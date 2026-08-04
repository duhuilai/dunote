import type { Task } from '@/types'

/**
 * 判断任务是否超期（已超过预计完成日期且未完成）。
 * - 预计完成时间为空 → 不判超期
 * - 已完成任务 → 不判超期
 * - 用 `T00:00:00` 拼接避免被解析为 UTC 而产生一天时区偏移；与「今日零时」比较
 */
export function isOverdue(t: Task): boolean {
  if (!t.expectedEndTime || t.status === 'completed') return false
  const end = new Date(t.expectedEndTime + 'T00:00:00')
  if (Number.isNaN(end.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return end.getTime() < today.getTime()
}
