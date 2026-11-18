import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  FileText,
  List,
  Loader2,
  Mic,
  PencilLine,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { Note } from '@/types'
import { useAppStore } from '@/store'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  AiServiceError,
  chatWithCurrentNote,
  generateMeetingMinutes,
  isAiChatConfigured,
  isAiTranscriptionConfigured,
  transcribeAudio,
  type AiChatMessage,
} from '@/utils/aiService'
import { markdownToSafeHtml } from '@/utils/aiMarkdown'
import type { NoteAiBridge } from '@/components/notes/noteAiBridge'

type NoteAiView = 'chat' | 'meeting'
type MeetingStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'recorded'
  | 'transcribing'
  | 'transcribed'
  | 'generating'
  | 'ready'

interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  content: string
  source?: 'chat' | 'meeting'
}

interface NoteAiPanelProps {
  note: Note
  bridge: NoteAiBridge | null
  readingMode: boolean
  onClose: () => void
}

function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      return `${prefix}-${cryptoApi.randomUUID()}`
    } catch {
      // Some embedded webviews expose Web Crypto without allowing randomUUID.
    }
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function errorMessage(error: unknown): string {
  if (error instanceof AiServiceError || error instanceof Error) return error.message
  return String(error)
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function AiMarkdownPreview({ value }: { value: string }) {
  const html = useMemo(() => markdownToSafeHtml(value), [value])
  return (
    <div
      className="ai-markdown-preview note-ai-markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function NoteAiPanel({
  note,
  bridge,
  readingMode,
  onClose,
}: NoteAiPanelProps) {
  const aiConfig = useAppStore((state) => state.settings.aiConfig)
  const setCurrentPage = useAppStore((state) => state.setCurrentPage)
  const showToast = useAppStore((state) => state.showToast)
  const confirm = useConfirm()

  const [view, setView] = useState<NoteAiView>('chat')
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [composer, setComposer] = useState('')
  const [pending, setPending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [meetingContext, setMeetingContext] = useState('')
  const [meetingError, setMeetingError] = useState<string | null>(null)

  const noteRef = useRef(note)
  noteRef.current = note
  const bridgeRef = useRef(bridge)
  bridgeRef.current = bridge
  const chatRequestRef = useRef(0)
  const meetingRequestRef = useRef(0)
  const mountedRef = useRef(true)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardOnStopRef = useRef(false)

  const canChat = isAiChatConfigured(aiConfig)
  const canTranscribe = isAiTranscriptionConfigured(aiConfig)
  const bridgeMatchesNote = bridge?.noteId === note.id
  const activeBridge = bridgeMatchesNote ? bridge : null
  const bridgeReady = Boolean(activeBridge?.ready)
  const readOnly = readingMode || Boolean(activeBridge?.readOnly)
  const hasSelection = Boolean(activeBridge?.hasSelection)
  const meetingBusy = ['requesting', 'transcribing', 'generating'].includes(meetingStatus)
  const canSend = canChat && bridgeReady && !pending

  const stopStreams = useCallback(() => {
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    chunksRef.current = []
  }, [])

  const resetMeeting = useCallback(() => {
    meetingRequestRef.current += 1
    discardOnStopRef.current = true
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // Recorder may already be transitioning to inactive.
      }
    }
    stopStreams()
    setMeetingStatus('idle')
    setElapsedSeconds(0)
    setAudioBlob(null)
    setAudioUrl('')
    setTranscript('')
    setMeetingContext('')
    setMeetingError(null)
  }, [stopStreams])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      chatRequestRef.current += 1
      meetingRequestRef.current += 1
      discardOnStopRef.current = true
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // Ignore shutdown races.
        }
      }
      stopStreams()
    }
  }, [stopStreams])

  useEffect(() => {
    chatRequestRef.current += 1
    setMessages([])
    setComposer('')
    setPending(false)
    setChatError(null)
    setEditingMessageId(null)
    setEditDraft('')
    setView('chat')
    resetMeeting()
    window.setTimeout(() => composerRef.current?.focus(), 80)
  }, [note.id, resetMeeting])

  useEffect(() => {
    setMessages((current) => (
      current.map((message) => (
        message.id === editingMessageId ? { ...message, content: editDraft } : message
      ))
    ))
  }, [editDraft, editingMessageId])

  useEffect(() => {
    if (meetingStatus !== 'recording') return
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [meetingStatus])

  useEffect(() => {
    if (!audioUrl) return
    return () => URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  useEffect(() => {
    const container = messagesRef.current
    if (!container || view !== 'chat') return
    container.scrollTop = container.scrollHeight
  }, [chatError, messages, pending, view])

  const sendMessage = async (rawContent: string, clearComposer = false) => {
    const content = rawContent.trim()
    if (!content || pending) return
    if (!canChat) {
      showToast('请先配置文本生成供应商和模型', 'error')
      return
    }
    const currentBridge = bridgeRef.current
    if (!currentBridge || currentBridge.noteId !== note.id || !currentBridge.ready) {
      showToast('当前文档仍在载入，请稍后再试', 'info')
      return
    }

    const noteId = note.id
    const requestId = ++chatRequestRef.current
    const history: AiChatMessage[] = messages
      .filter((message) => message.content.trim())
      .map((message) => ({ role: message.role, content: message.content }))
    const userMessage: ChatEntry = { id: createId('user'), role: 'user', content, source: 'chat' }

    setMessages((current) => [...current, userMessage])
    setPending(true)
    setChatError(null)
    if (clearComposer) setComposer('')

    try {
      const result = await chatWithCurrentNote(
        aiConfig,
        {
          title: noteRef.current.title,
          tags: noteRef.current.tags || [],
          text: currentBridge.getPlainText(),
          selectedText: currentBridge.getSelectedText(),
        },
        [...history, { role: 'user', content }],
      )
      if (
        !mountedRef.current
        || requestId !== chatRequestRef.current
        || noteRef.current.id !== noteId
      ) return
      setMessages((current) => [
        ...current,
        { id: createId('assistant'), role: 'assistant', content: result, source: 'chat' },
      ])
    } catch (error) {
      if (
        !mountedRef.current
        || requestId !== chatRequestRef.current
        || noteRef.current.id !== noteId
      ) return
      setChatError(errorMessage(error))
    } finally {
      if (
        mountedRef.current
        && requestId === chatRequestRef.current
        && noteRef.current.id === noteId
      ) {
        setPending(false)
      }
    }
  }

  const handleQuickAction = (action: 'summary' | 'todos' | 'polish') => {
    if (action === 'summary') {
      void sendMessage('请总结当前笔记，保留关键结论、重要数据和仍未解决的问题。')
      return
    }
    if (action === 'todos') {
      void sendMessage('请从当前笔记提取待办事项，按优先级整理，并标出负责人和截止时间；没有写明的信息不要补猜。')
      return
    }
    if (!bridgeRef.current?.getSelectedText().trim()) {
      showToast('请先在文档中选择需要润色的内容', 'info')
      return
    }
    void sendMessage('请润色当前选区。只输出可以直接替换原文的润色后正文，保留事实、数字、专有名词和原意。')
  }

  const insertMessage = (message: ChatEntry, mode: 'insert' | 'replace' | 'append') => {
    const currentBridge = bridgeRef.current
    if (!currentBridge || currentBridge.noteId !== note.id || !currentBridge.ready) {
      showToast('当前文档尚未准备好写入', 'error')
      return
    }
    if (readOnly || currentBridge.readOnly) {
      showToast('阅读模式下不能修改文档', 'info')
      return
    }
    const html = markdownToSafeHtml(message.content)
    if (!html.trim()) {
      showToast('这条回复没有可插入的内容', 'info')
      return
    }

    const changed = mode === 'insert'
      ? currentBridge.insertHtml(html)
      : mode === 'replace'
        ? currentBridge.replaceSelection(html)
        : currentBridge.appendHtml(html)

    if (!changed) {
      showToast(
        mode === 'replace'
          ? '选区已变化或当前不可写入，请重新选择后再试'
          : '无法写入当前文档，请稍后再试',
        'error',
      )
      return
    }
    setEditingMessageId(null)
    showToast(
      mode === 'replace' ? '已替换选区' : mode === 'append' ? '已追加到文末' : '已插入到光标位置',
      'success',
    )
  }

  const copyMessage = async (message: ChatEntry) => {
    try {
      await navigator.clipboard.writeText(message.content)
      showToast('已复制 AI 回复', 'success')
    } catch {
      showToast('复制失败，请手动选择文本', 'error')
    }
  }

  const startRecording = async () => {
    if (!canTranscribe) {
      showToast('请先配置支持录音转写的供应商和模型', 'error')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('当前运行环境不支持录音', 'error')
      return
    }

    meetingRequestRef.current += 1
    setMeetingStatus('requesting')
    setMeetingError(null)
    discardOnStopRef.current = false
    chunksRef.current = []
    setAudioBlob(null)
    setAudioUrl('')
    setTranscript('')
    setElapsedSeconds(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ]
      const mimeType = mimeCandidates.find((candidate) => (
        typeof MediaRecorder.isTypeSupported === 'function'
        && MediaRecorder.isTypeSupported(candidate)
      ))
      const recorder = new MediaRecorder(
        stream,
        mimeType
          ? { mimeType, audioBitsPerSecond: 128000 }
          : { audioBitsPerSecond: 128000 },
      )
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stopStreams()
        setMeetingStatus('idle')
        setMeetingError('录音过程中发生错误，请重试。')
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        if (discardOnStopRef.current || !mountedRef.current) {
          discardOnStopRef.current = false
          chunksRef.current = []
          if (mountedRef.current) setMeetingStatus('idle')
          return
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm',
        })
        chunksRef.current = []
        if (blob.size === 0) {
          setMeetingStatus('idle')
          setMeetingError('没有录到有效音频，请检查麦克风。')
          return
        }
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setMeetingStatus('recorded')
      }

      recorder.start(1000)
      setMeetingStatus('recording')
    } catch (error) {
      stopStreams()
      setMeetingStatus('idle')
      const detail = error instanceof DOMException && error.name === 'NotAllowedError'
        ? '麦克风权限被拒绝'
        : errorMessage(error)
      setMeetingError(`无法开始录音：${detail}`)
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }

  const handleDiscardRecording = async () => {
    const approved = await confirm({
      title: '放弃当前录音？',
      message: '音频、转写稿和尚未插入文档的内容都会清除。',
      confirmText: '放弃',
      danger: true,
    })
    if (approved) resetMeeting()
  }

  const handleTranscribe = async () => {
    if (!audioBlob || !canTranscribe) return
    const noteId = note.id
    const sizeMb = Math.max(audioBlob.size / (1024 * 1024), 0.01).toFixed(1)
    const approved = await confirm({
      title: '上传录音并转写？',
      message: `录音（约 ${sizeMb} MB）将发送到“${aiConfig.providerName || '当前 AI 服务'}”进行转写。只有确认后才会开始上传。`,
      confirmText: '上传并转写',
    })
    if (!approved) return

    const requestId = ++meetingRequestRef.current
    setMeetingStatus('transcribing')
    setMeetingError(null)
    try {
      const result = await transcribeAudio(aiConfig, audioBlob)
      if (
        !mountedRef.current
        || requestId !== meetingRequestRef.current
        || noteRef.current.id !== noteId
      ) return
      setTranscript(result)
      setMeetingStatus('transcribed')
      showToast('转写完成，可以校对后生成纪要', 'success')
    } catch (error) {
      if (
        !mountedRef.current
        || requestId !== meetingRequestRef.current
        || noteRef.current.id !== noteId
      ) return
      setMeetingStatus('recorded')
      setMeetingError(`转写失败：${errorMessage(error)}`)
    }
  }

  const handleGenerateMinutes = async () => {
    if (!canChat) {
      showToast('请先配置文本生成供应商和模型', 'error')
      return
    }
    if (!transcript.trim()) {
      showToast('请先完成转写或粘贴会议文字', 'info')
      return
    }

    const noteId = note.id
    const requestId = ++meetingRequestRef.current
    setMeetingStatus('generating')
    setMeetingError(null)
    try {
      const context = [
        `当前笔记：${noteRef.current.title || '未命名笔记'}`,
        meetingContext.trim(),
      ].filter(Boolean).join('\n')
      const result = await generateMeetingMinutes(aiConfig, transcript, context)
      if (
        !mountedRef.current
        || requestId !== meetingRequestRef.current
        || noteRef.current.id !== noteId
      ) return
      setMessages((current) => [
        ...current,
        {
          id: createId('meeting'),
          role: 'assistant',
          content: result,
          source: 'meeting',
        },
      ])
      setMeetingStatus('ready')
      setView('chat')
      showToast('会议纪要已生成，可在对话中校对并插入文档', 'success')
    } catch (error) {
      if (
        !mountedRef.current
        || requestId !== meetingRequestRef.current
        || noteRef.current.id !== noteId
      ) return
      setMeetingStatus('transcribed')
      setMeetingError(`生成纪要失败：${errorMessage(error)}`)
    }
  }

  const statusLabel = useMemo(() => {
    switch (meetingStatus) {
      case 'requesting': return '正在请求麦克风'
      case 'recording': return '录音中'
      case 'recorded': return '录音已就绪'
      case 'transcribing': return '正在转写'
      case 'transcribed': return '转写完成'
      case 'generating': return '正在生成纪要'
      case 'ready': return '纪要已生成'
      default: return '等待录音'
    }
  }, [meetingStatus])

  return (
    <aside className="note-ai-panel" aria-label="当前笔记 AI 助手">
      <header className="note-ai-header">
        <div className="note-ai-heading">
          <div className="note-ai-mark" aria-hidden="true">
            <Sparkles size={17} />
          </div>
          <div className="note-ai-heading-copy">
            <strong>笔记 AI</strong>
            <span title={note.title || '未命名笔记'}>{note.title || '未命名笔记'}</span>
          </div>
        </div>
        <button
          type="button"
          className="note-ai-icon-button"
          onClick={onClose}
          aria-label="关闭笔记 AI 助手"
          title="关闭笔记 AI 助手（Esc）"
        >
          <X size={17} />
        </button>
      </header>

      <div className="note-ai-context">
        <div className="note-ai-context-meta">
          <span>{activeBridge?.characterCount ?? 0} 字</span>
          <span>
            {hasSelection
              ? `已选 ${activeBridge?.selectionCharacterCount ?? 0} 字${readingMode ? ' · 阅读模式' : ''}`
              : readingMode
                ? '阅读模式'
                : '未选择文本'}
          </span>
          <button
            type="button"
            className={`note-ai-provider${canChat || canTranscribe ? ' is-ready' : ''}`}
            onClick={() => setCurrentPage('settings')}
            title="打开 AI 设置"
          >
            <span aria-hidden="true" />
            {aiConfig.providerName || '未配置供应商'}
          </button>
        </div>
        {(note.tags || []).length > 0 && (
          <div className="note-ai-tags" aria-label="当前笔记标签">
            {note.tags.slice(0, 3).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
            {note.tags.length > 3 && <span>+{note.tags.length - 3}</span>}
          </div>
        )}
      </div>

      <div className="note-ai-tabs" role="tablist" aria-label="笔记 AI 模式">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'chat'}
          className={`note-ai-tab${view === 'chat' ? ' is-active' : ''}`}
          onClick={() => setView('chat')}
        >
          <Sparkles size={14} />
          对话
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'meeting'}
          className={`note-ai-tab${view === 'meeting' ? ' is-active' : ''}`}
          onClick={() => setView('meeting')}
        >
          <Mic size={14} />
          会议纪要
        </button>
      </div>

      {view === 'chat' && (
        <div className="note-ai-main" role="tabpanel" aria-label="当前笔记对话">
          <div className="note-ai-scroll" ref={messagesRef}>
            {!canChat && (
              <div className="note-ai-notice" role="status">
                <AlertCircle size={16} aria-hidden="true" />
                <div>
                  <strong>文本生成尚未就绪</strong>
                  <span>配置供应商、API Key 和文本模型后即可对话。</span>
                </div>
                <button type="button" onClick={() => setCurrentPage('settings')}>
                  设置
                </button>
              </div>
            )}

            {!bridge && (
              <div className="note-ai-loading" role="status">
                <Loader2 size={14} className="spin" />
                正在载入当前文档
              </div>
            )}

            <div className="note-ai-quick-actions" aria-label="快捷操作">
              <button
                type="button"
                onClick={() => handleQuickAction('summary')}
                disabled={!canSend}
              >
                <FileText size={14} />
                总结
              </button>
              <button
                type="button"
                onClick={() => handleQuickAction('todos')}
                disabled={!canSend}
              >
                <List size={14} />
                提取待办
              </button>
              <button
                type="button"
                onClick={() => handleQuickAction('polish')}
                disabled={!canSend || !hasSelection}
              >
                <PencilLine size={14} />
                润色选区
              </button>
            </div>

            {messages.length === 0 && !pending && (
              <div className="note-ai-empty">
                <Sparkles size={20} aria-hidden="true" />
                <strong>围绕当前文档提问</strong>
                <span>回答只基于这篇笔记的实时正文。</span>
              </div>
            )}

            <div className="note-ai-messages">
              {messages.map((message) => {
                const isEditing = editingMessageId === message.id
                const content = isEditing ? editDraft : message.content
                return (
                  <article
                    key={message.id}
                    className={`note-ai-message is-${message.role}${message.source === 'meeting' ? ' is-meeting' : ''}`}
                  >
                    <div className="note-ai-message-label">
                      {message.role === 'assistant' ? (
                        message.source === 'meeting' ? '会议纪要' : 'AI 回复'
                      ) : '你'}
                    </div>
                    {message.role === 'assistant' ? (
                      <>
                        {isEditing ? (
                          <textarea
                            className="note-ai-edit-input"
                            value={editDraft}
                            onChange={(event) => setEditDraft(event.target.value)}
                            aria-label="编辑 AI 回复"
                          />
                        ) : (
                          <AiMarkdownPreview value={content} />
                        )}
                        <div className="note-ai-message-actions">
                          <button
                            type="button"
                            onClick={() => void copyMessage({ ...message, content })}
                            title="复制回复"
                          >
                            <Copy size={13} />
                            复制
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingMessageId(null)
                              } else {
                                setEditingMessageId(message.id)
                                setEditDraft(message.content)
                              }
                            }}
                            title={isEditing ? '完成编辑' : '编辑回复'}
                          >
                            {isEditing ? <CheckCircle2 size={13} /> : <PencilLine size={13} />}
                            {isEditing ? '完成' : '编辑'}
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMessage({ ...message, content }, 'insert')}
                            disabled={!bridgeReady || readOnly}
                            title="插入到当前光标位置"
                          >
                            <FileText size={13} />
                            插入
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMessage({ ...message, content }, 'replace')}
                            disabled={!bridgeReady || readOnly || !hasSelection}
                            title="替换文档中当前选中的内容"
                          >
                            <PencilLine size={13} />
                            替换选区
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMessage({ ...message, content }, 'append')}
                            disabled={!bridgeReady || readOnly}
                            title="追加到当前文档末尾"
                          >
                            <List size={13} />
                            追加
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="note-ai-user-text">{content}</div>
                    )}
                  </article>
                )
              })}

              {pending && (
                <div className="note-ai-pending" role="status">
                  <Loader2 size={15} className="spin" />
                  正在阅读当前文档
                </div>
              )}

              {chatError && (
                <div className="note-ai-error" role="alert">
                  <AlertCircle size={15} />
                  <span>{chatError}</span>
                </div>
              )}
            </div>
          </div>

          <div className="note-ai-composer">
            <textarea
              ref={composerRef}
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter'
                  && !event.shiftKey
                  && !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  void sendMessage(composer, true)
                }
              }}
              placeholder={bridgeReady ? '针对当前文档提问…' : '正在载入当前文档…'}
              aria-label="向当前笔记 AI 提问"
              disabled={!canChat || !bridgeReady || pending}
              rows={2}
            />
            <div className="note-ai-composer-footer">
              <span>{hasSelection ? '将同时参考当前选区' : '使用实时正文'}</span>
              <button
                type="button"
                onClick={() => void sendMessage(composer, true)}
                disabled={!canSend || !composer.trim()}
                aria-label="发送消息"
                title="发送消息（Enter）"
              >
                {pending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'meeting' && (
        <div className="note-ai-main" role="tabpanel" aria-label="会议纪要">
          <div className="note-ai-scroll note-ai-meeting">
            {!canTranscribe && (
              <div className="note-ai-notice" role="status">
                <AlertCircle size={16} aria-hidden="true" />
                <div>
                  <strong>录音转写尚未就绪</strong>
                  <span>仍可粘贴会议文字并生成纪要。</span>
                </div>
                <button type="button" onClick={() => setCurrentPage('settings')}>
                  设置
                </button>
              </div>
            )}

            <section className="note-ai-meeting-section">
              <div className="note-ai-section-heading">
                <div>
                  <strong>录音与转写</strong>
                  <span>停止后不会自动上传</span>
                </div>
                <span className={`note-ai-status is-${meetingStatus}`}>
                  <Clock3 size={12} />
                  {statusLabel}
                </span>
              </div>

              <div className={`note-ai-recorder${meetingStatus === 'recording' ? ' is-recording' : ''}`}>
                <div className="note-ai-record-time">{formatDuration(elapsedSeconds)}</div>
                <div className="note-ai-record-caption">
                  {meetingStatus === 'recording' ? '正在使用麦克风录音' : '音频只保留在当前面板'}
                </div>
                <div className="note-ai-record-actions">
                  {(meetingStatus === 'idle' || meetingStatus === 'requesting') && (
                    <button
                      type="button"
                      className="ai-primary-button"
                      onClick={() => void startRecording()}
                      disabled={!canTranscribe || meetingStatus === 'requesting'}
                    >
                      {meetingStatus === 'requesting'
                        ? <Loader2 size={16} className="spin" />
                        : <Mic size={16} />}
                      开始录音
                    </button>
                  )}
                  {meetingStatus === 'recording' && (
                    <button type="button" className="ai-stop-button" onClick={stopRecording}>
                      <Square size={14} />
                      停止录音
                    </button>
                  )}
                  {['recorded', 'transcribing', 'transcribed', 'generating', 'ready'].includes(meetingStatus) && (
                    <button
                      type="button"
                      className="ai-secondary-button"
                      onClick={() => void handleDiscardRecording()}
                      disabled={meetingBusy}
                    >
                      <Trash2 size={14} />
                      放弃
                    </button>
                  )}
                </div>
              </div>

              {audioUrl && (
                <div className="ai-audio-bar note-ai-audio">
                  <Play size={14} aria-hidden="true" />
                  <audio controls src={audioUrl}>
                    <track kind="captions" />
                  </audio>
                </div>
              )}

              {audioBlob && ['recorded', 'transcribing'].includes(meetingStatus) && (
                <div className="note-ai-inline-actions">
                  <button
                    type="button"
                    className="ai-primary-button"
                    onClick={() => void handleTranscribe()}
                    disabled={!canTranscribe || meetingStatus === 'transcribing'}
                  >
                    {meetingStatus === 'transcribing'
                      ? <Loader2 size={15} className="spin" />
                      : <Upload size={15} />}
                    {meetingStatus === 'transcribing' ? '正在转写' : '上传并转写'}
                  </button>
                  <button
                    type="button"
                    className="ai-secondary-button"
                    onClick={() => void startRecording()}
                    disabled={meetingStatus === 'transcribing'}
                  >
                    <RotateCcw size={15} />
                    重录
                  </button>
                </div>
              )}
            </section>

            <section className="note-ai-meeting-section">
              <label className="note-ai-field" htmlFor="note-ai-transcript">
                <span>会议文字</span>
                <textarea
                  id="note-ai-transcript"
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                  placeholder="转写完成后可在这里校对，也可以直接粘贴会议文字。"
                  disabled={meetingStatus === 'transcribing' || meetingStatus === 'generating'}
                />
              </label>
              <label className="note-ai-field" htmlFor="note-ai-meeting-context">
                <span>会议背景（可选）</span>
                <input
                  id="note-ai-meeting-context"
                  value={meetingContext}
                  onChange={(event) => setMeetingContext(event.target.value)}
                  placeholder="例如：产品周会，重点讨论发布计划"
                  disabled={meetingStatus === 'generating'}
                />
              </label>
              <button
                type="button"
                className="ai-primary-button note-ai-generate-button"
                onClick={() => void handleGenerateMinutes()}
                disabled={!canChat || !transcript.trim() || meetingStatus === 'generating'}
              >
                {meetingStatus === 'generating'
                  ? <Loader2 size={15} className="spin" />
                  : <Sparkles size={15} />}
                {meetingStatus === 'generating' ? '正在生成' : '生成会议纪要'}
              </button>
              <p className="note-ai-upload-note">转写稿会发送到当前文本模型。</p>
            </section>

            {meetingError && (
              <div className="note-ai-error" role="alert">
                <AlertCircle size={15} />
                <span>{meetingError}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
