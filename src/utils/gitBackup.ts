/**
 * 基于 git 的笔记备份（「软件自带 git」= isomorphic-git 纯 JS 实现，走 Tauri 的 fs/http 插件）。
 *
 * 设计原则（对应需求）：
 * 1. 备份直接提交「当前笔记文件」，而不是每次生成新的 JSON 快照 —— 智能表格等数据原样落在 .html 里，绝不丢失。
 * 2. 版本记录用 git commit 历史（`git log`）实现，而不是反复新增文件。
 * 3. 本地备份 = 在「打开的文件夹」里 git init 一个仓库；Gitee 备份 = 同一仓库加一个 gitee 远程并 push。
 *
 * 仓库位置：直接使用用户「打开的文件夹」根目录作为 repoDir（git init 会创建 .git）。
 *   - 本地文件笔记：提交其真实的 .html 文件（相对路径 = toRelativePath(filePath, root)）。
 *   - 内存型「普通笔记」：物化到 repoDir/.dunote/notes/<id>.html 后提交，避免污染用户可见文件。
 */
import git from 'isomorphic-git'
import { makeTauriFs } from './gitFs'
import { tauriHttp } from './gitHttp'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import * as tauriFs from '@tauri-apps/plugin-fs'

const GIT_USER_NAME = 'duNote'
const GIT_USER_EMAIL = 'dunote@local'
/** Gitee 远程名（与 pull/push 统一） */
export const GITEE_REMOTE = 'gitee'

export interface BackupResult {
  success: boolean
  message?: string
  oid?: string
}

export interface HistoryVersion {
  oid: string
  message: string
  /** 毫秒时间戳 */
  timestamp: number
  author: string
}

function errMsg(e: any): string {
  if (!e) return '未知错误'
  const m = e.message || String(e)
  if (/ECONN|ENOTFOUND|fetch failed|network|timed out/i.test(m)) return `网络错误：${m}`
  if (/NotFound|404/i.test(m) && /repository|repo/i.test(m)) return `仓库不存在或无权访问：${m}`
  return m
}

function parentDirOf(relPath: string): string {
  const segs = relPath.split('/').filter(Boolean)
  if (segs.length <= 1) return ''
  return segs.slice(0, -1).join('/')
}

function getFs(repoDir: string) {
  return makeTauriFs(repoDir)
}

/** 确保 repoDir 是一个 git 仓库，并设置提交身份 */
export async function ensureRepo(repoDir: string): Promise<BackupResult> {
  const fs = getFs(repoDir)
  try {
    const gitPath = `${repoDir.replace(/\/+$/, '')}/.git`.replace(/\//g, '\\')
    const hasGit = await tauriFs.exists(gitPath)
    if (!hasGit) {
      await git.init({ fs, dir: repoDir, defaultBranch: 'main' })
    }
    await git.setConfig({ fs, dir: repoDir, path: 'user.name', value: GIT_USER_NAME })
    await git.setConfig({ fs, dir: repoDir, path: 'user.email', value: GIT_USER_EMAIL })
    return { success: true }
  } catch (e) {
    return { success: false, message: errMsg(e) }
  }
}

/** 把笔记内容作为真实文件提交进仓库（一次版本记录 = 一次 commit） */
export async function commitNoteFile(opts: {
  repoDir: string
  relPath: string
  content: string
  message: string
}): Promise<BackupResult> {
  const fs = getFs(opts.repoDir)
  try {
    await ensureRepo(opts.repoDir)
    const parent = parentDirOf(opts.relPath)
    if (parent) await fs.mkdir(parent, { recursive: true })
    await fs.writeFile(opts.relPath, opts.content)
    await git.add({ fs, dir: opts.repoDir, filepath: opts.relPath })
    const oid = await git.commit({
      fs,
      dir: opts.repoDir,
      message: opts.message,
      author: { name: GIT_USER_NAME, email: GIT_USER_EMAIL },
    })
    return { success: true, oid }
  } catch (e) {
    return { success: false, message: errMsg(e) }
  }
}

/** 列出某文件的历史版本（git log -- <relPath>）。ref 可指定分支/远程跟踪引用 */
export async function listHistory(
  repoDir: string,
  relPath: string,
  ref = 'HEAD',
  depth = 100
): Promise<HistoryVersion[]> {
  const fs = getFs(repoDir)
  try {
    const log = await git.log({ fs, dir: repoDir, ref, filepath: relPath, depth })
    return log.map((c) => ({
      oid: c.oid,
      message: c.commit.message,
      timestamp: (c.commit.author.timestamp || 0) * 1000,
      author: c.commit.author.name || GIT_USER_NAME,
    }))
  } catch {
    // 文件从未提交过 / ref 不存在 → 视为无历史
    return []
  }
}

/** 读取某 commit 中该文件的内容（用于预览 / 还原） */
export async function readVersion(
  repoDir: string,
  relPath: string,
  oid: string
): Promise<string | null> {
  const fs = getFs(repoDir)
  try {
    const { blob } = await git.readBlob({ fs, dir: repoDir, oid, filepath: relPath })
    return new TextDecoder().decode(blob as Uint8Array)
  } catch {
    return null
  }
}

/** 推送到 Gitee 远程（force 确保备份仓库始终反映本地全部版本记录） */
export async function pushToRemote(opts: {
  repoDir: string
  remoteUrl: string
  token: string
  username: string
  branch?: string
}): Promise<BackupResult> {
  const fs = getFs(opts.repoDir)
  const branch = opts.branch || 'main'
  try {
    try {
      await git.addRemote({ fs, dir: opts.repoDir, remote: GITEE_REMOTE, url: opts.remoteUrl, force: true })
    } catch {
      /* 已存在则忽略 */
    }
    await git.push({
      fs,
      dir: opts.repoDir,
      http: tauriHttp,
      remote: GITEE_REMOTE,
      ref: branch,
      force: true,
      onAuth: () => ({ username: opts.username, password: opts.token }),
    })
    // Gitee 新建仓库默认分支是 master，而本地/推送分支是 main。
    // 若不改默认分支，网页默认展示 master（不存在/为空）→ 用户看到「仓库为空」。
    // push 成功后把 Gitee 仓库默认分支设为我们推送的分支，网页即可直接看到备份文件。
    const branchMsg = await setGiteeDefaultBranch(opts.remoteUrl, opts.token, branch)
    return { success: true, message: branchMsg }
  } catch (e) {
    return { success: false, message: errMsg(e) }
  }
}

/**
 * 通过 Gitee API 把仓库默认分支设为我们推送的分支（main）。
 * 失败不阻断（git push 已成功），仅返回提示，让用户在网页手动切换分支。
 */
async function setGiteeDefaultBranch(remoteUrl: string, token: string, branch: string): Promise<string | undefined> {
  try {
    const m = remoteUrl.replace(/\.git$/, '').match(/gitee\.com\/([^/]+)\/([^/]+)\/?$/i)
    if (!m) return undefined
    const owner = decodeURIComponent(m[1])
    const repo = decodeURIComponent(m[2])
    const url = `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    const res = await tauriFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `token ${token}` },
      body: JSON.stringify({ default_branch: branch }),
    })
    if (res.ok) {
      return `已同步到 Gitee（默认分支已设为 ${branch}）`
    }
    const err = await res.json().catch(() => ({}))
    console.warn('[Gitee] 设置默认分支失败', res.status, err)
    return `已推送到 Gitee 分支 ${branch}（设置默认分支失败：${err.message || res.status}，请在网页手动将默认分支切到 ${branch}）`
  } catch (e) {
    console.warn('[Gitee] 设置默认分支异常', e)
    return `已推送到 Gitee 分支 ${branch}（设置默认分支异常，请在网页手动将默认分支切到 ${branch}）`
  }
}

/** 从 Gitee 拉取最新版本（单分支，不带 tag） */
export async function pullRemote(opts: {
  repoDir: string
  remoteUrl: string
  token: string
  username: string
  branch?: string
}): Promise<BackupResult> {
  const fs = getFs(opts.repoDir)
  const branch = opts.branch || 'main'
  try {
    try {
      await git.addRemote({ fs, dir: opts.repoDir, remote: GITEE_REMOTE, url: opts.remoteUrl, force: true })
    } catch {
      /* ignore */
    }
    await git.fetch({
      fs,
      dir: opts.repoDir,
      http: tauriHttp,
      remote: GITEE_REMOTE,
      ref: branch,
      singleBranch: true,
      tags: false,
      onAuth: () => ({ username: opts.username, password: opts.token }),
    })
    return { success: true }
  } catch (e) {
    return { success: false, message: errMsg(e) }
  }
}

/** 把 noteId 清洗成合法文件名片段 */
export function sanitizeNoteIdForFile(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}
