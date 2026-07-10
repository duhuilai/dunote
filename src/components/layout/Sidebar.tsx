import { useState } from 'react'
import { useAppStore } from '@/store'
import type { PageKey } from '@/types'
import { installUpdate } from '@/utils/update'
import {
  FileText, Users, CheckSquare, BarChart3, Settings, ChevronLeft, ChevronRight, Download, RefreshCw
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
  const appVersion = useAppStore((s) => s.appVersion)
  const updateInfo = useAppStore((s) => s.updateInfo)
  const showToast = useAppStore((s) => s.showToast)
  const [downloading, setDownloading] = useState(false)

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.assetUrl || !updateInfo?.assetName) return
    setDownloading(true)
    showToast('正在下载更新…', 'info')
    const res = await installUpdate(updateInfo.assetUrl, updateInfo.assetName)
    setDownloading(false)
    if (res.ok) {
      showToast(res.message || '已启动安装程序', 'success')
    } else {
      showToast(res.message || '更新失败', 'error')
    }
  }

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

      {/* User / Version / Update */}
      <div style={{
        padding: sidebarCollapsed ? '12px 14px' : '12px 14px',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', 
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{
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
              <div style={{ fontSize: 11, color: '#94A3B8' }}>v{appVersion}</div>
            </div>
          )}
        </div>

        {/* 更新提示 */}
        {!sidebarCollapsed && updateInfo?.hasUpdate && (
          <button
            onClick={handleDownloadUpdate}
            disabled={downloading}
            title={`发现新版本 v${updateInfo.latestVersion}，点击下载并更新`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid #BBF7D0',
              background: '#F0FDF4',
              color: '#166534',
              fontSize: 12, fontWeight: 600,
              cursor: downloading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: downloading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.background = '#DCFCE7' }}
            onMouseLeave={(e) => { if (!downloading) e.currentTarget.style.background = '#F0FDF4' }}
          >
            {downloading ? <RefreshCw size={14} className="spin" /> : <Download size={14} />}
            {downloading ? '下载中…' : `发现新版本 v${updateInfo.latestVersion}`}
          </button>
        )}
      </div>
    </div>
  )
}
