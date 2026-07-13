import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { DataTableView } from '@/components/table/DataTableView'
import { defaultColumns, defaultRows, type Column, type Row } from '@/components/table/fieldTypes'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dataTable: {
      /** 在光标处插入一个默认智能表格 */
      insertDataTable: () => ReturnType
    }
  }
}

/**
 * 智能表格节点：以独立 block 节点形式存在（atom），
 * 列定义与行数据全部存于 node 属性中，由 React NodeView 负责交互渲染。
 * 这样所有单元格编辑/下拉/选项管理/插入删除行列都在 React 内完成，
 * 不再依赖 TipTap 原生表格命令，交互稳定可靠。
 */
export const DataTable = Node.create({
  name: 'dataTable',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      columns: {
        default: [] as Column[],
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-columns')
          if (!raw) return []
          try {
            const v = JSON.parse(raw)
            return Array.isArray(v) ? v : []
          } catch {
            return []
          }
        },
        renderHTML: (attrs: { columns?: Column[] }) =>
          attrs.columns && attrs.columns.length
            ? { 'data-columns': JSON.stringify(attrs.columns) }
            : {},
      },
      rows: {
        default: [] as Row[],
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-rows')
          if (!raw) return []
          try {
            const v = JSON.parse(raw)
            return Array.isArray(v) ? v : []
          } catch {
            return []
          }
        },
        renderHTML: (attrs: { rows?: Row[] }) =>
          attrs.rows && attrs.rows.length ? { 'data-rows': JSON.stringify(attrs.rows) } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="data-table"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'data-table' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DataTableView)
  },

  addCommands() {
    return {
      insertDataTable:
        () =>
        ({ commands }) => {
          const columns = defaultColumns()
          const rows = defaultRows(columns)
          return commands.insertContent({ type: 'dataTable', attrs: { columns, rows } })
        },
    }
  },
})

export { defaultColumns, defaultRows }
