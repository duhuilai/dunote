import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const WIKI_LINK_PATTERN = /\[\[([^[\]\r\n]{1,120})\]\]/g
const wikiLinkPluginKey = new PluginKey<DecorationSet>('wikiLinkDecorations')

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') return false
    if (!node.isText || !node.text) return true
    if (node.marks.some((mark) => mark.type.name === 'code')) return true

    const pattern = new RegExp(WIKI_LINK_PATTERN.source, 'g')
    let match = pattern.exec(node.text)
    while (match) {
      const target = match[1]?.trim()
      if (target) {
        const from = pos + match.index
        const to = from + match[0].length
        decorations.push(
          Decoration.inline(from, to, {
            class: 'wiki-link',
            'data-wiki-link': target,
            title: `打开笔记「${target}」`,
          }),
        )
      }
      match = pattern.exec(node.text)
    }
    return true
  })

  return DecorationSet.create(doc, decorations)
}

export const WikiLink = Extension.create({
  name: 'wikiLink',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: wikiLinkPluginKey,
        state: {
          init: (_, state) => buildDecorations(state.doc),
          apply: (transaction, decorations) => (
            transaction.docChanged ? buildDecorations(transaction.doc) : decorations
          ),
        },
        props: {
          decorations(state) {
            return wikiLinkPluginKey.getState(state)
          },
        },
      }),
    ]
  },
})
