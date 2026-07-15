import { appConfigDir, join } from '@tauri-apps/api/path'
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import type { Person, Task } from '@/types'

/**
 * 统一文件持久化层。
 * 数据以 JSON 形式存放在 Tauri 的 AppConfig 目录（用户 AppData 下，软件更新不会被清除），
 * 实现人员、任务等数据的持久化，避免“软件更新/重启后数据丢失”。
 * 沿用 settingsStorage 的既有模式。
 */

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const dir = await appConfigDir()
    const p = await join(dir, file)
    if (!(await exists(p))) return fallback
    const c = await readTextFile(p)
    if (!c || !c.trim()) return fallback
    return JSON.parse(c) as T
  } catch (e) {
    console.warn(`[Storage] 读取 ${file} 失败，使用默认值:`, e)
    return fallback
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  try {
    const dir = await appConfigDir()
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true })
    }
    const p = await join(dir, file)
    await writeTextFile(p, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error(`[Storage] 写入 ${file} 失败:`, e)
  }
}

/* ─── 人员 ─── */
export const loadPersonnel = () => readJson<Person[]>('personnel.json', [])
export const savePersonnel = (list: Person[]) => writeJson('personnel.json', list)

/* ─── 任务 ─── */
export const loadTasks = () => readJson<Task[]>('tasks.json', [])
export const saveTasks = (list: Task[]) => writeJson('tasks.json', list)
