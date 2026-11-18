import { exists, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import type { Note, NoteFolder } from '@/types'
import { loadNotePinned, loadNoteTags, loadNoteTitles, loadNoteTypes, toRelPath } from '@/utils/noteMeta'
import { compareByOrder, loadOrderData, orderOf } from '@/utils/noteOrder'
import { buildFolderTree } from '@/utils/noteTree'

export interface ScannedLocalTree {
  rootFolder: NoteFolder
  folders: NoteFolder[]
  notes: Note[]
}

export function basenameLocalPath(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || normalized
}

export function mergeScannedNotes(next: Note[], previous: Note[]): Note[] {
  const previousById = new Map(previous.map((note) => [note.id, note]))
  return next.map((note) => {
    const old = previousById.get(note.id)
    if (!old) return note
    return {
      ...note,
      content: old.content || note.content,
      updatedAt: old.content ? old.updatedAt : note.updatedAt,
    }
  })
}

/**
 * Scan a note folder once and return both the flat folder records and the
 * normalized root tree. All path composition goes through Tauri's join().
 */
export async function scanLocalTree(root: string): Promise<ScannedLocalTree> {
  const [noteTypeMap, titleMap, pinnedMap, tagMap, orderData] = await Promise.all([
    loadNoteTypes(root),
    loadNoteTitles(root),
    loadNotePinned(root),
    loadNoteTags(root),
    loadOrderData(root),
  ])
  const folders: NoteFolder[] = []
  const notes: Note[] = []

  const scan = async (currentPath: string, parentId: string) => {
    const entries = await readDir(currentPath)
    const dirs = entries
      .filter((entry) => entry.isDirectory && !entry.name.startsWith('.'))
      .sort(compareByOrder(
        (entry) => orderOf(orderData.folders, toRelPath(root, `${currentPath}/${entry.name}`)),
        (entry) => entry.name,
      ))
    const files = entries
      .filter((entry) => entry.isFile && entry.name.toLowerCase().endsWith('.html'))
      .sort(compareByOrder(
        (entry) => orderOf(orderData.notes, toRelPath(root, `${currentPath}/${entry.name}`)),
        (entry) => entry.name,
      ))

    let noteOrder = 0
    for (const entry of files) {
      const fullPath = await join(currentPath, entry.name)
      const relPath = toRelPath(root, fullPath)
      const customTitle = titleMap[relPath]?.trim()
      const now = new Date().toISOString()
      notes.push({
        id: `local-${fullPath}`,
        title: customTitle || entry.name.replace(/\.html$/i, ''),
        content: '',
        filePath: fullPath,
        createdAt: now,
        updatedAt: now,
        noteType: noteTypeMap[relPath] || 'normal',
        pinned: pinnedMap[relPath] === true,
        folderId: parentId,
        tags: tagMap[relPath] || [],
        order: noteOrder++,
        _isLocalFile: true,
      })
    }

    let folderOrder = 0
    for (const entry of dirs) {
      const subPath = await join(currentPath, entry.name)
      const folderId = `local-folder-${subPath}`
      folders.push({
        id: folderId,
        name: entry.name,
        parentId,
        path: subPath,
        expanded: false,
        order: folderOrder++,
      })
      await scan(subPath, folderId)
    }
  }

  await scan(root, 'local-root')
  return {
    folders,
    notes,
    rootFolder: {
      id: 'local-root',
      name: basenameLocalPath(root),
      parentId: null,
      path: root,
      expanded: true,
      children: buildFolderTree(folders),
    },
  }
}

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function sanitizeFileStem(value: string, fallback = '未命名笔记'): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120)
  if (!cleaned || RESERVED_WINDOWS_NAMES.test(cleaned)) return fallback
  return cleaned
}

export async function uniqueHtmlPath(directory: string, title: string): Promise<string> {
  const stem = sanitizeFileStem(title)
  for (let index = 1; index <= 9999; index += 1) {
    const candidate = await join(directory, `${stem}${index === 1 ? '' : ` (${index})`}.html`)
    if (!(await exists(candidate))) return candidate
  }
  throw new Error('同名笔记过多，无法创建新文件')
}

export async function readLocalNoteContent(filePath: string): Promise<string> {
  return readTextFile(filePath)
}

export async function writeLocalNoteContent(filePath: string, content: string): Promise<void> {
  await writeTextFile(filePath, content)
}
