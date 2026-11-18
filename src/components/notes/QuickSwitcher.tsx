import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FileText,
  Loader2,
  Pin,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Note } from '@/types'
import { useModalDialog } from '@/hooks/useModalDialog'
import { loadRecentNoteIds } from '@/utils/noteRecents'
import { searchNotes, type SearchResult } from '@/utils/noteSearch'

export interface QuickSwitcherCommand {
  id: string
  label: string
  description?: string
  keywords?: string[]
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  run: () => void | Promise<void>
}

interface QuickSwitcherProps {
  open: boolean
  notes: Note[]
  commands?: QuickSwitcherCommand[]
  onClose: () => void
  onSelect: (note: Note) => void
}

interface CommandResult {
  command: QuickSwitcherCommand
  score: number
  order: number
}

type ResultItem =
  | { kind: 'command'; key: string; command: QuickSwitcherCommand }
  | { kind: 'note'; key: string; note: Note; searchResult?: SearchResult }

const typeLabels: Record<string, string> = {
  normal: '普通笔记',
  meeting: '会议记录',
  project: '项目文档',
  study: '学习笔记',
  work: '工作日志',
}

function noteTimestamp(note: Note): number {
  const value = Date.parse(note.updatedAt)
  return Number.isFinite(value) ? value : 0
}

function rankNote(note: Note, query: string): number {
  if (!query) return 1

  const title = note.title.trim().toLocaleLowerCase()
  const tags = note.tags.map((tag) => tag.toLocaleLowerCase())
  if (title === query) return 1000
  if (title.startsWith(query)) return 850
  if (tags.some((tag) => tag === query)) return 700
  if (tags.some((tag) => tag.startsWith(query))) return 620
  if (title.includes(query)) return 540
  if (tags.some((tag) => tag.includes(query))) return 460
  return 0
}

function compareNotes(a: Note, b: Note, query: string): number {
  if (query) {
    const scoreDiff = rankNote(b, query) - rankNote(a, query)
    if (scoreDiff !== 0) return scoreDiff
  }

  const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
  if (pinnedDiff !== 0) return pinnedDiff
  return noteTimestamp(b) - noteTimestamp(a)
}

function compareRecentNotes(a: Note, b: Note, recentRanks: Map<string, number>): number {
  const aRank = recentRanks.get(a.id) ?? Number.MAX_SAFE_INTEGER
  const bRank = recentRanks.get(b.id) ?? Number.MAX_SAFE_INTEGER
  if (aRank !== bRank) return aRank - bRank

  const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
  if (pinnedDiff !== 0) return pinnedDiff
  return noteTimestamp(b) - noteTimestamp(a)
}

function rankCommand(command: QuickSwitcherCommand, query: string): number {
  if (!query) return 1
  const label = command.label.toLocaleLowerCase()
  const searchable = [
    label,
    command.description || '',
    ...(command.keywords || []),
  ].join(' ').toLocaleLowerCase()

  if (label === query) return 1400
  if (label.startsWith(query)) return 1200
  if (label.includes(query)) return 1000
  if (query.split(/\s+/).every((token) => searchable.includes(token))) return 760
  return 0
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export default function QuickSwitcher({
  open,
  notes,
  commands = [],
  onClose,
  onSelect,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [recentNoteIds, setRecentNoteIds] = useState<string[]>([])
  const [fullTextResults, setFullTextResults] = useState<SearchResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState('')
  const [isSearchingNotes, setIsSearchingNotes] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const searchRequestRef = useRef(0)

  useModalDialog({
    open,
    onClose,
    dialogRef,
    initialFocusRef: inputRef,
  })

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const searchQuery = query.trim()

  const rankedCommands = useMemo<CommandResult[]>(() => {
    return commands
      .map((command, order) => ({
        command,
        order,
        score: rankCommand(command, normalizedQuery),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (normalizedQuery) {
          return right.score - left.score || left.order - right.order
        }
        return left.order - right.order
      })
  }, [commands, normalizedQuery])

  const validRecentNoteIds = useMemo(() => {
    const availableIds = new Set(notes.map((note) => note.id))
    return recentNoteIds.filter((id) => availableIds.has(id))
  }, [notes, recentNoteIds])

  const recentRanks = useMemo(
    () => new Map(validRecentNoteIds.map((id, index) => [id, index])),
    [validRecentNoteIds],
  )

  const rankedNotes = useMemo(() => {
    if (!normalizedQuery) {
      return [...notes]
        .sort((a, b) => compareRecentNotes(a, b, recentRanks))
        .slice(0, 12)
        .map((note) => ({ note, searchResult: undefined }))
    }

    if (searchedQuery === normalizedQuery) {
      return fullTextResults.slice(0, 30).map((searchResult) => ({
        note: searchResult.note,
        searchResult,
      }))
    }

    return notes
      .map((note) => ({ note, score: rankNote(note, normalizedQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => compareNotes(a.note, b.note, normalizedQuery))
      .slice(0, 30)
      .map(({ note }) => ({ note, searchResult: undefined }))
  }, [fullTextResults, recentRanks, notes, normalizedQuery, searchedQuery])

  const resultItems = useMemo<ResultItem[]>(() => [
    ...rankedCommands.map(({ command }) => ({
      kind: 'command' as const,
      key: `command-${command.id}`,
      command,
    })),
    ...rankedNotes.map(({ note, searchResult }) => ({
      kind: 'note' as const,
      key: `note-${note.id}`,
      note,
      searchResult,
    })),
  ], [rankedCommands, rankedNotes])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    setRecentNoteIds(loadRecentNoteIds())
    searchRequestRef.current += 1
  }, [open])

  useEffect(() => {
    if (!open) return
    const requestId = ++searchRequestRef.current
    if (!searchQuery) {
      setFullTextResults([])
      setSearchedQuery('')
      setIsSearchingNotes(false)
      return
    }

    setIsSearchingNotes(true)
    const timer = window.setTimeout(() => {
      void searchNotes(notes, searchQuery)
        .then((results) => {
          if (requestId !== searchRequestRef.current) return
          setFullTextResults(results)
          setSearchedQuery(normalizedQuery)
        })
        .catch((error) => {
          if (requestId !== searchRequestRef.current) return
          console.error('[QuickSwitcher] full-text search failed:', error)
          setFullTextResults([])
          setSearchedQuery(normalizedQuery)
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) setIsSearchingNotes(false)
        })
    }, 160)

    return () => window.clearTimeout(timer)
  }, [normalizedQuery, notes, open, searchQuery])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, resultItems.length - 1)))
  }, [resultItems.length])

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  const choose = (item: ResultItem | undefined) => {
    if (!item) return
    if (item.kind === 'command') {
      if (item.command.disabled) return
      onClose()
      void item.command.run()
      return
    }
    onSelect(item.note)
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      if (resultItems.length) {
        setActiveIndex((current) => (current + 1) % resultItems.length)
      }
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (resultItems.length) {
        setActiveIndex((current) => (current - 1 + resultItems.length) % resultItems.length)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      choose(resultItems[activeIndex])
      return
    }

  }

  const commandOffset = 0
  const noteOffset = rankedCommands.length

  return createPortal(
    <div
      className="command-palette-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="command-palette-card"
        role="dialog"
        aria-modal="true"
        aria-label="命令与笔记"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-search" aria-busy={isSearchingNotes}>
          {isSearchingNotes
            ? <Loader2 size={17} className="spin" aria-hidden="true" />
            : <Search size={17} aria-hidden="true" />}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-switcher-results"
            aria-activedescendant={resultItems.length ? `quick-switcher-result-${activeIndex}` : undefined}
            placeholder="搜索标题、正文、标签或命令"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
              className="command-palette-clear"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          id="quick-switcher-results"
          role="listbox"
          aria-label="命令与笔记搜索结果"
          className="command-palette-results"
        >
          {resultItems.length === 0 ? (
            <div className="command-palette-empty">
              {isSearchingNotes
                ? <Loader2 size={25} className="spin" aria-hidden="true" />
                : <FileText size={25} aria-hidden="true" />}
              <span>{isSearchingNotes ? '正在检索笔记正文…' : '没有匹配的命令或笔记'}</span>
            </div>
          ) : (
            <>
              {rankedCommands.length > 0 && (
                <>
                  <div className="command-palette-group-label">快捷操作</div>
                  {rankedCommands.map(({ command }, commandIndex) => {
                    const index = commandOffset + commandIndex
                    const active = index === activeIndex
                    const Icon = command.icon
                    return (
                      <button
                        key={command.id}
                        id={`quick-switcher-result-${index}`}
                        ref={(element) => { itemRefs.current[index] = element }}
                        type="button"
                        role="option"
                        aria-selected={active}
                        aria-disabled={command.disabled || undefined}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => choose({ kind: 'command', key: command.id, command })}
                        className={`command-palette-item${active ? ' is-active' : ''}${command.disabled ? ' is-disabled' : ''}`}
                      >
                        <span className="command-palette-item-icon" aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <span className="command-palette-item-copy">
                          <span className="command-palette-item-title">
                            {command.label}
                            {command.active && <span className="command-palette-active">已开启</span>}
                          </span>
                          {command.description && (
                            <span className="command-palette-item-description">{command.description}</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}

              {rankedNotes.length > 0 && (
                <>
                  <div className="command-palette-group-label">
                    {normalizedQuery
                      ? (isSearchingNotes && searchedQuery !== normalizedQuery ? '正在检索正文…' : '笔记')
                      : validRecentNoteIds.length > 0 ? '最近打开' : '最近更新'}
                  </div>
                  {rankedNotes.map(({ note, searchResult }, noteIndex) => {
                    const index = noteOffset + noteIndex
                    const active = index === activeIndex
                    const tags = note.tags.slice(0, 3)
                    return (
                      <button
                        key={note.id}
                        id={`quick-switcher-result-${index}`}
                        ref={(element) => { itemRefs.current[index] = element }}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => choose({ kind: 'note', key: note.id, note })}
                        className={`command-palette-item${active ? ' is-active' : ''}`}
                      >
                        <span className="command-palette-item-icon" aria-hidden="true">
                          <FileText size={15} />
                        </span>
                        <span className="command-palette-item-copy">
                          <span className="command-palette-item-title">
                            {note.pinned && (
                              <Pin
                                size={12}
                                fill="currentColor"
                                aria-label="已固定"
                                className="command-palette-pin"
                              />
                            )}
                            <span>{note.title || '未命名笔记'}</span>
                          </span>
                          <span className="command-palette-item-description">
                            {searchResult?.matchSource === 'content' ? (
                              <>
                                <span className="command-palette-match">正文</span>
                                <span className="command-palette-snippet">{searchResult.snippet}</span>
                              </>
                            ) : (
                              <>
                                <span>{typeLabels[note.noteType || 'normal'] || '普通笔记'}</span>
                                {tags.map((tag) => (
                                  <span key={tag} className="command-palette-tag">{tag}</span>
                                ))}
                                {note.tags.length > tags.length && (
                                  <span>+{note.tags.length - tags.length}</span>
                                )}
                              </>
                            )}
                          </span>
                        </span>
                        <span className="command-palette-time">{formatUpdatedAt(note.updatedAt)}</span>
                      </button>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
