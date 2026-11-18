export interface NoteAiBridge {
  noteId: string
  characterCount: number
  selectionCharacterCount: number
  hasSelection: boolean
  readOnly: boolean
  ready: boolean
  getPlainText: () => string
  getSelectedText: () => string
  insertHtml: (html: string) => boolean
  replaceSelection: (html: string) => boolean
  appendHtml: (html: string) => boolean
}
