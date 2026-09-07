import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

const META_FILE = '.dunote-meta.json'

interface NoteMeta {
  version: number
  notes: Record<string, string>
  /** v2+: 笔记自定义标题（相对路径 -> 标题），未设置时回退到文件名 */
  titles?: Record<string, string>
}

function metaPath(root: string): Promise<string> {
  return join(root, META_FILE)
}

/** 读取本地根目录下的笔记类型元数据（相对路径 -> noteType） */
export async function loadNoteTypes(root: string): Promise<Record<string, string>> {
  try {
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
export async function saveNoteTypes(root: string, map: Record<string, string>): Promise<void> {
  try {
    const p = await metaPath(root)
    // 保留 titles 字段，避免写类型时把标题清掉
    const existing = await readMetaSafe(p)
    const payload: NoteMeta = {
      version: 2,
      notes: map,
      titles: existing.titles,
    }
    await writeTextFile(p, JSON.stringify(payload, null, 2))
  } catch (e) {
    console.error('[NoteMeta] 写入元数据失败:', e)
  }
}

/**
 * 写入单条笔记的标题（v2+）。保留 notes 字段、合并其他标题。
 * 标题为空串时视为删除该条。
 */
export async function saveNoteTitle(root: string, relPath: string, title: string): Promise<void> {
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
      version: 2,
      notes: existing.notes || {},
      titles,
    }
    await writeTextFile(p, JSON.stringify(payload, null, 2))
  } catch (e) {
    console.error('[NoteMeta] 写入标题失败:', e)
  }
}

/** 安全读取整个 meta 文件（不抛错），用于跨字段合并写入 */
async function readMetaSafe(p: string): Promise<NoteMeta> {
  try {
    if (!(await exists(p))) return { version: 2, notes: {} }
    const raw = await readTextFile(p)
    const parsed = JSON.parse(raw) as NoteMeta
    if (!parsed || typeof parsed !== 'object') return { version: 2, notes: {} }
    // 兼容 v1：notes 是 { relPath: noteType }，转为 v2
    if (parsed.version === 1) {
      return {
        version: 2,
        notes: (typeof parsed.notes === 'object' && parsed.notes) || {},
        titles: {},
      }
    }
    return {
      version: 2,
      notes: (typeof parsed.notes === 'object' && parsed.notes) || {},
      titles: (typeof parsed.titles === 'object' && parsed.titles) || {},
    }
  } catch {
    return { version: 2, notes: {} }
  }
}

/** 更新单个笔记的类型 */
export async function saveNoteType(root: string, relPath: string, noteType: string): Promise<void> {
  const map = await loadNoteTypes(root)
  map[relPath] = noteType
  await saveNoteTypes(root, map)
}

/** 根据根目录和绝对路径计算相对路径（用作元数据键） */
export function toRelPath(root: string, filePath: string): string {
  // 统一使用 '/' 作为分隔符，并去掉前导 '/'
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (!normalizedPath.startsWith(normalizedRoot + '/')) return normalizedPath
  return normalizedPath.slice(normalizedRoot.length + 1)
}
