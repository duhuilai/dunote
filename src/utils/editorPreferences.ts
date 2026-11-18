const EDITOR_PREFERENCES_KEY = 'dunote.editor.prefs.v1'

export interface EditorPreferences {
  typewriterMode: boolean
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  typewriterMode: false,
}

export function readEditorPreferences(): EditorPreferences {
  try {
    const raw = window.localStorage.getItem(EDITOR_PREFERENCES_KEY)
    if (!raw) return DEFAULT_EDITOR_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<EditorPreferences> | null
    return {
      typewriterMode: parsed?.typewriterMode === true,
    }
  } catch {
    return DEFAULT_EDITOR_PREFERENCES
  }
}

export function writeEditorPreferences(preferences: EditorPreferences): void {
  try {
    window.localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    // 本地偏好不可用时不影响编辑与保存。
  }
}
