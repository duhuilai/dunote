import type { Note, NoteFolder } from '@/types'

export interface FolderNode extends NoteFolder {
  children: FolderNode[]
}

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

function compareFolders(a: NoteFolder, b: NoteFolder): number {
  const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
  const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
  if (orderA !== orderB) return orderA - orderB
  return collator.compare(a.name, b.name)
}

/**
 * The store keeps folders flat for simple persistence. UI code should always
 * consume this normalized tree instead of rebuilding children independently.
 */
export function buildFolderTree(folders: NoteFolder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>()
  folders.forEach((folder) => {
    nodes.set(folder.id, { ...folder, children: [] })
  })

  const roots: FolderNode[] = []
  nodes.forEach((node) => {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent && parent.id !== node.id) parent.children.push(node)
    else roots.push(node)
  })

  const sortTree = (list: FolderNode[]) => {
    list.sort(compareFolders)
    list.forEach((node) => sortTree(node.children))
  }
  sortTree(roots)
  return roots
}

export function flattenFolderTree(nodes: FolderNode[]): FolderNode[] {
  const result: FolderNode[] = []
  const walk = (list: FolderNode[]) => {
    list.forEach((node) => {
      result.push(node)
      walk(node.children)
    })
  }
  walk(nodes)
  return result
}

export function findFolderNode(nodes: NoteFolder[], id: string | null): NoteFolder | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findFolderNode(node.children ?? [], id)
    if (child) return child
  }
  return null
}

export function collectFolderIds(nodes: FolderNode[], id: string): Set<string> {
  const result = new Set<string>()
  const root = findFolderNode(nodes, id)
  if (!root) return result
  const walk = (node: NoteFolder) => {
    result.add(node.id)
    ;(node.children ?? []).forEach(walk)
  }
  walk(root)
  return result
}

export function notesInFolder(notes: Note[], folderId: string): Note[] {
  return notes
    .filter((note) => note.folderId === folderId)
    .slice()
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return collator.compare(a.title || '', b.title || '')
    })
}

export function unfiledNotes(notes: Note[]): Note[] {
  return notesInFolder(notes, '')
}
