import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'

/* ─── Color Tokens ─── */
const C = {
  danger: '#EF4444',
  dangerHover: '#DC2626',
  dangerLight: 'rgba(239,68,68,0.08)',
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
} as const

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve })
    })
  }, [])

  const handleClose = useCallback((result: boolean) => {
    setState((prev) => {
      if (prev) prev.resolve(result)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
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
            onClick={() => handleClose(false)}
          />

          {/* Dialog */}
          <div
            style={{
              position: 'relative',
              background: C.surface,
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              width: '420px',
              maxWidth: '90vw',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => handleClose(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                padding: '4px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <X size={16} style={{ color: C.textMuted }} />
            </button>

            {/* Icon + Title */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: state.danger ? C.dangerLight : 'rgba(37,99,235,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} style={{ color: state.danger ? C.danger : C.primary }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: C.text,
                    margin: '0 0 4px 0',
                  }}
                >
                  {state.title || '确认操作'}
                </h3>
              </div>
            </div>

            {/* Message */}
            <p
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                color: C.textSecondary,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {state.message}
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => handleClose(false)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  color: C.textSecondary,
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.bg }}
                onMouseLeave={(e) => { e.currentTarget.style.background = C.surface }}
              >
                {state.cancelText || '取消'}
              </button>
              <button
                onClick={() => handleClose(true)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: state.danger ? C.danger : C.primary,
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = state.danger ? C.dangerHover : C.primaryHover }}
                onMouseLeave={(e) => { e.currentTarget.style.background = state.danger ? C.danger : C.primary }}
              >
                {state.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
