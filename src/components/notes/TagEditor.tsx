import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Tag as TagIcon, X } from 'lucide-react'
import {
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_NOTE,
  normalizeTag,
  normalizeTagList,
} from '@/utils/noteTags'

interface TagEditorProps {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
}

export default function TagEditor({ tags, suggestions, onChange }: TagEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const availableSuggestions = useMemo(() => {
    const existing = new Set(tags.map((tag) => tag.toLocaleLowerCase('zh-CN')))
    const query = normalizeTag(draft).toLocaleLowerCase('zh-CN')
    const seen = new Set<string>()

    return suggestions.filter((candidate) => {
      const tag = normalizeTag(candidate)
      const key = tag.toLocaleLowerCase('zh-CN')
      if (!tag || existing.has(key) || seen.has(key)) return false
      if (query && !key.includes(query)) return false
      seen.add(key)
      return true
    }).slice(0, 8)
  }, [draft, suggestions, tags])

  useEffect(() => {
    setActiveIndex(0)
  }, [draft])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, availableSuggestions.length - 1)))
  }, [availableSuggestions.length])

  useEffect(() => {
    suggestionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  useEffect(() => {
    if (!editing) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      setEditing(false)
      setDraft('')
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [editing])

  const addTag = useCallback((value: string) => {
    const nextTag = normalizeTag(value)
    if (!nextTag || tags.length >= MAX_TAGS_PER_NOTE) return false

    const nextTags = normalizeTagList([...tags, nextTag])
    if (nextTags.length === tags.length) {
      setDraft('')
      return false
    }

    onChange(nextTags)
    setDraft('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
    return true
  }, [onChange, tags])

  const removeTag = useCallback((tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove))
  }, [onChange, tags])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (availableSuggestions.length > 0) {
        setActiveIndex((current) => (current + 1) % availableSuggestions.length)
      }
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (availableSuggestions.length > 0) {
        setActiveIndex((current) => (
          (current - 1 + availableSuggestions.length) % availableSuggestions.length
        ))
      }
      return
    }

    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault()
      const value = draft.trim() || availableSuggestions[activeIndex] || ''
      addTag(value)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
      setDraft('')
      return
    }

    if (event.key === 'Backspace' && !draft && tags.length > 0) {
      event.preventDefault()
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="note-tag-editor" ref={containerRef}>
      <span className="note-tag-editor-label">
        <TagIcon size={13} aria-hidden="true" />
        标签
      </span>

      <div className="note-tag-editor-items">
        {tags.map((tag) => (
          <span className="note-tag-chip" key={tag}>
            <span title={tag}>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`移除标签 ${tag}`}
              title={`移除标签 ${tag}`}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ))}

        {editing ? (
          <span className="note-tag-input-wrap">
            <span aria-hidden="true">#</span>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={MAX_TAG_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={tags.length >= MAX_TAGS_PER_NOTE ? '标签已达到上限' : '输入标签'}
              aria-label="输入新标签"
              role="combobox"
              aria-expanded={availableSuggestions.length > 0}
              aria-controls="note-tag-suggestions"
              aria-activedescendant={
                availableSuggestions.length > 0 ? `note-tag-suggestion-${activeIndex}` : undefined
              }
              disabled={tags.length >= MAX_TAGS_PER_NOTE}
            />
          </span>
        ) : (
          <button
            type="button"
            className="note-tag-add"
            onClick={() => setEditing(true)}
            disabled={tags.length >= MAX_TAGS_PER_NOTE}
            aria-label="添加标签"
            title={tags.length >= MAX_TAGS_PER_NOTE ? '标签已达到上限' : '添加标签'}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {editing && availableSuggestions.length > 0 && (
        <div
          id="note-tag-suggestions"
          className="note-tag-suggestions"
          role="listbox"
          aria-label="标签建议"
        >
          {availableSuggestions.map((tag, index) => (
            <button
              key={tag}
              id={`note-tag-suggestion-${index}`}
              ref={(element) => { suggestionRefs.current[index] = element }}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'is-active' : undefined}
              onMouseDown={(event) => {
                event.preventDefault()
                addTag(tag)
              }}
            >
              <span aria-hidden="true">#</span>
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
