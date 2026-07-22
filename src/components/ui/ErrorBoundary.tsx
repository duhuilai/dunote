import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/* 顶层错误边界：捕获子组件渲染异常，避免整个应用直接白板 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染异常:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '32px',
            background: '#F8FAFC',
            color: '#1E293B',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h2 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>出错了</h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#64748B', textAlign: 'center' }}>
            组件渲染发生异常，应用已自动恢复。
          </p>
          <pre
            style={{
              maxWidth: '100%',
              maxHeight: '200px',
              overflow: 'auto',
              padding: '12px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#EF4444',
            }}
          >
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
