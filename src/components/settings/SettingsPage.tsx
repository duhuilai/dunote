import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { AiConfig } from '@/types'
import {
  Check,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  Info,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Sparkles,
  Sun,
  TestTube,
} from 'lucide-react'
import { testGiteeConnection } from '@/utils/sync'
import { checkForUpdate, openReleasePage } from '@/utils/update'
import { testAiConnection, validateAiBaseUrl } from '@/utils/aiService'
import UpdateDownloader from '@/components/update/UpdateDownloader'

const themeOptions = [
  { key: 'light', label: '浅色', icon: Sun },
  { key: 'dark', label: '深色', icon: Moon },
  { key: 'system', label: '跟随系统', icon: Monitor },
] as const

type AiProviderPreset = 'openai' | 'deepseek' | 'ollama' | 'custom'

const aiProviderPresets: Array<{
  key: AiProviderPreset
  label: string
  config?: Partial<AiConfig>
}> = [
  {
    key: 'openai',
    label: 'OpenAI',
    config: {
      providerName: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiProtocol: 'chat-completions',
      chatModel: 'gpt-4o-mini',
      transcriptionModel: 'whisper-1',
      supportsChat: true,
      supportsTranscription: true,
    },
  },
  {
    key: 'deepseek',
    label: 'DeepSeek',
    config: {
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiProtocol: 'chat-completions',
      chatModel: 'deepseek-chat',
      transcriptionModel: '',
      supportsChat: true,
      supportsTranscription: false,
    },
  },
  {
    key: 'ollama',
    label: 'Ollama（本机）',
    config: {
      providerName: 'Ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiProtocol: 'chat-completions',
      chatModel: 'qwen3:8b',
      transcriptionModel: '',
      supportsChat: true,
      supportsTranscription: false,
    },
  },
  { key: 'custom', label: '自定义兼容服务' },
]

function detectAiProvider(baseUrl: string): AiProviderPreset {
  const normalized = validateAiBaseUrl(baseUrl)
  if (!normalized.ok) return 'custom'
  const matched = aiProviderPresets.find((preset) => {
    if (!preset.config?.baseUrl) return false
    const presetUrl = validateAiBaseUrl(preset.config.baseUrl)
    return presetUrl.ok && presetUrl.baseUrl === normalized.baseUrl
  })
  return matched?.key || 'custom'
}

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const { syncConfig, aiConfig } = settings
  const [syncForm, setSyncForm] = useState(syncConfig)
  const [aiForm, setAiForm] = useState(aiConfig)
  const [aiPreset, setAiPreset] = useState<AiProviderPreset>(() => detectAiProvider(aiConfig.baseUrl))
  const [saved, setSaved] = useState(false)
  const [testMsg, setTestMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [testing, setTesting] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)
  const [aiTestMsg, setAiTestMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [testingAi, setTestingAi] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const appVersion = useAppStore((s) => s.appVersion)
  const updateInfo = useAppStore((s) => s.updateInfo)
  const setUpdateInfo = useAppStore((s) => s.setUpdateInfo)
  const checkingUpdate = useAppStore((s) => s.checkingUpdate)
  const setCheckingUpdate = useAppStore((s) => s.setCheckingUpdate)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    setAiForm(aiConfig)
    setAiPreset(detectAiProvider(aiConfig.baseUrl))
  }, [aiConfig])

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const info = await checkForUpdate(appVersion)
      setUpdateInfo(info)
      if (info.error) {
        showToast(info.error, 'error')
      } else if (info.hasUpdate) {
        showToast(`发现新版本 v${info.latestVersion}`, 'success')
      } else {
        showToast('已是最新版本', 'info')
      }
    } catch (error) {
      showToast('检查更新失败：' + (error instanceof Error ? error.message : String(error)), 'error')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleTestConnection = async () => {
    if (!syncForm.token || !syncForm.repo) {
      setTestMsg({ text: '请填写 Gitee 私人令牌和仓库名', ok: false })
      return
    }
    setTesting(true)
    setTestMsg(null)
    try {
      const result = await testGiteeConnection(syncForm)
      setTestMsg({
        text: result.message || (result.success ? '连接成功' : '连接失败'),
        ok: result.success,
      })
    } catch (error) {
      setTestMsg({
        text: '连接测试失败：' + (error instanceof Error ? error.message : String(error)),
        ok: false,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveSync = () => {
    updateSettings({ syncConfig: syncForm })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function updateAiField<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setAiForm((current) => ({ ...current, [key]: value }))
    setAiTestMsg(null)
  }

  const handleAiPresetChange = (key: AiProviderPreset) => {
    setAiPreset(key)
    setAiTestMsg(null)
    const preset = aiProviderPresets.find((item) => item.key === key)
    if (!preset?.config) {
      setAiForm((current) => ({
        ...current,
        providerName: current.providerName || '自定义兼容服务',
      }))
      return
    }
    setAiForm((current) => ({
      ...current,
      ...preset.config,
      apiKey: '',
    }))
  }

  const handleTestAi = async () => {
    if (!aiForm.supportsChat) {
      setAiTestMsg({ text: '当前配置未开启文本生成，无法执行文本连接测试', ok: false })
      return
    }
    const urlCheck = validateAiBaseUrl(aiForm.baseUrl)
    if (!urlCheck.ok) {
      setAiTestMsg({ text: urlCheck.message, ok: false })
      return
    }

    setTestingAi(true)
    setAiTestMsg(null)
    try {
      const result = await testAiConnection({
        ...aiForm,
        enabled: true,
        baseUrl: urlCheck.baseUrl,
      })
      setAiTestMsg({
        text: result ? `连接成功：${result}` : '连接成功，模型已正常响应',
        ok: true,
      })
    } catch (error) {
      setAiTestMsg({
        text: `连接失败：${error instanceof Error ? error.message : String(error)}`,
        ok: false,
      })
    } finally {
      setTestingAi(false)
    }
  }

  const handleSaveAi = () => {
    const urlCheck = validateAiBaseUrl(aiForm.baseUrl)
    if (!urlCheck.ok) {
      setAiTestMsg({ text: urlCheck.message, ok: false })
      return
    }
    if (aiForm.enabled && !aiForm.supportsChat && !aiForm.supportsTranscription) {
      setAiTestMsg({ text: '启用 AI 时至少需要开启一种能力', ok: false })
      return
    }
    if (aiForm.enabled && aiForm.supportsChat && !aiForm.chatModel.trim()) {
      setAiTestMsg({ text: '请填写文本生成模型', ok: false })
      return
    }
    if (aiForm.enabled && aiForm.supportsTranscription && !aiForm.transcriptionModel.trim()) {
      setAiTestMsg({ text: '请填写录音转写模型', ok: false })
      return
    }

    const isLocal = new URL(urlCheck.baseUrl).hostname === 'localhost'
      || new URL(urlCheck.baseUrl).hostname === '127.0.0.1'
    if (
      aiForm.enabled
      && !isLocal
      && (aiForm.supportsChat || aiForm.supportsTranscription)
      && !aiForm.apiKey.trim()
    ) {
      setAiTestMsg({ text: '使用远程 AI 服务时请填写 API Key', ok: false })
      return
    }

    const timeoutMs = Number(aiForm.requestTimeoutMs)
    const next: AiConfig = {
      ...aiForm,
      providerName: aiForm.providerName.trim() || '自定义兼容服务',
      baseUrl: urlCheck.baseUrl,
      apiKey: aiForm.apiKey.trim(),
      chatModel: aiForm.chatModel.trim(),
      transcriptionModel: aiForm.transcriptionModel.trim(),
      requestTimeoutMs: Number.isFinite(timeoutMs)
        ? Math.min(180000, Math.max(5000, Math.round(timeoutMs)))
        : 60000,
    }
    updateSettings({ aiConfig: next })
    setAiForm(next)
    setAiSaved(true)
    setAiTestMsg(null)
    setTimeout(() => setAiSaved(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid var(--app-border)',
    background: 'var(--app-bg)',
    color: 'var(--app-text)',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--app-text-secondary)',
    marginBottom: '7px',
    display: 'block',
  }

  const sectionCardStyle: React.CSSProperties = {
    background: 'var(--app-surface)',
    borderRadius: '8px',
    border: '1px solid var(--app-border)',
    overflow: 'hidden',
  }

  const sectionHeaderStyle: React.CSSProperties = {
    padding: '15px 20px',
    borderBottom: '1px solid var(--app-border)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--app-text)',
    margin: 0,
  }

  const secondaryButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    background: 'var(--app-surface)',
    color: 'var(--app-primary)',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid var(--app-primary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: 'var(--app-bg)' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--app-border)', background: 'var(--app-surface)', flexShrink: 0 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--app-text)', margin: 0 }}>系统设置</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', minHeight: 0 }}>
        <div style={{ width: '100%', maxWidth: '920px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Appearance */}
          <section style={sectionCardStyle} aria-labelledby="appearance-title">
            <div style={sectionHeaderStyle}>
              <Palette size={16} style={{ color: 'var(--app-primary)' }} />
              <h3 id="appearance-title" style={sectionTitleStyle}>外观</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <span style={labelStyle}>主题</span>
              <div role="group" aria-label="界面主题" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {themeOptions.map(({ key, label, icon: Icon }) => {
                  const isActive = settings.theme === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => updateSettings({ theme: key })}
                      style={{
                        minWidth: '104px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px',
                        padding: '9px 14px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: isActive ? 600 : 500,
                        border: `1px solid ${isActive ? 'var(--app-primary)' : 'var(--app-border)'}`,
                        background: isActive ? 'var(--app-primary-light)' : 'var(--app-surface)',
                        color: isActive ? 'var(--app-primary)' : 'var(--app-text-secondary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(event) => {
                        if (!isActive) event.currentTarget.style.background = 'var(--app-hover)'
                      }}
                      onMouseLeave={(event) => {
                        if (!isActive) event.currentTarget.style.background = 'var(--app-surface)'
                      }}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          {/* AI Assistant */}
          <section style={sectionCardStyle} aria-labelledby="ai-assistant-title">
            <div style={sectionHeaderStyle}>
              <Sparkles size={16} style={{ color: 'var(--app-primary)' }} />
              <h3 id="ai-assistant-title" style={sectionTitleStyle}>AI 助手</h3>
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: aiForm.enabled ? 'var(--app-success)' : 'var(--app-text-muted)',
                  background: aiForm.enabled ? 'var(--app-success-bg)' : 'var(--app-surface-muted)',
                  border: `1px solid ${aiForm.enabled ? 'var(--app-success-border)' : 'var(--app-border)'}`,
                }}
              >
                {aiForm.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--app-info-bg)',
                  border: '1px solid var(--app-info-border)',
                  color: 'var(--app-text-secondary)',
                  fontSize: '12px',
                  lineHeight: 1.7,
                }}
              >
                支持 OpenAI-compatible 接口，可接入 OpenAI、DeepSeek、Ollama 或其他兼容服务。
                远程服务必须使用 HTTPS；API Key 仅保存在当前设备的设置文件中，不会写入笔记。
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `1px solid ${aiForm.enabled ? 'var(--app-primary)' : 'var(--app-border)'}`,
                  background: aiForm.enabled ? 'var(--app-primary-light)' : 'var(--app-surface)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={aiForm.enabled}
                  onChange={(event) => updateAiField('enabled', event.target.checked)}
                  style={{ marginTop: '2px', accentColor: 'var(--app-primary)' }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--app-text)' }}>
                    启用 AI 工作台
                  </span>
                  <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', color: 'var(--app-text-secondary)' }}>
                    关闭后不会发起任何 AI 请求，已有配置仍会保留。
                  </span>
                </span>
              </label>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                }}
              >
                <div>
                  <label htmlFor="ai-provider-preset" style={labelStyle}>供应商预设</label>
                  <select
                    id="ai-provider-preset"
                    value={aiPreset}
                    onChange={(event) => handleAiPresetChange(event.target.value as AiProviderPreset)}
                    style={inputStyle}
                  >
                    {aiProviderPresets.map((preset) => (
                      <option key={preset.key} value={preset.key}>{preset.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ai-provider-name" style={labelStyle}>显示名称</label>
                  <input
                    id="ai-provider-name"
                    value={aiForm.providerName}
                    onChange={(event) => updateAiField('providerName', event.target.value)}
                    style={inputStyle}
                    placeholder="例如：团队 AI 网关"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ai-base-url" style={labelStyle}>API Base URL</label>
                <input
                  id="ai-base-url"
                  value={aiForm.baseUrl}
                  onChange={(event) => {
                    updateAiField('baseUrl', event.target.value)
                    setAiPreset(detectAiProvider(event.target.value))
                  }}
                  style={inputStyle}
                  placeholder="https://api.example.com/v1"
                  spellCheck={false}
                  autoComplete="off"
                />
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--app-text-muted)', lineHeight: 1.6 }}>
                  本机 Ollama 示例：<code>http://localhost:11434/v1</code>，通常无需 API Key。
                </div>
              </div>

              <div>
                <label htmlFor="ai-api-key" style={labelStyle}>API Key</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="ai-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={aiForm.apiKey}
                    onChange={(event) => updateAiField('apiKey', event.target.value)}
                    style={{ ...inputStyle, paddingRight: '42px' }}
                    placeholder="sk-...（Ollama 等本机服务可留空）"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((visible) => !visible)}
                    aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: '7px',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '6px',
                      background: 'transparent',
                      color: 'var(--app-text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <span style={labelStyle}>可用能力</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '9px',
                      padding: '11px',
                      border: '1px solid var(--app-border)',
                      borderRadius: '8px',
                      background: 'var(--app-bg)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={aiForm.supportsChat}
                      onChange={(event) => updateAiField('supportsChat', event.target.checked)}
                      style={{ marginTop: '2px', accentColor: 'var(--app-primary)' }}
                    />
                    <span>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--app-text)' }}>文本生成</span>
                      <span style={{ display: 'block', marginTop: '2px', fontSize: '11px', color: 'var(--app-text-muted)' }}>笔记检索整理与会议纪要</span>
                    </span>
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '9px',
                      padding: '11px',
                      border: '1px solid var(--app-border)',
                      borderRadius: '8px',
                      background: 'var(--app-bg)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={aiForm.supportsTranscription}
                      onChange={(event) => updateAiField('supportsTranscription', event.target.checked)}
                      style={{ marginTop: '2px', accentColor: 'var(--app-primary)' }}
                    />
                    <span>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--app-text)' }}>录音转写</span>
                      <span style={{ display: 'block', marginTop: '2px', fontSize: '11px', color: 'var(--app-text-muted)' }}>需供应商提供 transcription 接口和模型</span>
                    </span>
                  </label>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                }}
              >
                <div>
                  <label htmlFor="ai-chat-model" style={labelStyle}>文本生成模型</label>
                  <input
                    id="ai-chat-model"
                    value={aiForm.chatModel}
                    onChange={(event) => updateAiField('chatModel', event.target.value)}
                    style={inputStyle}
                    placeholder="例如：gpt-4o-mini / deepseek-chat"
                    spellCheck={false}
                    disabled={!aiForm.supportsChat}
                  />
                </div>
                <div>
                  <label htmlFor="ai-transcription-model" style={labelStyle}>录音转写模型</label>
                  <input
                    id="ai-transcription-model"
                    value={aiForm.transcriptionModel}
                    onChange={(event) => updateAiField('transcriptionModel', event.target.value)}
                    style={inputStyle}
                    placeholder="例如：whisper-1"
                    spellCheck={false}
                    disabled={!aiForm.supportsTranscription}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                }}
              >
                <div>
                  <label htmlFor="ai-api-protocol" style={labelStyle}>文本接口协议</label>
                  <select
                    id="ai-api-protocol"
                    value={aiForm.apiProtocol}
                    onChange={(event) => updateAiField('apiProtocol', event.target.value as AiConfig['apiProtocol'])}
                    style={inputStyle}
                  >
                    <option value="chat-completions">Chat Completions（兼容性最广）</option>
                    <option value="responses">Responses API</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ai-request-timeout" style={labelStyle}>请求超时（毫秒）</label>
                  <input
                    id="ai-request-timeout"
                    type="number"
                    min={5000}
                    max={180000}
                    step={1000}
                    value={aiForm.requestTimeoutMs}
                    onChange={(event) => updateAiField('requestTimeoutMs', Number(event.target.value))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSaveAi}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--app-primary)',
                    color: 'var(--app-on-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--app-primary-hover)' }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--app-primary)' }}
                >
                  {aiSaved ? <Check size={15} /> : <Save size={15} />}
                  {aiSaved ? '已保存' : '保存 AI 配置'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestAi()}
                  disabled={testingAi || !aiForm.supportsChat}
                  style={{
                    ...secondaryButtonStyle,
                    cursor: testingAi || !aiForm.supportsChat ? 'not-allowed' : 'pointer',
                    opacity: testingAi || !aiForm.supportsChat ? 0.7 : 1,
                  }}
                >
                  <TestTube size={15} />
                  {testingAi ? '测试中...' : '测试文本连接'}
                </button>
                <span style={{ fontSize: '11px', color: 'var(--app-text-muted)' }}>
                  连接测试会发送一条极短文本，不会上传笔记内容。
                </span>
              </div>

              {aiTestMsg && (
                <div
                  role={aiTestMsg.ok ? 'status' : 'alert'}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    background: aiTestMsg.ok ? 'var(--app-success-bg)' : 'var(--app-danger-bg)',
                    color: aiTestMsg.ok ? 'var(--app-success)' : 'var(--app-danger)',
                    border: `1px solid ${aiTestMsg.ok ? 'var(--app-success-border)' : 'var(--app-danger-border)'}`,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {aiTestMsg.text}
                </div>
              )}
            </div>
          </section>

          {/* Sync */}
          <section style={sectionCardStyle} aria-labelledby="sync-title">
            <div style={sectionHeaderStyle}>
              <RefreshCw size={16} style={{ color: 'var(--app-primary)' }} />
              <h3 id="sync-title" style={sectionTitleStyle}>同步配置</h3>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span style={labelStyle}>同步方式</span>
                <div role="group" aria-label="同步方式" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(['local', 'gitee'] as const).map((type) => {
                    const isActive = syncForm.type === type
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setSyncForm({ ...syncForm, type })}
                        style={{
                          minWidth: '88px',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 500,
                          border: `1px solid ${isActive ? 'var(--app-primary)' : 'var(--app-border)'}`,
                          background: isActive ? 'var(--app-primary-light)' : 'var(--app-surface)',
                          color: isActive ? 'var(--app-primary)' : 'var(--app-text-secondary)',
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

              {syncForm.type === 'local' && (
                <div style={{ padding: '12px', background: 'var(--app-success-bg)', borderRadius: '8px', border: '1px solid var(--app-success-border)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--app-success)', marginBottom: '4px' }}>本地模式</div>
                  <div style={{ fontSize: '12px', color: 'var(--app-text-secondary)' }}>历史记录保存在本地，不会进行远程同步。</div>
                </div>
              )}

              {syncForm.type === 'gitee' && (
                <>
                  <div style={{ padding: '12px', background: 'var(--app-info-bg)', borderRadius: '8px', border: '1px solid var(--app-info-border)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--app-text-secondary)', lineHeight: 1.7 }}>
                      同步地址使用软件内置默认值：
                      <code style={{ background: 'var(--app-surface-muted)', color: 'var(--app-text)', padding: '2px 6px', borderRadius: '4px', overflowWrap: 'anywhere' }}>
                        https://gitee.com/api/v5
                      </code>
                      <br />仅需填写私人令牌和仓库名。
                    </div>
                  </div>

                  <div>
                    <label htmlFor="sync-repo" style={labelStyle}>仓库名</label>
                    <input
                      id="sync-repo"
                      value={syncForm.repo}
                      onChange={(e) => setSyncForm({ ...syncForm, repo: e.target.value })}
                      style={inputStyle}
                      placeholder="owner/repo，例如：duhuilai/dunote-history"
                    />
                  </div>

                  <div>
                    <label htmlFor="sync-token" style={labelStyle}>私人令牌（Private Token）</label>
                    <input
                      id="sync-token"
                      type="password"
                      value={syncForm.token}
                      onChange={(e) => setSyncForm({ ...syncForm, token: e.target.value })}
                      style={inputStyle}
                      placeholder="在 Gitee「设置 → 私人令牌」中生成"
                    />
                  </div>

                  <div>
                    <label htmlFor="sync-branch" style={labelStyle}>分支（选填，留空自动使用默认分支）</label>
                    <input
                      id="sync-branch"
                      value={syncForm.branch}
                      onChange={(e) => setSyncForm({ ...syncForm, branch: e.target.value })}
                      style={inputStyle}
                      placeholder="master / main"
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSaveSync}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--app-primary)',
                    color: 'var(--app-on-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--app-primary-hover)' }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--app-primary)' }}
                >
                  {saved ? <Check size={15} /> : <Save size={15} />}
                  {saved ? '已保存' : '保存配置'}
                </button>
                {syncForm.type === 'gitee' && (
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    style={{
                      ...secondaryButtonStyle,
                      cursor: testing ? 'not-allowed' : 'pointer',
                      opacity: testing ? 0.7 : 1,
                    }}
                  >
                    <TestTube size={15} />
                    {testing ? '测试中…' : '测试连接'}
                  </button>
                )}
              </div>

              {testMsg && (
                <div
                  role={testMsg.ok ? 'status' : 'alert'}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    background: testMsg.ok ? 'var(--app-success-bg)' : 'var(--app-danger-bg)',
                    color: testMsg.ok ? 'var(--app-success)' : 'var(--app-danger)',
                    border: `1px solid ${testMsg.ok ? 'var(--app-success-border)' : 'var(--app-danger-border)'}`,
                  }}
                >
                  {testMsg.text}
                </div>
              )}
            </div>
          </section>

          {/* Language */}
          <section style={sectionCardStyle} aria-labelledby="language-title">
            <div style={sectionHeaderStyle}>
              <Globe size={16} style={{ color: 'var(--app-primary)' }} />
              <h3 id="language-title" style={sectionTitleStyle}>语言</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <div
                aria-label="当前语言：简体中文"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'var(--app-primary-light)',
                  color: 'var(--app-primary)',
                  border: '1px solid var(--app-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <Check size={15} />
                简体中文
              </div>
            </div>
          </section>

          {/* About & Update */}
          <section style={sectionCardStyle} aria-labelledby="about-title">
            <div style={sectionHeaderStyle}>
              <Info size={16} style={{ color: 'var(--app-primary)' }} />
              <h3 id="about-title" style={sectionTitleStyle}>关于与更新</h3>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--app-text)' }}>
                    duNote <span style={{ fontWeight: 600 }}>v{appVersion}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--app-text-muted)', marginTop: '3px' }}>
                    当前版本
                    {updateInfo?.checked && !updateInfo.error && (
                      updateInfo.hasUpdate
                        ? ` · 最新版本 v${updateInfo.latestVersion}`
                        : ' · 已是最新版本'
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  style={{
                    ...secondaryButtonStyle,
                    cursor: checkingUpdate ? 'not-allowed' : 'pointer',
                    opacity: checkingUpdate ? 0.7 : 1,
                  }}
                >
                  <RefreshCw size={15} className={checkingUpdate ? 'spin' : ''} />
                  {checkingUpdate ? '检查中…' : '检查更新'}
                </button>
              </div>

              {updateInfo?.error && (
                <div role="alert" style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '12px', background: 'var(--app-danger-bg)', color: 'var(--app-danger)', border: '1px solid var(--app-danger-border)' }}>
                  {updateInfo.error}
                </div>
              )}

              {updateInfo?.hasUpdate && (
                <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--app-success-bg)', border: '1px solid var(--app-success-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Download size={16} style={{ color: 'var(--app-success)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--app-success)' }}>
                      发现新版本 v{updateInfo.latestVersion}
                    </span>
                  </div>
                  {updateInfo.releaseNotes && (
                    <pre style={{ margin: 0, padding: '12px', background: 'var(--app-code-bg)', borderRadius: '8px', border: '1px solid var(--app-border)', fontSize: '11px', lineHeight: 1.6, color: 'var(--app-code-text)', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit' }}>
                      {updateInfo.releaseNotes}
                    </pre>
                  )}
                  <UpdateDownloader variant="full" />
                  <button
                    type="button"
                    onClick={() => openReleasePage(updateInfo.releaseUrl)}
                    style={{ ...secondaryButtonStyle, alignSelf: 'flex-start' }}
                  >
                    <ExternalLink size={15} />
                    查看发布页
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
