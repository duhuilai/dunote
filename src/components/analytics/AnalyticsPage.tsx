import { useState } from 'react'
import { useAppStore } from '@/store'
import { Users, CheckSquare, Clock, TrendingUp, Download, Filter } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export default function AnalyticsPage() {
  const { personnel, tasks } = useAppStore()
  const [filterPerson, setFilterPerson] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const activeCount = personnel.filter((p) => p.status === 'active').length
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.status === 'completed').length
  const runningTasks = tasks.filter((t) => t.status === 'running').length

  // Task status pie data
  const pieData = [
    { name: '已完成', value: completedTasks, color: '#10B981' },
    { name: '进行中', value: runningTasks, color: '#2563EB' },
    { name: '待开始', value: tasks.filter((t) => t.status === 'pending').length, color: '#F59E0B' },
  ]

  // Person task bar data
  const personTaskData = personnel.filter((p) => p.status === 'active').map((p) => {
    const personTasks = tasks.filter((t) => t.responsiblePerson === p.name || t.participants.includes(p.name))
    return {
      name: p.name,
      total: personTasks.length,
      completed: personTasks.filter((t) => t.status === 'completed').length,
      running: personTasks.filter((t) => t.status === 'running').length,
    }
  })

  // Filtered person list for the table
  const filteredPersonnel = personnel.filter((p) => {
    if (filterPerson && !p.name.includes(filterPerson)) return false
    if (filterStatus && p.status !== filterStatus) return false
    return true
  })

  const handleExport = () => {
    // Simple CSV export as demo
    const headers = ['姓名', '职位', '总任务', '已完成', '进行中']
    const rows = filteredPersonnel.map((p) => {
      const pt = tasks.filter((t) => t.responsiblePerson === p.name || t.participants.includes(p.name))
      return [p.name, p.position, pt.length, pt.filter((t) => t.status === 'completed').length, pt.filter((t) => t.status === 'running').length]
    })
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'duNote_分析统计.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1E293B', margin: 0 }}>分析统计</h2>
        <button
          onClick={handleExport}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#10B981', color: '#FFFFFF', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Download size={15} />
          导出 Excel
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {/* Overview Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <OverviewCard icon={Users} label="在岗人员" value={activeCount} color="primary" />
          <OverviewCard icon={CheckSquare} label="总任务数" value={totalTasks} color="accent" />
          <OverviewCard icon={CheckSquare} label="已完成" value={completedTasks} color="success" />
          <OverviewCard icon={Clock} label="进行中" value={runningTasks} color="warning" />
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {/* Pie Chart */}
          <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B', margin: '0 0 16px 0' }}>任务状态分布</h3>
            <div style={{ height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px' }}>
              {pieData.map((d) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: d.color }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </div>

          {/* Bar Chart */}
          <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B', margin: '0 0 16px 0' }}>人员任务统计</h3>
            <div style={{ height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={personTaskData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip />
                  <Bar dataKey="completed" name="已完成" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="running" name="进行中" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Filter & Table */}
        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Filter size={15} style={{ color: '#94A3B8' }} />
            <input
              value={filterPerson}
              onChange={(e) => setFilterPerson(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none', width: '160px', fontFamily: 'inherit' }}
              placeholder="按姓名筛选"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none', background: '#FFFFFF', fontFamily: 'inherit' }}
            >
              <option value="">全部状态</option>
              <option value="active">在岗</option>
              <option value="resigned">离职</option>
            </select>
          </div>
          <table style={{ width: '100%' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>姓名</th>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>职位</th>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>状态</th>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>总任务</th>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>已完成</th>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>进行中</th>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>完成率</th>
              </tr>
            </thead>
            <tbody>
              {filteredPersonnel.map((p) => {
                const pt = tasks.filter((t) => t.responsiblePerson === p.name || t.participants.includes(p.name))
                const completed = pt.filter((t) => t.status === 'completed').length
                const running = pt.filter((t) => t.status === 'running').length
                const rate = pt.length > 0 ? Math.round((completed / pt.length) * 100) : 0
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: '11px', fontWeight: 600 }}>{p.name[0]}</div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#1E293B' }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '13px', color: '#64748B' }}>{p.position}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 500,
                        background: p.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: p.status === 'active' ? '#10B981' : '#EF4444',
                      }}>
                        {p.status === 'active' ? '在岗' : '离职'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '13px', color: '#1E293B', fontWeight: 500 }}>{pt.length}</td>
                    <td style={{ padding: '12px 20px', fontSize: '13px', color: '#10B981', fontWeight: 500 }}>{completed}</td>
                    <td style={{ padding: '12px 20px', fontSize: '13px', color: '#2563EB', fontWeight: 500 }}>{running}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '64px', height: '6px', background: '#F8FAFC', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#10B981', borderRadius: '9999px', width: `${rate}%` }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>{rate}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function OverviewCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'rgba(37,99,235,0.1)', text: '#2563EB' },
    accent: { bg: 'rgba(6,182,212,0.1)', text: '#06B6D4' },
    success: { bg: 'rgba(16,185,129,0.1)', text: '#10B981' },
    warning: { bg: 'rgba(245,158,11,0.1)', text: '#F59E0B' },
  }
  const c = colors[color]
  return (
    <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg }}>
          <Icon size={18} style={{ color: c.text }} />
        </div>
        <TrendingUp size={14} style={{ color: '#94A3B8', marginLeft: 'auto' }} />
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#1E293B' }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{label}</div>
    </div>
  )
}
