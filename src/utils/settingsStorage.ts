import { appConfigDir, join } from '@tauri-apps/api/path'
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import type { AppSettings } from '@/types'
import { isTauriRuntime } from '@/utils/notesStorage'

const SETTINGS_FILE = 'settings.json'
const BROWSER_SETTINGS_KEY = 'dunote.settings.v1'

export const defaultSettings: AppSettings = {
  language: 'zh-CN',
  syncConfig: {
    type: 'local',
    url: 'https://gitee.com/api/v5',
    repo: '',
    branch: '',
    token: '',
  },
  aiConfig: {
    enabled: false,
    providerName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    apiProtocol: 'chat-completions',
    chatModel: 'gpt-4o-mini',
    transcriptionModel: 'whisper-1',
    supportsChat: true,
    supportsTranscription: true,
    requestTimeoutMs: 60000,
  },
  customColors: {
    '标签-重要': '#EF4444',
    '标签-工作': '#2563EB',
    '标签-学习': '#10B981',
    '标签-生活': '#F59E0B',
    '标签-灵感': '#8B5CF6',
    '标签-归档': '#64748B',
  },
  theme: 'system',
}

function mergeSettings(persisted: Partial<AppSettings>): AppSettings {
  return {
    ...defaultSettings,
    ...persisted,
    syncConfig: {
      ...defaultSettings.syncConfig,
      ...(persisted.syncConfig || {}),
    },
    aiConfig: {
      ...defaultSettings.aiConfig,
      ...(persisted.aiConfig || {}),
    },
    customColors: {
      ...defaultSettings.customColors,
      ...(persisted.customColors || {}),
    },
  }
}

export async function loadSettings(): Promise<AppSettings> {
  let browserFallback: Partial<AppSettings> | null = null
  try {
    const raw = localStorage.getItem(BROWSER_SETTINGS_KEY)
    if (raw) browserFallback = JSON.parse(raw) as Partial<AppSettings>
  } catch {
    /* localStorage may be unavailable in hardened webviews */
  }

  if (!isTauriRuntime()) {
    return browserFallback ? mergeSettings(browserFallback) : { ...defaultSettings }
  }

  try {
    const dir = await appConfigDir()
    const filePath = await join(dir, SETTINGS_FILE)
    const content = await readTextFile(filePath)
    const parsed = JSON.parse(content)
    return mergeSettings(parsed)
  } catch (e) {
    if (browserFallback) return mergeSettings(browserFallback)
    console.warn('[Settings] 无法读取桌面设置，使用默认值:', e)
    return { ...defaultSettings }
  }
}

let settingsWriteQueue = Promise.resolve()

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* The desktop file remains the source of truth when localStorage is blocked. */
  }

  if (!isTauriRuntime()) return

  const write = async () => {
    try {
      const dir = await appConfigDir()
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true })
      }
      const filePath = await join(dir, SETTINGS_FILE)
      await writeTextFile(filePath, JSON.stringify(settings, null, 2))
    } catch (e) {
      console.error('[Settings] 保存设置失败', e)
      throw e
    }
  }

  const task = settingsWriteQueue.then(write, write)
  settingsWriteQueue = task.then(() => undefined, () => undefined)
  await task
}
