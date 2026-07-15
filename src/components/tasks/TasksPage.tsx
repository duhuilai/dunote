import { useState } from 'react'
import { useAppStore } from '@/store'
import { Clock, CheckCircle2, AlertCircle, User, Calendar, Users as UsersIcon, X, Star, Plus } from 'lucide-react'

const colors = {
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryLight: 'rgba(37,99,235,0.1)',
  bg: '#F8FAFC',
  border: '#E2E8F0',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  success: '#10B981',
  successHover: '#059669',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  surface: '#FFFFFF',
}

const statusConfig = {
  pending: { label: '待开始', icon: AlertCircle, color: colors.warning, bg: colors.warningLight },
  running: { label: '进行中', icon: Clock, color: colors.primary, bg: '#EFF6FF' },
  completed: { label: '已完成', icon: CheckCircle2, color: colors.success, bg: colors.successLight },
}

export default function TasksPage() {
  const { tasks, updateTask, addTask, personnel } = useAppStore()
  const [filter, setFilter] = useState<'all' | 'pending' | 'running' | 'completed'>('all')
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [evalForm, setEvalForm] = useState({ evaluation: '', score: 0 })
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    content: '',
    responsiblePerson: '',
    participants: [] as string[],
    startTime: '',
    expectedEndTime: '',
    status: 'pending' as 'pending' | 'running' | 'completed',
    progress: 0,
  })

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  const tabs = [
    { key: 'all' as const, label: '全部', count: tasks.length },
    { key: 'pending' as const, label: '待开始', count: tasks.filter((t) => t.status === 'pending').length },
    { key: 'running' as const, label: '进行中', count: tasks.filter((t) => t.status === 'running').length },
    { key: 'completed' as const, label: '已完成', count: tasks.filter((t) => t.status === 'completed').length },
  ]

  const task = tasks.find((t) => t.id === selectedTask)

  const handleComplete = () => {
    if (!task) return
    updateTask(task.id, {
      status: 'completed',
      progress: 100,
      completionDate: new Date().toISOString().split('T')[0],
      evaluation: evalForm.evaluation,
      score: evalForm.score,
    })
    setSelectedTask(null)
    setEvalForm({ evaluation: '', score: 0 })
  }

  const handleCreate = () => {
    if (!createForm.name.trim()) return
    const progress =
      createForm.status === 'completed' ? 100 : createForm.status === 'running' ? Math.max(createForm.progress, 1) : 0
    addTask({
      id: `t-${Date.now()}`,
      name: createForm.name.trim(),
      content: createForm.content.trim(),
      startTime: createForm.startTime,
      expectedEndTime: createForm.expectedEndTime,
      responsiblePerson: createForm.responsiblePerson,
      participants: createForm.participants,
      status: createForm.status,
      progress,
    })
    setShowCreate(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.border}`, background: colors.surface, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: colors.text, margin: 0 }}>任务管理</h2>
          <button
            onClick={() => {
              setCreateForm({
                name: '',
                content: '',
                responsiblePerson: '',
                participants: [],
                startTime: '',
                expectedEndTime: '',
                status: 'pending',
                progress: 0,
              })
              setShowCreate(true)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: colors.primary, color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Plus size={15} />
            新建任务
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: colors.bg, borderRadius: '8px', padding: '4px' }}>
          {tabs.map((tab) => {
            const isActive = filter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: isActive ? colors.surface : 'transparent',
                  color: isActive ? colors.primary : colors.textSecondary,
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '9999px',
                  background: isActive ? colors.primaryLight : '#F1F5F9',
                  color: isActive ? colors.primary : colors.textMuted,
                }}>{tab.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Task Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredTasks.map((t) => {
            const cfg = statusConfig[t.status]
            const StatusIcon = cfg.icon
            const progressColor = t.status === 'completed' ? colors.success : t.status === 'running' ? colors.primary : '#E2E8F0'
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTask(t.id)}
                style={{ background: colors.surface, borderRadius: '12px', border: `1px solid ${colors.border}`, padding: '20px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <StatusIcon size={18} style={{ color: cfg.color }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: colors.text, margin: 0 }}>{t.name}</h3>
                  </div>
                  <span style={{ padding: '4px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500, background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '16px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.content}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', fontSize: '12px', color: colors.textMuted }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={13} />{t.responsiblePerson}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={13} />{t.startTime} ~ {t.expectedEndTime}</span>
                  {t.participants.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><UsersIcon size={13} />{t.participants.join(', ')}</span>
                  )}
                </div>
                {/* Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, height: '8px', background: colors.bg, borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '9999px', background: progressColor, width: `${t.progress}%` }} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: colors.textSecondary }}>{t.progress}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Task Detail Modal */}
      {task && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => { setSelectedTask(null); setEvalForm({ evaluation: '', score: 0 }) }} />
          <div style={{ position: 'relative', background: colors.surface, borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(() => { const I = statusConfig[task.status].icon; return <I size={18} style={{ color: statusConfig[task.status].color }} /> })()}
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: colors.text, margin: 0 }}>{task.name}</h3>
              </div>
              <button onClick={() => { setSelectedTask(null); setEvalForm({ evaluation: '', score: 0 }) }} style={{ padding: '4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                <X size={18} style={{ color: colors.textMuted }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: colors.textSecondary, marginBottom: '4px', display: 'block' }}>任务描述</label>
                <p style={{ fontSize: '13px', color: colors.text, lineHeight: 1.6, margin: 0 }}>{task.content}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <InfoRow icon={<User size={14} />} label="负责人" value={task.responsiblePerson} />
                <InfoRow icon={<UsersIcon size={14} />} label="参与人" value={task.participants.join(', ') || '无'} />
                <InfoRow icon={<Calendar size={14} />} label="开始时间" value={task.startTime} />
                <InfoRow icon={<Calendar size={14} />} label="预计完成" value={task.expectedEndTime} />
                {task.completionDate && <InfoRow icon={<CheckCircle2 size={14} />} label="实际完成" value={task.completionDate} />}
              </div>
              {/* Progress */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: colors.textSecondary }}>进度</label>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>{task.progress}%</span>
                </div>
                <div style={{ height: '10px', background: colors.bg, borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '9999px', background: task.status === 'completed' ? colors.success : colors.primary, width: `${task.progress}%` }} />
                </div>
              </div>

              {/* Evaluation (for completed tasks) */}
              {task.status === 'completed' && task.evaluation && (
                <div style={{ padding: '16px', background: colors.successLight, borderRadius: '12px', border: `1px solid #A7F3D0` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Star size={14} style={{ color: colors.warning }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>评价</span>
                    {task.score && <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: colors.primary }}>{task.score} 分</span>}
                  </div>
                  <p style={{ fontSize: '13px', color: colors.textSecondary, margin: 0 }}>{task.evaluation}</p>
                </div>
              )}

              {/* Complete form (for running tasks) */}
              {task.status === 'running' && (
                <div style={{ padding: '16px', background: colors.bg, borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: colors.text, marginBottom: '12px', display: 'block' }}>完成任务</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <textarea
                      value={evalForm.evaluation}
                      onChange={(e) => setEvalForm({ ...evalForm, evaluation: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '13px', outline: 'none', resize: 'none', height: '80px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      placeholder="填写任务评价..."
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label style={{ fontSize: '12px', color: colors.textSecondary }}>评分:</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={evalForm.score}
                        onChange={(e) => setEvalForm({ ...evalForm, score: Number(e.target.value) })}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 700, color: colors.primary, width: '40px', textAlign: 'right' }}>{evalForm.score}</span>
                    </div>
                    <button onClick={handleComplete} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: colors.success, color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      确认完成
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCreate(false)} />
          <div style={{ position: 'relative', background: colors.surface, borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${colors.border}` }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: colors.text, margin: 0 }}>新建任务</h3>
              <button onClick={() => setShowCreate(false)} style={{ padding: '4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                <X size={18} style={{ color: colors.textMuted }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Field label="任务名称（必填）">
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  style={inputStyle}
                  placeholder="输入任务名称"
                  autoFocus
                />
              </Field>
              <Field label="任务描述">
                <textarea
                  value={createForm.content}
                  onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                  style={{ ...inputStyle, height: '80px', resize: 'none' }}
                  placeholder="输入任务描述"
                />
              </Field>
              <Field label="负责人">
                <select
                  value={createForm.responsiblePerson}
                  onChange={(e) => setCreateForm({ ...createForm, responsiblePerson: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">未指定</option>
                  {personnel.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}{p.position ? `（${p.position}）` : ''}</option>
                  ))}
                </select>
              </Field>
              <Field label="参与人（可多选）">
                {personnel.length === 0 ? (
                  <span style={{ fontSize: '12px', color: colors.textMuted }}>暂无人员，请先在「人员管理」中添加</span>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px', border: `1px solid ${colors.border}`, borderRadius: '8px', maxHeight: '132px', overflowY: 'auto' }}>
                    {personnel.map((p) => {
                      const checked = createForm.participants.includes(p.name)
                      return (
                        <label
                          key={p.id}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '9999px', border: `1px solid ${checked ? colors.primary : colors.border}`, background: checked ? colors.primaryLight : colors.surface, cursor: 'pointer', fontSize: '12px', color: checked ? colors.primary : colors.text, fontWeight: checked ? 500 : 400 }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCreateForm((f) => ({
                                ...f,
                                participants: checked
                                  ? f.participants.filter((n) => n !== p.name)
                                  : [...f.participants, p.name],
                              }))
                            }
                            style={{ margin: 0, cursor: 'pointer' }}
                          />
                          {p.name}
                        </label>
                      )
                    })}
                  </div>
                )}
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <Field label="开始时间">
                  <input type="date" value={createForm.startTime} onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="预计完成">
                  <input type="date" value={createForm.expectedEndTime} onChange={(e) => setCreateForm({ ...createForm, expectedEndTime: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <Field label="状态">
                <select value={createForm.status} onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as 'pending' | 'running' | 'completed' })} style={inputStyle}>
                  <option value="pending">待开始</option>
                  <option value="running">进行中</option>
                  <option value="completed">已完成</option>
                </select>
              </Field>
              {createForm.status !== 'completed' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: colors.textSecondary }}>进度</label>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>{createForm.progress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={createForm.progress}
                    onChange={(e) => setCreateForm({ ...createForm, progress: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: `1px solid ${colors.border}` }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '9px 18px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textSecondary, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.name.trim()}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: createForm.name.trim() ? colors.primary : colors.textMuted, color: '#fff', fontSize: '13px', fontWeight: 500, cursor: createForm.name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: `1px solid ${colors.border}`,
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  color: colors.text,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '12px', fontWeight: 500, color: colors.textSecondary }}>{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ color: colors.textMuted }}>{icon}</span>
      <span style={{ fontSize: '12px', color: colors.textMuted }}>{label}:</span>
      <span style={{ fontSize: '13px', color: colors.text, fontWeight: 500 }}>{value}</span>
    </div>
  )
}
