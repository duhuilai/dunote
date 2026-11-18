export interface NoteStats {
  characters: number
  words: number
  paragraphs: number
  readingMinutes: number
}

const READING_WORDS_PER_MINUTE = 300
const CJK_CHARACTER_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g
const LATIN_WORD_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g

export const EMPTY_NOTE_STATS: NoteStats = {
  characters: 0,
  words: 0,
  paragraphs: 0,
  readingMinutes: 0,
}

export function calculateNoteStats(text: string): NoteStats {
  if (!text) return EMPTY_NOTE_STATS

  const cjkCharacters = text.match(CJK_CHARACTER_PATTERN)?.length ?? 0
  const withoutCjk = text.replace(CJK_CHARACTER_PATTERN, ' ')
  const latinWords = withoutCjk.match(LATIN_WORD_PATTERN)?.length ?? 0
  const words = cjkCharacters + latinWords

  return {
    characters: Array.from(text.replace(/\s/g, '')).length,
    words,
    paragraphs: text.split(/\n+/).filter((line) => line.trim().length > 0).length,
    readingMinutes: words > 0 ? Math.max(1, Math.ceil(words / READING_WORDS_PER_MINUTE)) : 0,
  }
}
