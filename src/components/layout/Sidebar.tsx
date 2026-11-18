import { useAppStore } from '@/store'
import type { PageKey } from '@/types'
import UpdateDownloader from '@/components/update/UpdateDownloader'
import {
  FileText, Users, CheckSquare, BarChart3, Settings, ChevronLeft, ChevronRight, Sparkles
} from 'lucide-react'

const navItems: { key: PageKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'notes', label: '笔记管理', icon: FileText },
  { key: 'ai', label: 'AI 工作台', icon: Sparkles },
  { key: 'personnel', label: '人员管理', icon: Users },
  { key: 'tasks', label: '任务管理', icon: CheckSquare },
  { key: 'analytics', label: '分析统计', icon: BarChart3 },
  { key: 'settings', label: '系统设置', icon: Settings },
]

export default function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const appVersion = useAppStore((s) => s.appVersion)

  return (
    <aside className={`app-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
      {/* Logo */}
      <div
        className="sidebar-logo"
        style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--app-sidebar-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
          <img
            src="/logo.png"
            alt="duNote"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              objectFit: 'cover',
            }}
          />
          <div className="sidebar-brand-copy" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--app-text)', lineHeight: 1.2 }}>duNote</div>
            <div style={{ fontSize: 10, color: 'var(--app-text-muted)', letterSpacing: 1 }}>NOTE MANAGER</div>
          </div>
      </div>

      {/* Toggle Button */}
      <button
        className="sidebar-toggle"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        aria-expanded={!sidebarCollapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-end',
          padding: sidebarCollapsed ? '6px 0' : '6px 14px',
          border: 'none',
          background: 'transparent',
          color: 'var(--app-text-muted)',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--app-text)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--app-text-muted)'
        }}
      >
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="主导航" style={{ flex: 1, padding: '4px 10px 12px', overflowY: 'auto' }}>
        {navItems.map(({ key, label, icon: Icon }) => {
          const isActive = currentPage === key
          return (
            <button
              key={key}
              className="sidebar-nav-button"
              onClick={() => setCurrentPage(key)}
              title={label}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: sidebarCollapsed ? '10px 0' : '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? 'var(--app-primary-light)' : 'transparent',
                color: isActive ? 'var(--app-primary)' : 'var(--app-text-secondary)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                marginBottom: 4,
                transition: 'all 0.15s',
                textAlign: 'left',
                fontFamily: 'inherit',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--app-hover)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Icon size={18} />
              <span className="sidebar-label">{label}</span>
            </button>
          )
        })}
      </nav>

      {/* User / Version / Update */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid var(--app-sidebar-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div className="sidebar-user" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--app-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600, color: 'var(--app-on-primary)',
            flexShrink: 0,
          }}>
            D
          </div>
          <div className="sidebar-label" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--app-text)' }}>开发者</div>
            <div style={{ fontSize: 11, color: 'var(--app-text-muted)' }}>v{appVersion}</div>
          </div>
        </div>

        {/* 更新提示 */}
        <div className="sidebar-update">
          <UpdateDownloader variant="compact" />
        </div>
      </div>
    </aside>
  )
}
