import { open } from '@tauri-apps/plugin-shell'
import { Command } from '@tauri-apps/plugin-shell'
import { fetch } from '@tauri-apps/plugin-http'
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import { appConfigDir, join } from '@tauri-apps/api/path'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { exit } from '@tauri-apps/plugin-process'
import { invoke } from '@tauri-apps/api/core'

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

/** 下载状态机 */
export type UpdateDownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'failed'

export interface UpdateDownloadState {
  /** 当前下载阶段 */
  status: UpdateDownloadStatus
  /** 进度百分比 0-100（total 未知时为 0） */
  progress: number
  /** 已下载字节数 */
  loaded: number
  /** 总字节数（0 表示服务器未返回 Content-Length） */
  total: number
  /** 安装包已保存的本地路径（下载完成后才有） */
  filePath: string | null
  /** 失败原因 */
  error: string | null
}

/** 初始下载状态 */
export const initialUpdateDownload = (): UpdateDownloadState => ({
  status: 'idle',
  progress: 0,
  loaded: 0,
  total: 0,
  filePath: null,
  error: null,
})

/** 字节数转可读文本：12.3 MB */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
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

/**
 * 判断运行平台。
 *
 * 注意：不能只依赖 userAgent —— 自打包的 WebView 在某些配置下 UA 不含平台特征，
 * 会导致挑错安装包（macOS 拿到 .exe）。这里按可靠性依次尝试三个信号：
 *  1. navigator.userAgentData.platform（Chromium / WebView2 提供的结构化平台信息）
 *  2. navigator.platform（WKWebView / WebView2 均支持，比 UA 字符串稳定）
 *  3. userAgent 正则兜底
 */
function detectPlatform(): 'windows' | 'macos' | 'linux' {
  if (typeof navigator === 'undefined') return 'linux'
  const n = navigator as unknown as {
    userAgentData?: { platform?: string }
    platform?: string
    userAgent?: string
  }

  const matchPlatform = (raw: string): 'windows' | 'macos' | 'linux' | null => {
    const s = (raw || '').toLowerCase()
    if (!s) return null
    if (s.includes('win')) return 'windows'
    if (s.includes('mac') || s.includes('darwin')) return 'macos'
    if (s.includes('linux') || s.includes('x11')) return 'linux'
    return null
  }

  // 1) 结构化平台信息（最可靠）
  const fromUad = matchPlatform(n.userAgentData?.platform || '')
  if (fromUad) return fromUad

  // 2) navigator.platform
  const fromNp = matchPlatform(n.platform || '')
  if (fromNp) return fromNp

  // 3) UA 兜底
  const ua = n.userAgent || ''
  if (/Windows|Win32|Win64/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X|Darwin/i.test(ua)) return 'macos'
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
 * 流式下载安装包到 appConfigDir/updates，并通过 onProgress 回调上报进度。
 * 使用 plugin-http 的流式 body 逐块读取并增量写入，避免一次性占用大块内存。
 * @returns ok 时返回已保存的本地 filePath
 */
export async function downloadUpdate(
  assetUrl: string,
  assetName: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: boolean; filePath?: string; message: string }> {
  try {
    const res = await fetch(assetUrl, { maxRedirections: 10 })
    if (!res.ok) return { ok: false, message: `下载失败：HTTP ${res.status}` }

    const total = Number(res.headers.get('content-length') || 0)
    const reader = res.body?.getReader()
    if (!reader) return { ok: false, message: '无法读取下载数据流' }

    const baseDir = await appConfigDir()
    const updateDir = await join(baseDir, 'updates')
    if (!(await exists(updateDir))) {
      await mkdir(updateDir, { recursive: true })
    }
    const filePath = await join(updateDir, assetName)

    let loaded = 0
    let first = true
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.byteLength > 0) {
        // 首块覆盖写入（创建文件），后续追加，峰值内存仅一个 chunk
        await writeFile(filePath, value, first ? { append: false } : { append: true })
        first = false
        loaded += value.byteLength
        onProgress?.(loaded, total)
      }
    }
    onProgress?.(loaded, total || loaded)
    return { ok: true, filePath, message: '下载完成' }
  } catch (e: any) {
    const msg = e?.message ? `下载失败：${e.message}` : '下载失败'
    return { ok: false, message: msg }
  }
}

/**
 * Windows：静默安装（无窗口、无 UAC），装完自动拉起新版本。
 *
 * 实现要点：
 * 1. Tauri 的 NSIS `-setup.exe` 支持 `/S`（大写）静默安装，且默认 installMode 为
 *    currentUser（安装到 %LOCALAPPDATA%），因此**不会触发 UAC 提权**，可以做到全程无窗口。
 * 2. 旧版本必须先退出，否则安装目录里的 duNote.exe 被占用、无法覆盖。但进程退出后
 *    就没有任何代码能再执行，所以这里把「等待 → 安装 → 拉起」整条指令交给一个
 *    先于本进程退出就已启动、且**脱离本进程**的 `cmd /c` 子进程托管：
 *      ping -n 4 127.0.0.1 >nul & start "" /WAIT "<安装包>" /S & start "" "<新版 exe>"
 *    - `ping -n 4` 用于延迟约 3 秒（不能用 `timeout`：从 spawn 启动的进程 stdin 被重定向，
 *      timeout 会直接报错退出）。
 *    - `start "" /WAIT` 等待安装程序结束后再执行下一步，保证拉起的是新版。
 *    - 用 `start "" "<exe>"` 重新打开应用；exe 路径由 Rust 的 app_exe_path 提供，
 *      避免硬编码 %LOCALAPPDATA% 在自定义安装目录下失效。
 * 3. spawn 出的 cmd 是独立 OS 进程，本进程 exit(0) 不会连带终止它。
 */
export async function silentInstallWindows(
  filePath: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    // 当前 exe 绝对路径（安装目录即新版安装目录）；拿不到则退化为只安装、不自动拉起
    let exePath = ''
    try {
      exePath = await invoke<string>('app_exe_path')
    } catch {
      exePath = ''
    }

    const relaunch = exePath ? ` & start "" "${exePath}"` : ''
    const script = `ping -n 4 127.0.0.1 >nul & start "" /WAIT "${filePath}" /S${relaunch}`
    await Command.create('cmd', ['/c', script]).spawn()

    // 子进程已接管安装流程，本进程立即退出让出安装目录
    await new Promise((r) => setTimeout(r, 300))
    try {
      await exit(0)
    } catch {
      await getCurrentWebviewWindow().close()
    }
    return { ok: true, message: '正在后台静默安装…' }
  } catch (e: any) {
    const msg = e?.message ? `静默安装失败：${e.message}` : '静默安装失败'
    return { ok: false, message: msg }
  }
}

/**
 * 打开/安装已下载的安装包。
 *
 * - Windows（NSIS .exe）：走静默安装 —— 后台无窗口完成安装并自动打开新版本，
 *   过程中本进程会立即退出（旧 exe 被占用时无法覆盖）。
 * - Windows（.msi 等）：WiX 默认是 per-machine 安装，静默也会弹 UAC，无法真正无感，
 *   因此保持原来的向导行为。
 * - macOS：`.dmg` 只是挂载磁盘镜像并弹出访达窗口，仍需用户手动把 duNote 拖进
 *   「应用程序」。若此处直接 exit(0)，用户会看到 dmg 窗口但 App 已消失、毫无提示，
 *   体验很差。因此 macOS 不自动退出，改为返回 manualInstall 标记，由 UI 引导用户
 *   完成拖拽安装并自行退出。
 */
export async function openInstaller(
  filePath: string,
): Promise<{ ok: boolean; message: string; manualInstall?: boolean; silent?: boolean }> {
  try {
    const platform = detectPlatform()

    // macOS：dmg 只能手动拖拽安装，保持引导
    if (platform === 'macos') {
      await open(filePath)
      return {
        ok: true,
        manualInstall: true,
        message: '已打开安装包：请在访达窗口中将 duNote 拖入「应用程序」文件夹完成安装，然后手动退出旧版本。',
      }
    }

    // Windows NSIS 安装包：静默安装 + 自动拉起（会退出本进程，不返回）
    if (platform === 'windows' && /\.exe$/i.test(filePath)) {
      const res = await silentInstallWindows(filePath)
      return { ok: res.ok, message: res.message, silent: true }
    }

    // 其他情况（msi 等）：交给系统打开安装向导，随后退出本进程让出文件
    await open(filePath)
    await new Promise((r) => setTimeout(r, 300))
    try {
      await exit(0)
    } catch {
      await getCurrentWebviewWindow().close()
    }
    return { ok: true, message: '正在启动安装程序…' }
  } catch (e: any) {
    const msg = e?.message ? `打开安装程序失败：${e.message}` : '打开安装程序失败'
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
