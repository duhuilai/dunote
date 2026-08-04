import { useState } from 'react'
import { useAppStore } from '@/store'
import { isOverdue } from '@/utils/taskUtils'
import { AlertTriangle, X, ChevronDown, ChevronUp, Clock } from 'lucide-react'

/**
 * 全局超期任务通知：无论当前在哪个页面（笔记 / 人员 / 任务 / 分析 / 设置），
 * 只要存在已超期且未完成的任务，就在右下角常驻显示提示，可展开查看清单。
 */
export default function OverdueNotifier() {
  const tasks = useAppStore((s) => s.tasks)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const [collapsed, setCollapsed] = useState(false)

  const overdue = tasks.filter(isOverdue)
  if (overdue.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        zIndex: 9998,
        width: '320px',
        maxWidth: 'calc(100vw - 40px)',
        background: '#FFFFFF',
        borderRadius: '14px',
        boxShadow: '0 12px 32px rgba(15,23,42,0.18), 0 0 0 1px rgba(239,68,68,0.15)',
        fontFamily: 'inherit',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 14px',
          background: 'linear-gradient(135deg,#EF4444,#DC2626)',
          color: '#fff',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={16} />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.6)',
              animation: 'dunote-pulse 1.8s ease-out infinite',
            }}
          />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>{overdue.length} 个任务已超期</div>
          <div style={{ fontSize: '11px', opacity: 0.85, lineHeight: 1.3 }}>点击{collapsed ? '展开' : '收起'}清单</div>
        </div>
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {/* List */}
      {!collapsed && (
        <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px' }}>
          {overdue.map((t) => (
            <div
              key={t.id}
              onClick={() => setCurrentPage('tasks')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                borderBottom: '1px solid #F1F5F9',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <Clock size={15} style={{ color: '#EF4444', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  截止 {t.expectedEndTime}
                  {t.responsiblePerson ? ` · ${t.responsiblePerson}` : ''}
                </div>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444', flexShrink: 0 }}>{t.progress}%</span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes dunote-pulse{0%{transform:scale(1);opacity:.7}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}`}</style>
    </div>
  )
}
