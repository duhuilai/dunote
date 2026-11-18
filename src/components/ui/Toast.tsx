import type { ReactNode } from 'react'
import { useAppStore } from '@/store'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

const STYLE: Record<string, { bg: string; color: string; border: string; icon: ReactNode }> = {
  success: {
    bg: 'var(--app-success-bg)',
    color: 'var(--app-success)',
    border: 'var(--app-success-border)',
    icon: <CheckCircle2 size={18} style={{ color: 'var(--app-success)' }} />,
  },
  error: {
    bg: 'var(--app-danger-bg)',
    color: 'var(--app-danger)',
    border: 'var(--app-danger-border)',
    icon: <XCircle size={18} style={{ color: 'var(--app-danger)' }} />,
  },
  info: {
    bg: 'var(--app-info-bg)',
    color: 'var(--app-primary)',
    border: 'var(--app-info-border)',
    icon: <Info size={18} style={{ color: 'var(--app-primary)' }} />,
  },
}

export default function Toast() {
  const toast = useAppStore((s) => s.toast)
  const hideToast = useAppStore((s) => s.hideToast)
  if (!toast) return null

  const s = STYLE[toast.type] ?? STYLE.info

  return (
    <div
      onClick={hideToast}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          hideToast()
        }
      }}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      tabIndex={0}
      style={{
        position: 'fixed',
        top: 'max(16px, env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 20px',
        borderRadius: '12px',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        boxShadow: 'var(--app-shadow)',
        fontSize: '14px',
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        boxSizing: 'border-box',
        maxWidth: 'calc(100vw - 32px)',
        overflowWrap: 'anywhere',
        animation: 'toastIn 0.2s ease-out',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{s.icon}</span>
      <span style={{ minWidth: 0, lineHeight: 1.45 }}>{toast.message}</span>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
    </div>
  )
}
