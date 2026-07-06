import { ReactRenderer } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import {
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, CodeSquare,
  Minus, Image as ImageIcon, CheckSquare,
  AlignLeft, Table, Calendar, AlertCircle,
} from 'lucide-react'
import {
  useState, useEffect, useRef, forwardRef, useImperativeHandle,
} from 'react'
import type { Editor, Range } from '@tiptap/react'

/* ─── Color Tokens ─── */
const C = {
  primary: '#2563EB',
  primaryLight: 'rgba(37,99,235,0.1)',
  border: '#E2E8F0',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  surface: '#FFFFFF',
  bg: '#F8FAFC',
} as const

/* ─── Command Items ─── */
export interface SlashCommandItem {
  title: string
  description: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  command: (props: { editor: Editor; range: Range }) => void
}

const commandItems: SlashCommandItem[] = [
  {
    title: '标题 1',
    description: '大标题',
    icon: Heading1,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: '标题 2',
    description: '中标题',
    icon: Heading2,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: '标题 3',
    description: '小标题',
    icon: Heading3,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: '文本',
    description: '普通文本段落',
    icon: AlignLeft,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('paragraph').run()
    },
  },
  {
    title: '无序列表',
    description: '项目符号列表',
    icon: List,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: '有序列表',
    description: '编号列表',
    icon: ListOrdered,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: '任务列表',
    description: '可勾选的待办事项',
    icon: CheckSquare,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: '表格',
    description: '插入 3×3 表格',
    icon: Table,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
  },
  {
    title: '引用',
    description: '引用文本块',
    icon: Quote,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: '代码块',
    description: '插入代码块',
    icon: CodeSquare,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: '提示框',
    description: '注意/提示信息',
    icon: AlertCircle,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .toggleBlockquote()
        .insertContent('<strong>提示：</strong>')
        .run()
    },
  },
  {
    title: '分割线',
    description: '水平分割线',
    icon: Minus,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: '图片',
    description: '插入网络图片',
    icon: ImageIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
      const url = prompt('输入图片地址:')
      if (url) editor.chain().focus().setImage({ src: url }).run()
    },
  },
  {
    title: '日期',
    description: '插入当前日期',
    icon: Calendar,
    command: ({ editor, range }) => {
      const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
      editor.chain().focus().deleteRange(range).insertContent(today).run()
    },
  },
]

/* ─── Popup Menu Component ─── */
interface SlashMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSelectedIndex(0) }, [props.items])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const active = el.querySelector('[data-active="true"]') as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) props.command(item)
  }

  const upHandler = () => {
    setSelectedIndex((i) => (i + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((i) => (i + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') { upHandler(); return true }
      if (event.key === 'ArrowDown') { downHandler(); return true }
      if (event.key === 'Enter') { enterHandler(); return true }
      return false
    },
  }))

  if (props.items.length === 0) return null

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => { e.preventDefault() }}
      style={{
        background: C.surface,
        borderRadius: '10px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        border: `1px solid ${C.border}`,
        padding: '6px',
        width: '240px',
        maxHeight: '320px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      <div style={{ padding: '6px 8px 4px', fontSize: '11px', fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        插入内容
      </div>
      {props.items.map((item, index) => {
        const isActive = index === selectedIndex
        const Icon = item.icon
        return (
          <button
            key={item.title}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => selectItem(index)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              width: '100%',
              transition: 'background 0.1s',
              background: isActive ? C.primaryLight : 'transparent',
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isActive ? C.primaryLight : C.bg,
                border: `1px solid ${isActive ? 'rgba(37,99,235,0.15)' : C.border}`,
                flexShrink: 0,
              }}
            >
              <Icon size={16} style={{ color: isActive ? C.primary : C.textSecondary }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: C.text }}>{item.title}</div>
              <div style={{ fontSize: '11px', color: C.textMuted }}>{item.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'

/* ─── Tiptap Extension ─── */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        dismissOnOutsideClick: false,
        command: () => {},
        items: ({ query }: { query: string }) => {
          return commandItems.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase())
          )
        },
        render: () => {
          let reactRenderer: ReactRenderer<SlashMenuRef>
          let popup: HTMLDivElement | null
          let currentEditor: Editor
          let currentRange: Range

          /* Position popup: flip upward when near screen bottom */
          const positionPopup = (clientRect: (() => DOMRect | null) | undefined) => {
            if (!popup || !clientRect) return
            const rect = clientRect()
            if (!rect) return

            const popupHeight = popup.offsetHeight
            const gap = 4
            const spaceBelow = window.innerHeight - rect.bottom - gap
            const spaceAbove = rect.top - gap

            popup.style.left = `${rect.left}px`

            if (spaceBelow < popupHeight && spaceAbove > popupHeight) {
              // Not enough room below → show above cursor
              popup.style.top = 'auto'
              popup.style.bottom = `${window.innerHeight - rect.top + gap}px`
            } else {
              // Default: show below cursor
              popup.style.top = `${rect.bottom + gap}px`
              popup.style.bottom = 'auto'
            }
          }

          return {
            onStart: (props: any) => {
              currentEditor = props.editor
              currentRange = props.range

              reactRenderer = new ReactRenderer(SlashMenu, {
                props: {
                  items: props.items,
                  command: (item: SlashCommandItem) => {
                    item.command({ editor: currentEditor, range: currentRange })
                  },
                },
                editor: props.editor,
              })

              popup = document.createElement('div')
              popup.style.position = 'absolute'
              popup.style.zIndex = '9999'
              popup.className = 'slash-command-popup'
              document.body.appendChild(popup)
              popup.appendChild(reactRenderer.element as Node)

              // Position after DOM insertion so offsetHeight is available
              requestAnimationFrame(() => positionPopup(props.clientRect))
            },

            onUpdate(props: any) {
              currentEditor = props.editor
              currentRange = props.range

              reactRenderer.updateProps({
                items: props.items,
                command: (item: SlashCommandItem) => {
                  item.command({ editor: currentEditor, range: currentRange })
                },
              })

              positionPopup(props.clientRect)
            },

            onKeyDown(props: any) {
              if (props.event.key === 'Escape') {
                popup?.remove()
                reactRenderer?.destroy()
                return true
              }
              return reactRenderer.ref?.onKeyDown(props) ?? false
            },

            onExit() {
              popup?.remove()
              reactRenderer?.destroy()
            },
          }
        },
      }),
    ]
  },
})
