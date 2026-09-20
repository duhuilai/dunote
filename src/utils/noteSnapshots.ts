/* ─── 本地实时保存版本（快照） ───
 *
 * 背景：本地文件笔记在某些异常路径下（切换竞态、磁盘读取失败、误覆盖）可能丢失内容，
 * 而 git 备份只在用户主动「生成历史」时产生版本。这里在**每次自动保存成功后**额外留一份
 * 本地版本，让用户在数据出错后能按修改记录找回任意一次保存的内容。
 *
 * 存储布局（appConfigDir/snapshots/）：
 *   <noteKey>/<ts>.html       版本正文
 *   <noteKey>/<ts>.meta.json  轻量元数据 { ts, title, bytes, hash }
 * 列表只读取体积很小的 .meta.json，避免把含 base64 图片的大正文全部读入内存。
 *
 * 保留策略（每次启动应用时统一清理，见 pruneAllSnapshotsOnStartup）：
 *   1. 最近 MIN_KEEP 版无条件保留（保证清理后仍有可找回的版本）
 *   2. 超过 RETENTION_DAYS 天的过期版本删除
 *   3. 硬上限 MAX_SNAPSHOTS 条，超出删除最旧的
 */

import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { appConfigDir, join } from '@tauri-apps/api/path'

export interface SnapshotMeta {
  /** 版本时间戳（ms），同时作为版本 id */
  ts: number
  title: string
  /** 正文字节数 */
  bytes: number
  /** 内容指纹，用于「与上一次留档完全相同则不再重复生成版本」 */
  hash: string
}

/** 每篇笔记的版本硬上限（防止磁盘无上限增长） */
export const MAX_SNAPSHOTS = 200
/** 保留天数：更旧的版本在启动清理时删除 */
export const RETENTION_DAYS = 7
/** 清理后**至少**保留的最近版本数（即使已全部过期） */
export const MIN_KEEP = 5
/**
 * 单篇笔记的版本总容量预算（字节，默认 150MB）。
 * 正文含 base64 图片时单份可达数 MB，若只按条数限制，200 份就可能占用 GB 级磁盘，
 * 因此再按总容量兜底：超出后从最旧的版本开始删，直到回到预算内（仍至少保留 MIN_KEEP 版）。
 */
export const MAX_TOTAL_BYTES_PER_NOTE = 150 * 1024 * 1024

const DAY_MS = 24 * 60 * 60 * 1000
/** 条数超过「上限 + 缓冲」时才执行一次清理，避免每次保存都全量扫描目录 */
const PRUNE_BUFFER = 20

/**
 * 内存缓存：noteId -> 最新一版的时间戳与内容指纹。
 * 用于在不读取磁盘的情况下完成「与上一版内容相同则不重复留档」的判断，
 * 把每次自动保存的文件读取次数从「遍历全部版本」降到常数级。
 */
/** 版本总字节数缓存：noteId -> 字节数（避免每次保存都遍历统计） */
const sizeCache = new Map<string, number>()

const latestCache = new Map<string, { ts: number; hash: string }>()

/** noteId 可能含路径分隔符等非法字符，转成安全的目录名 */
function noteKeyOf(noteId: string): string {
  const safe = (noteId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  return safe.length > 120 ? safe.slice(0, 120) : safe
}

/**
 * 内容指纹：长度 + 首尾各 4KB 的 djb2 哈希。
 * 全文哈希在含 base64 图片的大正文上代价过高，采样即可满足去重用途。
 */
function hashContent(content: string): string {
  const head = content.slice(0, 4096)
  const tail = content.length > 4096 ? content.slice(-4096) : ''
  let h = 5381
  const s = head + '|' + tail
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return `${content.length}:${h}`
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
 * 保存一个版本（每次自动保存成功后调用）。
 * 与上一次留档内容完全相同时自动跳过，避免空转刷出大量重复版本。
 * 失败不影响主流程（文件本身已写入成功），仅记录日志。
 *
 * 性能：命中内存缓存时几乎零 I/O；未命中也只读取「最新一个」元数据，
 * 且仅在条数超过上限时才做一次清理，不再每次保存都遍历全部版本目录。
 */
export async function saveSnapshot(noteId: string, title: string, content: string): Promise<void> {
  try {
    if (!noteId || !content) return
    const hash = hashContent(content)

    // 去重：优先用内存缓存，避免任何磁盘读取
    let newest = latestCache.get(noteId)
    if (!newest) {
      const meta = await newestMeta(await noteDir(noteId, true))
      if (meta) {
        newest = { ts: meta.ts, hash: meta.hash }
        latestCache.set(noteId, newest)
      }
    }
    if (newest && newest.hash === hash) return

    const dir = await noteDir(noteId, true)
    const ts = Date.now()
    const base = await join(dir, String(ts))
    await writeTextFile(`${base}.html`, content)
    const meta: SnapshotMeta = { ts, title: title || '', bytes: content.length, hash }
    await writeTextFile(`${base}.meta.json`, JSON.stringify(meta))
    latestCache.set(noteId, { ts, hash })

    // 容量预算：超出后从最旧的版本开始删，避免含 base64 图片的大笔记占满磁盘
    const bytes = content.length
    let total = sizeCache.get(noteId)
    if (total == null) {
      const metas = await listSnapshotsIn(dir)
      total = metas.reduce((s, m) => s + (m.bytes || 0), 0)
    }
    total += bytes
    sizeCache.set(noteId, total)

    // 仅在「条数明显超限」或「总容量超预算」时才清理
    // （readDir 很轻，但 pruneDir 会读取全部元数据，故需限频）
    if (total > MAX_TOTAL_BYTES_PER_NOTE) {
      sizeCache.set(noteId, await pruneDir(dir))
    } else {
      const count = await countIn(dir)
      if (count > MAX_SNAPSHOTS + PRUNE_BUFFER) {
        sizeCache.set(noteId, await pruneDir(dir))
      }
    }
  } catch (e) {
    console.warn('[Snapshot] 保存版本失败:', e)
  }
}

/** 列出某篇笔记的版本元数据，按时间倒序（最新在前） */
export async function listSnapshots(noteId: string): Promise<SnapshotMeta[]> {
  const dir = await noteDir(noteId, false)
  return await listSnapshotsIn(dir)
}

/** 读取某个版本的正文 */
export async function readSnapshot(noteId: string, ts: number): Promise<string> {
  const dir = await noteDir(noteId, false)
  return await readTextFile(await join(dir, `${ts}.html`))
}

/** 删除某个版本 */
export async function deleteSnapshot(noteId: string, ts: number): Promise<void> {
  const dir = await noteDir(noteId, false)
  await deleteIn(dir, ts)
  // 删掉的若是缓存中的「最新一版」，让缓存失效，下次保存重新探测
  const cached = latestCache.get(noteId)
  if (cached && cached.ts === ts) latestCache.delete(noteId)
  // 容量缓存失效（下次保存时重新统计）
  sizeCache.delete(noteId)
}

/**
 * 读取「最新一个」版本的元数据。
 * 只做一次 readDir 并按文件名（时间戳）取最大值，再读那一个元数据文件——
 * 不遍历读取全部元数据，代价与版本数量无关。
 */
async function newestMeta(dir: string): Promise<SnapshotMeta | null> {
  try {
    if (!(await exists(dir))) return null
    const entries = await readDir(dir)
    let maxTs = 0
    for (const entry of entries) {
      const name = entry.name || ''
      if (!name.endsWith('.meta.json')) continue
      const ts = Number(name.slice(0, -'.meta.json'.length))
      if (Number.isFinite(ts) && ts > maxTs) maxTs = ts
    }
    if (!maxTs) return null
    const raw = await readTextFile(await join(dir, `${maxTs}.meta.json`))
    const parsed = JSON.parse(raw) as SnapshotMeta
    return typeof parsed?.ts === 'number' ? parsed : null
  } catch {
    return null
  }
}

/** 统计版本条数（仅 readDir，不读取文件内容） */
async function countIn(dir: string): Promise<number> {
  try {
    if (!(await exists(dir))) return 0
    const entries = await readDir(dir)
    let n = 0
    for (const entry of entries) {
      if ((entry.name || '').endsWith('.meta.json')) n++
    }
    return n
  } catch {
    return 0
  }
}

/** 读取目录下的版本元数据（倒序） */
async function listSnapshotsIn(dir: string): Promise<SnapshotMeta[]> {
  try {
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
    console.warn('[Snapshot] 读取版本列表失败:', e)
    return []
  }
}

/** 删除目录下的某个版本（按时间戳） */
async function deleteIn(dir: string, ts: number): Promise<void> {
  try {
    const base = await join(dir, String(ts))
    if (await exists(`${base}.html`)) await remove(`${base}.html`)
    if (await exists(`${base}.meta.json`)) await remove(`${base}.meta.json`)
  } catch (e) {
    console.warn('[Snapshot] 删除版本失败:', e)
  }
}

/**
 * 对单个版本目录执行保留策略，返回清理后剩余版本的**总字节数**：
 * - 最近 MIN_KEEP 版无条件保留
 * - 超过 RETENTION_DAYS 天的删除
 * - 超过 MAX_SNAPSHOTS 条的删除最旧的
 * - 总容量超过 MAX_TOTAL_BYTES_PER_NOTE 的，从最旧开始删到预算内
 */
async function pruneDir(dir: string): Promise<number> {
  const metas = await listSnapshotsIn(dir)
  if (metas.length === 0) return 0
  const cutoff = Date.now() - RETENTION_DAYS * DAY_MS

  // 1) 条数上限 + 过期清理
  const kept: SnapshotMeta[] = []
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i]
    if (i < MIN_KEEP) {
      kept.push(m)
      continue
    }
    if (i >= MAX_SNAPSHOTS || m.ts < cutoff) {
      await deleteIn(dir, m.ts)
    } else {
      kept.push(m)
    }
  }

  // 2) 总容量预算：从最旧的一版开始删，直到回到预算内（至少保留 MIN_KEEP 版）
  let total = kept.reduce((s, m) => s + (m.bytes || 0), 0)
  for (let i = kept.length - 1; i >= MIN_KEEP && total > MAX_TOTAL_BYTES_PER_NOTE; i--) {
    const m = kept[i]
    await deleteIn(dir, m.ts)
    total -= m.bytes || 0
  }
  return total
}

/** 清理某篇笔记的过期版本 */
export async function pruneSnapshots(noteId: string): Promise<number> {
  try {
    return await pruneDir(await noteDir(noteId, false))
  } catch (e) {
    console.warn('[Snapshot] 清理版本失败:', e)
    return 0
  }
}

/**
 * 应用启动时统一清理所有笔记的过期版本。
 * 只删除「超过保留天数」或「超出条数上限」的版本，且始终至少保留最近 MIN_KEEP 版。
 */
export async function pruneAllSnapshotsOnStartup(): Promise<void> {
  try {
    const root = await snapshotsRoot()
    const entries = await readDir(root)
    let removed = 0
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const dir = await join(root, entry.name || '')
      removed += await pruneDir(dir)
    }
    if (removed > 0) {
      console.log(`[Snapshot] 启动清理：已删除 ${removed} 个过期版本`)
    }
  } catch (e) {
    console.warn('[Snapshot] 启动清理失败:', e)
  }
}
