import type { Note } from '@/types'
import { readTextFile } from '@tauri-apps/plugin-fs'

export interface SearchResult {
  note: Note
  snippet: string
  matchSource: 'title' | 'tag' | 'content'
}

interface ContentCacheEntry {
  content: string
  updatedAt: string
}

const contentCache = new Map<string, ContentCacheEntry>()

export function htmlToPlainText(html: string): string {
  if (!html) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
    return (doc.body.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildSearchSnippet(text: string, query: string, radius = 44): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  if (!query.trim()) return normalizedText.slice(0, radius * 2)
  const index = normalizedText.toLocaleLowerCase('zh-CN').indexOf(query.toLocaleLowerCase('zh-CN'))
  if (index < 0) return normalizedText.slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(normalizedText.length, index + query.length + radius)
  return `${start > 0 ? '…' : ''}${normalizedText.slice(start, end)}${end < normalizedText.length ? '…' : ''}`
}

export async function getNoteSearchText(note: Note): Promise<string> {
  const cached = contentCache.get(note.id)

  if (!note._isLocalFile || !note.filePath) {
    if (cached && cached.updatedAt === note.updatedAt) return cached.content
    const text = htmlToPlainText(note.content)
    contentCache.set(note.id, { content: text, updatedAt: note.updatedAt })
    return text
  }

  if (cached && cached.updatedAt === note.updatedAt && cached.content) return cached.content
  try {
    const raw = note.content || await readTextFile(note.filePath)
    const text = htmlToPlainText(raw)
    contentCache.set(note.id, { content: text, updatedAt: note.updatedAt })
    return text
  } catch {
    return htmlToPlainText(note.content)
  }
}

export function clearSearchCacheForNote(noteId: string): void {
  contentCache.delete(noteId)
}

export async function searchNotes(notes: Note[], rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim()
  if (!query) return []
  const lowered = query.toLocaleLowerCase('zh-CN')
  const results: Array<SearchResult & { score: number }> = []
  let cursor = 0
  const concurrency = Math.min(4, notes.length)

  const worker = async () => {
    while (cursor < notes.length) {
      const note = notes[cursor++]
      const titleMatches = note.title.toLocaleLowerCase('zh-CN').includes(lowered)
      const matchingTags = (note.tags || []).filter((tag) => (
        tag.toLocaleLowerCase('zh-CN').includes(lowered)
      ))
      const text = await getNoteSearchText(note)
      const contentMatches = text.toLocaleLowerCase('zh-CN').includes(lowered)
      if (!titleMatches && matchingTags.length === 0 && !contentMatches) continue

      const matchSource: SearchResult['matchSource'] = contentMatches
        ? 'content'
        : titleMatches
          ? 'title'
          : 'tag'
      const snippet = contentMatches
        ? buildSearchSnippet(text, query)
        : titleMatches
          ? (text.slice(0, 88) || '标题匹配')
          : `标签：${matchingTags.map((tag) => `#${tag}`).join('  ')}`

      results.push({
        note,
        snippet,
        matchSource,
        score: titleMatches ? 3 : matchingTags.length > 0 ? 2 : 1,
      })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  const rank = new Map(notes.map((note, index) => [note.id, index]))
  results.sort((a, b) => {
    const scoreDiff = b.score - a.score
    if (scoreDiff !== 0) return scoreDiff
    return (rank.get(a.note.id) ?? 0) - (rank.get(b.note.id) ?? 0)
  })
  return results.map(({ score: _score, ...result }) => result)
}
