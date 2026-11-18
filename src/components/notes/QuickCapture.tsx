import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Save, X, Zap } from 'lucide-react'
import { useModalDialog } from '@/hooks/useModalDialog'

interface QuickCaptureProps {
  open: boolean
  onClose: () => void
  onSave: (title: string, content: string) => Promise<boolean>
}

export default function QuickCapture({ open, onClose, onSave }: QuickCaptureProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setContent('')
    setSaving(false)
  }, [open])

  const closeWhenAvailable = () => {
    if (!saving) onClose()
  }

  useModalDialog({
    open,
    onClose: closeWhenAvailable,
    dialogRef,
    initialFocusRef: contentRef,
  })

  if (!open) return null

  const canSave = Boolean(title.trim() || content.trim())

  const submit = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      if (await onSave(title, content)) onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void submit()
    }
  }

  return createPortal(
    <div
      className="quick-capture-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeWhenAvailable()
      }}
    >
      <div
        ref={dialogRef}
        className="quick-capture-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-capture-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="quick-capture-header">
          <span className="quick-capture-icon" aria-hidden="true">
            <Zap size={17} />
          </span>
          <div>
            <h2 id="quick-capture-title">快速记录</h2>
            <p>先记下来，稍后再整理</p>
          </div>
          <button
            type="button"
            className="quick-capture-close"
            onClick={closeWhenAvailable}
            disabled={saving}
            aria-label="关闭快速记录"
            title="关闭（Esc）"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <input
          ref={titleRef}
          className="quick-capture-title-input"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              contentRef.current?.focus()
            }
          }}
          placeholder="标题（可选）"
          aria-label="快速记录标题"
        />

        <textarea
          ref={contentRef}
          className="quick-capture-content-input"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="写点什么…"
          aria-label="快速记录正文"
        />

        <div className="quick-capture-footer">
          <button
            type="button"
            className="quick-capture-secondary"
            onClick={closeWhenAvailable}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="quick-capture-primary"
            onClick={() => void submit()}
            disabled={!canSave || saving}
          >
            {saving
              ? <Loader2 size={15} className="spin" aria-hidden="true" />
              : <Save size={15} aria-hidden="true" />}
            <span>{saving ? '保存中…' : '保存记录'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
