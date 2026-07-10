import { appConfigDir, join } from '@tauri-apps/api/path'
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import type { AppSettings } from '@/types'

const SETTINGS_FILE = 'settings.json'

export const defaultSettings: AppSettings = {
  language: 'zh-CN',
  syncConfig: {
    type: 'local',
    url: 'https://gitee.com/api/v5',
    repo: '',
    branch: '',
    token: '',
  },
  customColors: {
    '标签-重要': '#EF4444',
    '标签-工作': '#2563EB',
    '标签-学习': '#10B981',
    '标签-生活': '#F59E0B',
    '标签-灵感': '#8B5CF6',
    '标签-归档': '#64748B',
  },
  theme: 'light',
}

function mergeSettings(persisted: Partial<AppSettings>): AppSettings {
  return {
    ...defaultSettings,
    ...persisted,
    syncConfig: {
      ...defaultSettings.syncConfig,
      ...(persisted.syncConfig || {}),
    },
    customColors: {
      ...defaultSettings.customColors,
      ...(persisted.customColors || {}),
    },
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const dir = await appConfigDir()
    const filePath = await join(dir, SETTINGS_FILE)
    const content = await readTextFile(filePath)
    const parsed = JSON.parse(content)
    return mergeSettings(parsed)
  } catch (e) {
    // 文件不存在或解析失败时返回默认设置
    return defaultSettings
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const dir = await appConfigDir()
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true })
    }
    const filePath = await join(dir, SETTINGS_FILE)
    await writeTextFile(filePath, JSON.stringify(settings, null, 2))
  } catch (e) {
    console.error('[Settings] 保存设置失败', e)
  }
}
