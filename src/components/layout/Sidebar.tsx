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
  background: '#0F172A',
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
  background: '#0F172A',
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
      <div style={{ padding: sidebarCollapsed ? '20px 14px 16px' : '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', lineHeight: 1.2 }}>duNote</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>NOTE MANAGER</div>
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        style={{
          position: 'absolute',
          right: -12,
          top: 28,
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
          background: '#0F172A',
          color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#1E293B'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#0F172A'
          e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
        }}
      >
        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
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
                background: isActive ? '#1E3A5F' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
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
                if (!isActive) e.currentTarget.style.background = '#1E293B'
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
        borderTop: '1px solid rgba(255,255,255,0.08)',
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
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>开发者</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>v1.0.0</div>
          </div>
        )}
      </div>
    </div>
  )
}
