import { open } from '@tauri-apps/plugin-shell'
import { fetch } from '@tauri-apps/plugin-http'
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import { appConfigDir, join } from '@tauri-apps/api/path'

const REPO = 'duhuilai/dunote'
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASE_PAGE = `https://github.com/${REPO}/releases`

export interface UpdateInfo {
  /** 是否存在可用更新 */
  hasUpdate: boolean
  /** 当前安装版本（不含 v 前缀） */
  currentVersion: string
  /** 远端最新版本（不含 v 前缀） */
  latestVersion: string
  /** 更新日志（Release body） */
  releaseNotes: string
  /** Release 页面地址 */
  releaseUrl: string
  /** 适用于当前平台的安装包下载地址 */
  assetUrl: string | null
  /** 安装包文件名 */
  assetName: string | null
  /** 检测过程中的错误信息（网络/解析失败等） */
  error?: string
  /** 检测是否完成 */
  checked: boolean
}

const emptyUpdate = (currentVersion: string): UpdateInfo => ({
  hasUpdate: false,
  currentVersion,
  latestVersion: currentVersion,
  releaseNotes: '',
  releaseUrl: RELEASE_PAGE,
  assetUrl: null,
  assetName: null,
  checked: true,
})

/** 通过 userAgent 判断运行平台（WebView 中可靠） */
function detectPlatform(): 'windows' | 'macos' | 'linux' {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac/i.test(ua)) return 'macos'
  return 'linux'
}

/** 解析 "v1.2.3" 为数字三元组，无法解析时返回 [0,0,0] */
function parseVersion(v: string): [number, number, number] {
  const m = (v || '').replace(/^v/i, '').trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return [0, 0, 0]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** 比较 latest 是否严格大于 current */
function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

/** 按平台挑选最匹配的 Release 资产 */
function pickAsset(assets: any[], platform: string): any | null {
  if (!Array.isArray(assets) || assets.length === 0) return null
  const name = (s: string) => (s || '').toLowerCase()
  if (platform === 'windows') {
    // 优先 NSIS 安装包（.exe），其次 MSI
    return (
      assets.find((a) => name(a.name).endsWith('.exe')) ||
      assets.find((a) => name(a.name).endsWith('.msi')) ||
      null
    )
  }
  if (platform === 'macos') {
    return assets.find((a) => name(a.name).endsWith('.dmg')) || null
  }
  return (
    assets.find((a) => name(a.name).endsWith('.appimage')) ||
    assets.find((a) => name(a.name).endsWith('.deb')) ||
    null
  )
}

/**
 * 检查 GitHub 上是否有新版本。
 * @param currentVersion 当前安装版本，如 "0.1.11"
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  try {
    const res = await fetch(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      maxRedirections: 10,
    })
    if (!res.ok) {
      return { ...emptyUpdate(currentVersion), error: `GitHub 返回 ${res.status}` }
    }
    const data = await res.json()
    const latest = (data.tag_name || '').replace(/^v/i, '')
    if (!latest) return { ...emptyUpdate(currentVersion), error: '无法解析最新版本号' }

    const platform = detectPlatform()
    const asset = pickAsset(data.assets || [], platform)
    const hasUpdate = isNewer(latest, currentVersion) && !!asset

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latest,
      releaseNotes: typeof data.body === 'string' ? data.body : '',
      releaseUrl: data.html_url || RELEASE_PAGE,
      assetUrl: asset?.browser_download_url || null,
      assetName: asset?.name || null,
      checked: true,
    }
  } catch (e: any) {
    return {
      ...emptyUpdate(currentVersion),
      error: e?.message ? `检查更新失败：${e.message}` : '检查更新失败（网络异常）',
    }
  }
}

/**
 * 下载并按平台启动安装包。
 * 下载到 appConfigDir/updates 后用系统默认程序打开（触发安装向导）。
 */
export async function installUpdate(
  assetUrl: string,
  assetName: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(assetUrl, { maxRedirections: 10 })
    if (!res.ok) return { ok: false, message: `下载失败：HTTP ${res.status}` }

    const bytes = new Uint8Array(await res.arrayBuffer())

    const baseDir = await appConfigDir()
    const updateDir = await join(baseDir, 'updates')
    if (!(await exists(updateDir))) {
      await mkdir(updateDir, { recursive: true })
    }
    const filePath = await join(updateDir, assetName)
    await writeFile(filePath, bytes)

    // 用系统关联程序打开安装包（Windows 启动 exe/msi 安装向导，macOS 挂载 dmg）
    await open(filePath)
    return { ok: true, message: '已下载安装包，正在启动安装程序…' }
  } catch (e: any) {
    const msg = e?.message ? `下载或安装失败：${e.message}` : '下载或安装失败'
    return { ok: false, message: msg }
  }
}

/** 在默认浏览器中打开 Release 页面（备选/兜底操作） */
export async function openReleasePage(url: string): Promise<void> {
  try {
    await open(url)
  } catch {
    /* 忽略打开失败 */
  }
}
