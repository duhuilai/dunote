import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

/**
 * 笔记 / 文件夹的手动排序持久化。
 *
 * 存储位置：本地根目录下的 `.dunote-order.json`
 * 结构：{ version, folders: { 相对路径: 序号 }, notes: { 相对路径: 序号 } }
 *
 * 说明：磁盘上的文件本身没有顺序概念，scanDirectory 每次都会重新扫描，
 * 所以顺序必须落盘；未记录顺序的条目回落到名称字母序，排在已排序条目之后。
 */

const ORDER_FILE = '.dunote-order.json'

export interface OrderData {
  version: number
  folders: Record<string, number>
  notes: Record<string, number>
}

const EMPTY: OrderData = { version: 1, folders: {}, notes: {} }

function orderPath(root: string): Promise<string> {
  return join(root, ORDER_FILE)
}

/** 读取排序元数据；文件不存在或损坏时返回空表 */
export async function loadOrderData(root: string): Promise<OrderData> {
  try {
    const p = await orderPath(root)
    if (!(await exists(p))) return { ...EMPTY, folders: {}, notes: {} }
    const raw = await readTextFile(p)
    const parsed = JSON.parse(raw) as Partial<OrderData>
    return {
      version: parsed?.version ?? 1,
      folders: (parsed?.folders && typeof parsed.folders === 'object') ? parsed.folders : {},
      notes: (parsed?.notes && typeof parsed.notes === 'object') ? parsed.notes : {},
    }
  } catch (e) {
    console.warn('[NoteOrder] 读取排序元数据失败:', e)
    return { ...EMPTY, folders: {}, notes: {} }
  }
}

/** 覆盖写入排序元数据 */
export async function saveOrderData(root: string, data: OrderData): Promise<void> {
  try {
    const p = await orderPath(root)
    await writeTextFile(p, JSON.stringify({ ...data, version: 1 }, null, 2))
  } catch (e) {
    console.error('[NoteOrder] 写入排序元数据失败:', e)
  }
}

/** 合并更新某一类（folders / notes）的排序序号 */
export async function applyOrder(
  root: string,
  kind: 'folders' | 'notes',
  entries: Record<string, number>,
): Promise<void> {
  const data = await loadOrderData(root)
  data[kind] = { ...data[kind], ...entries }
  await saveOrderData(root, data)
}

/** 未排序条目排在最后 */
export const NO_ORDER = Number.MAX_SAFE_INTEGER

export function orderOf(map: Record<string, number>, relPath: string): number {
  const v = map[relPath]
  return typeof v === 'number' ? v : NO_ORDER
}

/** 通用比较器：先按 order，再按名称 */
export function compareByOrder<T>(
  getOrder: (item: T) => number,
  getName: (item: T) => string,
) {
  return (a: T, b: T) => {
    const oa = getOrder(a)
    const ob = getOrder(b)
    if (oa !== ob) return oa - ob
    return getName(a).localeCompare(getName(b), 'zh-CN')
  }
}

/**
 * 把 fromId 移动到 toId 的位置（数组重排），返回新的 id 序列。
 * from/to 任一不存在或相同时原样返回。
 */
export function reorderIds(ids: string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return ids
  const next = ids.slice()
  next.splice(from, 1)
  next.splice(to, 0, fromId)
  return next
}

/** 把 id 在序列中上移 / 下移一位 */
export function shiftId(ids: string[], id: string, delta: -1 | 1): string[] | null {
  const i = ids.indexOf(id)
  if (i < 0) return null
  const j = i + delta
  if (j < 0 || j >= ids.length) return null
  const next = ids.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
