import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

export type ColType = 'text' | 'person' | 'date' | 'select' | 'number'

export const COL_TYPES: { value: ColType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'person', label: '人员' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '单选' },
  { value: 'number', label: '数字' },
]

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableSmart: {
      /** 设置某列的字段类型 */
      setTableColType: (opts: { col: number; type: ColType }) => ReturnType
      /** 按某列排序 */
      sortTableByColumn: (opts: { col: number; dir: 'asc' | 'desc' }) => ReturnType
      /** 按某列筛选（包含匹配，空值清除该列筛选） */
      filterTableByColumn: (opts: { col: number; value: string }) => ReturnType
      /** 清除所有筛选（显示全部行） */
      clearTableFilter: () => ReturnType
    }
  }
}

/* ───────────── 工具函数 ───────────── */

function findTable(state: EditorState): { node: PMNode; pos: number } | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'table') {
      return { node, pos: $from.before(d) }
    }
  }
  return null
}

/** 返回当前光标所在单元格对应的列索引（忽略合并单元格，假设无 colspan） */
function getActiveColumnIndex(state: EditorState): number | null {
  const { $from } = state.selection
  let cellDepth = -1
  let cellPos = -1
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cellDepth = d
      cellPos = $from.before(d)
      break
    }
  }
  if (cellDepth < 0) return null
  const row = $from.node(cellDepth - 1)
  if (!row || row.type.name !== 'tableRow') return null

  const rowPos = $from.before(cellDepth - 1)
  let col = 0
  let found = false
  row.forEach((child, offset) => {
    if (found) return false
    const childStart = rowPos + 1 + offset
    if (childStart <= cellPos && cellPos < childStart + child.nodeSize) {
      found = true
      return false
    }
    col += child.attrs.colspan || 1
  })
  return found ? col : null
}

function safeCell(row: PMNode, col: number): PMNode | null {
  if (col < 0 || col >= row.childCount) return null
  return row.child(col)
}

/** 取单元格纯文本 */
function cellText(cell: PMNode | null): string {
  if (!cell) return ''
  return cell.textContent || ''
}

function compareValues(a: string, b: string, type: ColType): number {
  const emptyA = a.trim() === ''
  const emptyB = b.trim() === ''
  if (emptyA && emptyB) return 0
  if (emptyA) return 1 // 空值排末尾
  if (emptyB) return -1
  if (type === 'number') {
    return (parseFloat(a) || 0) - (parseFloat(b) || 0)
  }
  if (type === 'date') {
    const da = Date.parse(a)
    const db = Date.parse(b)
    if (!isNaN(da) && !isNaN(db)) return da - db
  }
  return a.localeCompare(b, 'zh-Hans-CN')
}

/* ───────────── 扩展 Table ───────────── */

export const SmartTable = Table.extend({
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      colTypes: {
        default: [] as ColType[],
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-col-types')
          return v ? (v.split(',') as ColType[]) : []
        },
        renderHTML: (attrs: { colTypes?: ColType[] }) => {
          const arr = attrs.colTypes || []
          return arr.length ? { 'data-col-types': arr.join(',') } : {}
        },
      },
    }
  },

  addCommands() {
    return {
      setTableColType:
        ({ col, type }) =>
        ({ state, dispatch }) => {
          const t = findTable(state)
          if (!t) return false
          try {
            const colTypes = [...((t.node.attrs.colTypes as ColType[]) || [])]
            colTypes[col] = type
            if (dispatch) {
              const tr = state.tr.setNodeMarkup(t.pos, undefined, {
                ...t.node.attrs,
                colTypes,
              })
              dispatch(tr)
            }
            return true
          } catch (e) {
            console.warn('[tableSmart] setTableColType failed', e)
            return false
          }
        },

      sortTableByColumn:
        ({ col, dir }) =>
        ({ state, dispatch }) => {
          const t = findTable(state)
          if (!t) return false
          try {
            const rows: PMNode[] = []
            t.node.forEach((r) => rows.push(r))
            if (rows.length < 2) return false
            const header = rows[0]
            const body = rows.slice(1)
            if (col < 0 || col >= (header.childCount || 0)) return false
            const colTypes = (t.node.attrs.colTypes as ColType[]) || []
            const type = colTypes[col] || 'text'
            const sorted = body
              .map((r) => ({ r, k: cellText(safeCell(r, col)) }))
              .sort((a, b) => compareValues(a.k, b.k, type) * (dir === 'desc' ? -1 : 1))
              .map((x) => x.r)
            const newTable = t.node.type.create(
              t.node.attrs,
              Fragment.from([header, ...sorted]),
            )
            if (dispatch) {
              const tr = state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, newTable)
              dispatch(tr)
            }
            return true
          } catch (e) {
            console.warn('[tableSmart] sortTableByColumn failed', e)
            return false
          }
        },

      filterTableByColumn:
        ({ col, value }) =>
        ({ state, dispatch }) => {
          const t = findTable(state)
          if (!t) return false
          try {
            const colTypes = (t.node.attrs.colTypes as ColType[]) || []
            const v = (value || '').trim().toLowerCase()
            const tr = state.tr
            let p = t.pos + 1
            let rowIdx = 0
            t.node.forEach((row) => {
              rowIdx++
              if (rowIdx > 1) {
                const txt = cellText(safeCell(row, col)).toLowerCase()
                const hidden = v !== '' && !txt.includes(v)
                if (!!row.attrs.hidden !== hidden) {
                  tr.setNodeMarkup(p, undefined, { ...row.attrs, hidden })
                }
              }
              p += row.nodeSize
            })
            if (dispatch && tr.docChanged) dispatch(tr)
            return true
          } catch (e) {
            console.warn('[tableSmart] filterTableByColumn failed', e)
            return false
          }
        },

      clearTableFilter:
        () =>
        ({ state, dispatch }) => {
          const t = findTable(state)
          if (!t) return false
          try {
            const tr = state.tr
            let p = t.pos + 1
            let changed = false
            t.node.forEach((row) => {
              if (!!row.attrs.hidden) {
                tr.setNodeMarkup(p, undefined, { ...row.attrs, hidden: false })
                changed = true
              }
              p += row.nodeSize
            })
            if (dispatch && changed) dispatch(tr)
            return true
          } catch (e) {
            console.warn('[tableSmart] clearTableFilter failed', e)
            return false
          }
        },
    }
  },
})

/* ───────────── 扩展 TableRow（筛选隐藏） ───────────── */

export const SmartTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      hidden: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-hidden') === 'true',
        renderHTML: (attrs: { hidden?: boolean }) =>
          attrs.hidden ? { 'data-hidden': 'true' } : {},
      },
    }
  },
})

export { findTable, getActiveColumnIndex, safeCell, cellText }
