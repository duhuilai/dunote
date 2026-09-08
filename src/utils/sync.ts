import type { SyncConfig } from '@/types'

/**
 * Gitee 相关工具（设置页连通性测试 + git 远程地址解析 + 相对路径计算）
 *
 * 历史背景：本文件最初承载「Gitee OpenAPI 快照同步」实现（每次生成历史写一个 JSON
 * 快照文件）。v0.2.x 起备份改为 **git 提交真实笔记文件**（见 `gitBackup.ts`），
 * 那批 OpenAPI 推/拉函数（`pushHistoryToGitee` / `pullHistoryFromGitee` /
 * `fetchGiteeFileContent` / `syncHistoryToRemote` / `restoreHistoryFromRemote`）
 * 已全部无调用方，于 v0.2.23 删除，避免与 git 备份流程混淆。
 *
 * 保留：testGiteeConnection（设置页测试连接）、resolveGiteeRemoteUrl（git push/fetch 用）、
 * toRelativePath（笔记相对根目录路径）。
 */

const DEFAULT_GITEE_API = 'https://gitee.com/api/v5'

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

/** 构造认证头（推荐方式，比 URL query 参数更稳定） */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `token ${token}` }
}

/**
 * 计算笔记文件相对「打开的文件夹」根目录的路径。
 * 用于 Gitee 同步时按本地文件夹层级存储。
 * 例：absPath="D:/我的笔记/工作/项目A/笔记1.html"，root="D:/我的笔记" → "工作/项目A/笔记1.html"
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

/**
 * 解析出 Gitee 的 git 远程仓库地址（用于 isomorphic-git 的 push/fetch）。
 * 返回形如 https://gitee.com/owner/repo.git 的地址与 owner（作为 Basic Auth 用户名）。
 * 若仓库名只填了 repo 没填 owner，则探测当前登录用户。
 */
export async function resolveGiteeRemoteUrl(
  config: SyncConfig
): Promise<{ url: string; owner: string } | null> {
  const rp = await repoPath(config)
  if (!rp) return null
  const owner = rp.split('/')[0]
  return { url: `https://gitee.com/${rp}.git`, owner }
}
