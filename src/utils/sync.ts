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

/** 把 noteId 清洗成合法的远程目录/文件名字段（避免 :、\、中文空格等） */
function sanitizeNoteId(noteId: string): string {
  // 保留可读性：字母数字、点、下划线、横线；其他替换为下划线；连续多个下划线合并
  return noteId
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
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
  const url = `${base}/repos/${encodeURIComponent(config.repo)}`
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
  const url = `${base}/repos/${encodeURIComponent(config.repo)}`
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
export async function pushHistoryToGitee(
  config: SyncConfig,
  entry: Omit<NoteHistory, 'id' | 'timestamp' | 'remote' | 'remotePath'>
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
  }
  const safeNoteId = sanitizeNoteId(entry.noteId)
  const path = `${HISTORY_ROOT}/${safeNoteId}/${ts}.json`
  const url = `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(path)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config.token) },
      body: JSON.stringify({
        content: utf8ToBase64(JSON.stringify(payload)),
        message: `duNote history: ${entry.title} @ ${ts}`,
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
  noteId: string
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

  const safeNoteId = sanitizeNoteId(noteId)
  const dirPath = `${HISTORY_ROOT}/${safeNoteId}`
  const listUrl = `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(dirPath)}?ref=${encodeURIComponent(branch)}`

  try {
    const listRes = await fetch(listUrl, { headers: authHeaders(config.token) })
    if (!listRes.ok) {
      if (listRes.status === 404) return { success: true, data: [], message: '远程暂无历史记录' }
      const err = await listRes.json().catch(() => ({}))
      return { success: false, message: `列出历史失败（${listRes.status}）：${err.message || ''}`, data: [] }
    }

    const files: Array<{ name: string; path: string }> = await listRes.json()
    const entries: NoteHistory[] = []

    for (const f of files) {
      if (!f.name.endsWith('.json')) continue
      const contentUrl = `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(f.path)}?ref=${encodeURIComponent(branch)}`
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
    const url = `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(remotePath)}?ref=${encodeURIComponent(branch)}`
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
  historyEntry: Omit<NoteHistory, 'id' | 'timestamp' | 'remote' | 'remotePath'>
): Promise<SyncResult> {
  return pushHistoryToGitee(config, historyEntry)
}

export async function restoreHistoryFromRemote(
  config: SyncConfig,
  noteId: string
): Promise<SyncResult<NoteHistory[]>> {
  return pullHistoryFromGitee(config, noteId)
}
