import { useMemo, useState, type CSSProperties } from 'react'
import { useAppStore } from '@/store'
import { Users, CheckSquare, Clock, TrendingUp, Download, Filter } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const chartTooltipStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  background: 'var(--app-surface-elevated)',
  boxShadow: 'var(--app-shadow)',
  color: 'var(--app-text)',
  fontSize: '12px',
}

const tableHeadStyle: CSSProperties = {
  padding: '12px 20px',
  color: 'var(--app-text-secondary)',
  fontSize: '12px',
  fontWeight: 600,
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tableCellStyle: CSSProperties = {
  padding: '12px 20px',
  color: 'var(--app-text-secondary)',
  fontSize: '13px',
}

export default function AnalyticsPage() {
  const { personnel, tasks, showToast } = useAppStore()
  const [filterPerson, setFilterPerson] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const activeCount = personnel.filter((person) => person.status === 'active').length
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => task.status === 'completed').length
  const runningTasks = tasks.filter((task) => task.status === 'running').length
  const pendingTasks = tasks.filter((task) => task.status === 'pending').length

  const pieData = [
    { name: '已完成', value: completedTasks, color: 'var(--app-success)' },
    { name: '进行中', value: runningTasks, color: 'var(--app-primary)' },
    { name: '待开始', value: pendingTasks, color: 'var(--app-warning)' },
  ]

  const personTaskData = useMemo(
    () =>
      personnel
        .filter((person) => person.status === 'active')
        .map((person) => {
          const personTasks = tasks.filter(
            (task) => task.responsiblePerson === person.name || task.participants.includes(person.name),
          )
          return {
            name: person.name,
            total: personTasks.length,
            completed: personTasks.filter((task) => task.status === 'completed').length,
            running: personTasks.filter((task) => task.status === 'running').length,
          }
        }),
    [personnel, tasks],
  )

  const filteredPersonnel = useMemo(
    () =>
      personnel.filter((person) => {
        if (filterPerson && !person.name.includes(filterPerson)) return false
        if (filterStatus && person.status !== filterStatus) return false
        return true
      }),
    [filterPerson, filterStatus, personnel],
  )

  const handleExport = async () => {
    try {
      const headers = ['姓名', '职位', '总任务', '已完成', '进行中']
      const rows = filteredPersonnel.map((person) => {
        const personTasks = tasks.filter(
          (task) => task.responsiblePerson === person.name || task.participants.includes(person.name),
        )
        return [
          person.name,
          person.position,
          personTasks.length,
          personTasks.filter((task) => task.status === 'completed').length,
          personTasks.filter((task) => task.status === 'running').length,
        ]
      })
      const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
      const filePath = await save({
        title: '导出统计',
        filters: [{ name: 'CSV 表格', extensions: ['csv'] }],
        defaultPath: 'duNote_分析统计.csv',
      })
      if (!filePath) return

      const bytes = new TextEncoder().encode('\uFEFF' + csv)
      await writeFile(filePath, bytes)
      showToast(`已导出到 ${filePath}`, 'success')
    } catch (error) {
      console.error('[Analytics] 导出 CSV 失败:', error)
      showToast(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '16px 24px',
          borderBottom: '1px solid var(--app-border)',
          background: 'var(--app-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, color: 'var(--app-text)', fontSize: '18px', fontWeight: 700 }}>分析统计</h2>
        </div>
        <button
          type="button"
          onClick={handleExport}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            flexShrink: 0,
            padding: '8px 16px',
            border: 0,
            borderRadius: '8px',
            background: 'var(--app-success)',
            color: 'var(--app-on-primary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <Download size={15} aria-hidden="true" />
          导出 Excel
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, padding: '24px', overflowY: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <OverviewCard icon={Users} label="在岗人员" value={activeCount} color="primary" />
          <OverviewCard icon={CheckSquare} label="总任务数" value={totalTasks} color="accent" />
          <OverviewCard icon={CheckSquare} label="已完成" value={completedTasks} color="success" />
          <OverviewCard icon={Clock} label="进行中" value={runningTasks} color="warning" />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <section style={cardStyle}>
            <h3 style={cardTitleStyle}>任务状态分布</h3>
            {totalTasks === 0 ? (
              <ChartEmptyState />
            ) : (
              <>
                <div style={{ height: '210px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="var(--app-surface)"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        itemStyle={{ color: 'var(--app-text-secondary)' }}
                        labelStyle={{ color: 'var(--app-text)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px 16px', marginTop: '8px' }}>
                  {pieData.map((entry) => (
                    <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--app-text-secondary)', fontSize: '12px' }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: entry.color }} />
                      {entry.name} ({entry.value})
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section style={cardStyle}>
            <h3 style={cardTitleStyle}>人员任务统计</h3>
            {personTaskData.length === 0 ? (
              <ChartEmptyState />
            ) : (
              <div style={{ height: '238px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={personTaskData} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'var(--app-text-secondary)' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'var(--app-text-secondary)' }}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: 'var(--app-text-secondary)' }}
                      labelStyle={{ color: 'var(--app-text)' }}
                      cursor={{ fill: 'var(--app-hover)' }}
                    />
                    <Bar dataKey="completed" name="已完成" fill="var(--app-success)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="running" name="进行中" fill="var(--app-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        <section style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              padding: '12px 20px',
              borderBottom: '1px solid var(--app-border)',
            }}
          >
            <Filter size={15} aria-hidden="true" style={{ color: 'var(--app-text-muted)' }} />
            <input
              value={filterPerson}
              onChange={(event) => setFilterPerson(event.target.value)}
              aria-label="按姓名筛选"
              placeholder="按姓名筛选"
              style={filterControlStyle}
            />
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              aria-label="按人员状态筛选"
              style={filterControlStyle}
            >
              <option value="">全部状态</option>
              <option value="active">在岗</option>
              <option value="resigned">离职</option>
            </select>
            <span style={{ marginLeft: 'auto', color: 'var(--app-text-muted)', fontSize: '12px' }}>
              {filteredPersonnel.length} 人
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--app-border)', background: 'var(--app-bg)' }}>
                  <th style={tableHeadStyle}>姓名</th>
                  <th style={tableHeadStyle}>职位</th>
                  <th style={tableHeadStyle}>状态</th>
                  <th style={tableHeadStyle}>总任务</th>
                  <th style={tableHeadStyle}>已完成</th>
                  <th style={tableHeadStyle}>进行中</th>
                  <th style={tableHeadStyle}>完成率</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersonnel.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 20px', color: 'var(--app-text-muted)', fontSize: '13px', textAlign: 'center' }}>
                      没有符合当前筛选条件的人员
                    </td>
                  </tr>
                ) : (
                  filteredPersonnel.map((person) => {
                    const personTasks = tasks.filter(
                      (task) => task.responsiblePerson === person.name || task.participants.includes(person.name),
                    )
                    const completed = personTasks.filter((task) => task.status === 'completed').length
                    const running = personTasks.filter((task) => task.status === 'running').length
                    const rate = personTasks.length > 0 ? Math.round((completed / personTasks.length) * 100) : 0
                    const isActive = person.status === 'active'

                    return (
                      <tr key={person.id} style={{ borderBottom: '1px solid var(--app-border)' }}>
                        <td style={{ ...tableCellStyle, color: 'var(--app-text)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              aria-hidden="true"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                flexShrink: 0,
                                borderRadius: '50%',
                                background: 'var(--app-primary)',
                                color: 'var(--app-on-primary)',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              {person.name[0]}
                            </span>
                            <span style={{ color: 'var(--app-text)', fontSize: '13px', fontWeight: 500 }}>{person.name}</span>
                          </div>
                        </td>
                        <td style={tableCellStyle}>{person.position}</td>
                        <td style={tableCellStyle}>
                          <span
                            style={{
                              display: 'inline-flex',
                              padding: '3px 9px',
                              borderRadius: '9999px',
                              background: isActive ? 'var(--app-success-bg)' : 'var(--app-danger-bg)',
                              color: isActive ? 'var(--app-success)' : 'var(--app-danger)',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            {isActive ? '在岗' : '离职'}
                          </span>
                        </td>
                        <td style={{ ...tableCellStyle, color: 'var(--app-text)', fontWeight: 600 }}>{personTasks.length}</td>
                        <td style={{ ...tableCellStyle, color: 'var(--app-success)', fontWeight: 600 }}>{completed}</td>
                        <td style={{ ...tableCellStyle, color: 'var(--app-primary)', fontWeight: 600 }}>{running}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '72px', height: '6px', overflow: 'hidden', borderRadius: '9999px', background: 'var(--app-border)' }}>
                              <div style={{ width: `${rate}%`, height: '100%', borderRadius: '9999px', background: 'var(--app-success)' }} />
                            </div>
                            <span style={{ color: 'var(--app-text-secondary)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

const cardStyle: CSSProperties = {
  minWidth: 0,
  padding: '20px',
  border: '1px solid var(--app-border)',
  borderRadius: '12px',
  background: 'var(--app-surface)',
}

const cardTitleStyle: CSSProperties = {
  margin: '0 0 16px',
  color: 'var(--app-text)',
  fontSize: '14px',
  fontWeight: 600,
}

const filterControlStyle: CSSProperties = {
  width: '160px',
  maxWidth: '100%',
  padding: '7px 11px',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  outline: 'none',
  background: 'var(--app-surface)',
  color: 'var(--app-text)',
  fontFamily: 'inherit',
  fontSize: '13px',
}

function ChartEmptyState() {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '238px',
        color: 'var(--app-text-muted)',
        fontSize: '13px',
      }}
    >
      暂无数据
    </div>
  )
}

type OverviewColor = 'primary' | 'accent' | 'success' | 'warning'

function OverviewCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon
  label: string
  value: number
  color: OverviewColor
}) {
  const colorMap = {
    primary: { bg: 'var(--app-primary-light)', text: 'var(--app-primary)' },
    accent: { bg: 'color-mix(in srgb, var(--app-accent) 12%, transparent)', text: 'var(--app-accent)' },
    success: { bg: 'var(--app-success-bg)', text: 'var(--app-success)' },
    warning: { bg: 'var(--app-warning-bg)', text: 'var(--app-warning)' },
  }
  const selectedColor = colorMap[color]

  return (
    <article style={{ ...cardStyle, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: selectedColor.bg,
            color: selectedColor.text,
          }}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <TrendingUp size={14} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--app-text-muted)' }} />
      </div>
      <div style={{ color: 'var(--app-text)', fontSize: '24px', fontWeight: 700 }}>{value}</div>
      <div style={{ marginTop: '2px', color: 'var(--app-text-muted)', fontSize: '12px' }}>{label}</div>
    </article>
  )
}
