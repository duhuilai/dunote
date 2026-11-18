import { useState } from 'react'
import { useAppStore } from '@/store'
import { isOverdue } from '@/utils/taskUtils'
import { AlertTriangle, ChevronDown, ChevronUp, Clock } from 'lucide-react'

/**
 * 全局超期任务提示：在任何页面都显示超期数量，展开后可快速进入任务管理。
 */
export default function OverdueNotifier() {
  const tasks = useAppStore((s) => s.tasks)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const [collapsed, setCollapsed] = useState(false)

  const overdue = tasks.filter(isOverdue)
  if (overdue.length === 0) return null

  return (
    <aside
      aria-live="polite"
      style={{
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        zIndex: 30,
        width: '340px',
        maxWidth: 'calc(100vw - 24px)',
        overflow: 'hidden',
        border: '1px solid var(--app-danger-border)',
        borderRadius: '12px',
        background: 'var(--app-surface-elevated)',
        boxShadow: 'var(--app-shadow)',
        color: 'var(--app-text)',
        fontFamily: 'inherit',
      }}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="overdue-task-list"
        onClick={() => setCollapsed((value) => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          padding: '12px 14px',
          border: 0,
          background: 'var(--app-danger)',
          color: 'var(--app-on-primary)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            flexShrink: 0,
            borderRadius: '50%',
            background: 'color-mix(in srgb, currentColor 16%, transparent)',
          }}
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid currentColor',
              borderRadius: '50%',
              opacity: 0.55,
              animation: 'dunote-pulse 1.8s ease-out infinite',
            }}
          />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>
            {overdue.length} 个任务已超期
          </span>
          <span style={{ display: 'block', marginTop: '2px', fontSize: '11px', lineHeight: 1.3, opacity: 0.82 }}>
            点击{collapsed ? '展开' : '收起'}清单
          </span>
        </span>
        {collapsed ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
      </button>

      {!collapsed && (
        <div id="overdue-task-list" style={{ maxHeight: '320px', overflowY: 'auto', padding: '6px' }}>
          {overdue.map((task) => (
            <button
              type="button"
              key={task.id}
              onClick={() => setCurrentPage('tasks')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                width: '100%',
                padding: '10px',
                border: 0,
                borderBottom: '1px solid var(--app-border)',
                borderRadius: '8px',
                background: 'transparent',
                color: 'var(--app-text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--app-danger-bg)' }}
              onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
            >
              <Clock size={15} aria-hidden="true" style={{ color: 'var(--app-danger)', marginTop: '2px', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    color: 'var(--app-text)',
                    fontSize: '13px',
                    fontWeight: 600,
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.name}
                </span>
                <span style={{ display: 'block', marginTop: '2px', color: 'var(--app-text-secondary)', fontSize: '11px' }}>
                  截止 {task.expectedEndTime}
                  {task.responsiblePerson ? ` · ${task.responsiblePerson}` : ''}
                </span>
              </span>
              <span style={{ flexShrink: 0, color: 'var(--app-danger)', fontSize: '12px', fontWeight: 700 }}>
                {task.progress}%
              </span>
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes dunote-pulse{0%{transform:scale(1);opacity:.7}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}`}</style>
    </aside>
  )
}
