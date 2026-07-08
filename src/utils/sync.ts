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

/* ─── 编码工具 ─── */
function apiBase(config: SyncConfig): string {
  return config.url && config.url.trim() ? config.url.trim().replace(/\/$/, '') : DEFAULT_GITEE_API
}

/** 按路径段分别编码（Gitee 要求路径中的 / 不能整体编码） */
function encodePath(p: string): string {
  return p.split('/').map((seg) => encodeURIComponent(seg)).join('/')
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
async function resolveBranch(config: SyncConfig): Promise<string> {
  if (config.branch && config.branch.trim()) return config.branch.trim()
  const base = apiBase(config)
  const url = `${base}/repos/${encodeURIComponent(config.repo)}?access_token=${encodeURIComponent(config.token)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`获取仓库信息失败（${res.status}）：请检查令牌与仓库名是否正确`)
  }
  const data = await res.json()
  return data.default_branch || 'master'
}

/* ─── 推送单条历史快照 ─── */
export async function pushHistoryToGitee(
  config: SyncConfig,
  entry: Omit<NoteHistory, 'id' | 'timestamp' | 'remote' | 'remotePath'>
): Promise<boolean> {
  try {
    const base = apiBase(config)
    const branch = await resolveBranch(config)
    const ts = new Date().toISOString()
    const payload = {
      title: entry.title,
      content: entry.content,
      timestamp: ts,
      action: entry.action,
      noteId: entry.noteId,
    }
    const path = `${HISTORY_ROOT}/${entry.noteId}/${ts}.json`
    const url =
      `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(path)}` +
      `?access_token=${encodeURIComponent(config.token)}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: utf8ToBase64(JSON.stringify(payload)),
        message: `duNote 历史快照：${entry.title} @ ${ts}`,
        branch,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[Gitee] 推送历史失败', res.status, err)
      return false
    }
    return true
  } catch (error) {
    console.error('[Gitee] 推送历史异常', error)
    return false
  }
}

/* ─── 拉取某条笔记的全部历史快照 ─── */
export async function pullHistoryFromGitee(
  config: SyncConfig,
  noteId: string
): Promise<NoteHistory[]> {
  try {
    const base = apiBase(config)
    const branch = await resolveBranch(config)
    const dirPath = `${HISTORY_ROOT}/${noteId}`
    const listUrl =
      `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(dirPath)}` +
      `?access_token=${encodeURIComponent(config.token)}&ref=${encodeURIComponent(branch)}`

    const listRes = await fetch(listUrl)
    if (!listRes.ok) {
      if (listRes.status === 404) return [] // 目录不存在 = 还没有历史
      console.error('[Gitee] 列出历史失败', listRes.status)
      return []
    }

    const files: Array<{ name: string; path: string }> = await listRes.json()
    const entries: NoteHistory[] = []

    for (const f of files) {
      if (!f.name.endsWith('.json')) continue
      const contentUrl =
        `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(f.path)}` +
        `?access_token=${encodeURIComponent(config.token)}&ref=${encodeURIComponent(branch)}`
      const cRes = await fetch(contentUrl)
      if (!cRes.ok) continue
      const cData = await cRes.json()
      try {
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

    // 按时间倒序（最新在前）
    entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    return entries
  } catch (error) {
    console.error('[Gitee] 拉取历史异常', error)
    return []
  }
}

/* ─── 拉取单条快照内容（还原时重新获取最新内容） ─── */
export async function fetchGiteeFileContent(
  config: SyncConfig,
  remotePath: string
): Promise<string | null> {
  try {
    const base = apiBase(config)
    const branch = await resolveBranch(config)
    const url =
      `${base}/repos/${encodeURIComponent(config.repo)}/contents/${encodePath(remotePath)}` +
      `?access_token=${encodeURIComponent(config.token)}&ref=${encodeURIComponent(branch)}`
    const res = await fetch(url)
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
): Promise<boolean> {
  if (config.type !== 'gitee') return false
  return pushHistoryToGitee(config, historyEntry)
}

export async function restoreHistoryFromRemote(
  config: SyncConfig,
  noteId: string
): Promise<NoteHistory[] | null> {
  if (config.type !== 'gitee') return null
  return pullHistoryFromGitee(config, noteId)
}
