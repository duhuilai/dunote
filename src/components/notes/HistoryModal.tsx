import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '@/store'
import { readVersion } from '@/utils/gitBackup'
import { renderDataTablesInHTML } from '@/utils/dataTablePreview'
import { listSnapshots, readSnapshot, deleteSnapshot, type SnapshotMeta } from '@/utils/noteSnapshots'
import { X, Clock, RotateCcw, Trash2, Eye, Loader2, Save } from 'lucide-react'

/* ─── Color Tokens ─── */
const C = {
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryLight: 'rgba(37,99,235,0.1)',
  accent: '#06B6D4',
  bg: '#F8FAFC',
  border: '#E2E8F0',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  surface: '#FFFFFF',
} as const

export default function HistoryModal({
  onRestore,
  initialTab = 'history',
}: {
  onRestore?: (noteId: string, content: string, title: string, filePath?: string) => void
  /** 打开时默认落在哪个页签：'snapshots' = 本地实时保存版本 */
  initialTab?: 'history' | 'snapshots'
}) {
  const { showHistory, setShowHistory, history, selectedNoteId, restoreFromHistory, deleteHistoryEntry, settings, updateHistoryContent, showToast } = useAppStore()
  const [previewHistory, setPreviewHistory] = useState<any | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  /** 'history'=git/内存历史；'snapshots'=本地保存快照（每次落盘留档，用于数据出错后找回） */
  const [tab, setTab] = useState<'history' | 'snapshots'>('history')
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [snapLoading, setSnapLoading] = useState(false)

  // 每次打开弹窗时回到调用方指定的页签（「实时历史恢复」按钮会指定 snapshots）
  useEffect(() => {
    if (showHistory) setTab(initialTab)
  }, [showHistory, initialTab])

  // 切到「本地保存版本」页签时加载该笔记的快照列表
  useEffect(() => {
    if (!showHistory || tab !== 'snapshots' || !selectedNoteId) return
    let alive = true
    setSnapLoading(true)
    listSnapshots(selectedNoteId)
      .then((list) => { if (alive) setSnapshots(list) })
      .catch(() => { if (alive) setSnapshots([]) })
      .finally(() => { if (alive) setSnapLoading(false) })
    return () => { alive = false }
  }, [showHistory, tab, selectedNoteId])

  // 预览时也要从 git 读取真实内容（git 备份模式下 history.content 可能为空）
  // ⚠️ 必须在 early return 之前调用，否则违反 Hooks 规则（React error #310）
  const handlePreview = useCallback(async (entry: any) => {
    try {
      let content = entry.content
      if ((!content || !content.trim()) && entry.oid && entry.repoDir && entry.relPath) {
        setPreviewLoading(true)
        try {
          const fresh = await readVersion(entry.repoDir, entry.relPath, entry.oid)
          if (fresh != null) {
            content = fresh
            updateHistoryContent(entry.id, fresh)
            entry.content = fresh
          }
        } catch {
          /* 读取失败则显示已有内容 */
        } finally {
          setPreviewLoading(false)
        }
      }
      setPreviewHistory({ ...entry, content })
    } catch (err) {
      console.error('[HistoryModal] handlePreview failed:', err)
    }
  }, [updateHistoryContent])

  if (!showHistory) return null

  const noteHistory = history.filter((h) => h.noteId === selectedNoteId)

  const handleRestore = async (historyId: string) => {
    try {
      const entry = noteHistory.find((h) => h.id === historyId)
      if (!entry) {
        showToast('恢复失败：找不到该历史版本', 'error')
        return
      }

      // git 备份模式：从对应 commit 读取真实文件内容（本地与 Gitee 镜像一致）
      let content = entry.content
      if ((!content || !content.trim()) && entry.oid && entry.repoDir && entry.relPath) {
        const fresh = await readVersion(entry.repoDir, entry.relPath, entry.oid)
        if (fresh != null) {
          content = fresh
          updateHistoryContent(entry.id, fresh)
          entry.content = fresh
        }
      }

      // 内容仍为空 → 直接中止并提示，避免用空内容覆盖现有笔记
      if (!content || !content.trim()) {
        showToast('恢复失败：该历史版本内容为空（可能已被清理）', 'error')
        return
      }

      restoreFromHistory(historyId)
      setPreviewHistory(null)
      setShowHistory(false)
      // Notify parent so it can handle local file writes
      if (onRestore) {
        onRestore(entry.noteId, content, entry.title, (entry as any).filePath)
      }
    } catch (err) {
      console.error('[HistoryModal] handleRestore failed:', err)
      showToast(`恢复失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleDelete = (historyId: string) => {
    deleteHistoryEntry(historyId)
    if (previewHistory?.id === historyId) {
      setPreviewHistory(null)
    }
  }

  /* ─── 本地保存快照：预览 / 恢复 / 删除 ─── */
  const handlePreviewSnapshot = useCallback(async (meta: SnapshotMeta) => {
    if (!selectedNoteId) return
    try {
      setPreviewLoading(true)
      const content = await readSnapshot(selectedNoteId, meta.ts)
      setPreviewHistory({ id: `snap-${meta.ts}`, title: meta.title || '本地保存版本', content, timestamp: new Date(meta.ts).toISOString() })
    } catch (err) {
      console.error('[HistoryModal] 读取快照失败:', err)
      showToast('读取该保存版本失败', 'error')
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedNoteId, showToast])

  const handleRestoreSnapshot = useCallback(async (meta: SnapshotMeta) => {
    if (!selectedNoteId) return
    try {
      const content = await readSnapshot(selectedNoteId, meta.ts)
      if (!content || !content.trim()) {
        showToast('恢复失败：该保存版本内容为空', 'error')
        return
      }
      setPreviewHistory(null)
      setShowHistory(false)
      // 复用与历史版本相同的恢复回调（内部区分普通笔记 / 本地文件笔记并刷新编辑器）
      if (onRestore) onRestore(selectedNoteId, content, meta.title || '', undefined)
    } catch (err) {
      console.error('[HistoryModal] 恢复快照失败:', err)
      showToast(`恢复失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [selectedNoteId, onRestore, setShowHistory, showToast])

  const handleDeleteSnapshot = useCallback(async (ts: number) => {
    if (!selectedNoteId) return
    await deleteSnapshot(selectedNoteId, ts)
    setSnapshots((prev) => prev.filter((s) => s.ts !== ts))
    if (previewHistory?.id === `snap-${ts}`) setPreviewHistory(null)
  }, [selectedNoteId, previewHistory])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
        }}
        onClick={() => setShowHistory(false)}
      />

      {/* Card */}
      <div
        style={{
          position: 'relative',
          background: C.surface,
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          width: previewHistory ? '900px' : '560px',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        {/* ─── Left Panel: History List ─── */}
        <div
          style={{
            flex: previewHistory ? '0 0 380px' : '1',
            display: 'flex',
            flexDirection: 'column',
            borderRight: previewHistory ? `1px solid ${C.border}` : 'none',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: `1px solid ${C.border}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: C.primary }} />
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: C.text,
                  margin: 0,
                }}
              >
                {tab === 'snapshots' ? '本地保存版本' : '历史记录'}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', background: C.bg, borderRadius: '8px', padding: '2px', border: `1px solid ${C.border}` }}>
                {([
                  { key: 'history' as const, label: '历史记录' },
                  { key: 'snapshots' as const, label: '本地保存版本' },
                ]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key); setPreviewHistory(null) }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: tab === t.key ? C.surface : 'transparent',
                      color: tab === t.key ? C.primary : C.textMuted,
                      fontSize: '12px',
                      fontWeight: tab === t.key ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: tab === t.key ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            <button
              onClick={() => { setShowHistory(false); setPreviewHistory(null) }}
              style={{
                padding: '4px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <X size={18} style={{ color: C.textMuted }} />
            </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {tab === 'snapshots' ? (
              snapLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0', color: C.textMuted, gap: '8px' }}>
                  <Loader2 size={16} className="spin" />
                  <span style={{ fontSize: '13px' }}>加载中…</span>
                </div>
              ) : snapshots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: C.textMuted, fontSize: '14px' }}>
                  暂无本地保存版本
                  <div style={{ fontSize: '12px', marginTop: '6px' }}>本地文件笔记在每次自动保存成功后会自动留档</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {snapshots.map((s) => (
                    <div
                      key={s.ts}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px',
                        borderRadius: '12px',
                        background: previewHistory?.id === `snap-${s.ts}` ? C.primaryLight : C.bg,
                        border: `1px solid ${previewHistory?.id === `snap-${s.ts}` ? C.primary : C.border}`,
                      }}
                    >
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: 'rgba(16,185,129,0.12)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px',
                      }}>
                        <Save size={14} style={{ color: C.success }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.title || '本地保存版本'}
                          </span>
                          <span style={{ fontSize: '11px', color: C.textMuted, flexShrink: 0, marginLeft: '8px' }}>
                            {new Date(s.ts).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: C.textSecondary, marginBottom: '8px' }}>
                          自动保存留档 · {(s.bytes / 1024).toFixed(1)} KB
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handlePreviewSnapshot(s)} style={{
                            display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                            borderRadius: '8px',
                            background: previewHistory?.id === `snap-${s.ts}` ? C.primary : '#F1F5F9',
                            color: previewHistory?.id === `snap-${s.ts}` ? '#FFFFFF' : C.textSecondary,
                            fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <Eye size={12} />预览
                          </button>
                          <button onClick={() => handleRestoreSnapshot(s)} style={{
                            display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                            borderRadius: '8px', background: C.primaryLight, color: C.primary,
                            fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <RotateCcw size={12} />恢复此版本
                          </button>
                          <button onClick={() => handleDeleteSnapshot(s.ts)} style={{
                            display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                            borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: C.danger,
                            fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <Trash2 size={12} />删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : noteHistory.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 0',
                  color: C.textMuted,
                  fontSize: '14px',
                }}
              >
                暂无历史记录
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {noteHistory.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '12px',
                      background: previewHistory?.id === h.id ? C.primaryLight : C.bg,
                      border: `1px solid ${previewHistory?.id === h.id ? C.primary : C.border}`,
                    }}
                  >
                    {/* Clock icon circle */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: C.primaryLight,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <Clock size={14} style={{ color: C.primary }} />
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title + timestamp row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: C.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h.title}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: C.textMuted,
                            flexShrink: 0,
                            marginLeft: '8px',
                          }}
                        >
                          {new Date(h.timestamp).toLocaleString('zh-CN')}
                        </span>
                      </div>

                      {/* Action description */}
                      <div
                        style={{
                          fontSize: '12px',
                          color: C.textSecondary,
                          marginBottom: '8px',
                        }}
                      >
                        操作: {h.action === 'create' ? '创建' : h.action === 'edit' ? '编辑' : '删除'}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Preview button */}
                        <button
                          onClick={() => handlePreview(h)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            background: previewHistory?.id === h.id ? C.primary : '#F1F5F9',
                            color: previewHistory?.id === h.id ? '#FFFFFF' : C.textSecondary,
                            fontSize: '12px',
                            fontWeight: 500,
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            if (previewHistory?.id !== h.id) {
                              e.currentTarget.style.background = '#E2E8F0'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (previewHistory?.id !== h.id) {
                              e.currentTarget.style.background = '#F1F5F9'
                            }
                          }}
                        >
                          <Eye size={12} />
                          预览
                        </button>

                        {/* Restore button */}
                        <button
                          onClick={() => handleRestore(h.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            background: C.primaryLight,
                            color: C.primary,
                            fontSize: '12px',
                            fontWeight: 500,
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(37,99,235,0.2)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = C.primaryLight
                          }}
                        >
                          <RotateCcw size={12} />
                          恢复此版本
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={() => handleDelete(h.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            background: 'rgba(239,68,68,0.08)',
                            color: C.danger,
                            fontSize: '12px',
                            fontWeight: 500,
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                          }}
                        >
                          <Trash2 size={12} />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right Panel: Preview ─── */}
        {previewHistory && (
          <div
            style={{
              flex: '1',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Preview header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${C.border}`,
                background: '#FAFBFC',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: C.text, margin: 0 }}>
                  版本预览
                </h4>
                <button
                  onClick={() => setPreviewHistory(null)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: C.textSecondary,
                    fontFamily: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  关闭预览
                </button>
              </div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>
                {previewHistory.title} · {new Date(previewHistory.timestamp).toLocaleString('zh-CN')}
              </div>
            </div>

            {/* Preview content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
              }}
            >
              {previewLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textMuted, gap: '8px' }}>
                  <Loader2 size={18} className="spin" />
                  <span style={{ fontSize: '14px' }}>加载中…</span>
                </div>
              ) : (
                <div
                  className="tiptap-preview"
                  dangerouslySetInnerHTML={{ __html: renderDataTablesInHTML(previewHistory.content || '<p style="color:#94A3B8">（无内容）</p>') }}
                  style={{
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: C.text,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
