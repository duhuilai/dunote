/* ─── 本地保存快照（版本记录） ───
 *
 * 背景：本地文件笔记在某些异常路径下（切换竞态、磁盘读取失败、误覆盖）可能丢失内容，
 * 而 git 备份只在用户主动提交时产生版本。这里在**每次落盘**时额外留一份本地快照，
 * 让用户在数据出错后能按修改记录找回任意一次保存的内容。
 *
 * 存储布局（appConfigDir/snapshots/）：
 *   <noteKey>/<ts>.html       快照正文
 *   <noteKey>/<ts>.meta.json  轻量元数据 { ts, title, bytes }
 * 列表只读取体积很小的 .meta.json，避免把含 base64 图片的正文全部读入内存。
 */

import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { appConfigDir, join } from '@tauri-apps/api/path'

export interface SnapshotMeta {
  /** 快照时间戳（ms），同时作为快照 id */
  ts: number
  title: string
  /** 正文字节数 */
  bytes: number
}

/** 每篇笔记保留的快照上限（超出后删除最旧的） */
export const MAX_SNAPSHOTS = 30
/** 节流窗口：同一篇笔记在该间隔内的连续保存不重复留档（force 可绕过） */
const MIN_INTERVAL_MS = 15_000

/** 节流状态：noteId -> { ts, len }（len 用于快速判断内容是否真的变了） */
const lastSnapshot = new Map<string, { ts: number; len: number }>()

/** noteId 可能含路径分隔符等非法字符，转成安全的目录名 */
function noteKeyOf(noteId: string): string {
  const safe = (noteId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  return safe.length > 120 ? safe.slice(0, 120) : safe
}

async function snapshotsRoot(): Promise<string> {
  const base = await appConfigDir()
  const dir = await join(base, 'snapshots')
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

async function noteDir(noteId: string, create: boolean): Promise<string> {
  const root = await snapshotsRoot()
  const dir = await join(root, noteKeyOf(noteId))
  if (create && !(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

/**
 * 保存一次快照。失败不影响主流程（落盘本身已成功），仅记录日志。
 * @param force 为 true 时跳过节流（切换笔记、关闭软件前的关键保存）
 */
export async function saveSnapshot(
  noteId: string,
  title: string,
  content: string,
  opts?: { force?: boolean },
): Promise<void> {
  try {
    if (!noteId || !content) return
    const now = Date.now()
    const prev = lastSnapshot.get(noteId)
    // 节流：内容长度都没变且间隔很短 → 视为同一次编辑，不重复留档
    if (!opts?.force && prev && now - prev.ts < MIN_INTERVAL_MS && prev.len === content.length) {
      return
    }
    const dir = await noteDir(noteId, true)
    const ts = now
    const base = await join(dir, String(ts))
    await writeTextFile(`${base}.html`, content)
    const meta: SnapshotMeta = { ts, title: title || '', bytes: content.length }
    await writeTextFile(`${base}.meta.json`, JSON.stringify(meta))
    lastSnapshot.set(noteId, { ts, len: content.length })
    await pruneSnapshots(noteId)
  } catch (e) {
    console.warn('[Snapshot] 保存快照失败:', e)
  }
}

/** 列出某篇笔记的快照元数据，按时间倒序（最新在前） */
export async function listSnapshots(noteId: string): Promise<SnapshotMeta[]> {
  try {
    const dir = await noteDir(noteId, false)
    if (!(await exists(dir))) return []
    const entries = await readDir(dir)
    const metas: SnapshotMeta[] = []
    for (const entry of entries) {
      const name = entry.name || ''
      if (!name.endsWith('.meta.json')) continue
      try {
        const raw = await readTextFile(await join(dir, name))
        const parsed = JSON.parse(raw) as SnapshotMeta
        if (typeof parsed?.ts === 'number') metas.push(parsed)
      } catch {
        /* 单个元数据损坏则跳过 */
      }
    }
    return metas.sort((a, b) => b.ts - a.ts)
  } catch (e) {
    console.warn('[Snapshot] 读取快照列表失败:', e)
    return []
  }
}

/** 读取某次快照的正文 */
export async function readSnapshot(noteId: string, ts: number): Promise<string> {
  const dir = await noteDir(noteId, false)
  return await readTextFile(await join(dir, `${ts}.html`))
}

/** 删除某次快照 */
export async function deleteSnapshot(noteId: string, ts: number): Promise<void> {
  try {
    const dir = await noteDir(noteId, false)
    const base = await join(dir, String(ts))
    if (await exists(`${base}.html`)) await remove(`${base}.html`)
    if (await exists(`${base}.meta.json`)) await remove(`${base}.meta.json`)
  } catch (e) {
    console.warn('[Snapshot] 删除快照失败:', e)
  }
}

/** 超出上限时删除最旧的快照 */
export async function pruneSnapshots(noteId: string, max: number = MAX_SNAPSHOTS): Promise<void> {
  try {
    const metas = await listSnapshots(noteId)
    if (metas.length <= max) return
    for (const m of metas.slice(max)) {
      await deleteSnapshot(noteId, m.ts)
    }
  } catch (e) {
    console.warn('[Snapshot] 清理旧快照失败:', e)
  }
}
