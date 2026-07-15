/* 智能表格 · 数据模型与字段类型定义 */

export type FieldType =
  | 'text' // 文本
  | 'number' // 数字
  | 'date' // 日期
  | 'select' // 单选
  | 'multiSelect' // 多选
  | 'person' // 人员
  | 'checkbox' // 勾选
  | 'url' // 链接
  | 'rating' // 评分
  | 'progress' // 进度条

export interface SelectOption {
  id: string
  label: string
  color: string
}

export interface Column {
  id: string
  name: string
  type: FieldType
  options: SelectOption[] // 单选/多选/人员 的选项（人员也可自由录入）
  width?: number
}

export interface Row {
  id: string
  cells: Record<string, CellValue> // colId -> 值
}

export type CellValue = string | number | boolean | string[] | null | undefined

export interface FieldTypeDef {
  value: FieldType
  label: string
}

export const FIELD_TYPES: FieldTypeDef[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '单选' },
  { value: 'multiSelect', label: '多选' },
  { value: 'person', label: '人员' },
  { value: 'checkbox', label: '勾选' },
  { value: 'url', label: '链接' },
  { value: 'rating', label: '评分' },
  { value: 'progress', label: '进度' },
]

/** 单选/多选/人员 可选项配色 */
export const OPTION_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#64748B',
]

export function uid(prefix = 'c'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 9)
}

/** 根据列类型生成空值 */
export function emptyValueFor(type: FieldType): CellValue {
  switch (type) {
    case 'checkbox':
      return false
    case 'multiSelect':
    case 'person':
      return []
    case 'rating':
    case 'progress':
      return 0
    default:
      return ''
  }
}

/** 新建一列 */
export function makeColumn(name: string, type: FieldType = 'text'): Column {
  return { id: uid('col'), name, type, options: [] }
}

/** 新建一行（为给定列生成空值） */
export function makeRow(columns: Column[]): Row {
  const cells: Record<string, CellValue> = {}
  columns.forEach((c) => {
    cells[c.id] = emptyValueFor(c.type)
  })
  return { id: uid('row'), cells }
}

/** 默认列：演示多类型 */
export function defaultColumns(): Column[] {
  const statusOpts: SelectOption[] = [
    { id: uid('opt'), label: '进行中', color: OPTION_COLORS[0] },
    { id: uid('opt'), label: '已完成', color: OPTION_COLORS[1] },
  ]
  return [
    { id: uid('col'), name: '名称', type: 'text', options: [] },
    { id: uid('col'), name: '状态', type: 'select', options: statusOpts },
    { id: uid('col'), name: '日期', type: 'date', options: [] },
  ]
}

export function defaultRows(columns: Column[]): Row[] {
  return [makeRow(columns), makeRow(columns), makeRow(columns)]
}
