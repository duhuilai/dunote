import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { isOverdue } from '@/utils/taskUtils'
import type { Task } from '@/types'
import DateField from '@/components/ui/DateField'
import { Clock, CheckCircle2, AlertCircle, User, Calendar, Users as UsersIcon, X, Star, Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ChevronUp, ChevronDown } from 'lucide-react'

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

// 与 DateField 组件共享的配色（中文日期选择器，与人员管理一致）
const dateFieldColors = {
  text: colors.text,
  textMuted: colors.textMuted,
  textSecondary: colors.textSecondary,
  border: colors.border,
  surface: colors.surface,
  primary: colors.primary,
  bg: colors.bg,
}

const statusConfig = {
  pending: { label: '待开始', icon: AlertCircle, color: colors.warning, bg: colors.warningLight },
  running: { label: '进行中', icon: Clock, color: colors.primary, bg: '#EFF6FF' },
  completed: { label: '已完成', icon: CheckCircle2, color: colors.success, bg: colors.successLight },
}

/* ─── 多字段组合排序 ─── */
type TaskSortKey = 'name' | 'responsiblePerson' | 'startTime' | 'expectedEndTime'
type SortRule = { key: TaskSortKey; dir: 'asc' | 'desc' }

const SORT_FIELDS: { key: TaskSortKey; label: string }[] = [
  { key: 'name', label: '任务名称' },
  { key: 'responsiblePerson', label: '姓名' },
  { key: 'startTime', label: '开始日期' },
  { key: 'expectedEndTime', label: '结束日期' },
]

// 多字段组合排序：按 rules 顺序依次比较，首个非 0 结果决定次序；空值恒排末尾（不受升降序影响）
function sortTasks(list: Task[], rules: SortRule[]): Task[] {
  if (rules.length === 0) return list
  const out = list.slice()
  out.sort((a, b) => {
    for (const rule of rules) {
      const va = (a[rule.key] ?? '').toString()
      const vb = (b[rule.key] ?? '').toString()
      const ea = va === ''
      const eb = vb === ''
      if (ea || eb) {
        if (ea && eb) continue
        return ea ? 1 : -1
      }
      let base: number
      if (rule.key === 'startTime' || rule.key === 'expectedEndTime') {
        const da = Date.parse(va)
        const db = Date.parse(vb)
        base = !isNaN(da) && !isNaN(db) ? da - db : 0
      } else {
        base = va.localeCompare(vb, 'zh-Hans-CN')
      }
      const r = rule.dir === 'desc' ? -base : base
      if (r !== 0) return r
    }
    return 0
  })
  return out
}

export default function TasksPage() {
  const { tasks, updateTask, addTask, deleteTask, showToast, personnel } = useAppStore()
  const confirm = useConfirm()
  const [filter, setFilter] = useState<'all' | 'pending' | 'running' | 'completed'>('running')
  const [personFilter, setPersonFilter] = useState('')
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
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    content: '',
    responsiblePerson: '',
    participants: [] as string[],
    startTime: '',
    expectedEndTime: '',
    status: 'pending' as 'pending' | 'running' | 'completed',
    progress: 0,
  })

  const filteredTasks = tasks.filter((t) => {
    if (filter !== 'all' && t.status !== filter) return false
    if (personFilter && t.responsiblePerson !== personFilter && !t.participants.includes(personFilter)) return false
    return true
  })

  // 多字段组合排序：按 sortRules 的顺序作为优先级依次比较
  const [sortRules, setSortRules] = useState<SortRule[]>([])
  const [sortOpen, setSortOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const sortAnchorRef = useRef<HTMLButtonElement>(null)
  const [sortPos, setSortPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const sortedTasks = useMemo(() => sortTasks(filteredTasks, sortRules), [filteredTasks, sortRules])

  // 打开/关闭排序面板，并按触发按钮位置定位（fixed + portal，避免被父容器 overflow 裁剪）
  const openSort = () => {
    const el = sortAnchorRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      setSortPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 320) })
    }
    setSortOpen((v) => !v)
  }

  // 调整排序规则先后顺序
  const moveRule = (idx: number, delta: number) => {
    setSortRules((prev) => {
      const next = prev.slice()
      const target = idx + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const iconBtnStyle = (disabled: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', color: disabled ? colors.textMuted : colors.textSecondary, opacity: disabled ? 0.4 : 1,
  })

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

  const startEdit = () => {
    if (!task) return
    setEditForm({
      name: task.name,
      content: task.content,
      responsiblePerson: task.responsiblePerson,
      participants: task.participants.slice(),
      startTime: task.startTime,
      expectedEndTime: task.expectedEndTime,
      status: task.status,
      progress: task.progress,
    })
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (!task || !editForm.name.trim()) return
    const progress =
      editForm.status === 'completed'
        ? 100
        : editForm.status === 'running'
          ? Math.max(editForm.progress, 1)
          : 0
    updateTask(task.id, {
      name: editForm.name.trim(),
      content: editForm.content.trim(),
      responsiblePerson: editForm.responsiblePerson,
      participants: editForm.participants,
      startTime: editForm.startTime,
      expectedEndTime: editForm.expectedEndTime,
      status: editForm.status,
      progress,
    })
    setIsEditing(false)
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

  // 删除任务（带二次确认）
  const handleDelete = async (id: string) => {
    const target = tasks.find((x) => x.id === id)
    const ok = await confirm({
      title: '删除任务',
      message: `确定删除任务「${target?.name ?? ''}」吗？此操作不可恢复。`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    deleteTask(id)
    showToast('任务已删除', 'success')
    if (selectedTask === id) {
      setSelectedTask(null)
      setEvalForm({ evaluation: '', score: 0 })
      setIsEditing(false)
    }
  }

  // 弹窗内进度条可直接修改并自动保存（防抖落盘）
  const [progressInput, setProgressInput] = useState(0)
  const progressTimer = useRef<number | null>(null)
  useEffect(() => {
    setProgressInput(task?.progress ?? 0)
  }, [task?.id, task?.progress])
  const handleProgressChange = (val: number) => {
    setProgressInput(val)
    if (progressTimer.current) window.clearTimeout(progressTimer.current)
    progressTimer.current = window.setTimeout(() => {
      if (selectedTask) updateTask(selectedTask, { progress: val })
    }, 500)
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
        {/* Tabs + 按人员筛选 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              ref={sortAnchorRef}
              onClick={openSort}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: `1px solid ${sortRules.length ? colors.primary : colors.border}`, background: sortRules.length ? colors.primaryLight : colors.surface, color: sortRules.length ? colors.primary : colors.textSecondary, fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <ArrowUpDown size={14} />
              排序
              {sortRules.length > 0 && (
                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '9999px', background: colors.primary, color: '#fff' }}>{sortRules.length}</span>
              )}
            </button>
            <User size={14} style={{ color: colors.textMuted }} />
            <select
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '13px', outline: 'none', fontFamily: 'inherit', color: colors.text, background: colors.surface, cursor: 'pointer', maxWidth: '180px' }}
            >
              <option value="">全部人员</option>
              {personnel.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 排序面板（portal 到 body，避免被 overflow 裁剪） */}
      {sortOpen && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onMouseDown={() => { setSortOpen(false); setAddMenuOpen(false) }} />
          <div style={{ position: 'fixed', top: sortPos.top, left: sortPos.left, zIndex: 41, width: '300px', background: colors.surface, borderRadius: '12px', border: `1px solid ${colors.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>排序规则</span>
              {sortRules.length > 0 && (
                <button onClick={() => { setSortRules([]); setAddMenuOpen(false) }} style={{ fontSize: '12px', color: colors.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  清空
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
              {sortRules.map((rule, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: colors.bg }}>
                  <span style={{ fontSize: '11px', color: colors.textMuted, width: '16px', textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
                  <select
                    value={rule.key}
                    onChange={(e) => {
                      const key = e.target.value as TaskSortKey
                      setSortRules((prev) => prev.map((r, i) => (i === idx ? { ...r, key } : r)))
                    }}
                    style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: '6px', border: `1px solid ${colors.border}`, fontSize: '12px', outline: 'none', fontFamily: 'inherit', color: colors.text, background: colors.surface, cursor: 'pointer' }}
                  >
                    {SORT_FIELDS.map((f) => (
                      <option key={f.key} value={f.key} disabled={f.key !== rule.key && sortRules.some((r, i) => i !== idx && r.key === f.key)}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSortRules((prev) => prev.map((r, i) => (i === idx ? { ...r, dir: r.dir === 'asc' ? 'desc' : 'asc' } : r)))}
                    title={rule.dir === 'asc' ? '升序' : '降序'}
                    style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '6px 8px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textSecondary, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {rule.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                    {rule.dir === 'asc' ? '升' : '降'}
                  </button>
                  <button onClick={() => moveRule(idx, -1)} disabled={idx === 0} title="上移（提高优先级）" style={iconBtnStyle(idx === 0)}><ChevronUp size={14} /></button>
                  <button onClick={() => moveRule(idx, 1)} disabled={idx === sortRules.length - 1} title="下移（降低优先级）" style={iconBtnStyle(idx === sortRules.length - 1)}><ChevronDown size={14} /></button>
                  <button onClick={() => setSortRules((prev) => prev.filter((_, i) => i !== idx))} title="删除" style={{ ...iconBtnStyle(false), color: colors.danger, flexShrink: 0 }}><X size={14} /></button>
                </div>
              ))}
              {sortRules.length === 0 && (
                <div style={{ fontSize: '12px', color: colors.textMuted, textAlign: 'center', padding: '12px 0' }}>暂无排序，点击下方添加</div>
              )}
            </div>
            <div style={{ marginTop: '10px', borderTop: `1px solid ${colors.border}`, paddingTop: '10px' }}>
              {addMenuOpen ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {SORT_FIELDS.filter((f) => !sortRules.some((r) => r.key === f.key)).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => { setSortRules((prev) => [...prev, { key: f.key, dir: 'asc' }]); setAddMenuOpen(false) }}
                      style={{ textAlign: 'left', padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: colors.text, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {f.label}
                    </button>
                  ))}
                  {SORT_FIELDS.every((f) => sortRules.some((r) => r.key === f.key)) && (
                    <div style={{ fontSize: '12px', color: colors.textMuted, padding: '8px 10px' }}>已全部添加</div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setAddMenuOpen(true)}
                  disabled={sortRules.length >= SORT_FIELDS.length}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center', padding: '8px', borderRadius: '8px', border: `1px dashed ${colors.border}`, background: 'transparent', color: colors.primary, fontSize: '12px', fontWeight: 500, cursor: sortRules.length >= SORT_FIELDS.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  <Plus size={14} />
                  添加排序字段
                </button>
              )}
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: colors.textMuted, lineHeight: 1.5 }}>
              规则按从上到下的顺序排列优先级；同名字段自动禁用；空值恒排末尾。
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* Task Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'grid', gap: '10px' }}>
          {sortedTasks.map((t) => {
            const cfg = statusConfig[t.status]
            const StatusIcon = cfg.icon
            const overdue = isOverdue(t)
            const progressColor = overdue ? colors.danger : t.status === 'completed' ? colors.success : t.status === 'running' ? colors.primary : '#E2E8F0'
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTask(t.id)}
                style={{ background: colors.surface, borderRadius: '10px', border: `1px solid ${colors.border}`, padding: '12px 14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StatusIcon size={16} style={{ color: cfg.color }} />
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: colors.text, margin: 0 }}>{t.name}</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {overdue && (
                      <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, background: colors.danger, color: '#fff' }}>
                        超期
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }}
                      title="删除任务"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <Trash2 size={15} style={{ color: colors.textMuted }} />
                    </button>
                    <span style={{ padding: '4px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500, background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.content}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', fontSize: '11px', color: colors.textMuted }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12} />{t.responsiblePerson}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} />{t.startTime} ~ {t.expectedEndTime}</span>
                  {t.participants.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><UsersIcon size={12} />{t.participants.join(', ')}</span>
                  )}
                </div>
                {/* Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, height: '6px', background: colors.bg, borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '9999px', background: progressColor, width: `${t.progress}%` }} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: colors.textSecondary }}>{t.progress}%</span>
                </div>
              </div>
            )
          })}
          {sortedTasks.length === 0 && (
            <div style={{ padding: '48px 0', textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>
              没有符合条件的任务
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Modal */}
      {task && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => { setSelectedTask(null); setEvalForm({ evaluation: '', score: 0 }); setIsEditing(false) }} />
          <div style={{ position: 'relative', background: colors.surface, borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(() => { const I = statusConfig[task.status].icon; return <I size={18} style={{ color: statusConfig[task.status].color }} /> })()}
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: colors.text, margin: 0 }}>{task.name}</h3>
                {isOverdue(task) && (
                  <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, background: colors.danger, color: '#fff' }}>
                    超期
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!isEditing && (
                  <button
                    onClick={startEdit}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    编辑
                  </button>
                )}
                <button
                  onClick={() => handleDelete(task.id)}
                  title="删除任务"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.surface, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <Trash2 size={16} style={{ color: colors.danger }} />
                </button>
                <button onClick={() => { setSelectedTask(null); setEvalForm({ evaluation: '', score: 0 }); setIsEditing(false) }} style={{ padding: '4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <X size={18} style={{ color: colors.textMuted }} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <Field label="任务名称（必填）">
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      style={inputStyle}
                      placeholder="输入任务名称"
                      autoFocus
                    />
                  </Field>
                  <Field label="任务描述">
                    <textarea
                      value={editForm.content}
                      onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                      style={{ ...inputStyle, height: '80px', resize: 'none' }}
                      placeholder="输入任务描述"
                    />
                  </Field>
                  <Field label="负责人">
                    <select
                      value={editForm.responsiblePerson}
                      onChange={(e) => setEditForm({ ...editForm, responsiblePerson: e.target.value })}
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
                          const checked = editForm.participants.includes(p.name)
                          return (
                            <label
                              key={p.id}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '9999px', border: `1px solid ${checked ? colors.primary : colors.border}`, background: checked ? colors.primaryLight : colors.surface, cursor: 'pointer', fontSize: '12px', color: checked ? colors.primary : colors.text, fontWeight: checked ? 500 : 400 }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setEditForm((f) => ({
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
                      <DateField value={editForm.startTime} onChange={(v) => setEditForm({ ...editForm, startTime: v })} placeholder="选择开始时间" colors={dateFieldColors} />
                    </Field>
                    <Field label="预计完成">
                      <DateField value={editForm.expectedEndTime} onChange={(v) => setEditForm({ ...editForm, expectedEndTime: v })} placeholder="选择预计完成时间" colors={dateFieldColors} />
                    </Field>
                  </div>
                  <Field label="状态">
                    <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'pending' | 'running' | 'completed' })} style={inputStyle}>
                      <option value="pending">待开始</option>
                      <option value="running">进行中</option>
                      <option value="completed">已完成</option>
                    </select>
                  </Field>
                  {editForm.status !== 'completed' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: colors.textSecondary }}>进度</label>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>{editForm.progress}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editForm.progress}
                        onChange={(e) => setEditForm({ ...editForm, progress: Number(e.target.value) })}
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px' }}>
                    <button onClick={() => setIsEditing(false)} style={{ padding: '9px 18px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textSecondary, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      取消
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editForm.name.trim()}
                      style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: editForm.name.trim() ? colors.primary : colors.textMuted, color: '#fff', fontSize: '13px', fontWeight: 500, cursor: editForm.name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <>
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
                  {/* Progress - 可直接拖动修改，自动保存 */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 500, color: colors.textSecondary }}>进度（修改后自动保存）</label>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: isOverdue(task) ? colors.danger : colors.text }}>{progressInput}%</span>
                    </div>
                    <div style={{ height: '10px', background: colors.bg, borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '9999px', background: isOverdue(task) ? colors.danger : task.status === 'completed' ? colors.success : colors.primary, width: `${progressInput}%` }} />
                    </div>
                    {task.status !== 'completed' && (
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={progressInput}
                        onChange={(e) => handleProgressChange(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '12px' }}
                      />
                    )}
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
                </>
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
                  <DateField value={createForm.startTime} onChange={(v) => setCreateForm({ ...createForm, startTime: v })} placeholder="选择开始时间" colors={dateFieldColors} />
                </Field>
                <Field label="预计完成">
                  <DateField value={createForm.expectedEndTime} onChange={(v) => setCreateForm({ ...createForm, expectedEndTime: v })} placeholder="选择预计完成时间" colors={dateFieldColors} />
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
