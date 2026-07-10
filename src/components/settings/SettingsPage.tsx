import { useState } from 'react'
import { useAppStore } from '@/store'
import { Globe, RefreshCw, Palette, Save, Check, TestTube } from 'lucide-react'
import { testGiteeConnection } from '@/utils/sync'

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const { syncConfig } = settings
  const [syncForm, setSyncForm] = useState(syncConfig)
  const [saved, setSaved] = useState(false)
  const [testMsg, setTestMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [testing, setTesting] = useState(false)
  const [newColor, setNewColor] = useState({ name: '', color: '#2563EB' })

  const handleTestConnection = async () => {
    if (!syncForm.token || !syncForm.repo) {
      setTestMsg({ text: '请填写 Gitee 私人令牌和仓库名', ok: false })
      return
    }
    setTesting(true)
    setTestMsg(null)
    const result = await testGiteeConnection(syncForm)
    setTesting(false)
    setTestMsg({ text: result.message || (result.success ? '连接成功' : '连接失败'), ok: result.success })
  }

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
                {(['local', 'gitee'] as const).map((type) => {
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
                      {type === 'local' ? '本地' : 'Gitee'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Local mode info */}
            {syncForm.type === 'local' && (
              <div style={{ padding: '12px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#166534', marginBottom: '4px' }}>本地模式</div>
                <div style={{ fontSize: '11px', color: '#15803D' }}>历史记录保存在本地，不会进行远程同步</div>
              </div>
            )}

            {/* Gitee config - only token + repo name needed */}
            {syncForm.type === 'gitee' && (
              <>
                <div style={{ padding: '12px', background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: '12px', color: '#1E40AF' }}>
                    同步地址使用软件内置默认：<code style={{ background: '#DBEAFE', padding: '1px 6px', borderRadius: '4px' }}>https://gitee.com/api/v5</code>
                    <br />仅需填写「私人令牌」和「仓库名」即可。
                  </div>
                </div>

                {/* Repository name */}
                <div>
                  <label style={labelStyle}>仓库名</label>
                  <input
                    value={syncForm.repo}
                    onChange={(e) => setSyncForm({ ...syncForm, repo: e.target.value })}
                    style={inputStyle}
                    placeholder="owner/repo，例如：duhuilai/dunote-history"
                  />
                </div>

                {/* Token */}
                <div>
                  <label style={labelStyle}>私人令牌 (Private Token)</label>
                  <input
                    type="password"
                    value={syncForm.token}
                    onChange={(e) => setSyncForm({ ...syncForm, token: e.target.value })}
                    style={inputStyle}
                    placeholder="在 Gitee「设置 → 私人令牌」中生成"
                  />
                </div>

                {/* Optional branch */}
                <div>
                  <label style={labelStyle}>分支（选填，留空自动使用默认分支）</label>
                  <input
                    value={syncForm.branch}
                    onChange={(e) => setSyncForm({ ...syncForm, branch: e.target.value })}
                    style={inputStyle}
                    placeholder="master / main"
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={handleSaveSync}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#2563EB', color: '#FFFFFF', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {saved ? <Check size={15} /> : <Save size={15} />}
                {saved ? '已保存' : '保存配置'}
              </button>
              {syncForm.type === 'gitee' && (
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#FFFFFF', color: '#2563EB', fontSize: '13px', fontWeight: 500, border: '1px solid #2563EB', cursor: testing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: testing ? 0.7 : 1 }}
                >
                  <TestTube size={15} />
                  {testing ? '测试中…' : '测试连接'}
                </button>
              )}
            </div>
            {testMsg && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '12px', background: testMsg.ok ? '#F0FDF4' : '#FEF2F2', color: testMsg.ok ? '#166534' : '#991B1B', border: `1px solid ${testMsg.ok ? '#BBF7D0' : '#FECACA'}` }}>
                {testMsg.text}
              </div>
            )}
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
