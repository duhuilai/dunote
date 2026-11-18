import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Clock3,
  FileText,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AiConfig, Note } from '@/types'
import { useAppStore } from '@/store'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  getNoteSearchText,
  searchNotes,
  type SearchResult,
  escapeHtml,
} from '@/utils/noteSearch'
import {
  AiServiceError,
  generateMeetingMinutes,
  generateNoteDigest,
  transcribeAudio,
  validateAiBaseUrl,
} from '@/utils/aiService'
import { markdownToSafeHtml, textToSafeHtml } from '@/utils/aiMarkdown'

type AiTab = 'organize' | 'meeting'
type MeetingStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'recorded'
  | 'transcribing'
  | 'transcribed'
  | 'generating'
  | 'ready'

function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      return `${prefix}-${cryptoApi.randomUUID()}`
    } catch {
      /* Fall through for webviews with a partial Web Crypto implementation. */
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

function formatDateLabel(date = new Date()): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function safeTitle(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 100) || fallback
}

function chatReady(config: AiConfig): boolean {
  const url = validateAiBaseUrl(config.baseUrl)
  return Boolean(
    config.enabled
    && config.supportsChat
    && config.chatModel.trim()
    && url.ok
    && (config.apiKey.trim() || new URL(url.ok ? url.baseUrl : 'https://invalid.local').hostname === 'localhost'
      || new URL(url.ok ? url.baseUrl : 'https://invalid.local').hostname === '127.0.0.1'),
  )
}

function transcriptionReady(config: AiConfig): boolean {
  const url = validateAiBaseUrl(config.baseUrl)
  return Boolean(
    config.enabled
    && config.supportsTranscription
    && config.transcriptionModel.trim()
    && url.ok
    && (config.apiKey.trim() || new URL(url.ok ? url.baseUrl : 'https://invalid.local').hostname === 'localhost'
      || new URL(url.ok ? url.baseUrl : 'https://invalid.local').hostname === '127.0.0.1'),
  )
}

function AiMarkdownPreview({ value, emptyText }: { value: string; emptyText: string }) {
  const html = useMemo(() => markdownToSafeHtml(value), [value])
  if (!value.trim()) {
    return <div className="ai-preview-empty">{emptyText}</div>
  }
  return (
    <div
      className="ai-markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function AiPage() {
  const notes = useAppStore((state) => state.notes)
  const aiConfig = useAppStore((state) => state.settings.aiConfig)
  const showToast = useAppStore((state) => state.showToast)
  const setCurrentPage = useAppStore((state) => state.setCurrentPage)
  const setSelectedNoteId = useAppStore((state) => state.setSelectedNoteId)
  const addNote = useAppStore((state) => state.addNote)
  const confirm = useConfirm()

  const [activeTab, setActiveTab] = useState<AiTab>('organize')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [instruction, setInstruction] = useState('')
  const [generatingDigest, setGeneratingDigest] = useState(false)
  const [digest, setDigest] = useState('')
  const [digestTitle, setDigestTitle] = useState('')

  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [minutes, setMinutes] = useState('')
  const [meetingTitle, setMeetingTitle] = useState('')
  const [meetingContext, setMeetingContext] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardOnStopRef = useRef(false)

  const canChat = chatReady(aiConfig)
  const canTranscribe = transcriptionReady(aiConfig)
  const selectedCount = selectedIds.size
  const selectedResults = searchResults.filter((result) => selectedIds.has(result.note.id))
  const meetingBusy = ['requesting', 'transcribing', 'generating'].includes(meetingStatus)

  useEffect(() => {
    if (meetingStatus !== 'recording') return
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [meetingStatus])

  useEffect(() => {
    return () => {
      discardOnStopRef.current = true
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!audioUrl) return
    return () => URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  const switchTab = (tab: AiTab) => {
    setActiveTab(tab)
  }

  const handleSearch = async () => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      showToast('请输入要检索的关键词', 'info')
      return
    }
    setSearching(true)
    setDigest('')
    try {
      const results = await searchNotes(notes, normalizedQuery)
      const visibleResults = results.slice(0, 8)
      setSearchResults(visibleResults)
      setSelectedIds(new Set(visibleResults.slice(0, 3).map((result) => result.note.id)))
      if (visibleResults.length === 0) showToast('没有找到匹配的笔记', 'info')
    } catch (error) {
      showToast(`检索失败：${errorMessage(error)}`, 'error')
    } finally {
      setSearching(false)
    }
  }

  const toggleResult = (noteId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  const handleGenerateDigest = async () => {
    if (!canChat) {
      showToast('请先在系统设置中完成 AI 文本模型配置', 'error')
      return
    }
    if (selectedResults.length === 0) {
      showToast('请至少选择一篇笔记', 'info')
      return
    }

    setGeneratingDigest(true)
    try {
      const sources = await Promise.all(selectedResults.map(async ({ note }) => ({
        title: note.title,
        tags: note.tags || [],
        text: await getNoteSearchText(note),
      })))
      const result = await generateNoteDigest(aiConfig, sources, instruction)
      setDigest(result)
      setDigestTitle((current) => current || `AI 整理：${query.trim()}`.slice(0, 60))
      showToast('整理结果已生成，请预览后保存', 'success')
    } catch (error) {
      showToast(`整理失败：${errorMessage(error)}`, 'error')
    } finally {
      setGeneratingDigest(false)
    }
  }

  const persistGeneratedNote = (options: {
    title: string
    markdown: string
    noteType: string
    tags: string[]
    transcript?: string
  }): Note => {
    const now = new Date().toISOString()
    const title = safeTitle(options.title, 'AI 生成笔记')
    const transcriptHtml = options.transcript?.trim()
      ? `<h2>原始转写</h2>${textToSafeHtml(options.transcript)}`
      : ''
    const note: Note = {
      id: createId('note'),
      title,
      content: `<h1>${escapeHtml(title)}</h1>${markdownToSafeHtml(options.markdown)}${transcriptHtml}`,
      folderId: '',
      filePath: '',
      tags: options.tags,
      createdAt: now,
      updatedAt: now,
      noteType: options.noteType,
    }
    addNote(note)
    setSelectedNoteId(note.id)
    setCurrentPage('notes')
    showToast('已保存为新笔记', 'success')
    return note
  }

  const handleSaveDigest = () => {
    if (!digest.trim()) {
      showToast('整理结果为空，暂时无法保存', 'info')
      return
    }
    const sourceTags = selectedResults.flatMap((result) => result.note.tags || [])
    const tags = Array.from(new Set(['AI整理', ...sourceTags])).slice(0, 6)
    persistGeneratedNote({
      title: digestTitle,
      markdown: digest,
      noteType: 'normal',
      tags,
    })
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

    setMeetingStatus('requesting')
    discardOnStopRef.current = false
    chunksRef.current = []
    setAudioBlob(null)
    setAudioUrl('')
    setTranscript('')
    setMinutes('')
    setElapsedSeconds(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      const recorder = new MediaRecorder(stream, mimeType
        ? { mimeType, audioBitsPerSecond: 128000 }
        : { audioBitsPerSecond: 128000 })
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop())
        setMeetingStatus('idle')
        showToast('录音过程中发生错误，请重试', 'error')
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        if (discardOnStopRef.current) {
          discardOnStopRef.current = false
          chunksRef.current = []
          setMeetingStatus('idle')
          return
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm',
        })
        chunksRef.current = []
        if (blob.size === 0) {
          setMeetingStatus('idle')
          showToast('没有录到有效音频，请检查麦克风', 'error')
          return
        }
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setMeetingStatus('recorded')
      }

      recorder.start(1000)
      setMeetingStatus('recording')
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setMeetingStatus('idle')
      const detail = error instanceof DOMException && error.name === 'NotAllowedError'
        ? '麦克风权限被拒绝'
        : errorMessage(error)
      showToast(`无法开始录音：${detail}`, 'error')
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }

  const resetRecording = () => {
    discardOnStopRef.current = true
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    setAudioBlob(null)
    setAudioUrl('')
    setTranscript('')
    setMinutes('')
    setMeetingTitle('')
    setElapsedSeconds(0)
    setMeetingStatus('idle')
  }

  const handleDiscardRecording = async () => {
    const shouldDiscard = await confirm({
      title: '放弃当前录音？',
      message: '音频、转写稿和已生成的会议纪要都会从当前页面清除。',
      confirmText: '放弃',
      danger: true,
    })
    if (shouldDiscard) resetRecording()
  }

  const handleTranscribe = async () => {
    if (!audioBlob) return
    const sizeMb = Math.max(audioBlob.size / (1024 * 1024), 0.01).toFixed(1)
    const approved = await confirm({
      title: '上传录音并转写？',
      message: `录音（约 ${sizeMb} MB）将发送到“${aiConfig.providerName || '当前 AI 服务'}”进行转写。只有点击“上传并转写”后才会开始上传。`,
      confirmText: '上传并转写',
    })
    if (!approved) return

    setMeetingStatus('transcribing')
    try {
      const result = await transcribeAudio(aiConfig, audioBlob)
      setTranscript(result)
      setMeetingStatus('transcribed')
      showToast('转写完成，可以校对后生成纪要', 'success')
    } catch (error) {
      setMeetingStatus('recorded')
      showToast(`转写失败：${errorMessage(error)}`, 'error')
    }
  }

  const handleGenerateMinutes = async () => {
    if (!canChat) {
      showToast('请先配置文本生成模型', 'error')
      return
    }
    if (!transcript.trim()) {
      showToast('请先完成转写或粘贴会议文字', 'info')
      return
    }

    setMeetingStatus('generating')
    try {
      const result = await generateMeetingMinutes(aiConfig, transcript, meetingContext)
      setMinutes(result)
      setMeetingTitle((current) => current || `会议纪要 - ${formatDateLabel()}`)
      setMeetingStatus('ready')
      showToast('会议纪要已生成，请预览后保存', 'success')
    } catch (error) {
      setMeetingStatus(transcript.trim() ? 'transcribed' : 'recorded')
      showToast(`生成纪要失败：${errorMessage(error)}`, 'error')
    }
  }

  const handleSaveMinutes = () => {
    if (!minutes.trim()) {
      showToast('会议纪要为空，暂时无法保存', 'info')
      return
    }
    persistGeneratedNote({
      title: meetingTitle,
      markdown: minutes,
      noteType: 'meeting',
      tags: ['AI纪要', '会议'],
      transcript,
    })
  }

  const statusLabel = (() => {
    switch (meetingStatus) {
      case 'requesting': return '正在请求麦克风'
      case 'recording': return '录音中'
      case 'recorded': return '录音已就绪'
      case 'transcribing': return '正在转写'
      case 'transcribed': return '转写完成'
      case 'generating': return '正在生成纪要'
      case 'ready': return '纪要约已生成'
      default: return '等待录音'
    }
  })()

  return (
    <div className="ai-page">
      <header className="ai-page-header">
        <div className="ai-page-heading">
          <div className="ai-page-mark" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <div>
            <h1>AI 工作台</h1>
            <p>检索整理与会议纪要</p>
          </div>
        </div>
        <button
          type="button"
          className="ai-provider-button"
          onClick={() => setCurrentPage('settings')}
          title="打开 AI 设置"
        >
          <span className={`ai-provider-dot${canChat || canTranscribe ? ' is-ready' : ''}`} />
          <span>{aiConfig.providerName || '未配置供应商'}</span>
          <Settings size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="ai-page-scroll">
        <div className="ai-page-content">
          <div className="ai-tabs" role="tablist" aria-label="AI 功能">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'organize'}
              className={`ai-tab${activeTab === 'organize' ? ' is-active' : ''}`}
              onClick={() => switchTab('organize')}
            >
              <Search size={16} />
              检索整理
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'meeting'}
              className={`ai-tab${activeTab === 'meeting' ? ' is-active' : ''}`}
              onClick={() => switchTab('meeting')}
            >
              <Mic size={16} />
              会议纪要
            </button>
          </div>

          {!canChat && activeTab === 'organize' && (
            <div className="ai-config-notice" role="status">
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>文本生成尚未就绪</strong>
                <span>配置供应商、API Key 和文本模型后即可生成整理结果。</span>
              </div>
              <button type="button" onClick={() => setCurrentPage('settings')}>
                前往设置
              </button>
            </div>
          )}

          {activeTab === 'organize' && (
            <div role="tabpanel" aria-label="检索整理">
              <section className="ai-panel">
                <div className="ai-panel-heading">
                  <div>
                    <h2>从笔记库检索素材</h2>
                    <p>搜索标题、标签和正文，最多选择 8 篇笔记。</p>
                  </div>
                  <span className="ai-count-badge">已选 {selectedCount}</span>
                </div>

                <div className="ai-search-row">
                  <div className="ai-search-input">
                    <Search size={17} aria-hidden="true" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void handleSearch()
                      }}
                      placeholder="例如：项目复盘、客户反馈、周会"
                      aria-label="检索笔记"
                    />
                  </div>
                  <button
                    type="button"
                    className="ai-primary-button"
                    onClick={() => void handleSearch()}
                    disabled={searching}
                  >
                    {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                    {searching ? '检索中' : '检索'}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="ai-result-list" aria-label="检索结果">
                    {searchResults.map((result) => {
                      const selected = selectedIds.has(result.note.id)
                      return (
                        <label
                          key={result.note.id}
                          className={`ai-result-item${selected ? ' is-selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleResult(result.note.id)}
                          />
                          <span className="ai-result-check" aria-hidden="true">
                            {selected && <Check size={13} />}
                          </span>
                          <span className="ai-result-copy">
                            <span className="ai-result-title">{result.note.title || '无标题笔记'}</span>
                            <span className="ai-result-snippet">{result.snippet}</span>
                          </span>
                          <span className="ai-result-source">
                            {result.matchSource === 'content' ? '正文' : result.matchSource === 'title' ? '标题' : '标签'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}

                <div className="ai-field">
                  <label htmlFor="ai-digest-instruction">整理要求（可选）</label>
                  <input
                    id="ai-digest-instruction"
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="例如：重点提炼风险和下一步行动"
                  />
                </div>

                <div className="ai-panel-actions">
                  <button
                    type="button"
                    className="ai-primary-button"
                    onClick={() => void handleGenerateDigest()}
                    disabled={!canChat || selectedCount === 0 || generatingDigest}
                  >
                    {generatingDigest ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                    {generatingDigest ? '生成中' : '生成整理结果'}
                  </button>
                  <span className="ai-action-hint">只会发送所选笔记的有限文本片段</span>
                </div>
              </section>

              <section className="ai-panel">
                <div className="ai-panel-heading">
                  <div>
                    <h2>整理结果</h2>
                    <p>内容可继续编辑，确认后保存为新笔记。</p>
                  </div>
                  {digest && (
                    <button type="button" className="ai-primary-button" onClick={handleSaveDigest}>
                      <Save size={16} />
                      保存为新笔记
                    </button>
                  )}
                </div>

                {digest ? (
                  <>
                    <div className="ai-field">
                      <label htmlFor="ai-digest-title">新笔记标题</label>
                      <input
                        id="ai-digest-title"
                        value={digestTitle}
                        onChange={(event) => setDigestTitle(event.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="ai-editor-grid">
                      <div className="ai-editor-column">
                        <div className="ai-editor-label">Markdown 编辑</div>
                        <textarea
                          value={digest}
                          onChange={(event) => setDigest(event.target.value)}
                          aria-label="编辑整理结果"
                        />
                      </div>
                      <div className="ai-preview-column">
                        <div className="ai-editor-label">预览</div>
                        <div className="ai-preview-scroll">
                          <AiMarkdownPreview value={digest} emptyText="整理结果为空" />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="ai-empty-state">
                    <FileText size={22} aria-hidden="true" />
                    <span>选择笔记并生成整理结果后，可在这里校对和保存。</span>
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'meeting' && (
            <div role="tabpanel" aria-label="会议纪要">
              {!canTranscribe && (
                <div className="ai-config-notice" role="status">
                  <AlertCircle size={18} aria-hidden="true" />
                  <div>
                    <strong>录音转写尚未就绪</strong>
                    <span>可先在下方粘贴会议文字，使用文本模型生成纪要。</span>
                  </div>
                  <button type="button" onClick={() => setCurrentPage('settings')}>
                    前往设置
                  </button>
                </div>
              )}

              <section className="ai-panel">
                <div className="ai-panel-heading">
                  <div>
                    <h2>录音与转写</h2>
                    <p>录音停止后不会自动上传。</p>
                  </div>
                  <span className={`ai-status-pill status-${meetingStatus}`}>
                    <Clock3 size={14} />
                    {statusLabel}
                  </span>
                </div>

                <div className={`ai-recorder${meetingStatus === 'recording' ? ' is-recording' : ''}`}>
                  <div className="ai-recorder-time">{formatDuration(elapsedSeconds)}</div>
                  <div className="ai-recorder-caption">
                    {meetingStatus === 'recording' ? '正在使用麦克风录音' : '音频仅保留在当前页面'}
                  </div>
                  <div className="ai-recorder-actions">
                    {(meetingStatus === 'idle' || meetingStatus === 'requesting') && (
                      <button
                        type="button"
                        className="ai-record-button"
                        onClick={() => void startRecording()}
                        disabled={!canTranscribe || meetingStatus === 'requesting'}
                      >
                        {meetingStatus === 'requesting'
                          ? <Loader2 size={18} className="spin" />
                          : <Mic size={18} />}
                        开始录音
                      </button>
                    )}
                    {meetingStatus === 'recording' && (
                      <button type="button" className="ai-stop-button" onClick={stopRecording}>
                        <Square size={16} />
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
                        <Trash2 size={16} />
                        放弃
                      </button>
                    )}
                  </div>
                </div>

                {audioUrl && (
                  <div className="ai-audio-bar">
                    <Play size={16} aria-hidden="true" />
                    <audio controls src={audioUrl}>
                      <track kind="captions" />
                    </audio>
                  </div>
                )}

                {audioBlob && ['recorded', 'transcribing'].includes(meetingStatus) && (
                  <div className="ai-panel-actions">
                    <button
                      type="button"
                      className="ai-primary-button"
                      onClick={() => void handleTranscribe()}
                      disabled={!canTranscribe || meetingStatus === 'transcribing'}
                    >
                      {meetingStatus === 'transcribing'
                        ? <Loader2 size={16} className="spin" />
                        : <Upload size={16} />}
                      {meetingStatus === 'transcribing' ? '正在转写' : '上传并转写'}
                    </button>
                    <button
                      type="button"
                      className="ai-secondary-button"
                      onClick={() => void startRecording()}
                      disabled={meetingStatus === 'transcribing'}
                    >
                      <RotateCcw size={16} />
                      重新录制
                    </button>
                  </div>
                )}

                <div className="ai-field">
                  <label htmlFor="ai-transcript">转写稿</label>
                  <textarea
                    id="ai-transcript"
                    className="ai-transcript-input"
                    value={transcript}
                    onChange={(event) => setTranscript(event.target.value)}
                    placeholder="转写完成后可在这里校对，也可以直接粘贴会议文字。"
                    disabled={meetingStatus === 'transcribing' || meetingStatus === 'generating'}
                  />
                </div>

                <div className="ai-field">
                  <label htmlFor="ai-meeting-context">会议背景（可选）</label>
                  <input
                    id="ai-meeting-context"
                    value={meetingContext}
                    onChange={(event) => setMeetingContext(event.target.value)}
                    placeholder="例如：产品周会，重点讨论发布计划"
                  />
                </div>

                <div className="ai-panel-actions">
                  <button
                    type="button"
                    className="ai-primary-button"
                    onClick={() => void handleGenerateMinutes()}
                    disabled={!canChat || !transcript.trim() || meetingStatus === 'generating'}
                  >
                    {meetingStatus === 'generating'
                      ? <Loader2 size={16} className="spin" />
                      : <Sparkles size={16} />}
                    {meetingStatus === 'generating' ? '生成中' : '生成会议纪要'}
                  </button>
                  <span className="ai-action-hint">转写稿会发送到当前文本模型</span>
                </div>
              </section>

              <section className="ai-panel">
                <div className="ai-panel-heading">
                  <div>
                    <h2>纪要约</h2>
                    <p>可编辑 Markdown，保存时会附带原始转写稿。</p>
                  </div>
                  {minutes && (
                    <button type="button" className="ai-primary-button" onClick={handleSaveMinutes}>
                      <Save size={16} />
                      保存会议记录
                    </button>
                  )}
                </div>

                {minutes ? (
                  <>
                    <div className="ai-field">
                      <label htmlFor="ai-meeting-title">会议记录标题</label>
                      <input
                        id="ai-meeting-title"
                        value={meetingTitle}
                        onChange={(event) => setMeetingTitle(event.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="ai-editor-grid">
                      <div className="ai-editor-column">
                        <div className="ai-editor-label">Markdown 编辑</div>
                        <textarea
                          value={minutes}
                          onChange={(event) => setMinutes(event.target.value)}
                          aria-label="编辑会议纪要"
                        />
                      </div>
                      <div className="ai-preview-column">
                        <div className="ai-editor-label">预览</div>
                        <div className="ai-preview-scroll">
                          <AiMarkdownPreview value={minutes} emptyText="会议纪要为空" />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="ai-empty-state">
                    <ShieldCheck size={22} aria-hidden="true" />
                    <span>纪要生成后会在这里显示，保存前不会改动任何已有笔记。</span>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
