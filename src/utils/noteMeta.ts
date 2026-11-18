import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { normalizeTagList } from '@/utils/noteTags'

const META_FILE = '.dunote-meta.json'

interface NoteMeta {
  version: number
  notes: Record<string, string>
  /** v2+: 笔记自定义标题（相对路径 -> 标题），未设置时回退到文件名 */
  titles?: Record<string, string>
  pinned?: Record<string, boolean>
  /** v3+: 笔记标签（相对路径 -> 标签列表） */
  tags?: Record<string, string[]>
}

const metaQueues = new Map<string, Promise<void>>()

async function waitForMetaQueue(root: string): Promise<void> {
  const pending = metaQueues.get(root)
  if (pending) await pending
}

async function withMetaLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  await waitForMetaQueue(root)
  const previous = metaQueues.get(root) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.catch(() => undefined).then(() => current)
  metaQueues.set(root, tail)
  try {
    return await operation()
  } finally {
    release()
    if (metaQueues.get(root) === tail) metaQueues.delete(root)
  }
}

function metaPath(root: string): Promise<string> {
  return join(root, META_FILE)
}

/** 读取本地根目录下的笔记类型元数据（相对路径 -> noteType） */
export async function loadNoteTypes(root: string): Promise<Record<string, string>> {
  try {
    await waitForMetaQueue(root)
    const p = await metaPath(root)
    if (!(await exists(p))) return {}
    const raw = await readTextFile(p)
    const parsed = JSON.parse(raw) as NoteMeta
    if (parsed && typeof parsed.notes === 'object') {
      return parsed.notes
    }
    return {}
  } catch (e) {
    console.warn('[NoteMeta] 读取元数据失败:', e)
    return {}
  }
}

/** 读取本地根目录下的笔记自定义标题（相对路径 -> 标题） */
export async function loadNoteTitles(root: string): Promise<Record<string, string>> {
  try {
    await waitForMetaQueue(root)
    const p = await metaPath(root)
    if (!(await exists(p))) return {}
    const raw = await readTextFile(p)
    const parsed = JSON.parse(raw) as NoteMeta
    if (parsed && parsed.titles && typeof parsed.titles === 'object') {
      return parsed.titles
    }
    return {}
  } catch (e) {
    console.warn('[NoteMeta] 读取标题失败:', e)
    return {}
  }
}

/** 写入本地根目录下的笔记类型元数据 */
export async function loadNotePinned(root: string): Promise<Record<string, boolean>> {
  try {
    await waitForMetaQueue(root)
    const p = await metaPath(root)
    if (!(await exists(p))) return {}
    const raw = await readTextFile(p)
    const parsed = JSON.parse(raw) as NoteMeta
    if (parsed && parsed.pinned && typeof parsed.pinned === 'object') {
      return Object.fromEntries(
        Object.entries(parsed.pinned).filter(([, value]) => value === true),
      )
    }
    return {}
  } catch (e) {
    console.warn('[NoteMeta] load pinned state failed:', e)
    return {}
  }
}

/** 读取本地根目录下的笔记标签（相对路径 -> 标签列表） */
export async function loadNoteTags(root: string): Promise<Record<string, string[]>> {
  try {
    await waitForMetaQueue(root)
    const p = await metaPath(root)
    if (!(await exists(p))) return {}
    const raw = await readTextFile(p)
    const parsed = JSON.parse(raw) as NoteMeta
    if (!parsed || !parsed.tags || typeof parsed.tags !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed.tags)
        .map(([relPath, tags]) => [relPath, normalizeTagList(tags)] as const)
        .filter(([, tags]) => tags.length > 0),
    )
  } catch (e) {
    console.warn('[NoteMeta] load tags failed:', e)
    return {}
  }
}

export async function saveNoteTypes(root: string, map: Record<string, string>): Promise<void> {
  return withMetaLock(root, async () => {
    try {
      const p = await metaPath(root)
      // 保留 titles 字段，避免写类型时把标题清掉
      const existing = await readMetaSafe(p)
      const payload: NoteMeta = {
        version: 3,
        notes: map,
        titles: existing.titles,
        pinned: existing.pinned,
        tags: existing.tags,
      }
      await writeTextFile(p, JSON.stringify(payload, null, 2))
    } catch (e) {
      console.error('[NoteMeta] 写入元数据失败:', e)
      throw e instanceof Error ? e : new Error(String(e))
    }
  })
}

/**
 * 写入单条笔记的标题（v2+）。保留 notes 字段、合并其他标题。
 * 标题为空串时视为删除该条。
 */
export async function saveNoteTitle(root: string, relPath: string, title: string): Promise<void> {
  return withMetaLock(root, async () => {
    try {
      const p = await metaPath(root)
      const existing = await readMetaSafe(p)
      const titles: Record<string, string> = { ...(existing.titles || {}) }
      const trimmed = (title || '').trim()
      if (trimmed) {
        titles[relPath] = trimmed
      } else {
        delete titles[relPath]
      }
      const payload: NoteMeta = {
        version: 3,
        notes: existing.notes || {},
        titles,
        pinned: existing.pinned,
        tags: existing.tags,
      }
      await writeTextFile(p, JSON.stringify(payload, null, 2))
    } catch (e) {
      console.error('[NoteMeta] 写入标题失败:', e)
      throw e instanceof Error ? e : new Error(String(e))
    }
  })
}

/** 安全读取整个 meta 文件（不抛错），用于跨字段合并写入 */
async function readMetaSafe(p: string): Promise<NoteMeta> {
  try {
    if (!(await exists(p))) return { version: 3, notes: {} }
    const raw = await readTextFile(p)
    const parsed = JSON.parse(raw) as NoteMeta
    if (!parsed || typeof parsed !== 'object') return { version: 3, notes: {} }
    // 兼容 v1：notes 是 { relPath: noteType }，读取时迁移为当前结构
    if (parsed.version === 1) {
      return {
        version: 3,
        notes: (typeof parsed.notes === 'object' && parsed.notes) || {},
        titles: {},
      }
    }
    return {
      version: 3,
      notes: (typeof parsed.notes === 'object' && parsed.notes) || {},
      titles: (typeof parsed.titles === 'object' && parsed.titles) || {},
      pinned: (typeof parsed.pinned === 'object' && parsed.pinned) || {},
      tags: (typeof parsed.tags === 'object' && parsed.tags) || {},
    }
  } catch {
    return { version: 3, notes: {} }
  }
}

/** 更新单个笔记的类型 */
export async function saveNoteType(root: string, relPath: string, noteType: string): Promise<void> {
  return withMetaLock(root, async () => {
    const p = await metaPath(root)
    const existing = await readMetaSafe(p)
    const payload: NoteMeta = {
      version: 3,
      notes: { ...(existing.notes || {}), [relPath]: noteType },
      titles: existing.titles,
      pinned: existing.pinned,
      tags: existing.tags,
    }
    await writeTextFile(p, JSON.stringify(payload, null, 2))
  })
}

/** 根据根目录和绝对路径计算相对路径（用作元数据键） */
export async function saveNotePinned(root: string, relPath: string, pinned: boolean): Promise<void> {
  return withMetaLock(root, async () => {
    const p = await metaPath(root)
    const existing = await readMetaSafe(p)
    const pinnedMap: Record<string, boolean> = { ...(existing.pinned || {}) }
    if (pinned) {
      pinnedMap[relPath] = true
    } else {
      delete pinnedMap[relPath]
    }
    const payload: NoteMeta = {
      version: 3,
      notes: existing.notes || {},
      titles: existing.titles || {},
      pinned: pinnedMap,
      tags: existing.tags || {},
    }
    await writeTextFile(p, JSON.stringify(payload, null, 2))
  })
}

/** 更新单个本地笔记的标签，空列表会从元数据中删除。 */
export async function saveNoteTags(root: string, relPath: string, tags: string[]): Promise<void> {
  return withMetaLock(root, async () => {
    const p = await metaPath(root)
    const existing = await readMetaSafe(p)
    const tagMap: Record<string, string[]> = { ...(existing.tags || {}) }
    const normalized = normalizeTagList(tags)
    if (normalized.length > 0) {
      tagMap[relPath] = normalized
    } else {
      delete tagMap[relPath]
    }
    const payload: NoteMeta = {
      version: 3,
      notes: existing.notes || {},
      titles: existing.titles || {},
      pinned: existing.pinned || {},
      tags: tagMap,
    }
    await writeTextFile(p, JSON.stringify(payload, null, 2))
  })
}

export function toRelPath(root: string, filePath: string): string {
  // 统一使用 '/' 作为分隔符，并去掉前导 '/'
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (!normalizedPath.startsWith(normalizedRoot + '/')) return normalizedPath
  return normalizedPath.slice(normalizedRoot.length + 1)
}
