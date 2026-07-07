import { useAppStore } from '@/store'
import type { PageKey } from '@/types'
import {
  FileText, Users, CheckSquare, BarChart3, Settings, ChevronLeft, ChevronRight
} from 'lucide-react'

const navItems: { key: PageKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'notes', label: '笔记管理', icon: FileText },
  { key: 'personnel', label: '人员管理', icon: Users },
  { key: 'tasks', label: '任务管理', icon: CheckSquare },
  { key: 'analytics', label: '分析统计', icon: BarChart3 },
  { key: 'settings', label: '系统设置', icon: Settings },
]

const sidebarStyle: React.CSSProperties = {
  width: 220,
  minWidth: 220,
  maxWidth: 220,
  background: '#F1F5F9',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  userSelect: 'none',
  height: '100%',
  transition: 'width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease',
}

const collapsedSidebarStyle: React.CSSProperties = {
  width: 64,
  minWidth: 64,
  maxWidth: 64,
  background: '#F1F5F9',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  userSelect: 'none',
  height: '100%',
  transition: 'width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease',
}

export default function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <div style={sidebarCollapsed ? collapsedSidebarStyle : sidebarStyle}>
      {/* Logo */}
      <div style={{ padding: sidebarCollapsed ? '20px 14px 16px' : '20px 20px 16px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
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
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1E293B', lineHeight: 1.2 }}>duNote</div>
              <div style={{ fontSize: 10, color: '#94A3B8', letterSpacing: 1 }}>NOTE MANAGER</div>
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-end',
          padding: sidebarCollapsed ? '6px 0' : '6px 14px',
          border: 'none',
          background: 'transparent',
          color: '#94A3B8',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#1E293B'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#94A3B8'
        }}
      >
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '4px 10px 12px', overflowY: 'auto' }}>
        {navItems.map(({ key, label, icon: Icon }) => {
          const isActive = currentPage === key
          return (
            <button
              key={key}
              onClick={() => setCurrentPage(key)}
              title={sidebarCollapsed ? label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: sidebarCollapsed ? '10px 0' : '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? 'rgba(37,99,235,0.1)' : 'transparent',
                color: isActive ? '#2563EB' : '#475569',
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
                if (!isActive) e.currentTarget.style.background = '#E2E8F0'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Icon size={18} />
              {!sidebarCollapsed && label}
            </button>
          )
        })}
      </nav>

      {/* User */}
      <div style={{
        padding: sidebarCollapsed ? '12px 14px' : '12px 14px',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', 
        alignItems: 'center', 
        gap: 10,
        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600, color: '#fff',
          flexShrink: 0,
        }}>
          D
        </div>
        {!sidebarCollapsed && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>开发者</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>v1.0.0</div>
          </div>
        )}
      </div>
    </div>
  )
}
