import { useState } from 'react'
import { useAppStore } from '@/store'
import { Globe, RefreshCw, Palette, Save, Check } from 'lucide-react'

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const { syncConfig } = settings
  const [syncForm, setSyncForm] = useState(syncConfig)
  const [saved, setSaved] = useState(false)
  const [newColor, setNewColor] = useState({ name: '', color: '#2563EB' })

  const handleSaveSync = () => {
    updateSettings({ syncConfig: syncForm })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAddColor = () => {
    if (!newColor.name) return
    updateSettings({
      customColors: { ...settings.customColors, [newColor.name]: newColor.color },
    })
    setNewColor({ name: '', color: '#2563EB' })
  }

  const handleRemoveColor = (key: string) => {
    const colors = { ...settings.customColors }
    delete colors[key]
    updateSettings({ customColors: colors })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 500,
    color: '#64748B',
    marginBottom: '6px',
    display: 'block',
  }

  const sectionCardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
  }

  const sectionHeaderStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid #E2E8F0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1E293B',
    margin: 0,
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', flexShrink: 0 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1E293B', margin: 0 }}>系统设置</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', minHeight: 0 }}>
        {/* Sync Config */}
        <div style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <RefreshCw size={16} style={{ color: '#2563EB' }} />
            <h3 style={sectionTitleStyle}>同步配置</h3>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Sync Type */}
            <div>
              <label style={{ ...labelStyle, marginBottom: '8px' }}>同步方式</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['local', 'git', 'gitee', 'server'] as const).map((type) => {
                  const isActive = syncForm.type === type
                  return (
                    <button
                      key={type}
                      onClick={() => setSyncForm({ ...syncForm, type })}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 500,
                        border: isActive ? '1px solid #2563EB' : '1px solid #E2E8F0',
                        background: isActive ? '#2563EB' : '#FFFFFF',
                        color: isActive ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {type === 'local' ? '本地' : type === 'git' ? 'Git' : type === 'gitee' ? 'Gitee' : '服务器'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Remote config fields - only show when not local */}
            {syncForm.type !== 'local' && (
              <>
                {/* URL */}
                <div>
                  <label style={labelStyle}>
                    {syncForm.type === 'server' ? '服务器地址' : '仓库地址'}
                  </label>
                  <input
                    value={syncForm.url}
                    onChange={(e) => setSyncForm({ ...syncForm, url: e.target.value })}
                    style={inputStyle}
                    placeholder={syncForm.type === 'server' ? 'https://api.example.com' : 'https://github.com/user/repo.git'}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  {/* Branch */}
                  <div>
                    <label style={labelStyle}>分支</label>
                    <input
                      value={syncForm.branch}
                      onChange={(e) => setSyncForm({ ...syncForm, branch: e.target.value })}
                      style={inputStyle}
                      placeholder="main"
                    />
                  </div>
                  {/* Username */}
                  <div>
                    <label style={labelStyle}>用户名</label>
                    <input
                      value={syncForm.username}
                      onChange={(e) => setSyncForm({ ...syncForm, username: e.target.value })}
                      style={inputStyle}
                      placeholder="用户名"
                    />
                  </div>
                </div>

                {/* Token */}
                <div>
                  <label style={labelStyle}>访问令牌 (Token)</label>
                  <input
                    type="password"
                    value={syncForm.token}
                    onChange={(e) => setSyncForm({ ...syncForm, token: e.target.value })}
                    style={inputStyle}
                    placeholder="输入访问令牌"
                  />
                </div>

                {/* Auto Sync */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#F8FAFC', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1E293B' }}>自动同步</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>每隔 {syncForm.syncInterval} 分钟自动同步一次</div>
                  </div>
                  <button
                    onClick={() => setSyncForm({ ...syncForm, autoSync: !syncForm.autoSync })}
                    style={{
                      width: '44px',
                      height: '24px',
                      borderRadius: '9999px',
                      border: 'none',
                      cursor: 'pointer',
                      background: syncForm.autoSync ? '#2563EB' : '#D1D5DB',
                      position: 'relative',
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      background: '#FFFFFF',
                      borderRadius: '50%',
                      position: 'absolute',
                      top: '2px',
                      left: syncForm.autoSync ? '22px' : '2px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }} />
                  </button>
                </div>
              </>
            )}

            {/* Local mode info */}
            {syncForm.type === 'local' && (
              <div style={{ padding: '12px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#166534', marginBottom: '4px' }}>本地模式</div>
                <div style={{ fontSize: '11px', color: '#15803D' }}>历史记录将保存在本地，不会进行远程同步</div>
              </div>
            )}

            <button
              onClick={handleSaveSync}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#2563EB', color: '#FFFFFF', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {saved ? <Check size={15} /> : <Save size={15} />}
              {saved ? '已保存' : '保存配置'}
            </button>
          </div>
        </div>

        {/* Language */}
        <div style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <Globe size={16} style={{ color: '#2563EB' }} />
            <h3 style={sectionTitleStyle}>语言设置</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { key: 'zh-CN' as const, label: '简体中文' },
                { key: 'en' as const, label: 'English' },
                { key: 'ja' as const, label: '日本語' },
              ].map(({ key, label }) => {
                const isActive = settings.language === key
                return (
                  <button
                    key={key}
                    onClick={() => updateSettings({ language: key })}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: isActive ? '1px solid #2563EB' : '1px solid #E2E8F0',
                      background: isActive ? '#2563EB' : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : '#64748B',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Custom Colors */}
        <div style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <Palette size={16} style={{ color: '#2563EB' }} />
            <h3 style={sectionTitleStyle}>自定义类型字体颜色</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              {Object.entries(settings.customColors).map(([name, color]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0, background: color }} />
                  <span style={{ fontSize: '12px', color: '#1E293B', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <button
                    onClick={() => handleRemoveColor(name)}
                    style={{ fontSize: '11px', color: '#94A3B8', cursor: 'pointer', border: 'none', background: 'transparent', fontFamily: 'inherit', padding: '2px 4px' }}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                value={newColor.name}
                onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="类型名称"
              />
              <input
                type="color"
                value={newColor.color}
                onChange={(e) => setNewColor({ ...newColor, color: e.target.value })}
                style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer', padding: '2px' }}
              />
              <button
                onClick={handleAddColor}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563EB', color: '#FFFFFF', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
