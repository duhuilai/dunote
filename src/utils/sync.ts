import type { SyncConfig, NoteHistory } from '@/types'

/**
 * Gitee 同步实现
 *
 * 模型：每次「生成历史」向仓库写入一个 JSON 快照文件
 *   dunote-history/<noteId>/<ISO时间戳>.json
 * 该文件写入会创建一个 commit，相当于「推送一次版本」。
 * 「还原历史」时列出该目录并逐个拉取文件内容还原。
 *
 * 地址使用软件内置默认（https://gitee.com/api/v5），用户只需提供
 * 私人令牌 (token) 与仓库名 (repo)。分支留空时自动探测仓库默认分支。
 */

const DEFAULT_GITEE_API = 'https://gitee.com/api/v5'

/** 历史快照在仓库中的目录前缀 */
const HISTORY_ROOT = 'dunote-history'

/** 推/拉操作返回结果 */
export interface SyncResult<T = boolean> {
  success: boolean
  data?: T
  message?: string
}

/* ─── 编码工具 ─── */
function apiBase(config: SyncConfig): string {
  return config.url && config.url.trim() ? config.url.trim().replace(/\/$/, '') : DEFAULT_GITEE_API
}

/** 按路径段分别编码（Gitee 要求路径中的 / 不能整体编码） */
function encodePath(p: string): string {
  return p.split('/').map((seg) => encodeURIComponent(seg)).join('/')
}

/**
 * 把仓库标识转成 API 路径段（owner/repo）。
 * - 关键：路径中的 / 必须分段编码，绝不能整体 encodeURIComponent，
 *   否则 "owner/repo" 会变成 "owner%2Frepo"，Gitee 视为单段路径而返回 404 Not Found Project。
 * - 支持用户填写 "owner/repo" 或仅填仓库名：
 *   仅仓库名时，用私人令牌调 /user 自动探测当前登录用户作为 owner。
 */
async function repoPath(config: SyncConfig): Promise<string> {
  let repo = (config.repo || '').trim()
  if (!repo) return ''
  if (!repo.includes('/')) {
    try {
      const me = await fetch(`${apiBase(config)}/user`, { headers: authHeaders(config.token) })
      if (me.ok) {
        const d = await me.json().catch(() => ({}))
        const owner = d.login || d.username
        if (owner) repo = `${owner}/${repo}`
      }
    } catch {
      /* 探测失败时退回原 repo（下面会因缺 owner 而 404，错误信息会提示填写 owner/repo） */
    }
  }
  return repo.split('/').filter(Boolean).map((s) => encodeURIComponent(s)).join('/')
}

/** 把 noteId 清洗成合法的远程目录/文件名字段（避免 :、\、中文空格等） */
function sanitizeNoteId(noteId: string): string {
  // 保留可读性：字母数字、点、下划线、横线；其他替换为下划线；连续多个下划线合并
  return noteId
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** 紧凑本地时间戳 YYYYMMDDHHMMSSmmm（如 20260710182398284），用于备份文件名 */
function flatTimestamp(d: Date = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
  )
}

/**
 * 计算笔记文件相对「打开的文件夹」根目录的路径。
 * 用于 Gitee 同步时按本地文件夹层级存储。
 * 例：absPath="D:/我的笔记/工作/项目A/笔记1.md"，root="D:/我的笔记" → "工作/项目A/笔记1.md"
 * 不传 root 时返回去掉盘符后的完整路径。
 */
export function toRelativePath(absPath?: string, root?: string | null): string {
  if (!absPath) return ''
  let p = absPath.replace(/^[A-Za-z]:[\\/]/, '').replace(/\\/g, '/')
  if (root) {
    const r = root.replace(/^[A-Za-z]:[\\/]/, '').replace(/\\/g, '/').replace(/\/+$/, '')
    const rr = r ? r + '/' : ''
    if (r && p.startsWith(rr)) p = p.slice(rr.length)
  }
  return p.replace(/^\/+/, '')
}

/**
 * 把层级相对路径清洗为合法的 Gitee 目录路径（保留 / 分隔）。
 * 结构：完全镜像本地打开的文件夹层级，末级文件夹即笔记名，里面放时间戳备份文件。
 * 例：relPath="知识库/内控系统.md" → "知识库/内控系统"
 *     relPath="dunote/会议纪要/2026-05-11亚林所/2026-05-11亚林所.md"
 *     → "dunote/会议纪要/2026-05-11亚林所/2026-05-11亚林所"
 * 无有效路径时回退到 noteId 清洗目录，保证兼容旧数据。
 */
function buildHistoryDir(relPath?: string, noteId?: string): string {
  if (relPath && relPath.trim()) {
    let cleaned = relPath
      .replace(/^[A-Za-z]:[\\/]/, '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
    // 仅去掉文件扩展名；文件/文件夹名本身作为末级容器（笔记名文件夹）
    cleaned = cleaned.replace(/\.(md|html?|txt|json)$/i, '')
    if (cleaned) return cleaned
  }
  return sanitizeNoteId(noteId || 'note')
}

/** 取 path 的父目录（空则返回空） */
function parentDir(path?: string): string {
  if (!path) return ''
  const segs = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return segs.length <= 1 ? '' : segs.slice(0, -1).join('/')
}

/** 构造认证头（推荐方式，比 URL query 参数更稳定） */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `token ${token}` }
}

/** UTF-8 字符串 → Base64（浏览器 / Tauri WebView 环境） */
function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

/** Base64 → UTF-8 字符串 */
function base64ToUtf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))))
}

/* ─── 分支探测 ─── */
async function resolveBranch(config: SyncConfig): Promise<{ branch: string; message?: string }> {
  if (config.branch && config.branch.trim()) return { branch: config.branch.trim() }
  const base = apiBase(config)
  const url = `${base}/repos/${await repoPath(config)}`
  try {
    const res = await fetch(url, { headers: authHeaders(config.token) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        branch: 'master',
        message: `获取仓库信息失败（${res.status}）：${err.message || '请检查令牌与仓库名是否正确，以及令牌是否有仓库读取权限'}`
      }
    }
    const data = await res.json()
    return { branch: data.default_branch || 'master' }
  } catch (error) {
    return {
      branch: 'master',
      message: `探测默认分支时网络异常：${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/** 测试 Gitee 连接（用于设置页） */
export async function testGiteeConnection(config: SyncConfig): Promise<SyncResult> {
  if (config.type !== 'gitee') {
    return { success: false, message: '当前同步方式不是 Gitee' }
  }
  if (!config.token || !config.repo) {
    return { success: false, message: '请填写 Gitee 私人令牌和仓库名' }
  }
  const base = apiBase(config)
  const url = `${base}/repos/${await repoPath(config)}`
  try {
    const res = await fetch(url, { headers: authHeaders(config.token) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        success: false,
        message: `连接失败（${res.status}）：${err.message || '请检查令牌与仓库名是否正确，以及令牌权限是否包含 projects'}`
      }
    }
    const data = await res.json()
    return {
      success: true,
      message: `连接成功：${data.full_name || config.repo}，默认分支 ${data.default_branch || 'master'}`
    }
  } catch (error) {
    return {
      success: false,
      message: `连接异常：${error instanceof Error ? error.message : String(error)}（可能是网络或 CORS 限制）`
    }
  }
}

/* ─── 推送单条历史快照 ─── */
export interface PushOptions {
  /** 笔记文件相对「打开的文件夹」根目录的层级路径（如 工作/项目A/笔记1.md），用于分层存储 */
  relPath?: string
  /** 应用版本号 */
  appVersion?: string
  /** 笔记本地绝对路径 */
  localPath?: string
}

export async function pushHistoryToGitee(
  config: SyncConfig,
  entry: Omit<NoteHistory, 'id' | 'timestamp' | 'remote' | 'remotePath'>,
  opts?: PushOptions
): Promise<SyncResult> {
  if (config.type !== 'gitee') {
    return { success: false, message: '同步方式不是 Gitee' }
  }
  if (!config.token || !config.repo) {
    return { success: false, message: '请填写 Gitee 私人令牌和仓库名' }
  }

  const base = apiBase(config)
  const branchResult = await resolveBranch(config)
  if (branchResult.message) {
    return { success: false, message: branchResult.message }
  }
  const branch = branchResult.branch

  const ts = new Date().toISOString()
  const payload = {
    title: entry.title,
    content: entry.content,
    timestamp: ts,
    action: entry.action,
    noteId: entry.noteId,
    // ── 详细备份信息 ──
    path: opts?.localPath || '',
    relativePath: opts?.relPath || '',
    app: 'duNote',
    appVersion: opts?.appVersion || '',
  }
  const dir = buildHistoryDir(opts?.relPath, entry.noteId)
  const path = `${dir}/${flatTimestamp()}.json`
  const url = `${base}/repos/${await repoPath(config)}/contents/${encodePath(path)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config.token) },
      body: JSON.stringify({
        content: utf8ToBase64(JSON.stringify(payload, null, 2)),
        message: `duNote 备份: ${entry.title} @ ${ts}`,
        branch,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[Gitee] 推送历史失败', res.status, err)
      return {
        success: false,
        message: `推送失败（${res.status}）：${err.message || err.error || '请检查令牌权限、仓库名和分支是否正确'}`
      }
    }
    return { success: true, message: `已推送 ${path}` }
  } catch (error) {
    console.error('[Gitee] 推送历史异常', error)
    return {
      success: false,
      message: `推送异常：${error instanceof Error ? error.message : String(error)}（可能是网络或 CORS 限制）`
    }
  }
}

/* ─── 拉取某条笔记的全部历史快照 ─── */
export async function pullHistoryFromGitee(
  config: SyncConfig,
  noteId: string,
  relPath?: string
): Promise<SyncResult<NoteHistory[]>> {
  if (config.type !== 'gitee') {
    return { success: false, message: '同步方式不是 Gitee', data: [] }
  }
  if (!config.token || !config.repo) {
    return { success: false, message: '请填写 Gitee 私人令牌和仓库名', data: [] }
  }

  const base = apiBase(config)
  const branchResult = await resolveBranch(config)
  if (branchResult.message) {
    return { success: false, message: branchResult.message, data: [] }
  }
  const branch = branchResult.branch
  const repo = await repoPath(config)

  // 候选目录：新结构（层级路径）+ v0.1.17 旧结构（缺少笔记名层）+ 旧结构（dunote-history 前缀单层目录），合并去重以保证兼容
  const newDir = buildHistoryDir(relPath, noteId)
  const dirCandidates = Array.from(
    new Set(
      [
        newDir,
        parentDir(newDir), // 兼容 v0.1.17：文件平铺在父目录下
        buildHistoryDir(undefined, noteId),
        `${HISTORY_ROOT}/${sanitizeNoteId(noteId || 'note')}`,
      ].filter(Boolean)
    )
  )

  const entries: NoteHistory[] = []
  try {
    for (const dirPath of dirCandidates) {
      const listUrl = `${base}/repos/${repo}/contents/${encodePath(dirPath)}?ref=${encodeURIComponent(branch)}`
      const listRes = await fetch(listUrl, { headers: authHeaders(config.token) })
      if (!listRes.ok) {
        if (listRes.status === 404) continue // 该目录不存在，尝试下一个候选
        const err = await listRes.json().catch(() => ({}))
        console.warn('[Gitee] 列出历史失败', listRes.status, err)
        continue
      }

      const files: Array<{ name: string; path: string }> = await listRes.json()
      for (const f of files) {
        if (!f.name.endsWith('.json')) continue
        const contentUrl = `${base}/repos/${repo}/contents/${encodePath(f.path)}?ref=${encodeURIComponent(branch)}`
        try {
          const cRes = await fetch(contentUrl, { headers: authHeaders(config.token) })
          if (!cRes.ok) continue
          const cData = await cRes.json()
          const obj = JSON.parse(base64ToUtf8(cData.content || ''))
          entries.push({
            id: f.path,
            noteId,
            title: obj.title || noteId,
            content: obj.content || '',
            timestamp: obj.timestamp || '',
            action: obj.action || 'edit',
            remote: true,
            remotePath: f.path,
          })
        } catch (e) {
          console.warn('[Gitee] 解析快照失败', f.path, e)
        }
      }
    }

    if (entries.length === 0) {
      return { success: true, data: [], message: '远程暂无历史记录' }
    }

    entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    return { success: true, data: entries }
  } catch (error) {
    console.error('[Gitee] 拉取历史异常', error)
    return {
      success: false,
      message: `拉取异常：${error instanceof Error ? error.message : String(error)}`,
      data: []
    }
  }
}

/* ─── 拉取单条快照内容（还原时重新获取最新内容） ─── */
export async function fetchGiteeFileContent(
  config: SyncConfig,
  noteId: string,
  remotePath: string
): Promise<string | null> {
  if (config.type !== 'gitee' || !config.token || !config.repo) return null
  try {
    const base = apiBase(config)
    const branchResult = await resolveBranch(config)
    const branch = branchResult.branch
    const url = `${base}/repos/${await repoPath(config)}/contents/${encodePath(remotePath)}?ref=${encodeURIComponent(branch)}`
    const res = await fetch(url, { headers: authHeaders(config.token) })
    if (!res.ok) return null
    const data = await res.json()
    const obj = JSON.parse(base64ToUtf8(data.content || ''))
    return obj.content ?? null
  } catch (error) {
    console.error('[Gitee] 拉取单文件异常', error)
    return null
  }
}

/* ─── 兼容旧调用签名（让 NoteEditor 改动最小） ─── */
export async function syncHistoryToRemote(
  config: SyncConfig,
  historyEntry: Omit<NoteHistory, 'id' | 'timestamp' | 'remote' | 'remotePath'>,
  opts?: PushOptions
): Promise<SyncResult> {
  return pushHistoryToGitee(config, historyEntry, opts)
}

export async function restoreHistoryFromRemote(
  config: SyncConfig,
  noteId: string,
  relPath?: string
): Promise<SyncResult<NoteHistory[]>> {
  return pullHistoryFromGitee(config, noteId, relPath)
}
