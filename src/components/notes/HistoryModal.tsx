import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import {
  Clock,
  Eye,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useModalDialog } from '@/hooks/useModalDialog'
import { useAppStore } from '@/store'
import type { NoteHistory } from '@/types'
import { renderDataTablesInHTML } from '@/utils/dataTablePreview'
import { readVersion } from '@/utils/gitBackup'
import {
  deleteSnapshot,
  listSnapshots,
  readSnapshot,
  type SnapshotMeta,
} from '@/utils/noteSnapshots'

interface PreviewVersion {
  id: string
  title: string
  content: string
  timestamp: string
}

function formatTimestamp(value?: string): string {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return date.toLocaleString('zh-CN')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function HistoryModal({
  onRestore,
  initialTab = 'history',
}: {
  onRestore?: (
    noteId: string,
    content: string,
    title: string,
    filePath?: string,
  ) => void
  /** 打开时默认落在哪个页签：'snapshots' = 本地实时保存版本 */
  initialTab?: 'history' | 'snapshots'
}) {
  const {
    showHistory,
    setShowHistory,
    history,
    selectedNoteId,
    restoreFromHistory,
    deleteHistoryEntry,
    updateHistoryContent,
    showToast,
  } = useAppStore()
  const [previewHistory, setPreviewHistory] = useState<PreviewVersion | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [tab, setTab] = useState<'history' | 'snapshots'>('history')
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [snapLoading, setSnapLoading] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previewRequestRef = useRef(0)
  const titleId = useId()
  const panelId = useId()

  const handleClose = useCallback(() => {
    previewRequestRef.current += 1
    setPreviewLoading(false)
    setPreviewHistory(null)
    setShowHistory(false)
  }, [setShowHistory])

  useModalDialog({
    open: showHistory,
    onClose: handleClose,
    dialogRef,
    initialFocusRef: closeButtonRef,
  })

  // 每次打开弹窗时回到调用方指定的页签（「实时历史恢复」按钮会指定 snapshots）
  useEffect(() => {
    if (!showHistory) return
    previewRequestRef.current += 1
    setTab(initialTab)
    setPreviewHistory(null)
    setPreviewLoading(false)
  }, [showHistory, initialTab])

  // 切到「本地保存版本」页签时加载该笔记的快照列表
  useEffect(() => {
    if (!showHistory || tab !== 'snapshots' || !selectedNoteId) return
    let alive = true
    setSnapLoading(true)
    listSnapshots(selectedNoteId)
      .then((list) => {
        if (alive) setSnapshots(list)
      })
      .catch(() => {
        if (alive) setSnapshots([])
      })
      .finally(() => {
        if (alive) setSnapLoading(false)
      })
    return () => {
      alive = false
    }
  }, [showHistory, tab, selectedNoteId])

  // Hooks 必须始终在 early return 之前调用，避免弹窗开关时改变 Hook 数量。
  const handlePreview = useCallback(async (entry: NoteHistory) => {
    const requestId = ++previewRequestRef.current
    let content = entry.content

    if (!content.trim() && entry.oid && entry.repoDir && entry.relPath) {
      setPreviewLoading(true)
      try {
        const fresh = await readVersion(entry.repoDir, entry.relPath, entry.oid)
        if (fresh != null) {
          content = fresh
          updateHistoryContent(entry.id, fresh)
        }
      } catch (error) {
        console.error('[HistoryModal] handlePreview failed:', error)
        showToast('读取该历史版本失败', 'error')
      } finally {
        if (requestId === previewRequestRef.current) {
          setPreviewLoading(false)
        }
      }
    }

    if (requestId !== previewRequestRef.current) return
    setPreviewHistory({
      id: entry.id,
      title: entry.title || '无标题笔记',
      content,
      timestamp: entry.timestamp,
    })
  }, [showToast, updateHistoryContent])

  const handlePreviewSnapshot = useCallback(async (meta: SnapshotMeta) => {
    if (!selectedNoteId) return
    const requestId = ++previewRequestRef.current
    setPreviewLoading(true)
    try {
      const content = await readSnapshot(selectedNoteId, meta.ts)
      if (requestId !== previewRequestRef.current) return
      setPreviewHistory({
        id: `snap-${meta.ts}`,
        title: meta.title || '本地保存版本',
        content,
        timestamp: new Date(meta.ts).toISOString(),
      })
    } catch (error) {
      console.error('[HistoryModal] 读取快照失败:', error)
      if (requestId === previewRequestRef.current) {
        showToast('读取该保存版本失败', 'error')
      }
    } finally {
      if (requestId === previewRequestRef.current) {
        setPreviewLoading(false)
      }
    }
  }, [selectedNoteId, showToast])

  const handleRestoreSnapshot = useCallback(async (meta: SnapshotMeta) => {
    if (!selectedNoteId) return
    try {
      const content = await readSnapshot(selectedNoteId, meta.ts)
      if (!content.trim()) {
        showToast('恢复失败：该保存版本内容为空', 'error')
        return
      }
      setPreviewHistory(null)
      setShowHistory(false)
      // 复用与历史版本相同的恢复回调（内部区分普通笔记 / 本地文件笔记并刷新编辑器）
      if (onRestore) {
        onRestore(selectedNoteId, content, meta.title || '', undefined)
      }
    } catch (error) {
      console.error('[HistoryModal] 恢复快照失败:', error)
      showToast(`恢复失败：${errorMessage(error)}`, 'error')
    }
  }, [selectedNoteId, onRestore, setShowHistory, showToast])

  const handleDeleteSnapshot = useCallback(async (timestamp: number) => {
    if (!selectedNoteId) return
    try {
      await deleteSnapshot(selectedNoteId, timestamp)
      setSnapshots((previous) => previous.filter((snapshot) => snapshot.ts !== timestamp))
      if (previewHistory?.id === `snap-${timestamp}`) setPreviewHistory(null)
    } catch (error) {
      console.error('[HistoryModal] 删除保存版本失败:', error)
      showToast(`删除保存版本失败：${errorMessage(error)}`, 'error')
    }
  }, [previewHistory?.id, selectedNoteId, showToast])

  if (!showHistory) return null

  const noteHistory = history.filter((entry) => entry.noteId === selectedNoteId)
  const activeTabId = tab === 'history' ? `${panelId}-history` : `${panelId}-snapshots`

  const handleRestore = async (historyId: string) => {
    try {
      const entry = noteHistory.find((item) => item.id === historyId)
      if (!entry) {
        showToast('恢复失败：找不到该历史版本', 'error')
        return
      }

      // git 备份模式：从对应 commit 读取真实文件内容（本地与远程镜像一致）
      let content = entry.content
      if (!content.trim() && entry.oid && entry.repoDir && entry.relPath) {
        const fresh = await readVersion(entry.repoDir, entry.relPath, entry.oid)
        if (fresh != null) {
          content = fresh
          updateHistoryContent(entry.id, fresh)
        }
      }

      if (!content.trim()) {
        showToast('恢复失败：该历史版本内容为空（可能已被清理）', 'error')
        return
      }

      restoreFromHistory(historyId)
      setPreviewHistory(null)
      setShowHistory(false)
      // 通知父组件处理本地文件写盘
      onRestore?.(entry.noteId, content, entry.title, entry.relPath)
    } catch (error) {
      console.error('[HistoryModal] handleRestore failed:', error)
      showToast(`恢复失败：${errorMessage(error)}`, 'error')
    }
  }

  const handleDelete = (historyId: string) => {
    deleteHistoryEntry(historyId)
    if (previewHistory?.id === historyId) setPreviewHistory(null)
  }

  return (
    <div className="history-modal-layer">
      <div
        className="history-modal-overlay"
        aria-hidden="true"
        onClick={handleClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`history-modal-card${previewHistory ? ' has-preview' : ''}`}
      >
        <section className="history-modal-list">
          <header className="history-modal-header">
            <div className="history-modal-heading">
              <Clock size={18} aria-hidden="true" />
              <h3 id={titleId}>
                {tab === 'snapshots' ? '本地保存版本' : '历史记录'}
              </h3>
            </div>

            <div className="history-modal-header-actions">
              <div className="history-tabs" role="tablist" aria-label="历史类型">
                <button
                  type="button"
                  id={`${panelId}-history`}
                  role="tab"
                  aria-selected={tab === 'history'}
                  aria-controls={panelId}
                  className={`history-tab${tab === 'history' ? ' is-active' : ''}`}
                  onClick={() => {
                    previewRequestRef.current += 1
                    setTab('history')
                    setPreviewHistory(null)
                    setPreviewLoading(false)
                  }}
                >
                  历史记录
                </button>
                <button
                  type="button"
                  id={`${panelId}-snapshots`}
                  role="tab"
                  aria-selected={tab === 'snapshots'}
                  aria-controls={panelId}
                  className={`history-tab${tab === 'snapshots' ? ' is-active' : ''}`}
                  onClick={() => {
                    previewRequestRef.current += 1
                    setTab('snapshots')
                    setPreviewHistory(null)
                    setPreviewLoading(false)
                  }}
                >
                  本地保存版本
                </button>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                className="icon-button history-close-button"
                onClick={handleClose}
                aria-label="关闭历史记录"
                title="关闭"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={activeTabId}
            className="history-modal-content"
          >
            {tab === 'snapshots' ? (
              snapLoading ? (
                <div className="history-empty-state">
                  <Loader2 size={18} className="spin" aria-hidden="true" />
                  <span>正在加载保存版本…</span>
                </div>
              ) : snapshots.length === 0 ? (
                <div className="history-empty-state">
                  <Save size={22} aria-hidden="true" />
                  <strong>暂无本地保存版本</strong>
                  <span>本地文件笔记在自动保存成功后会自动留档。</span>
                </div>
              ) : (
                <div className="history-entry-list">
                  {snapshots.map((snapshot) => {
                    const selected = previewHistory?.id === `snap-${snapshot.ts}`
                    return (
                      <article
                        key={snapshot.ts}
                        className={`history-entry${selected ? ' is-selected' : ''}`}
                      >
                        <div className="history-entry-icon is-snapshot" aria-hidden="true">
                          <Save size={14} />
                        </div>
                        <div className="history-entry-main">
                          <div className="history-entry-title-row">
                            <span className="history-entry-title">
                              {snapshot.title || '本地保存版本'}
                            </span>
                            <time
                              className="history-entry-time"
                              dateTime={new Date(snapshot.ts).toISOString()}
                            >
                              {formatTimestamp(new Date(snapshot.ts).toISOString())}
                            </time>
                          </div>
                          <div className="history-entry-description">
                            自动保存留档 · {(snapshot.bytes / 1024).toFixed(1)} KB
                          </div>
                          <div className="history-entry-actions">
                            <button
                              type="button"
                              className={`history-action${selected ? ' is-active' : ''}`}
                              onClick={() => void handlePreviewSnapshot(snapshot)}
                            >
                              <Eye size={12} aria-hidden="true" />
                              预览
                            </button>
                            <button
                              type="button"
                              className="history-action is-primary-soft"
                              onClick={() => void handleRestoreSnapshot(snapshot)}
                            >
                              <RotateCcw size={12} aria-hidden="true" />
                              恢复此版本
                            </button>
                            <button
                              type="button"
                              className="history-action is-danger-soft"
                              onClick={() => void handleDeleteSnapshot(snapshot.ts)}
                            >
                              <Trash2 size={12} aria-hidden="true" />
                              删除
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )
            ) : noteHistory.length === 0 ? (
              <div className="history-empty-state">
                <Clock size={22} aria-hidden="true" />
                <strong>暂无历史记录</strong>
                <span>生成历史版本后，可在这里预览并恢复。</span>
              </div>
            ) : (
              <div className="history-entry-list">
                {noteHistory.map((entry) => {
                  const selected = previewHistory?.id === entry.id
                  return (
                    <article
                      key={entry.id}
                      className={`history-entry${selected ? ' is-selected' : ''}`}
                    >
                      <div className="history-entry-icon" aria-hidden="true">
                        <Clock size={14} />
                      </div>
                      <div className="history-entry-main">
                        <div className="history-entry-title-row">
                          <span className="history-entry-title">
                            {entry.title || '无标题笔记'}
                          </span>
                          <time
                            className="history-entry-time"
                            dateTime={entry.timestamp}
                          >
                            {formatTimestamp(entry.timestamp)}
                          </time>
                        </div>
                        <div className="history-entry-description">
                          操作：{entry.action === 'create'
                            ? '创建'
                            : entry.action === 'edit'
                              ? '编辑'
                              : '删除'}
                        </div>
                        <div className="history-entry-actions">
                          <button
                            type="button"
                            className={`history-action${selected ? ' is-active' : ''}`}
                            onClick={() => void handlePreview(entry)}
                          >
                            <Eye size={12} aria-hidden="true" />
                            预览
                          </button>
                          <button
                            type="button"
                            className="history-action is-primary-soft"
                            onClick={() => void handleRestore(entry.id)}
                          >
                            <RotateCcw size={12} aria-hidden="true" />
                            恢复此版本
                          </button>
                          <button
                            type="button"
                            className="history-action is-danger-soft"
                            onClick={() => handleDelete(entry.id)}
                          >
                            <Trash2 size={12} aria-hidden="true" />
                            删除
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {previewHistory && (
          <section className="history-preview" aria-label="历史版本预览">
            <header className="history-preview-header">
              <div className="history-preview-heading">
                <div>
                  <h4>版本预览</h4>
                  <div className="history-preview-meta">
                    {previewHistory.title} · {formatTimestamp(previewHistory.timestamp)}
                  </div>
                </div>
                <button
                  type="button"
                  className="history-preview-close"
                  onClick={() => {
                    previewRequestRef.current += 1
                    setPreviewLoading(false)
                    setPreviewHistory(null)
                  }}
                >
                  关闭预览
                </button>
              </div>
            </header>

            <div className="history-preview-content">
              {previewLoading ? (
                <div className="history-preview-loading" role="status">
                  <Loader2 size={18} className="spin" aria-hidden="true" />
                  <span>正在读取版本内容…</span>
                </div>
              ) : previewHistory.content.trim() ? (
                <div
                  className="tiptap-preview"
                  dangerouslySetInnerHTML={{
                    __html: renderDataTablesInHTML(previewHistory.content),
                  }}
                />
              ) : (
                <p className="history-preview-empty">（无内容）</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
