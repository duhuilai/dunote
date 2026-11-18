import { FileText, Pin, Plus } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export interface WikiLinkSuggestionItem {
  title: string
  noteType?: string
  tags?: string[]
  pinned?: boolean
  isNew?: boolean
}

export interface WikiLinkSuggestionMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface WikiLinkSuggestionMenuProps {
  items: WikiLinkSuggestionItem[]
  command: (item: WikiLinkSuggestionItem) => void
}

const typeLabels: Record<string, string> = {
  normal: '普通笔记',
  meeting: '会议记录',
  project: '项目文档',
  study: '学习笔记',
  work: '工作日志',
}

const WikiLinkSuggestionMenu = forwardRef<WikiLinkSuggestionMenuRef, WikiLinkSuggestionMenuProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      setSelectedIndex(0)
    }, [props.items])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const active = container.querySelector('[data-active="true"]') as HTMLElement | null
      active?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    const selectItem = (index: number) => {
      const item = props.items[index]
      if (item) props.command(item)
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.isComposing) return false
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedIndex((current) => (
            (current + props.items.length - 1) % props.items.length
          ))
          return true
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedIndex((current) => (current + 1) % props.items.length)
          return true
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (props.items.length === 0) return null

    return (
      <div
        ref={containerRef}
        className="wiki-link-suggestion"
        role="listbox"
        aria-label="链接笔记"
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="wiki-link-suggestion-heading">链接笔记</div>
        {props.items.map((item, index) => {
          const active = index === selectedIndex
          return (
            <button
              key={`${item.isNew ? 'new' : 'note'}-${item.title}`}
              type="button"
              role="option"
              aria-selected={active}
              data-active={active ? 'true' : 'false'}
              className={`wiki-link-suggestion-item${active ? ' is-active' : ''}${item.isNew ? ' is-new' : ''}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => selectItem(index)}
            >
              <span className="wiki-link-suggestion-icon" aria-hidden="true">
                {item.isNew ? <Plus size={15} /> : <FileText size={15} />}
              </span>
              <span className="wiki-link-suggestion-copy">
                <span className="wiki-link-suggestion-title">
                  {item.isNew ? `创建「${item.title}」` : item.title}
                  {item.pinned && <Pin size={11} fill="currentColor" aria-label="已固定" />}
                </span>
                <span className="wiki-link-suggestion-meta">
                  {item.isNew
                    ? '新建笔记链接'
                    : typeLabels[item.noteType || 'normal'] || '普通笔记'}
                  {!item.isNew && item.tags?.length ? ` · ${item.tags.slice(0, 2).join(' · ')}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    )
  },
)

WikiLinkSuggestionMenu.displayName = 'WikiLinkSuggestionMenu'

export default WikiLinkSuggestionMenu
