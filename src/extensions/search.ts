import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchMatch {
  from: number
  to: number
}

export interface SearchPluginState {
  query: string
  matches: SearchMatch[]
  current: number
}

export const searchPluginKey = new PluginKey<SearchPluginState>('dunoteSearch')

// 扫描文档文本节点，找出所有与 query 匹配的位置（大小写不敏感）。
// 每个文本节点独立匹配，因此跨「带不同样式的文本片段」边界的长词可能漏匹配——属可接受范围。
function findMatches(doc: any, query: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!query) return matches
  const lower = query.toLowerCase()
  doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return
    const lowerText = node.text.toLowerCase()
    let idx = lowerText.indexOf(lower)
    while (idx !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + query.length })
      idx = lowerText.indexOf(lower, idx + query.length)
    }
  })
  return matches
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
            if (meta) {
              // 设置新检索词：重新计算匹配并定位到第一个
              if (typeof meta.query === 'string') {
                const query = meta.query
                const matches = query ? findMatches(tr.doc, query) : []
                return { query, matches, current: matches.length ? 0 : -1 }
              }
              // 上一个 / 下一个：在匹配列表中循环移动
              if (typeof meta.step === 'number') {
                if (!value.matches.length) return value
                let current = value.current + meta.step
                if (current < 0) current = value.matches.length - 1
                if (current >= value.matches.length) current = 0
                return { ...value, current }
              }
              // 直接跳转到指定下标
              if (typeof meta.index === 'number') {
                let current = meta.index
                if (current < 0) current = 0
                if (current >= value.matches.length) current = value.matches.length - 1
                return { ...value, current }
              }
            }
            // 文档被编辑（docChanged）时，若仍有关键词则重新计算匹配，并维持 current 有效
            if (tr.docChanged && value.query) {
              const matches = findMatches(tr.doc, value.query)
              let current = value.current
              if (!matches.length) current = -1
              else if (current < 0) current = 0
              else if (current >= matches.length) current = matches.length - 1
              return { ...value, matches, current }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const s = searchPluginKey.getState(state)
            if (!s || !s.query || !s.matches.length) return DecorationSet.empty
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === s.current ? 'search-current' : 'search-match',
                }),
              ),
            )
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
