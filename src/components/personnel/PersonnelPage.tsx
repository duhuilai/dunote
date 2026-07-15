import { useState } from 'react'
import { useAppStore } from '@/store'
import { Users, UserCheck, UserX, Plus, X, Phone, Calendar, DollarSign, Edit3, Trash2 } from 'lucide-react'
import DateField from '@/components/ui/DateField'

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
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  surface: '#FFFFFF',
}

export default function PersonnelPage() {
  const { personnel, addPerson, updatePerson, deletePerson } = useAppStore()
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', position: '', hireDate: '', monthlySalary: '', phone: '', status: 'active' as 'active' | 'resigned' })

  const activeCount = personnel.filter((p) => p.status === 'active').length
  const resignedCount = personnel.filter((p) => p.status === 'resigned').length
  const totalSalary = personnel.filter((p) => p.status === 'active').reduce((s, p) => s + p.monthlySalary, 0)

  const handleSave = () => {
    if (!form.name || !form.position) return
    if (editingId) {
      updatePerson(editingId, {
        name: form.name,
        position: form.position,
        hireDate: form.hireDate,
        monthlySalary: Number(form.monthlySalary) || 0,
        phone: form.phone,
        status: form.status,
      })
    } else {
      addPerson({
        id: `p${Date.now()}`,
        name: form.name,
        position: form.position,
        hireDate: form.hireDate,
        monthlySalary: Number(form.monthlySalary) || 0,
        phone: form.phone,
        status: form.status,
      })
    }
    setForm({ name: '', position: '', hireDate: '', monthlySalary: '', phone: '', status: 'active' })
    setEditingId(null)
    setShowModal(false)
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  const tdStyle: React.CSSProperties = {
    padding: '14px 20px',
    fontSize: '13px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.border}`, background: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: colors.text, margin: 0 }}>人员管理</h2>
        <button
          onClick={() => {
            setEditingId(null)
            setForm({ name: '', position: '', hireDate: '', monthlySalary: '', phone: '', status: 'active' })
            setShowModal(true)
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: colors.primary, color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Plus size={15} />
          新增人员
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <StatCard icon={Users} label="总人数" value={personnel.length} color="primary" />
          <StatCard icon={UserCheck} label="在岗" value={activeCount} color="success" />
          <StatCard icon={UserX} label="离职" value={resignedCount} color="danger" />
        </div>

        {/* Table */}
        <div style={{ background: colors.surface, borderRadius: '12px', border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                <th style={thStyle}>人员</th>
                <th style={thStyle}>职位</th>
                <th style={thStyle}>入职日期</th>
                <th style={thStyle}>月薪</th>
                <th style={thStyle}>电话</th>
                <th style={thStyle}>状态</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {personnel.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}>
                        {p.name[0]}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: colors.text }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: colors.textSecondary }}>{p.position}</td>
                  <td style={{ ...tdStyle, color: colors.textSecondary }}>{p.hireDate}</td>
                  <td style={{ ...tdStyle, color: colors.text, fontWeight: 500 }}>¥{p.monthlySalary.toLocaleString()}</td>
                  <td style={{ ...tdStyle, color: colors.textSecondary }}>{p.phone}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background: p.status === 'active' ? colors.successLight : colors.dangerLight,
                      color: p.status === 'active' ? colors.success : colors.danger,
                    }}>
                      {p.status === 'active' ? '在岗' : '离职'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => {
                          setEditingId(p.id)
                          setForm({
                            name: p.name,
                            position: p.position,
                            hireDate: p.hireDate,
                            monthlySalary: String(p.monthlySalary),
                            phone: p.phone,
                            status: p.status,
                          })
                          setShowModal(true)
                        }}
                        style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                        title="编辑"
                      >
                        <Edit3 size={14} style={{ color: colors.textMuted }} />
                      </button>
                      <button onClick={() => deletePerson(p.id)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }} title="删除">
                        <Trash2 size={14} style={{ color: colors.textMuted }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Salary Summary */}
        <div style={{ marginTop: '16px', padding: '16px', background: colors.surface, borderRadius: '12px', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: colors.textSecondary }}>在岗人员月薪总计</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: colors.primary }}>¥{totalSalary.toLocaleString()}</span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => { setShowModal(false); setEditingId(null) }} />
          <div style={{ position: 'relative', background: colors.surface, borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '480px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${colors.border}` }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: colors.text, margin: 0 }}>{editingId ? '编辑人员' : '新增人员'}</h3>
              <button onClick={() => { setShowModal(false); setEditingId(null) }} style={{ padding: '4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                <X size={18} style={{ color: colors.textMuted }} />
              </button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <FormField label="姓名" icon={<Users size={15} />}>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="请输入姓名" />
              </FormField>
              <FormField label="职位" icon={<Edit3 size={15} />}>
                <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} style={inputStyle} placeholder="请输入职位" />
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <FormField label="入职日期" icon={<Calendar size={15} />}>
                  <DateField
                    value={form.hireDate}
                    onChange={(v) => setForm({ ...form, hireDate: v })}
                    placeholder="选择入职日期"
                    colors={{
                      text: colors.text,
                      textMuted: colors.textMuted,
                      textSecondary: colors.textSecondary,
                      border: colors.border,
                      surface: colors.surface,
                      primary: colors.primary,
                      bg: colors.bg,
                    }}
                  />
                </FormField>
                <FormField label="月薪" icon={<DollarSign size={15} />}>
                  <input type="number" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} style={inputStyle} placeholder="¥" />
                </FormField>
              </div>
              <FormField label="电话" icon={<Phone size={15} />}>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} placeholder="请输入电话号码" />
              </FormField>
              <FormField label="状态">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} style={{ ...inputStyle, background: colors.surface }}>
                  <option value="active">在岗</option>
                  <option value="resigned">离职</option>
                </select>
              </FormField>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: `1px solid ${colors.border}` }}>
              <button onClick={() => { setShowModal(false); setEditingId(null) }} style={{ padding: '8px 16px', borderRadius: '8px', background: colors.bg, color: colors.text, fontSize: '13px', fontWeight: 500, border: `1px solid ${colors.border}`, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
              <button onClick={handleSave} style={{ padding: '8px 16px', borderRadius: '8px', background: colors.primary, color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{editingId ? '保存' : '确认添加'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    primary: { bg: colors.primaryLight, fg: colors.primary },
    success: { bg: colors.successLight, fg: colors.success },
    danger: { bg: colors.dangerLight, fg: colors.danger },
  }
  const c = colorMap[color] || colorMap.primary
  return (
    <div style={{ background: colors.surface, borderRadius: '12px', border: `1px solid ${colors.border}`, padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, color: c.fg }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>{value}</div>
      </div>
    </div>
  )
}

function FormField({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, color: colors.textSecondary, marginBottom: '6px' }}>
        {icon}
        {label}
      </label>
      {children}
    </div>
  )
}
