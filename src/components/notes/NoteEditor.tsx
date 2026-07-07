import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import { FontSize } from '@/extensions/FontSize'
import { SlashCommand } from './SlashCommand'
import type { Note } from '@/types'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, CodeSquare,
  Link2, Image as ImageIcon, Highlighter, Palette, ChevronDown,
  Undo, Redo, Minus, Download, FileText, FileCode, FileType, Clock,
  AlignLeft, AlignCenter, AlignRight, Plus, Trash2, Table as TableIcon, X,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react'
import { useEffect, useState, useRef, useCallback } from 'react'
import { exportNote, type ExportFormat } from '@/utils/exportNote'
import { syncHistoryToRemote, restoreHistoryFromRemote } from '@/utils/sync'
import { useAppStore } from '@/store'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

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

interface NoteEditorProps {
  note: Note
}

export default function NoteEditor({ note }: NoteEditorProps) {
  const { updateNote, addHistoryEntry, setShowHistory, settings } = useAppStore()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const baselineContentRef = useRef<string>(note.content || '')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: '开始输入内容...' }),
      Image,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      SlashCommand,
    ],
    content: note.content,
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
    onUpdate: ({ editor }) => {
      // Debounced auto-save (1.5 seconds after last edit)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const content = editor.getHTML()
        // Only save if content actually changed from the baseline (last loaded/saved content)
        if (content !== baselineContentRef.current) {
          // Update note in store
          updateNote(note.id, { content })
          
          // If this is a local file, write back to source file using Tauri API
          if ((note as any)._isLocalFile) {
            const filePath = (note as any).filePath as string
            try {
              // Convert HTML back to Markdown for .md files
              let fileContent = content
              if (filePath.toLowerCase().endsWith('.md')) {
                const turndown = new TurndownService({
                  headingStyle: 'atx',
                  codeBlockStyle: 'fenced',
                  bulletListMarker: '-',
                })
                turndown.use(gfm)
                fileContent = turndown.turndown(content)
              }
              await writeTextFile(filePath, fileContent)
              console.log(`[Tauri] Successfully wrote to file: ${filePath}`)
            } catch (error) {
              console.error(`[Tauri] Failed to write to file: ${filePath}`, error)
            }
          }
          // Update baseline after saving
          baselineContentRef.current = content
        }
      }, 1500)
    },
  })

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (editor && note.content !== editor.getHTML()) {
      console.log(`[NoteEditor] Syncing content for note ${note.id}, content length: ${note.content?.length || 0}`)
      editor.commands.setContent(note.content)
      // Update baseline so auto-save won't trigger for this content
      baselineContentRef.current = note.content || ''
      console.log(`[NoteEditor] Content set and baseline updated`)
    }
  }, [note.id, note.content])

  if (!editor) return null

  const handleExport = async (format: ExportFormat) => {
    setShowExportMenu(false)
    const title = note.title || 'untitled'
    const htmlContent = editor.getHTML()
    await exportNote(title, htmlContent, format)
  }

  // Manual history creation
  const handleCreateHistory = async () => {
    const syncType = settings.syncConfig.type
    
    if (syncType === 'local') {
      // Local mode: create local history entry
      addHistoryEntry({
        noteId: note.id,
        title: note.title,
        content: editor.getHTML(),
        action: 'edit',
      })
    } else {
      // Remote mode: sync to remote instead of creating local history
      const success = await syncHistoryToRemote(settings.syncConfig, {
        noteId: note.id,
        title: note.title,
        content: editor.getHTML(),
        action: 'edit',
      })
      
      if (success) {
        // Show success message (you can replace with a toast notification)
        console.log('History synced to remote successfully')
      } else {
        console.error('Failed to sync history to remote')
      }
    }
  }

  // Open history modal
  const handleOpenHistory = async () => {
    const syncType = settings.syncConfig.type
    
    if (syncType !== 'local') {
      // Remote mode: fetch history from remote first
      const remoteHistory = await restoreHistoryFromRemote(settings.syncConfig, note.id)
      
      if (remoteHistory) {
        // TODO: Merge remote history with local history or show it separately
        // For now, just open the history modal with existing local history
        console.log('Fetched remote history:', remoteHistory.length, 'entries')
      } else {
        console.warn('Failed to fetch remote history')
      }
    }
    
    // Open history modal (works for both local and remote modes)
    setShowHistory(true)
  }

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExportMenu])

  // Color picker functionality
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  const presetColors = [
    '#000000', '#434343', '#666666', '#999999', '#CCCCCC', '#EFEFEF', '#F3F3F3', '#FFFFFF',
    '#FF0000', '#FF5733', '#FF914D', '#FFDA79', '#FFE082', '#FFFF00', '#A3E635', '#4ADE80',
    '#22D3EE', '#3B82F6', '#2563EB', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#FB7185',
  ]

  const handleColorChange = (color: string) => {
    editor.chain().focus().setColor(color).run()
    setShowColorPicker(false)
  }

  // Close color picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false)
      }
    }
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColorPicker])

  // Font family functionality
  const [showFontFamilyMenu, setShowFontFamilyMenu] = useState(false)
  const fontFamilyRef = useRef<HTMLDivElement>(null)

  const fontFamilies = [
    { label: '默认', value: '' },
    { label: 'Arial', value: 'Arial' },
    { label: 'Times New Roman', value: 'Times New Roman' },
    { label: 'Courier New', value: 'Courier New' },
    { label: 'Georgia', value: 'Georgia' },
    { label: 'Verdana', value: 'Verdana' },
    { label: '微软雅黑', value: 'Microsoft YaHei' },
    { label: '宋体', value: 'SimSun' },
    { label: '黑体', value: 'SimHei' },
    { label: '楷体', value: 'KaiTi' },
  ]

  const handleFontFamilyChange = (font: string) => {
    editor.chain().focus().setFontFamily(font).run()
    setShowFontFamilyMenu(false)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fontFamilyRef.current && !fontFamilyRef.current.contains(event.target as Node)) {
        setShowFontFamilyMenu(false)
      }
    }
    if (showFontFamilyMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFontFamilyMenu])

  // Font size functionality
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false)
  const fontSizeRef = useRef<HTMLDivElement>(null)

  const fontSizes = [
    { label: '小八', value: '8pt' },
    { label: '小九', value: '9pt' },
    { label: '十号', value: '10pt' },
    { label: '十一', value: '11pt' },
    { label: '十二', value: '12pt' },
    { label: '十四', value: '14pt' },
    { label: '十六', value: '16pt' },
    { label: '十八', value: '18pt' },
    { label: '二十', value: '20pt' },
    { label: '二十四', value: '24pt' },
    { label: '三十六', value: '36pt' },
    { label: '四十八', value: '48pt' },
  ]

  const handleFontSizeChange = (size: string) => {
    editor.chain().focus().setFontSize(size).run()
    setShowFontSizeMenu(false)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fontSizeRef.current && !fontSizeRef.current.contains(event.target as Node)) {
        setShowFontSizeMenu(false)
      }
    }
    if (showFontSizeMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFontSizeMenu])

  // Cell background color functionality
  const [showCellColorPicker, setShowCellColorPicker] = useState(false)
  const cellColorRef = useRef<HTMLDivElement>(null)

  const cellColors = [
    '#FFFFFF', '#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1',
    '#FEE2E2', '#FECACA', '#FCA5A5', '#F87171', '#EF4444',
    '#FEF3C7', '#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B',
    '#D1FAE5', '#A7F3D0', '#6EE7B7', '#34D399', '#10B981',
    '#DBEAFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6',
    '#EDE9FE', '#DDD6FE', '#C4B5FD', '#A78BFA', '#8B5CF6',
  ]

  const handleCellColorChange = (color: string) => {
    editor.chain().focus().setCellAttribute('background', color).run()
    setShowCellColorPicker(false)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cellColorRef.current && !cellColorRef.current.contains(event.target as Node)) {
        setShowCellColorPicker(false)
      }
    }
    if (showCellColorPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCellColorPicker])

  // Context menu for table
  const [showTableContextMenu, setShowTableContextMenu] = useState(false)
  const [tableContextMenuPos, setTableContextMenuPos] = useState({ x: 0, y: 0 })
  const tableContextMenuRef = useRef<HTMLDivElement>(null)

  // Insert row/column dropdown menu
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const insertMenuRef = useRef<HTMLDivElement>(null)

  // Delete row/column dropdown menu
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const deleteMenuRef = useRef<HTMLDivElement>(null)

  const handleEditorContextMenu = (event: React.MouseEvent) => {
    if (editor.isActive('table')) {
      event.preventDefault()
      setTableContextMenuPos({ x: event.clientX, y: event.clientY })
      setShowTableContextMenu(true)
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tableContextMenuRef.current && !tableContextMenuRef.current.contains(event.target as Node)) {
        setShowTableContextMenu(false)
      }
      if (insertMenuRef.current && !insertMenuRef.current.contains(event.target as Node)) {
        setShowInsertMenu(false)
      }
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setShowDeleteMenu(false)
      }
    }
    if (showTableContextMenu || showInsertMenu || showDeleteMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTableContextMenu, showInsertMenu, showDeleteMenu])

  // Text selection context menu
  const [showTextContextMenu, setShowTextContextMenu] = useState(false)
  const [textContextMenuPos, setTextContextMenuPos] = useState({ x: 0, y: 0 })
  const textContextMenuRef = useRef<HTMLDivElement>(null)

  const handleTextContextMenu = (event: React.MouseEvent) => {
    const selection = editor.state.selection
    const hasSelection = !selection.empty
    
    if (!editor.isActive('table') && hasSelection) {
      event.preventDefault()
      setTextContextMenuPos({ x: event.clientX, y: event.clientY })
      setShowTextContextMenu(true)
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (textContextMenuRef.current && !textContextMenuRef.current.contains(event.target as Node)) {
        setShowTextContextMenu(false)
      }
    }
    if (showTextContextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTextContextMenu])

  const ToolBtn = ({ active, onClick, children, title }: {
    active?: boolean
    onClick: () => void
    children: React.ReactNode
    title: string
  }) => (
    <button
      onMouseDown={(e) => { e.preventDefault() }}
      onClick={onClick}
      title={title}
      style={{
        padding: '6px',
        borderRadius: '6px',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s',
        background: active ? C.primaryLight : 'transparent',
        color: active ? C.primary : C.textSecondary,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = '#F1F5F9'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )

  const Divider = () => (
    <div
      style={{
        width: '1px',
        height: '20px',
        background: C.border,
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ─── Title Section ─── */}
      <div
        style={{
          padding: '16px 24px 8px',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <input
          type="text"
          defaultValue={note.title}
          placeholder="笔记标题"
          style={{
            width: '100%',
            fontSize: '20px',
            fontWeight: 700,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: C.text,
            fontFamily: 'inherit',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '4px',
            fontSize: '11px',
            color: C.textMuted,
          }}
        >
          <span>路径: {note.filePath}</span>
          <span>·</span>
          <span>更新于 {new Date(note.updatedAt).toLocaleString('zh-CN')}</span>
        </div>
      </div>

      {/* ─── Toolbar ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          padding: '8px 16px',
          borderBottom: `1px solid ${C.border}`,
          overflowX: 'auto',
        }}
      >
        <ToolBtn title="撤销" onClick={() => editor.chain().focus().undo().run()}>
          <Undo size={16} />
        </ToolBtn>
        <ToolBtn title="重做" onClick={() => editor.chain().focus().redo().run()}>
          <Redo size={16} />
        </ToolBtn>

        <Divider />

        <ToolBtn
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="标题 1"
        >
          <Heading1 size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="标题 2"
        >
          <Heading2 size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="标题 3"
        >
          <Heading3 size={16} />
        </ToolBtn>

        <Divider />

        {/* Font Family Selector */}
        <div style={{ position: 'relative' }} ref={fontFamilyRef}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowFontFamilyMenu((v) => !v)}
            title="字体"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              background: showFontFamilyMenu ? C.primaryLight : 'transparent',
              color: showFontFamilyMenu ? C.primary : C.textSecondary,
              transition: 'background 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!showFontFamilyMenu) e.currentTarget.style.background = '#F1F5F9'
            }}
            onMouseLeave={(e) => {
              if (!showFontFamilyMenu) e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>字体</span>
            <ChevronDown size={12} />
          </button>

          {showFontFamilyMenu && (
            <div
              style={{
                position: 'fixed',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                border: `1px solid ${C.border}`,
                padding: '6px',
                zIndex: 9999,
                minWidth: '140px',
              }}
              ref={(el) => {
                if (el && fontFamilyRef.current) {
                  const rect = fontFamilyRef.current.getBoundingClientRect()
                  el.style.top = `${rect.bottom + 4}px`
                  el.style.left = `${rect.left}px`
                }
              }}
            >
              {fontFamilies.map(({ label, value }) => (
                <button
                  key={value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFontFamilyChange(value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: value || 'inherit',
                    fontSize: '13px',
                    color: C.text,
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font Size Selector */}
        <div style={{ position: 'relative' }} ref={fontSizeRef}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowFontSizeMenu((v) => !v)}
            title="字号"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              background: showFontSizeMenu ? C.primaryLight : 'transparent',
              color: showFontSizeMenu ? C.primary : C.textSecondary,
              transition: 'background 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!showFontSizeMenu) e.currentTarget.style.background = '#F1F5F9'
            }}
            onMouseLeave={(e) => {
              if (!showFontSizeMenu) e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>字号</span>
            <ChevronDown size={12} />
          </button>

          {showFontSizeMenu && (
            <div
              style={{
                position: 'fixed',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                border: `1px solid ${C.border}`,
                padding: '6px',
                zIndex: 9999,
                minWidth: '100px',
              }}
              ref={(el) => {
                if (el && fontSizeRef.current) {
                  const rect = fontSizeRef.current.getBoundingClientRect()
                  el.style.top = `${rect.bottom + 4}px`
                  el.style.left = `${rect.left}px`
                }
              }}
            >
              {fontSizes.map(({ label, value }) => (
                <button
                  key={value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFontSizeChange(value)}
                  style={{
                    display: 'block',
                    width: '100%',
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
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        <ToolBtn
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="粗体"
        >
          <Bold size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体"
        >
          <Italic size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="下划线"
        >
          <UnderlineIcon size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="删除线"
        >
          <Strikethrough size={16} />
        </ToolBtn>

        <Divider />

        <ToolBtn
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="无序列表"
        >
          <List size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        >
          <ListOrdered size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="引用"
        >
          <Quote size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="行内代码"
        >
          <Code size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="代码块"
        >
          <CodeSquare size={16} />
        </ToolBtn>

        <Divider />

        <ToolBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="分割线"
        >
          <Minus size={16} />
        </ToolBtn>
        <ToolBtn
          onClick={() => {
            const url = prompt('输入链接地址:')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
          title="链接"
        >
          <Link2 size={16} />
        </ToolBtn>
        <ToolBtn
          onClick={() => {
            const url = prompt('输入图片地址:')
            if (url) editor.chain().focus().setImage({ src: url }).run()
          }}
          title="图片"
        >
          <ImageIcon size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="高亮"
        >
          <Highlighter size={16} />
        </ToolBtn>

        <Divider />

        {/* Color Picker */}
        <div style={{ position: 'relative' }} ref={colorPickerRef}>
          <ToolBtn
            onClick={() => setShowColorPicker((v) => !v)}
            title="文本颜色"
          >
            <Palette size={16} />
          </ToolBtn>

          {showColorPicker && (
            <div
              style={{
                position: 'fixed',
                top: 'auto',
                left: 'auto',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                border: `1px solid ${C.border}`,
                padding: '10px',
                zIndex: 9999,
                width: '200px',
              }}
              ref={(el) => {
                if (el && colorPickerRef.current) {
                  const rect = colorPickerRef.current.getBoundingClientRect()
                  el.style.top = `${rect.bottom + 4}px`
                  el.style.left = `${rect.left}px`
                }
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px' }}>
                {presetColors.map((color) => (
                  <button
                    key={color}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleColorChange(color)}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      border: color === '#FFFFFF' ? `1px solid ${C.border}` : 'none',
                      background: color,
                      cursor: 'pointer',
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  />
                ))}
              </div>
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${C.border}` }}>
                <input
                  type="color"
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => handleColorChange(e.target.value)}
                  style={{
                    width: '100%',
                    height: '28px',
                    border: 'none',
                    cursor: 'pointer',
                    background: 'transparent',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* Export Button */}
        <div style={{ position: 'relative' }} ref={exportMenuRef}>
          <ToolBtn
            onClick={() => setShowExportMenu((v) => !v)}
            title="导出笔记"
          >
            <Download size={16} />
          </ToolBtn>

          {showExportMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                border: `1px solid ${C.border}`,
                padding: '6px',
                zIndex: 50,
                minWidth: '160px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {[
                { format: 'markdown' as ExportFormat, label: 'Markdown', icon: FileText, ext: '.md' },
                { format: 'html' as ExportFormat, label: 'HTML', icon: FileCode, ext: '.html' },
                { format: 'word' as ExportFormat, label: 'Word', icon: FileType, ext: '.doc' },
                { format: 'pdf' as ExportFormat, label: 'PDF', icon: FileType, ext: '.pdf' },
              ].map(({ format, label, icon: Icon, ext }) => (
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
                  <Icon size={15} style={{ color: C.primary, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  <span style={{ fontSize: '11px', color: C.textMuted }}>{ext}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Editor Content ─── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <EditorContent 
          editor={editor} 
          onContextMenu={(e) => {
            if (editor.isActive('table')) {
              handleEditorContextMenu(e)
            } else {
              handleTextContextMenu(e)
            }
          }}
        />
      </div>

      {/* Table Floating Toolbar */}
      {showTableContextMenu && (
        <div
          ref={tableContextMenuRef}
          style={{
            position: 'fixed',
            top: Math.max(10, tableContextMenuPos.y - 60),
            left: tableContextMenuPos.x,
            background: C.surface,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: `1px solid ${C.border}`,
            padding: '4px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {/* Close button */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowTableContextMenu(false)}
            title="关闭"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={14} style={{ color: C.textMuted }} />
          </button>

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Text Alignment */}
          {[
            { icon: AlignLeft, label: '左对齐', action: () => editor.chain().focus().setTextAlign('left').run(), active: editor.isActive({ textAlign: 'left' }) },
            { icon: AlignCenter, label: '居中', action: () => editor.chain().focus().setTextAlign('center').run(), active: editor.isActive({ textAlign: 'center' }) },
            { icon: AlignRight, label: '右对齐', action: () => editor.chain().focus().setTextAlign('right').run(), active: editor.isActive({ textAlign: 'right' }) },
          ].map(({ icon: Icon, label, action, active }) => (
            <button
              key={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={action}
              title={label}
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: 'none',
                background: active ? C.primaryLight : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F1F5F9' }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={16} style={{ color: active ? C.primary : C.textSecondary }} />
            </button>
          ))}

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Text Color */}
          <div style={{ position: 'relative' }} ref={colorPickerRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowColorPicker((v) => !v)}
              title="文本颜色"
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: showColorPicker ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showColorPicker ? C.primaryLight : C.surface,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Palette size={16} style={{ color: C.textSecondary }} />
            </button>

            {showColorPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: `1px solid ${C.border}`,
                  padding: '8px',
                  zIndex: 10000,
                  width: '200px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px' }}>
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleColorChange(color)
                        setShowColorPicker(false)
                      }}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        border: color === '#FFFFFF' ? `1px solid ${C.border}` : 'none',
                        background: color,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cell Background Color */}
          <div style={{ position: 'relative' }} ref={cellColorRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowCellColorPicker((v) => !v)}
              title="单元格背景"
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: showCellColorPicker ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showCellColorPicker ? C.primaryLight : C.surface,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <TableIcon size={16} style={{ color: C.textSecondary }} />
            </button>

            {showCellColorPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: `1px solid ${C.border}`,
                  padding: '8px',
                  zIndex: 10000,
                  width: '200px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                  {cellColors.map((color) => (
                    <button
                      key={color}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleCellColorChange(color)
                        setShowCellColorPicker(false)
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '4px',
                        border: color === '#FFFFFF' ? `1px solid ${C.border}` : 'none',
                        background: color,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Insert Row/Column Dropdown */}
          <div style={{ position: 'relative' }} ref={insertMenuRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowInsertMenu((v) => !v)}
              title="插入行/列"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: showInsertMenu ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showInsertMenu ? C.primaryLight : C.surface,
                cursor: 'pointer',
                fontSize: '12px',
                color: C.text,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <Plus size={14} style={{ color: C.textSecondary }} />
              <span>插入</span>
              <ChevronDown size={12} style={{ color: C.textMuted }} />
            </button>

            {showInsertMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: `1px solid ${C.border}`,
                  padding: '4px',
                  zIndex: 10000,
                  minWidth: '140px',
                }}
              >
                {[
                  { icon: ArrowUp, label: '上方插行', action: () => editor.chain().focus().addRowBefore().run() },
                  { icon: ArrowDown, label: '下方插行', action: () => editor.chain().focus().addRowAfter().run() },
                  { icon: ArrowLeft, label: '左侧插列', action: () => editor.chain().focus().addColumnBefore().run() },
                  { icon: ArrowRight, label: '右侧插列', action: () => editor.chain().focus().addColumnAfter().run() },
                ].map(({ icon: Icon, label, action }) => (
                  <button
                    key={label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      action()
                      setShowInsertMenu(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      color: C.text,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon size={14} style={{ color: C.primary }} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delete Row/Column Dropdown */}
          <div style={{ position: 'relative' }} ref={deleteMenuRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowDeleteMenu((v) => !v)}
              title="删除行/列"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: showDeleteMenu ? `1px solid ${C.danger}` : `1px solid ${C.border}`,
                background: showDeleteMenu ? 'rgba(239,68,68,0.1)' : C.surface,
                cursor: 'pointer',
                fontSize: '12px',
                color: C.danger,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <Trash2 size={14} />
              <span>删除</span>
              <ChevronDown size={12} style={{ color: C.textMuted }} />
            </button>

            {showDeleteMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: `1px solid ${C.border}`,
                  padding: '4px',
                  zIndex: 10000,
                  minWidth: '120px',
                }}
              >
                {[
                  { label: '删除行', action: () => editor.chain().focus().deleteRow().run() },
                  { label: '删除列', action: () => editor.chain().focus().deleteColumn().run() },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      action()
                      setShowDeleteMenu(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      color: C.danger,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <Trash2 size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Text Selection Floating Toolbar */}
      {showTextContextMenu && (
        <div
          ref={textContextMenuRef}
          style={{
            position: 'fixed',
            top: Math.max(10, textContextMenuPos.y - 60),
            left: textContextMenuPos.x,
            background: C.surface,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: `1px solid ${C.border}`,
            padding: '4px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {/* Close button */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowTextContextMenu(false)}
            title="关闭"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={14} style={{ color: C.textMuted }} />
          </button>

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Bold, Italic, Underline, Strikethrough */}
          {[
            { icon: Bold, label: '粗体', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
            { icon: Italic, label: '斜体', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
            { icon: UnderlineIcon, label: '下划线', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
            { icon: Strikethrough, label: '删除线', action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike') },
          ].map(({ icon: Icon, label, action, active }) => (
            <button
              key={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={action}
              title={label}
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: 'none',
                background: active ? C.primaryLight : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F1F5F9' }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={16} style={{ color: active ? C.primary : C.textSecondary }} />
            </button>
          ))}

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Highlight */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            title="高亮"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: editor.isActive('highlight') ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
              background: editor.isActive('highlight') ? C.primaryLight : C.surface,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <Highlighter size={16} style={{ color: editor.isActive('highlight') ? C.primary : C.textSecondary }} />
          </button>

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Font Family Dropdown */}
          <div style={{ position: 'relative' }} ref={fontFamilyRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowFontFamilyMenu((v) => !v)}
              title="字体"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: showFontFamilyMenu ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showFontFamilyMenu ? C.primaryLight : C.surface,
                cursor: 'pointer',
                fontSize: '12px',
                color: C.text,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                字体
              </span>
              <ChevronDown size={12} style={{ color: C.textMuted }} />
            </button>

            {showFontFamilyMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: `1px solid ${C.border}`,
                  padding: '4px',
                  zIndex: 10000,
                  minWidth: '120px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {fontFamilies.map(({ label, value }) => (
                  <button
                    key={value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      handleFontFamilyChange(value)
                      setShowFontFamilyMenu(false)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: value || 'inherit',
                      fontSize: '12px',
                      color: C.text,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Font Size Dropdown */}
          <div style={{ position: 'relative' }} ref={fontSizeRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowFontSizeMenu((v) => !v)}
              title="字号"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: showFontSizeMenu ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showFontSizeMenu ? C.primaryLight : C.surface,
                cursor: 'pointer',
                fontSize: '12px',
                color: C.text,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <span>字号</span>
              <ChevronDown size={12} style={{ color: C.textMuted }} />
            </button>

            {showFontSizeMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: `1px solid ${C.border}`,
                  padding: '4px',
                  zIndex: 10000,
                  minWidth: '100px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {fontSizes.map(({ label, value }) => (
                  <button
                    key={value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      handleFontSizeChange(value)
                      setShowFontSizeMenu(false)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      color: C.text,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Text Color */}
          <div style={{ position: 'relative' }} ref={colorPickerRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowColorPicker((v) => !v)}
              title="文本颜色"
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: showColorPicker ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showColorPicker ? C.primaryLight : C.surface,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Palette size={16} style={{ color: C.textSecondary }} />
            </button>

            {showColorPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: `1px solid ${C.border}`,
                  padding: '8px',
                  zIndex: 10000,
                  width: '200px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px' }}>
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleColorChange(color)
                        setShowColorPicker(false)
                      }}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        border: color === '#FFFFFF' ? `1px solid ${C.border}` : 'none',
                        background: color,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tags Bar ─── */}
      <div
        style={{
          padding: '8px 24px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: History buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleCreateHistory}
            title="生成历史记录"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.primary,
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C.primaryLight
              e.currentTarget.style.borderColor = C.primary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = C.surface
              e.currentTarget.style.borderColor = C.border
            }}
          >
            <Clock size={14} />
            <span>生成历史</span>
          </button>

          <button
            onClick={handleOpenHistory}
            title="恢复历史记录"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.textSecondary,
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F1F5F9'
              e.currentTarget.style.borderColor = C.textSecondary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = C.surface
              e.currentTarget.style.borderColor = C.border
            }}
          >
            <Clock size={14} />
            <span>恢复历史</span>
          </button>
        </div>

        {/* Right: Tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: C.textMuted }}>标签:</span>
          {note.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: C.primaryLight,
                color: C.primary,
                fontWeight: 500,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
