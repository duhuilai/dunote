import { appConfigDir, join } from '@tauri-apps/api/path'
import {
  exists,
  mkdir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import type { Note, NoteFolder } from '@/types'
import { normalizeTagList } from '@/utils/noteTags'

const NOTES_FILE = 'notes.json'
const NOTES_BACKUP_FILE = 'notes.json.bak'
const NOTES_TEMP_FILE = 'notes.json.tmp'
const BROWSER_STORAGE_KEY = 'dunote.notes.v1'
const BROWSER_BACKUP_KEY = 'dunote.notes.v1.bak'

export interface NotesPayload {
  notes: Note[]
  folders: NoteFolder[]
}

interface PersistedNotes extends NotesPayload {
  version: 1
  savedAt: string
}

export interface LoadedNotes extends NotesPayload {
  recoveredFromBackup: boolean
}

/**
 * Tauri 2 exposes __TAURI_INTERNALS__ in both development and release webviews.
 * Checking it here keeps `npm run dev` usable in a normal browser via localStorage.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const candidate = window as unknown as { __TAURI_INTERNALS__?: unknown }
  return Boolean(candidate.__TAURI_INTERNALS__)
}

function normalizePayload(value: unknown): NotesPayload | null {
  if (!value || typeof value !== 'object') return null

  // Older builds may have stored the bare note array. Accept it so an upgrade
  // does not strand existing data.
  if (Array.isArray(value)) {
    return { notes: value as Note[], folders: [] }
  }

  const payload = value as Partial<PersistedNotes>
  if (!Array.isArray(payload.notes) || !Array.isArray(payload.folders)) return null

  return {
    notes: payload.notes
      .filter((note): note is Note => {
        return Boolean(note && typeof note === 'object' && typeof note.id === 'string')
      })
      .map((note) => ({
        ...note,
        tags: normalizeTagList(note.tags),
      })),
    folders: payload.folders.filter((folder): folder is NoteFolder => {
      return Boolean(folder && typeof folder === 'object' && typeof folder.id === 'string')
    }),
  }
}

function parsePayload(raw: string): NotesPayload {
  const payload = normalizePayload(JSON.parse(raw))
  if (!payload) throw new Error('笔记数据格式无效')
  return payload
}

function browserLoad(): LoadedNotes {
  const candidates = [BROWSER_STORAGE_KEY, BROWSER_BACKUP_KEY]
  let lastError: unknown = null

  for (let index = 0; index < candidates.length; index++) {
    const raw = window.localStorage.getItem(candidates[index])
    if (!raw) continue
    try {
      return {
        ...parsePayload(raw),
        recoveredFromBackup: index === 1,
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) throw lastError
  return { notes: [], folders: [], recoveredFromBackup: false }
}

function browserSave(payload: NotesPayload): void {
  const previous = window.localStorage.getItem(BROWSER_STORAGE_KEY)
  if (previous) window.localStorage.setItem(BROWSER_BACKUP_KEY, previous)
  const persisted: PersistedNotes = {
    version: 1,
    savedAt: new Date().toISOString(),
    ...payload,
  }
  window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(persisted))
}

async function readTauriFile(path: string): Promise<NotesPayload | null> {
  if (!(await exists(path))) return null
  return parsePayload(await readTextFile(path))
}

async function tauriLoad(): Promise<LoadedNotes> {
  const dir = await appConfigDir()
  const mainPath = await join(dir, NOTES_FILE)
  const backupPath = await join(dir, NOTES_BACKUP_FILE)

  let mainError: unknown = null
  try {
    const data = await readTauriFile(mainPath)
    if (data) return { ...data, recoveredFromBackup: false }
  } catch (error) {
    mainError = error
  }

  try {
    const backup = await readTauriFile(backupPath)
    if (backup) return { ...backup, recoveredFromBackup: true }
  } catch (backupError) {
    if (!mainError) throw backupError
  }

  if (mainError) throw mainError
  return { notes: [], folders: [], recoveredFromBackup: false }
}

async function tauriSave(payload: NotesPayload): Promise<void> {
  const dir = await appConfigDir()
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }

  const mainPath = await join(dir, NOTES_FILE)
  const backupPath = await join(dir, NOTES_BACKUP_FILE)
  const tempPath = await join(dir, NOTES_TEMP_FILE)
  const persisted: PersistedNotes = {
    version: 1,
    savedAt: new Date().toISOString(),
    ...payload,
  }
  const serialized = JSON.stringify(persisted, null, 2)

  try {
    if (await exists(mainPath)) {
      const previous = await readTextFile(mainPath)
      if (previous.trim()) await writeTextFile(backupPath, previous)
    }
  } catch (error) {
    // A failed backup must not block the primary note save.
    console.warn('[NotesStorage] 写入备份失败:', error)
  }

  await writeTextFile(tempPath, serialized)
  try {
    if (await exists(mainPath)) await remove(mainPath)
    await rename(tempPath, mainPath)
  } catch (error) {
    // Some Windows filesystems reject replacing an existing file via rename.
    // The backup was already written, so the direct-write fallback is safe.
    console.warn('[NotesStorage] 原子替换失败，回退直接写入:', error)
    await writeTextFile(mainPath, serialized)
    try {
      if (await exists(tempPath)) await remove(tempPath)
    } catch {
      /* temp cleanup is best effort */
    }
  }
}

function withoutLocalFiles(notes: Note[]): Note[] {
  return notes.filter((note) => !note._isLocalFile)
}

export async function loadNotesData(): Promise<LoadedNotes> {
  if (!isTauriRuntime()) return browserLoad()
  return tauriLoad()
}

export async function saveNotesData(data: NotesPayload): Promise<void> {
  const payload: NotesPayload = {
    notes: withoutLocalFiles(data.notes),
    folders: data.folders,
  }
  if (!isTauriRuntime()) {
    browserSave(payload)
    return
  }
  await tauriSave(payload)
}
