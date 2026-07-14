import { useEffect, useRef, useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { getFormatExt, type ExportFormat } from '@/utils/exportNote'

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
  /** 由父组件执行真正的生成+写入（写入下载文件夹），成功/失败由父组件 toast。 */
  onSave: (filename: string) => Promise<void>
  /** 打开原生保存对话框选择其他位置（保留操作系统原生按钮）。 */
  onChooseOther: () => void
}

export function ExportSaveModal({ format, defaultTitle, onClose, onSave, onChooseOther }: Props) {
  const ext = getFormatExt(format)
  const [name, setName] = useState(defaultTitle)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 聚焦并选中文件名（不含扩展名部分），方便直接改写
    const el = inputRef.current
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      let fname = name.trim() || defaultTitle
      if (!fname.toLowerCase().endsWith('.' + ext)) fname += '.' + ext
      await onSave(fname)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: '92vw',
          background: '#FFFFFF',
          borderRadius: 14,
          boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
          border: '1px solid #E2E8F0',
          padding: 20,
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>
            导出为 {FORMAT_LABELS[format]}
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', padding: 2 }}
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>文件名</div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '9px 11px',
            fontSize: 13,
            border: '1px solid #CBD5E1',
            borderRadius: 8,
            outline: 'none',
            fontFamily: 'inherit',
            color: '#1E293B',
          }}
        />
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
          将保存到「下载」文件夹，格式：{ext}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '9px 0',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: saving ? '#93B4F0' : '#2563EB',
              border: 'none',
              borderRadius: 8,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '9px 0',
              fontSize: 13,
              color: '#475569',
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
        </div>

        <button
          onClick={onChooseOther}
          style={{
            marginTop: 12,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '7px 0',
            fontSize: 12,
            color: '#2563EB',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <FolderOpen size={13} /> 选择其他位置…
        </button>
      </div>
    </div>
  )
}
