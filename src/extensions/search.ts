import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { setSearchBroadcast } from './searchState'

export interface SearchDtMatch {
  rowId: string
  colId: string
}

export interface SearchMatch {
  from: number
  to: number
  /** 命中来自智能表格单元格时记录其坐标，供 React 节点视图精确高亮 */
  dt?: SearchDtMatch
}

export interface SearchPluginState {
  query: string
  matches: SearchMatch[]
  current: number
}

export const searchPluginKey = new PluginKey<SearchPluginState>('dunoteSearch')

// 单元格值转可检索文本（智能表格字段类型多样）
function cellSearchText(v: any, t: string): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'boolean') return v ? '是' : ''
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '').join(',')
  return String(v)
}

// 扫描文档：正文文本节点 + 智能表格（dataTable atom 节点）单元格文本。
// 每个文本节点独立匹配，故跨不同样式片段边界的长词可能漏匹配（可接受）。
function findMatches(doc: any, query: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!query) return matches
  const lower = query.toLowerCase()
  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const lowerText = node.text.toLowerCase()
      let idx = lowerText.indexOf(lower)
      while (idx !== -1) {
        matches.push({ from: pos + idx, to: pos + idx + query.length })
        idx = lowerText.indexOf(lower, idx + query.length)
      }
    } else if (node.type && node.type.name === 'dataTable') {
      const rows = (node.attrs && node.attrs.rows) || []
      const cols = (node.attrs && node.attrs.columns) || []
      for (const r of rows) {
        if (!r || !r.cells) continue
        for (const c of cols) {
          const text = cellSearchText(r.cells[c.id], c.type)
          if (text && text.toLowerCase().includes(lower)) {
            matches.push({ from: pos, to: pos + node.nodeSize, dt: { rowId: r.id, colId: c.id } })
          }
        }
      }
    }
  })
  return matches
}

// 把当前命中情况广播给智能表格节点视图（仅状态变化时调用）
function emitBroadcast(state: SearchPluginState) {
  if (!state.query) {
    setSearchBroadcast({ query: '', current: null, matches: [] })
    return
  }
  const dtMatches: SearchDtMatch[] = []
  for (const m of state.matches) if (m.dt) dtMatches.push(m.dt)
  const cur = state.current >= 0 ? state.matches[state.current]?.dt ?? null : null
  setSearchBroadcast({ query: state.query, current: cur, matches: dtMatches })
}

export const SearchExtension = Extension.create({
  name: 'dunoteSearch',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,
        state: {
          init: () => ({ query: '', matches: [], current: -1 }),
          apply(tr, value) {
            const meta = tr.getMeta(searchPluginKey)
            let next: SearchPluginState | null = null

            if (meta) {
              // 设置新检索词：重新计算匹配并定位到第一个
              if (typeof meta.query === 'string') {
                const query = meta.query
                const matches = query ? findMatches(tr.doc, query) : []
                next = { query, matches, current: matches.length ? 0 : -1 }
              }
              // 上一个 / 下一个：在匹配列表中循环移动
              else if (typeof meta.step === 'number') {
                if (!value.matches.length) {
                  next = value
                } else {
                  let current = value.current + meta.step
                  if (current < 0) current = value.matches.length - 1
                  if (current >= value.matches.length) current = 0
                  next = { ...value, current }
                }
              }
              // 直接跳转到指定下标
              else if (typeof meta.index === 'number') {
                let current = meta.index
                if (current < 0) current = 0
                else if (current >= value.matches.length) current = value.matches.length - 1
                next = { ...value, current }
              }
            }
            // 文档被编辑（docChanged）时，若仍有关键词则重新计算匹配，并维持 current 有效
            else if (tr.docChanged && value.query) {
              const matches = findMatches(tr.doc, value.query)
              let current = value.current
              if (!matches.length) current = -1
              else if (current < 0) current = 0
              else if (current >= matches.length) current = matches.length - 1
              next = { ...value, matches, current }
            }

            if (next) {
              emitBroadcast(next)
              return next
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const s = searchPluginKey.getState(state)
            if (!s || !s.query || !s.matches.length) return DecorationSet.empty
            const decos: Decoration[] = []
            s.matches.forEach((m, i) => {
              const isCur = i === s.current
              if (m.dt) {
                // 智能表格单元格：当前命中时在 atom 节点上挂 class（整体高亮，并供 scrollIntoView 定位）
                if (isCur) decos.push(Decoration.node(m.from, m.to, { class: 'search-current' }))
              } else {
                decos.push(
                  Decoration.inline(m.from, m.to, {
                    class: isCur ? 'search-current' : 'search-match',
                  }),
                )
              }
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
        view(editorView) {
          return {
            update(view, prevState) {
              const s = searchPluginKey.getState(view.state)
              const prev = searchPluginKey.getState(prevState)
              const changed =
                !!s && !!prev &&
                (s.current !== prev.current || (s.query !== prev.query && s.current >= 0))
              if (!changed) return
              // 等待 DOM 更新（装饰已应用）后，把当前匹配滚动到可视区域中央
              requestAnimationFrame(() => {
                const el = view.dom.querySelector('.search-current') as HTMLElement | null
                if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
              })
            },
          }
        },
      }),
    ]
  },
})
