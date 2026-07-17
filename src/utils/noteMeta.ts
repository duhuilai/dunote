import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

const META_FILE = '.dunote-meta.json'

interface NoteMeta {
  version: number
  notes: Record<string, string>
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

/** 写入本地根目录下的笔记类型元数据 */
export async function saveNoteTypes(root: string, map: Record<string, string>): Promise<void> {
  try {
    const p = await metaPath(root)
    const payload: NoteMeta = { version: 1, notes: map }
    await writeTextFile(p, JSON.stringify(payload, null, 2))
  } catch (e) {
    console.error('[NoteMeta] 写入元数据失败:', e)
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
