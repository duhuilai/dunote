import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/store'
import {
  Search, Plus, ChevronDown, ChevronRight, Folder,
  Clock, Upload, Download, Trash2, Edit3, PanelRightOpen, PanelRightClose,
  FileText, Users, BookOpen, FileCode, FileType, ChevronRight as ChevronRightIcon, ExternalLink
} from 'lucide-react'
import NoteEditor from './NoteEditor'
import HistoryModal from './HistoryModal'
import { exportNote, type ExportFormat } from '@/utils/exportNote'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs'

/* ─── Color Tokens ─── */
const C = {
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryLight: 'rgba(37,99,235,0.1)',
  accent: '#06B6D4',
  bg: '#F8FAFC',
  border: '#E2E8F0',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  surface: '#FFFFFF',
} as const

/* ─── Note Types ─── */
const noteTypes = [
  { key: 'normal',  label: '普通笔记', color: '#2563EB', icon: FileText },
  { key: 'meeting', label: '会议记录', color: '#06B6D4', icon: Users },
  { key: 'project', label: '项目文档', color: '#10B981', icon: Folder },
  { key: 'study',   label: '学习笔记', color: '#F59E0B', icon: BookOpen },
  { key: 'work',    label: '工作日志', color: '#8B5CF6', icon: Clock },
] as const

function getNoteType(key?: string) {
  return noteTypes.find(t => t.key === key) ?? noteTypes[0]
}

function getTemplateContent(typeKey: string, title: string): string {
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  switch (typeKey) {
    case 'meeting':
      return `<h1>${title}</h1><h2>会议信息</h2><table><tbody><tr><th>日期</th><td>${today}</td></tr><tr><th>参会人员</th><td></td></tr><tr><th>会议地点</th><td></td></tr></tbody></table><h2>议题</h2><ol><li></li></ol><h2>讨论内容</h2><p></p><h2>决议事项</h2><ul><li></li></ul><h2>后续跟进</h2><ul><li></li></ul>`
    case 'project':
      return `<h1>${title}</h1><h2>项目概述</h2><p></p><h2>目标</h2><ul><li></li></ul><h2>技术方案</h2><p></p><h2>任务分解</h2><ul><li></li></ul><h2>时间规划</h2><table><tbody><tr><th>阶段</th><th>时间</th><th>负责人</th></tr><tr><td></td><td></td><td></td></tr></tbody></table><h2>风险与注意事项</h2><ul><li></li></ul>`
    case 'study':
      return `<h1>${title}</h1><h2>学习目标</h2><ul><li></li></ul><h2>核心概念</h2><p></p><h2>要点笔记</h2><p></p><h2>代码示例</h2><pre><code></code></pre><h2>总结与思考</h2><p></p><h2>参考资料</h2><ul><li></li></ul>`
    case 'work':
      return `<h1>${title}</h1><h2>日期：${today}</h2><h2>今日工作内容</h2><ul><li></li></ul><h2>工作进展</h2><p></p><h2>遇到的问题</h2><p></p><h2>明日计划</h2><ul><li></li></ul>`
    default:
      return `<h1>${title}</h1><p></p>`
  }
}

/* ─── Note Item (inside folder) ─── */
function NoteItem({ note, isActive, onSelect, onContextMenu, onNoteSelect }: {
  note: any; isActive: boolean; onSelect: () => void; onContextMenu: (e: React.MouseEvent, note: any) => void; onNoteSelect?: (noteId: string, filePath: string) => void
}) {
  const noteType = getNoteType(note.noteType)
  const TypeIcon = noteType.icon
  return (
    <button
      onClick={() => {
        onSelect()
        // If this is a local file and we have a handler, load the file content
        if (onNoteSelect && note._isLocalFile && note.filePath) {
          onNoteSelect(note.id, note.filePath)
        }
      }}
      onContextMenu={(e) => onContextMenu(e, note)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        paddingLeft: '38px',
        border: 'none',
        borderLeft: `3px solid ${isActive ? C.primary : 'transparent'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: isActive ? C.primaryLight : 'transparent',
        display: 'block',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#F8FAFC' }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <TypeIcon size={12} style={{ color: isActive ? C.primary : noteType.color, flexShrink: 0 }} />
        <span style={{
          fontSize: '12px', fontWeight: 500, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isActive ? C.primary : C.text,
        }}>
          {note.title}
        </span>
        <span style={{
          fontSize: '9px', fontWeight: 500, color: noteType.color,
          background: `${noteType.color}18`, borderRadius: '3px', padding: '1px 5px',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {noteType.label}
        </span>
      </div>
    </button>
  )
}

/* ─── Folder Tree (with notes inside) ─── */
function FolderTree({ folders, filteredNotes, onNoteContextMenu, onNoteSelect, level = 0 }: {
  folders: any[]; filteredNotes: any[]; onNoteContextMenu: (e: React.MouseEvent, note: any) => void; onNoteSelect?: (noteId: string, filePath: string) => void; level?: number
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ f1: true, f2: true, 'local-root': true })
  const selectedFolderId = useAppStore((s) => s.selectedFolderId)
  const setSelectedFolderId = useAppStore((s) => s.setSelectedFolderId)
  const selectedNoteId = useAppStore((s) => s.selectedNoteId)
  const setSelectedNoteId = useAppStore((s) => s.setSelectedNoteId)

  // Sync expanded state when folders prop changes (e.g., when switching to local folders)
  useEffect(() => {
    if (folders.length > 0) {
      setExpanded(prev => {
        const newExpanded = { ...prev }
        // Ensure root folders are expanded
        folders.forEach(f => {
          if (newExpanded[f.id] === undefined) {
            newExpanded[f.id] = true
          }
        })
        return newExpanded
      })
    }
  }, [folders])

  const handleOpenFolder = useCallback((folder: any) => {
    const folderPath = folder.path || '默认笔记目录'
    
    // Show folder path information
    console.log('Opening folder:', folderPath)
    
    // For now, display the path and provide copy functionality
    // In a real Tauri app, this would use shell.open() API
    const message = `文件夹路径:\n${folderPath}\n\n提示：在桌面应用中将自动打开文件管理器`
    
    // Try to copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(folderPath).then(() => {
        alert(`${message}\n\n✓ 路径已复制到剪贴板`)
      }).catch(() => {
        alert(message)
      })
    } else {
      alert(message)
    }
  }, [])

  return (
    <>
      {folders.map((f) => {
        const isSelected = selectedFolderId === f.id
        const isExpanded = expanded[f.id] ?? false
        // Get notes in this folder (use filtered if searching, otherwise all)
        const folderNotes = filteredNotes.filter((n) => n.folderId === f.id)
        // Collect child folder ids recursively
        const getChildFolderIds = (folder: any): string[] => {
          if (!folder.children?.length) return []
          return folder.children.flatMap((c: any) => [c.id, ...getChildFolderIds(c)])
        }
        const childFolderIds = getChildFolderIds(f)
        const hasContent = folderNotes.length > 0 || childFolderIds.some((cid: string) =>
          folders.some((pf: any) => pf.id === cid) // has child folders
        ) || f.children?.length

        return (
          <div key={f.id}>
            <div
              className="folder-row"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '4px 12px',
                paddingLeft: `${12 + level * 16}px`,
                gap: '2px',
              }}
            >
              {/* Expand/Collapse button */}
              <button
                onClick={() => setExpanded((p) => ({ ...p, [f.id]: !p[f.id] }))}
                style={{
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: hasContent ? 'pointer' : 'default',
                  flexShrink: 0,
                  padding: 0,
                  transition: 'background 0.15s',
                  opacity: hasContent ? 1 : 0.3,
                }}
                onMouseEnter={(e) => { if (hasContent) e.currentTarget.style.background = '#E2E8F0' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {isExpanded
                  ? <ChevronDown size={14} style={{ color: C.textSecondary }} />
                  : <ChevronRight size={14} style={{ color: C.textSecondary }} />
                }
              </button>
              {/* Folder name button */}
              <button
                onClick={() => setSelectedFolderId(f.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  border: 'none',
                  background: isSelected ? C.primaryLight : 'transparent',
                  color: isSelected ? C.primary : C.textSecondary,
                  fontWeight: isSelected ? 500 : 400,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                  borderRadius: '6px',
                  minWidth: 0,
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <Folder
                  size={14}
                  style={{ color: isSelected ? C.primary : C.textMuted, flexShrink: 0 }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {f.name}
                </span>
                <span style={{ fontSize: '10px', color: C.textMuted, flexShrink: 0 }}>
                  {folderNotes.length}
                </span>
              </button>

              {/* Open folder button */}
              <button
                onClick={() => handleOpenFolder(f)}
                title="在文件管理器中打开"
                style={{
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                  padding: 0,
                  opacity: 0.4,
                  transition: 'all 0.15s',
                }}
                className="folder-open-btn"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#E2E8F0'
                  e.currentTarget.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.opacity = '0.4'
                }}
              >
                <ExternalLink size={13} style={{ color: C.textSecondary }} />
              </button>
            </div>
            {isExpanded && (
              <>
                {/* Notes inside this folder */}
                {folderNotes.map((note: any) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    isActive={selectedNoteId === note.id}
                    onSelect={() => setSelectedNoteId(note.id)}
                    onContextMenu={onNoteContextMenu}
                    onNoteSelect={onNoteSelect}
                  />
                ))}
                {/* Sub-folders */}
                {f.children?.length ? (
                  <FolderTree 
                    folders={f.children} 
                    filteredNotes={filteredNotes} 
                    onNoteContextMenu={onNoteContextMenu} 
                    onNoteSelect={onNoteSelect}
                    level={level + 1} 
                  />
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ─── Context Menu ─── */
function ContextMenu({ x, y, note, onClose }: { x: number; y: number; note: any; onClose: () => void }) {
  const [showExportSubmenu, setShowExportSubmenu] = useState(false)

  const handleExport = async (format: ExportFormat) => {
    setShowExportSubmenu(false)
    if (!note) return
    const title = note.title || 'untitled'
    const htmlContent = note.content || ''
    await exportNote(title, htmlContent, format)
    onClose()
  }

  const menuItems = [
    { icon: Download, label: '导出为...', action: () => setShowExportSubmenu(true), hasSubmenu: true, danger: false },
    { icon: Edit3, label: '重命名', action: () => {}, danger: false },
    { icon: Trash2, label: '删除', action: () => {}, danger: true },
  ]

  const exportFormats: { format: ExportFormat; label: string; icon: React.ComponentType<{ size?: number }>; ext: string }[] = [
    { format: 'markdown', label: 'Markdown', icon: FileText, ext: '.md' },
    { format: 'html', label: 'HTML', icon: FileCode, ext: '.html' },
    { format: 'word', label: 'Word', icon: FileType, ext: '.doc' },
    { format: 'pdf', label: 'PDF', icon: FileType, ext: '.pdf' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: C.surface,
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        border: `1px solid ${C.border}`,
        padding: '6px 0',
        zIndex: 50,
        minWidth: '180px',
      }}
      onMouseLeave={() => { setShowExportSubmenu(false); onClose() }}
    >
      {menuItems.map(({ icon: Icon, label, action, hasSubmenu, danger }) => (
        <div key={label} style={{ position: 'relative' }}>
          <button
            onClick={() => { action(); if (!hasSubmenu) onClose() }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 14px',
              fontSize: '13px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              color: danger ? C.danger : C.text,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.07)' : '#F8FAFC'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Icon size={15} />
            <span style={{ flex: 1 }}>{label}</span>
            {hasSubmenu && <ChevronRightIcon size={14} style={{ color: C.textMuted }} />}
          </button>

          {/* Export Submenu */}
          {hasSubmenu && showExportSubmenu && (
            <div
              style={{
                position: 'absolute',
                left: '100%',
                top: 0,
                marginLeft: '4px',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                border: `1px solid ${C.border}`,
                padding: '6px',
                minWidth: '160px',
                zIndex: 51,
              }}
            >
              {exportFormats.map(({ format, label, icon: Icon, ext }) => (
                <button
                  key={format}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleExport(format)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    color: C.text,
                    textAlign: 'left',
                    transition: 'background 0.15s',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ flexShrink: 0, color: C.primary }}>
                    <Icon size={15} />
                  </div>
                  <span style={{ flex: 1 }}>{label}</span>
                  <span style={{ fontSize: '11px', color: C.textMuted }}>{ext}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Outline extraction ─── */
function OutlineContent({ html }: { html: string }) {
  const headings: { level: number; text: string }[] = []
  const regex = /<h([1-3])[^>]*>(.*?)<\/h[1-3]>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    headings.push({ level: parseInt(match[1]), text: match[2].replace(/<[^>]*>/g, '') })
  }

  const scrollToHeading = (index: number) => {
    const editorEl = document.querySelector('.tiptap')
    if (!editorEl) return
    const headingEls = editorEl.querySelectorAll('h1, h2, h3')
    const target = headingEls[index]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (headings.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: C.textMuted, margin: 0 }}>暂无标题</p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {headings.map((h, i) => (
        <button
          key={i}
          onMouseDown={(e) => { e.preventDefault() }}
          onClick={() => scrollToHeading(i)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            paddingLeft: `${(h.level - 1) * 12 + 8}px`,
            borderRadius: '6px',
            fontSize: '12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: C.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {h.text}
        </button>
      ))}
    </div>
  )
}

/* ─── Main Notes Page ─── */
export default function NotesPage() {
  const {
    notes, selectedNoteId, setSelectedNoteId,
    selectedFolderId, setSelectedFolderId,
    searchQuery, setSearchQuery,
    showOutline, setShowOutline,
    deleteNote,
    updateNote,
  } = useAppStore()

  const folders        = useAppStore((s) => s.folders)
  const addNote        = useAppStore((s) => s.addNote)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; note: any } | null>(null)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createNoteTitle, setCreateNoteTitle] = useState('')
  const [pendingNoteType, setPendingNoteType] = useState('normal')
  const [noteListWidth]             = useState(280)
  const [outlineWidth]              = useState(220)
  const typeMenuRef                 = useRef<HTMLDivElement>(null)
  const createInputRef              = useRef<HTMLInputElement>(null)
  
  // Local folder state (for Tauri desktop app)
  const [selectedLocalFolder, setSelectedLocalFolder] = useState<string | null>(null)
  const [localFolders, setLocalFolders] = useState<import('@/types').NoteFolder[]>([])
  const [localNotes, setLocalNotes] = useState<import('@/types').Note[]>([])
  
  // New folder creation state
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef             = useRef<HTMLInputElement>(null)

  // Close type menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setShowTypeMenu(false)
      }
    }
    if (showTypeMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTypeMenu])

  // When a local folder is selected, use local notes; otherwise use store notes
  const allDisplayNotes = selectedLocalFolder ? localNotes : notes
  const filteredNotes = allDisplayNotes.filter((n) =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedNote = [...notes, ...localNotes].find((n) => n.id === selectedNoteId)

  const handleContextMenu = useCallback((e: React.MouseEvent, note: any) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, note })
  }, [])

  const handleCreateNote = (typeKey: string) => {
    setShowTypeMenu(false)
    setPendingNoteType(typeKey)
    setCreateNoteTitle('')
    setShowCreateDialog(true)
    setTimeout(() => createInputRef.current?.focus(), 50)
  }

  const confirmCreateNote = () => {
    const title = createNoteTitle.trim()
    if (!title) return
    setShowCreateDialog(false)
    const now = new Date().toISOString()
    const newNote = {
      id: `note-${Date.now()}`,
      title,
      content: getTemplateContent(pendingNoteType, title),
      folderId: selectedFolderId || 'f1',
      filePath: '/未分类',
      tags: [] as string[],
      createdAt: now,
      updatedAt: now,
      noteType: pendingNoteType,
    }
    addNote(newNote)
    setSelectedNoteId(newNote.id)
  }

  // Recursively scan a directory to build folder tree and collect note files
  const scanDirectory = useCallback(async (dirPath: string, parentId: string | null, parentPath: string): Promise<{ folders: import('@/types').NoteFolder[]; notes: import('@/types').Note[] }> => {
    const folders: import('@/types').NoteFolder[] = []
    const notes: import('@/types').Note[] = []

    const scan = async (currentPath: string, currentParentId: string | null): Promise<void> => {
      try {
        console.log(`[scanDirectory] Reading: ${currentPath}`)
        const entries = await readDir(currentPath)
        console.log(`[scanDirectory] Found ${entries.length} entries in ${currentPath}:`, entries.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
        
        // Sort: directories first, then files, alphabetically within each group
        const dirs = entries.filter(e => e.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
        const files = entries.filter(e => e.isFile).sort((a, b) => a.name.localeCompare(b.name))
        console.log(`[scanDirectory] Dirs: ${dirs.length}, Files: ${files.length}`)

        // Process files
        for (const entry of files) {
          const name = entry.name.toLowerCase()
          if (name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.html')) {
            const fullPath = currentPath + '/' + entry.name
            const now = new Date().toISOString()
            notes.push({
              id: `local-${fullPath}`,
              title: entry.name.replace(/\.(md|txt|html)$/i, ''),
              content: '', // Will be loaded on demand when selected
              filePath: fullPath,
              createdAt: now,
              updatedAt: now,
              noteType: 'normal',
              folderId: currentParentId || 'local-root',
              tags: [] as string[],
              _isLocalFile: true,
            } as any)
          }
        }

        // Process subdirectories recursively
        for (const dir of dirs) {
          // Skip hidden directories
          if (dir.name.startsWith('.')) continue
          const subPath = currentPath + '/' + dir.name
          const folderId = `local-folder-${subPath}`
          console.log(`[scanDirectory] Adding folder: ${dir.name}, id=${folderId}, parentId=${currentParentId}`)
          folders.push({
            id: folderId,
            name: dir.name,
            parentId: currentParentId,
            path: subPath,
            expanded: false,
            children: [],
          })
          await scan(subPath, folderId)
        }
      } catch (err) {
        console.warn(`Failed to read directory ${currentPath}:`, err)
      }
    }

    await scan(dirPath, parentId || 'local-root')
    console.log(`[scanDirectory] Result: ${folders.length} folders, ${notes.length} notes`)
    return { folders, notes }
  }, [])

  const handleSelectLocalFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择笔记文件夹',
      })
      
      if (selected && typeof selected === 'string') {
        setSelectedLocalFolder(selected)
        
        // Recursively scan the selected directory
        const result = await scanDirectory(selected, null, selected)
        
        console.log(`[handleSelectLocalFolder] Scan result: ${result.folders.length} folders, ${result.notes.length} notes`)
        console.log(`[handleSelectLocalFolder] Folders:`, result.folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId })))
        
        // Create a root folder entry for the selected directory
        const rootFolderName = selected.split('/').pop() || selected.split('\\').pop() || selected
        const rootFolder: import('@/types').NoteFolder = {
          id: 'local-root',
          name: rootFolderName,
          parentId: null,
          path: selected,
          expanded: true,
          children: [],
        }
        
        // Build the children references for nested folders
        const buildChildren = (folder: import('@/types').NoteFolder, allFolders: import('@/types').NoteFolder[]) => {
          const children = allFolders.filter(f => f.parentId === folder.id)
          console.log(`[buildChildren] Folder ${folder.id} (${folder.name}) has ${children.length} children`)
          folder.children = children.map(f => {
            const child = { ...f }
            buildChildren(child, allFolders)
            return child
          })
        }
        buildChildren(rootFolder, result.folders)
        
        console.log(`[handleSelectLocalFolder] Root folder children count: ${rootFolder.children?.length || 0}`)
        console.log(`[handleSelectLocalFolder] Final localFolders:`, [rootFolder])
        
        setLocalFolders([rootFolder])
        setLocalNotes(result.notes)
        
        // Select the root folder
        setSelectedFolderId('local-root')
        
        console.log(`Scanned ${selected}: ${result.folders.length} folders, ${result.notes.length} files`)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      alert('打开文件夹失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [scanDirectory])

  const handleCreateNewFolder = useCallback(() => {
    setShowNewFolderDialog(true)
    setNewFolderName('')
    // Focus input after dialog opens
    setTimeout(() => {
      if (newFolderInputRef.current) {
        newFolderInputRef.current.focus()
      }
    }, 100)
  }, [])

  const confirmCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      alert('请输入文件夹名称')
      return
    }

    const folderName = newFolderName.trim()
    
    // Determine where to create the folder
    let targetPath = ''
    try {
      if (selectedLocalFolder) {
        // Create subfolder in selected folder
        targetPath = `${selectedLocalFolder}/${folderName}`
        await mkdir(targetPath)
      } else {
        // Create in current directory or app data directory
        // For Tauri apps, you might want to use appDataDir from @tauri-apps/api/path
        targetPath = `./${folderName}`
        await mkdir(folderName, { recursive: true })
      }

      console.log(`Created folder: ${targetPath}`)
      
      // Update selected folder to the new one
      setSelectedLocalFolder(targetPath)
      
      setShowNewFolderDialog(false)
      setNewFolderName('')
      
      alert(`文件夹已创建: ${folderName}\n路径: ${targetPath}`)
    } catch (error) {
      console.error('Failed to create folder:', error)
      alert('创建文件夹失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [newFolderName, selectedLocalFolder])

  // Handler for selecting a local file note
  const handleSelectLocalNote = useCallback(async (noteId: string, filePath: string) => {
    try {
      // Read file content
      const content = await readTextFile(filePath)
      
      // Check if it's a local note (in localNotes state) or a store note
      const isLocalNote = localNotes.some(n => n.id === noteId)
      if (isLocalNote) {
        // Update in localNotes state
        setLocalNotes(prev => prev.map(n => 
          n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n
        ))
      } else {
        // Update in store
        updateNote(noteId, { content })
      }
      
      console.log(`Loaded file content: ${filePath}`)
    } catch (error) {
      console.error('Failed to read file:', error)
      alert('读取文件失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [updateNote, localNotes])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ─── Left: Note List ─── */}
      <div
        style={{
          width: noteListWidth,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${C.border}`,
          background: C.surface,
        }}
      >
        {/* 1. Action Buttons Row */}
        <div style={{ padding: '8px', display: 'flex', gap: '8px', position: 'relative' }} ref={typeMenuRef}>
          {/* New Note Button */}
          <button
            onClick={() => setShowTypeMenu((v) => !v)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: C.primary,
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.primaryHover }}
            onMouseLeave={(e) => { e.currentTarget.style.background = C.primary }}
          >
            <Plus size={15} />
            新建笔记
            <ChevronDown
              size={13}
              style={{
                transform: showTypeMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          </button>

          {/* Open Local Folder Button */}
          <button
            onClick={handleSelectLocalFolder}
            title="打开本地文件夹"
            style={{
              width: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              borderRadius: '8px',
              background: selectedLocalFolder ? C.accent : '#F1F5F9',
              color: selectedLocalFolder ? '#FFFFFF' : C.textSecondary,
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { 
              if (!selectedLocalFolder) e.currentTarget.style.background = '#E2E8F0'
              else e.currentTarget.style.background = '#0891B2'
            }}
            onMouseLeave={(e) => { 
              if (!selectedLocalFolder) e.currentTarget.style.background = '#F1F5F9'
              else e.currentTarget.style.background = C.accent
            }}
          >
            <Folder size={18} />
          </button>

          {/* New Folder Button */}
          <button
            onClick={handleCreateNewFolder}
            title="新建文件夹"
            style={{
              width: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              borderRadius: '8px',
              background: '#F1F5F9',
              color: C.textSecondary,
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
          >
            <Plus size={18} />
          </button>

          {/* Type Dropdown Menu */}
          {showTypeMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '8px',
                right: '8px',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                border: `1px solid ${C.border}`,
                padding: '6px',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {noteTypes.map((type) => {
                const Icon = type.icon
                return (
                  <button
                    key={type.key}
                    onClick={() => handleCreateNote(type.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '13px',
                      color: C.text,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${type.color}14`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: type.color,
                        flexShrink: 0,
                      }}
                    />
                    <Icon size={15} style={{ color: type.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>{type.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Local Folder Info */}
        {selectedLocalFolder && (
          <div style={{ 
            padding: '8px 12px', 
            borderBottom: `1px solid ${C.border}`,
            background: '#F8FAFC',
          }}>
            <div style={{ 
              fontSize: '11px', 
              color: C.textMuted,
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span>📁 本地文件夹</span>
              <button
                onClick={() => { setSelectedLocalFolder(null); setLocalFolders([]); setLocalNotes([]) }}
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '10px',
                  color: C.danger,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                清除
              </button>
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: C.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 500,
            }}>
              {selectedLocalFolder}
            </div>
          </div>
        )}

        {/* 2. Search bar */}
        <div style={{ padding: '0 12px 12px', borderBottom: `1px solid ${C.border}` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: C.bg,
              borderRadius: '8px',
              padding: '8px 12px',
            }}
          >
            <Search size={15} style={{ color: C.textMuted, flexShrink: 0 }} />
            <input
              type="text"
              placeholder="搜索笔记..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '13px',
                color: C.text,
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* 3. Folder Tree with notes inside */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <FolderTree
            folders={selectedLocalFolder ? localFolders : folders}
            filteredNotes={filteredNotes}
            onNoteContextMenu={handleContextMenu}
            onNoteSelect={handleSelectLocalNote}
          />

        </div>
      </div>

      {/* ─── Center: Editor ─── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: C.surface,
        }}
      >
        {selectedNote ? (
          <NoteEditor note={selectedNote} />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.textMuted,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <FileText
                size={48}
                style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }}
              />
              <p style={{ fontSize: '14px', margin: 0 }}>选择一篇笔记开始编辑</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Right: Outline ─── */}
      {showOutline && selectedNote && (
        <div
          style={{
            width: outlineWidth,
            flexShrink: 0,
            borderLeft: `1px solid ${C.border}`,
            background: C.surface,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Outline header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>大纲</span>
            <button
              onClick={() => setShowOutline(false)}
              style={{
                padding: '4px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <PanelRightClose size={15} style={{ color: C.textMuted }} />
            </button>
          </div>
          {/* Outline body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            <OutlineContent html={selectedNote.content} />
          </div>
        </div>
      )}

      {/* Outline toggle button (when panel is closed) */}
      {!showOutline && (
        <button
          onClick={() => setShowOutline(true)}
          style={{
            position: 'fixed',
            right: '16px',
            top: '64px',
            padding: '8px',
            borderRadius: '8px',
            background: C.surface,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: `1px solid ${C.border}`,
            cursor: 'pointer',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.surface }}
        >
          <PanelRightOpen size={16} style={{ color: C.textSecondary }} />
        </button>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} note={ctxMenu.note} onClose={() => setCtxMenu(null)} />
      )}

      {/* ─── Note Creation Dialog ─── */}
      {showCreateDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowCreateDialog(false)}
        >
          <div
            style={{
              background: C.surface,
              borderRadius: '14px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              padding: '24px',
              width: '400px',
              maxWidth: '90vw',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '16px', fontWeight: 600, color: C.text, marginBottom: '16px' }}>
              新建{getNoteType(pendingNoteType).label}
            </div>
            <input
              ref={createInputRef}
              type="text"
              placeholder="请输入笔记名称..."
              value={createNoteTitle}
              onChange={(e) => setCreateNoteTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreateNote()
                if (e.key === 'Escape') setShowCreateDialog(false)
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: `1px solid ${C.border}`,
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                color: C.text,
                background: C.bg,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.primary }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.border }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setShowCreateDialog(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${C.border}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  color: C.textSecondary,
                }}
              >
                取消
              </button>
              <button
                onClick={confirmCreateNote}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: createNoteTitle.trim() ? C.primary : C.textMuted,
                  cursor: createNoteTitle.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  color: '#FFFFFF',
                  fontWeight: 500,
                }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      <HistoryModal />

      {/* ── New Folder Dialog ─── */}
      {showNewFolderDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowNewFolderDialog(false)}
        >
          <div
            style={{
              width: '400px',
              background: C.surface,
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: C.text }}>
              新建文件夹
            </h3>
            
            <p style={{ 
              margin: '0 0 16px', 
              fontSize: '13px', 
              color: C.textSecondary,
              lineHeight: 1.5,
            }}>
              {selectedLocalFolder 
                ? `将在 "${selectedLocalFolder}" 中创建子文件夹`
                : '将在应用目录下创建新文件夹'}
            </p>

            <input
              ref={newFolderInputRef}
              type="text"
              placeholder="输入文件夹名称..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmCreateFolder()
                } else if (e.key === 'Escape') {
                  setShowNewFolderDialog(false)
                }
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${C.border}`,
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewFolderDialog(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${C.border}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  color: C.textSecondary,
                }}
              >
                取消
              </button>
              <button
                onClick={confirmCreateFolder}
                disabled={!newFolderName.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: newFolderName.trim() ? C.primary : C.textMuted,
                  cursor: newFolderName.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  color: '#FFFFFF',
                  fontWeight: 500,
                }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
