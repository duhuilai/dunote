import { useState } from 'react'
import { useAppStore } from '@/store'
import { X, Clock, RotateCcw, Trash2, Eye } from 'lucide-react'

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

export default function HistoryModal({ onRestore }: { onRestore?: (noteId: string, content: string, title: string, filePath?: string) => void }) {
  const { showHistory, setShowHistory, history, selectedNoteId, restoreFromHistory, deleteHistoryEntry } = useAppStore()
  const [previewHistory, setPreviewHistory] = useState<any | null>(null)

  if (!showHistory) return null

  const noteHistory = history.filter((h) => h.noteId === selectedNoteId)

  const handleRestore = (historyId: string) => {
    const entry = noteHistory.find((h) => h.id === historyId)
    restoreFromHistory(historyId)
    setPreviewHistory(null)
    // Notify parent so it can handle local file writes
    if (onRestore && entry) {
      onRestore(entry.noteId, entry.content, entry.title, (entry as any).filePath)
    }
  }

  const handleDelete = (historyId: string) => {
    deleteHistoryEntry(historyId)
    if (previewHistory?.id === historyId) {
      setPreviewHistory(null)
    }
  }

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
                历史记录
              </h3>
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

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {noteHistory.length === 0 ? (
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
                          onClick={() => setPreviewHistory(h)}
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
              <div
                className="tiptap-preview"
                dangerouslySetInnerHTML={{ __html: previewHistory.content }}
                style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: C.text,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
