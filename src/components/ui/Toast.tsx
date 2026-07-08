import type { ReactNode } from 'react'
import { useAppStore } from '@/store'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

const STYLE: Record<string, { bg: string; color: string; border: string; icon: ReactNode }> = {
  success: {
    bg: '#ECFDF5',
    color: '#047857',
    border: '#6EE7B7',
    icon: <CheckCircle2 size={18} style={{ color: '#10B981' }} />,
  },
  error: {
    bg: '#FEF2F2',
    color: '#B91C1C',
    border: '#FCA5A5',
    icon: <XCircle size={18} style={{ color: '#EF4444' }} />,
  },
  info: {
    bg: '#EFF6FF',
    color: '#1D4ED8',
    border: '#93C5FD',
    icon: <Info size={18} style={{ color: '#3B82F6' }} />,
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
      style={{
        position: 'fixed',
        top: '24px',
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
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        fontSize: '14px',
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        userSelect: 'none',
        animation: 'toastIn 0.2s ease-out',
      }}
    >
      {s.icon}
      <span>{toast.message}</span>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
    </div>
  )
}
