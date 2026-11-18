const RECENT_NOTE_IDS_KEY = 'dunote.recent-note-ids.v1'
const MAX_RECENT_NOTES = 24

export function loadRecentNoteIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_NOTE_IDS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(0, MAX_RECENT_NOTES)
  } catch {
    return []
  }
}

export function rememberRecentNote(noteId: string): string[] {
  if (!noteId) return loadRecentNoteIds()
  const next = [
    noteId,
    ...loadRecentNoteIds().filter((id) => id !== noteId),
  ].slice(0, MAX_RECENT_NOTES)

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECENT_NOTE_IDS_KEY, JSON.stringify(next))
    } catch {
      /* Recents are a convenience and must never block note navigation. */
    }
  }
  return next
}
