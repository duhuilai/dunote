import { Extension } from '@tiptap/core'
import Suggestion, {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
import type { Editor, Range } from '@tiptap/react'
import type { Note } from '@/types'
import { normalizeWikiTitle } from '@/utils/wikiLinks'
import WikiLinkSuggestionMenu, {
  type WikiLinkSuggestionItem,
  type WikiLinkSuggestionMenuRef,
} from '@/components/notes/WikiLinkSuggestionMenu'

interface WikiLinkSuggestionOptions {
  getNotes?: () => Note[]
  getCurrentNoteId?: () => string | null
  maxItems?: number
}

function noteTimestamp(note: Note): number {
  const value = Date.parse(note.updatedAt)
  return Number.isFinite(value) ? value : 0
}

function scoreNote(note: Note, query: string): number {
  if (!query) return 1

  const title = normalizeWikiTitle(note.title)
  const tags = (note.tags || []).map(normalizeWikiTitle)
  if (title === query) return 1200
  if (title.startsWith(query)) return 900
  if (tags.some((tag) => tag === query)) return 760
  if (tags.some((tag) => tag.startsWith(query))) return 680
  if (title.includes(query)) return 540
  if (tags.some((tag) => tag.includes(query))) return 460
  return 0
}

function sanitizeLinkTitle(value: string): string {
  return Array.from(value.replace(/[\u005B\u005D\r\n]/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, 120)
    .join('')
}

export function findWikiLinkSuggestions(
  notes: Note[],
  rawQuery: string,
  currentNoteId: string | null,
  maxItems = 12,
): WikiLinkSuggestionItem[] {
  // A closing bracket means the user has already completed the link. Keep the
  // suggestion closed instead of offering a second, malformed link.
  if (rawQuery.includes(']')) return []

  const query = sanitizeLinkTitle(rawQuery)
  const normalizedQuery = normalizeWikiTitle(query)
  const candidates: Array<{ note: Note; score: number }> = []
  const seenTitles = new Set<string>()

  for (const note of notes) {
    if (note.id === currentNoteId) continue
    const title = sanitizeLinkTitle(note.title || '')
    const normalizedTitle = normalizeWikiTitle(title)
    if (!title || !normalizedTitle || seenTitles.has(normalizedTitle)) continue

    const score = scoreNote(note, normalizedQuery)
    if (normalizedQuery && score === 0) continue
    seenTitles.add(normalizedTitle)
    candidates.push({ note, score })
  }

  candidates.sort((left, right) => (
    right.score - left.score
    || Number(Boolean(right.note.pinned)) - Number(Boolean(left.note.pinned))
    || noteTimestamp(right.note) - noteTimestamp(left.note)
    || left.note.title.localeCompare(right.note.title, 'zh-CN')
  ))

  const results: WikiLinkSuggestionItem[] = candidates
    .slice(0, Math.max(1, maxItems - (normalizedQuery ? 1 : 0)))
    .map(({ note }) => ({
      title: sanitizeLinkTitle(note.title),
      noteType: note.noteType,
      tags: note.tags || [],
      pinned: note.pinned,
    }))

  if (normalizedQuery && !results.some((item) => normalizeWikiTitle(item.title) === normalizedQuery)) {
    results.push({ title: query, isNew: true })
  }

  return results
}

const suggestionPluginKey = new PluginKey('wikiLinkSuggestion')

function insertWikiLink(
  editor: Editor,
  range: Range,
  rawTitle: string,
): boolean {
  const title = sanitizeLinkTitle(rawTitle)
  if (!title) return false

  const inserted = editor
    .chain()
    .focus()
    .insertContentAt(range, `[[${title}]]`)
    .run()

  if (inserted) {
    exitSuggestion(editor.view, suggestionPluginKey)
  }
  return inserted
}

export const WikiLinkSuggestion = Extension.create<WikiLinkSuggestionOptions>({
  name: 'wikiLinkSuggestion',

  addOptions() {
    return {
      getNotes: () => [],
      getCurrentNoteId: () => null,
      maxItems: 12,
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<WikiLinkSuggestionItem>({
        editor: this.editor,
        pluginKey: suggestionPluginKey,
        char: '[[',
        allowSpaces: true,
        allowedPrefixes: null,
        startOfLine: false,
        dismissOnOutsideClick: true,
        shouldShow: ({ editor }) => (
          editor.isEditable
          && !editor.isActive('codeBlock')
          && !editor.isActive('code')
        ),
        items: ({ query }) => findWikiLinkSuggestions(
          this.options.getNotes?.() || [],
          query,
          this.options.getCurrentNoteId?.() || null,
          this.options.maxItems || 12,
        ),
        command: ({ editor, range, props }) => {
          insertWikiLink(editor, range, props.title)
        },
        render: () => {
          let renderer: ReactRenderer<WikiLinkSuggestionMenuRef>
          let popup: HTMLDivElement | null
          let currentEditor: Editor
          let currentRange: Range
          let currentClientRect: (() => DOMRect | null) | null | undefined
          let listeningForViewportChanges = false

          const positionPopup = (clientRect: (() => DOMRect | null) | null | undefined) => {
            if (!popup || !clientRect) return
            const rect = clientRect()
            if (!rect) return

            const gap = 6
            const popupWidth = Math.min(320, Math.max(220, window.innerWidth - 16))
            const popupHeight = popup.offsetHeight || 180
            const spaceBelow = window.innerHeight - rect.bottom - gap
            const spaceAbove = rect.top - gap
            popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 8))}px`

            if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
              popup.style.top = 'auto'
              popup.style.bottom = `${Math.max(8, window.innerHeight - rect.top + gap)}px`
            } else {
              popup.style.top = `${rect.bottom + gap}px`
              popup.style.bottom = 'auto'
            }
          }

          const handleViewportChange = () => {
            positionPopup(currentClientRect)
          }

          const startViewportListeners = () => {
            if (listeningForViewportChanges) return
            listeningForViewportChanges = true
            window.addEventListener('resize', handleViewportChange)
            window.addEventListener('scroll', handleViewportChange, true)
            window.visualViewport?.addEventListener('resize', handleViewportChange)
            window.visualViewport?.addEventListener('scroll', handleViewportChange)
          }

          const stopViewportListeners = () => {
            if (!listeningForViewportChanges) return
            listeningForViewportChanges = false
            window.removeEventListener('resize', handleViewportChange)
            window.removeEventListener('scroll', handleViewportChange, true)
            window.visualViewport?.removeEventListener('resize', handleViewportChange)
            window.visualViewport?.removeEventListener('scroll', handleViewportChange)
          }

          const close = () => {
            stopViewportListeners()
            popup?.remove()
            popup = null
            renderer?.destroy()
          }

          return {
            onStart: (props: SuggestionProps<WikiLinkSuggestionItem>) => {
              currentEditor = props.editor
              currentRange = props.range
              currentClientRect = props.clientRect

              renderer = new ReactRenderer(WikiLinkSuggestionMenu, {
                props: {
                  items: props.items,
                  command: (item: WikiLinkSuggestionItem) => {
                    insertWikiLink(currentEditor, currentRange, item.title)
                  },
                },
                editor: props.editor,
              })

              popup = document.createElement('div')
              popup.className = 'wiki-link-suggestion-popup'
              popup.style.position = 'fixed'
              popup.style.zIndex = '9999'
              document.body.appendChild(popup)
              popup.appendChild(renderer.element as Node)
              startViewportListeners()
              requestAnimationFrame(() => positionPopup(props.clientRect))
            },

            onUpdate: (props: SuggestionProps<WikiLinkSuggestionItem>) => {
              currentEditor = props.editor
              currentRange = props.range
              currentClientRect = props.clientRect
              renderer.updateProps({
                items: props.items,
                command: (item: WikiLinkSuggestionItem) => {
                  insertWikiLink(currentEditor, currentRange, item.title)
                },
              })
              positionPopup(props.clientRect)
            },

            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.isComposing) return false
              if (props.event.key === 'Escape') {
                props.event.preventDefault()
                exitSuggestion(props.view, suggestionPluginKey)
                return true
              }
              return renderer?.ref?.onKeyDown(props) ?? false
            },

            onExit: close,
          }
        },
      }),
    ]
  },
})
