import { useId, useRef, useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { getFormatExt, type ExportFormat } from '@/utils/exportNote'
import { useModalDialog } from '@/hooks/useModalDialog'

const FORMAT_LABELS: Record<ExportFormat, string> = {
  markdown: 'Markdown 文档',
  html: 'HTML 网页',
  word: 'Word 文档',
  pdf: 'PDF 文档',
}

interface Props {
  format: ExportFormat
  defaultTitle: string
  onClose: () => void
  /** 由父组件执行真正的生成与写入，成功/失败由父组件提示。 */
  onSave: (filename: string) => Promise<void>
  /** 打开原生保存对话框并选择其他位置。 */
  onChooseOther: () => void
}

export function ExportSaveModal({
  format,
  defaultTitle,
  onClose,
  onSave,
  onChooseOther,
}: Props) {
  const ext = getFormatExt(format)
  const [name, setName] = useState(defaultTitle)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const handleClose = () => {
    if (!savingRef.current) onClose()
  }

  useModalDialog({
    open: true,
    onClose: handleClose,
    dialogRef,
    initialFocusRef: inputRef,
  })

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      let filename = name.trim() || defaultTitle
      if (!filename.toLowerCase().endsWith('.' + ext)) filename += '.' + ext
      await onSave(filename)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const handleChooseOther = () => {
    if (savingRef.current) return
    onChooseOther()
  }

  return (
    <div
      onMouseDown={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--app-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: 'min(400px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          boxSizing: 'border-box',
          background: 'var(--app-surface-elevated)',
          color: 'var(--app-text)',
          borderRadius: '12px',
          boxShadow: 'var(--app-shadow)',
          border: '1px solid var(--app-border)',
          padding: '20px',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div id={titleId} style={{ fontSize: '15px', fontWeight: 600, color: 'var(--app-text)' }}>
            导出为 {FORMAT_LABELS[format]}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: saving ? 'default' : 'pointer',
              color: 'var(--app-text-muted)',
              padding: '3px',
              borderRadius: '6px',
              display: 'flex',
            }}
            title="关闭"
            aria-label="关闭导出对话框"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label
          htmlFor="export-save-filename"
          style={{ display: 'block', fontSize: '12px', color: 'var(--app-text-secondary)', marginBottom: '6px' }}
        >
          文件名
        </label>
        <input
          id="export-save-filename"
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleSave()
            }
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '9px 11px',
            fontSize: '13px',
            border: '1px solid var(--app-border)',
            borderRadius: '8px',
            outline: 'none',
            fontFamily: 'inherit',
            color: 'var(--app-text)',
            background: 'var(--app-bg)',
          }}
        />
        <div style={{ fontSize: '11px', color: 'var(--app-text-muted)', marginTop: '6px', overflowWrap: 'anywhere' }}>
          将保存到「下载」文件夹，格式：{ext}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            style={{
              flex: '1 1 120px',
              padding: '9px 12px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--app-on-primary)',
              background: 'var(--app-primary)',
              border: 'none',
              borderRadius: '8px',
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: saving ? 0.65 : 1,
            }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              flex: '1 1 120px',
              padding: '9px 12px',
              fontSize: '13px',
              color: 'var(--app-text-secondary)',
              background: 'var(--app-hover)',
              border: '1px solid var(--app-border)',
              borderRadius: '8px',
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            取消
          </button>
        </div>

        <button
          type="button"
          onClick={handleChooseOther}
          disabled={saving}
          style={{
            marginTop: '12px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 0',
            fontSize: '12px',
            color: 'var(--app-primary)',
            background: 'transparent',
            border: 'none',
            cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <FolderOpen size={13} aria-hidden="true" />
          选择其他位置…
        </button>
      </div>
    </div>
  )
}
