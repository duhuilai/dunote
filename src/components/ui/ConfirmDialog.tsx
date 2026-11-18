import {
  useState,
  useCallback,
  createContext,
  useContext,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useModalDialog } from '@/hooks/useModalDialog'

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
  const [state, setState] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const messageId = useId()

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current?.(false)
      resolveRef.current = resolve
      setState(options)
    })
  }, [])

  const handleClose = useCallback((result: boolean) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setState(null)
  }, [])

  useModalDialog({
    open: state !== null,
    onClose: () => handleClose(false),
    dialogRef,
    initialFocusRef: confirmButtonRef,
  })

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
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--app-overlay)',
            }}
            onClick={() => handleClose(false)}
          />

          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            tabIndex={-1}
            style={{
              position: 'relative',
              background: 'var(--app-surface-elevated)',
              color: 'var(--app-text)',
              borderRadius: '12px',
              boxShadow: 'var(--app-shadow)',
              width: 'min(420px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              padding: '24px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <button
              type="button"
              onClick={() => handleClose(false)}
              aria-label="关闭确认对话框"
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                padding: '4px',
                borderRadius: '7px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--app-hover)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent'
              }}
            >
              <X size={16} style={{ color: 'var(--app-text-muted)' }} aria-hidden="true" />
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                aria-hidden="true"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: state.danger
                    ? 'var(--app-danger-bg)'
                    : 'var(--app-primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle
                  size={20}
                  style={{
                    color: state.danger
                      ? 'var(--app-danger)'
                      : 'var(--app-primary)',
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
                <h3
                  id={titleId}
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--app-text)',
                    margin: '0 0 4px 0',
                  }}
                >
                  {state.title || '确认操作'}
                </h3>
              </div>
            </div>

            <p
              id={messageId}
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                color: 'var(--app-text-secondary)',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {state.message}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleClose(false)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: '1px solid var(--app-border)',
                  background: 'var(--app-surface)',
                  color: 'var(--app-text-secondary)',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'var(--app-hover)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'var(--app-surface)'
                }}
              >
                {state.cancelText || '取消'}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => handleClose(true)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: state.danger
                    ? 'var(--app-danger)'
                    : 'var(--app-primary)',
                  color: state.danger
                    ? '#FFFFFF'
                    : 'var(--app-on-primary)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = state.danger
                    ? 'var(--app-danger-hover)'
                    : 'var(--app-primary-hover)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = state.danger
                    ? 'var(--app-danger)'
                    : 'var(--app-primary)'
                }}
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
