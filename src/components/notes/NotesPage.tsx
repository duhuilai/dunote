import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store'
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronRight as ChevronRightIcon, Folder,
  Clock, Upload, Download, Trash2, Edit3, PanelRightOpen, PanelRightClose,
  FileText, FileCode, FileType, Users, BookOpen, ExternalLink, FolderOpen,
  ArrowUp, ArrowDown, X, Loader2, SearchX, Command,
  Pin, PinOff, Tag, Zap, Focus, PencilLine, TextCursorInput, Link2, Sparkles,
} from 'lucide-react'
import NoteEditor from './NoteEditor'
import type { NoteAiBridge } from './noteAiBridge'
import HistoryModal from './HistoryModal'
import QuickSwitcher, { type QuickSwitcherCommand } from './QuickSwitcher'
import QuickCapture from './QuickCapture'
import NoteAiPanel from '@/components/ai/NoteAiPanel'
import { exportNote, exportToDownloads, type ExportFormat } from '@/utils/exportNote'
import { ExportSaveModal } from './ExportSaveModal'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile, mkdir, exists, remove } from '@tauri-apps/plugin-fs'
import { appConfigDir, join, dirname } from '@tauri-apps/api/path'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
// 惰性加载说明：marked 已改为在导入 Markdown 时动态 import，不在顶层引入
import { saveNotePinned, saveNoteTags, saveNoteType, toRelPath } from '@/utils/noteMeta'
import { applyOrder, compareByOrder, reorderIds, shiftId } from '@/utils/noteOrder'
import {
  basenameLocalPath,
  mergeScannedNotes,
  sanitizeFileStem,
  scanLocalTree,
  uniqueHtmlPath,
} from '@/utils/localNotes'
import { escapeHtml, searchNotes, type SearchResult } from '@/utils/noteSearch'
import { buildFolderTree, findFolderNode } from '@/utils/noteTree'
import { normalizeTag, normalizeTagList, sameTags } from '@/utils/noteTags'
import { readEditorPreferences, writeEditorPreferences } from '@/utils/editorPreferences'
import { rememberRecentNote } from '@/utils/noteRecents'
import { extractWikiLinkTitlesFromHtml, normalizeWikiTitle } from '@/utils/wikiLinks'
import type { Note, NoteFolder } from '@/types'
import { useConfirm } from '@/components/ui/ConfirmDialog'

/* ─── Color Tokens ─── */
const C = {
  primary: 'var(--app-primary)',
  primaryHover: 'var(--app-primary-hover)',
  primaryLight: 'var(--app-primary-light)',
  accent: 'var(--app-accent)',
  bg: 'var(--app-bg)',
  border: 'var(--app-border)',
  text: 'var(--app-text)',
  textSecondary: 'var(--app-text-secondary)',
  textMuted: 'var(--app-text-muted)',
  success: 'var(--app-success)',
  warning: 'var(--app-warning)',
  danger: 'var(--app-danger)',
  surface: 'var(--app-surface)',
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

function compareSidebarNotes(a: Note, b: Note): number {
  const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
  if (pinnedDiff !== 0) return pinnedDiff
  return compareByOrder<Note>(
    (note) => (typeof note.order === 'number' ? note.order : Number.MAX_SAFE_INTEGER),
    (note) => note.title || '',
  )(a, b)
}

function getTemplateContent(typeKey: string, title: string): string {
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  const safeTitle = escapeHtml(title)
  switch (typeKey) {
    case 'meeting':
      return `<h1>${safeTitle}</h1><h2>会议信息</h2><table><tbody><tr><th>日期</th><td>${today}</td></tr><tr><th>参会人员</th><td></td></tr><tr><th>会议地点</th><td></td></tr></tbody></table><h2>议题</h2><ol><li></li></ol><h2>讨论内容</h2><p></p><h2>决议事项</h2><ul><li></li></ul><h2>后续跟进</h2><ul><li></li></ul>`
    case 'project':
      return `<h1>${safeTitle}</h1><h2>项目概述</h2><p></p><h2>目标</h2><ul><li></li></ul><h2>技术方案</h2><p></p><h2>任务分解</h2><ul><li></li></ul><h2>时间规划</h2><table><tbody><tr><th>阶段</th><th>时间</th><th>负责人</th></tr><tr><td></td><td></td><td></td></tr></tbody></table><h2>风险与注意事项</h2><ul><li></li></ul>`
    case 'study':
      return `<h1>${safeTitle}</h1><h2>学习目标</h2><ul><li></li></ul><h2>核心概念</h2><p></p><h2>要点笔记</h2><p></p><h2>代码示例</h2><pre><code></code></pre><h2>总结与思考</h2><p></p><h2>参考资料</h2><ul><li></li></ul>`
    case 'work':
      return `<h1>${safeTitle}</h1><h2>日期：${today}</h2><h2>今日工作内容</h2><ul><li></li></ul><h2>工作进展</h2><p></p><h2>遇到的问题</h2><p></p><h2>明日计划</h2><ul><li></li></ul>`
    default:
      return `<h1>${safeTitle}</h1><p></p>`
  }
}

function plainTextToSafeHtml(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => escapeHtml(line))
      return `<p>${lines.join('<br>')}</p>`
    })
    .join('')
}

function getQuickCaptureContent(title: string, content: string): string {
  return `<h1>${escapeHtml(title)}</h1>${plainTextToSafeHtml(content) || '<p></p>'}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], .tiptap')
}

/* ── Note Item (inside folder) ─── */
function NoteItem({ note, isActive, onSelect, onContextMenu, searchSnippet, level = 0, dragProps, dropHint, isDragging }: {
  note: Note; isActive: boolean; onSelect: () => void; onContextMenu: (e: React.MouseEvent, note: Note) => void; searchSnippet?: string; level?: number
  dragProps?: React.HTMLAttributes<HTMLElement> & { draggable?: boolean }
  dropHint?: 'top' | 'bottom' | null
  isDragging?: boolean
}) {
  const noteType = getNoteType(note.noteType)
  const TypeIcon = noteType.icon
  const noteIndent = 28 + level * 20
  const hintShadow = dropHint === 'top'
    ? `inset 0 2px 0 0 ${C.primary}`
    : dropHint === 'bottom'
      ? `inset 0 -2px 0 0 ${C.primary}`
      : 'none'
  return (
    <button
      {...dragProps}
      className="note-list-item"
      onClick={onSelect}
      onContextMenu={(e) => onContextMenu(e, note)}
      aria-current={isActive ? 'page' : undefined}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '7px 12px',
        paddingLeft: `${noteIndent}px`,
        border: 'none',
        borderLeft: `3px solid ${isActive ? C.primary : 'transparent'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: isActive ? C.primaryLight : 'transparent',
        display: 'block',
        transition: 'background 0.15s, border-color 0.15s',
        boxShadow: hintShadow,
        opacity: isDragging ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--app-hover)' }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <TypeIcon size={13} style={{ color: isActive ? C.primary : C.textSecondary, flexShrink: 0 }} />
        <span style={{
          fontSize: '12.5px', fontWeight: 400, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isActive ? C.primary : C.text,
        }}>
          {note.title}
        </span>
        <span style={{
          fontSize: '9px', fontWeight: 500, color: C.textMuted,
          background: 'var(--app-surface-muted)', borderRadius: '3px', padding: '1px 5px',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {noteType.label}
        </span>
        {note.pinned && (
          <Pin
            size={11}
            fill="currentColor"
            aria-label="已固定"
            style={{ color: C.primary, flexShrink: 0 }}
          />
        )}
      </div>
      {searchSnippet && (
        <div style={{
          marginTop: '3px',
          marginLeft: '19px',
          color: C.textSecondary,
          fontSize: '11px',
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          whiteSpace: 'normal',
        }}>
          {searchSnippet}
        </div>
      )}
    </button>
  )
}

/* ─── Folder Tree (with notes inside) ─── */
function FolderTree({ folders, filteredNotes, searchResults, onNoteContextMenu, onCreateSubFolder, onDeleteFolder, onFolderContextMenu, onOpenFolder, onReorderNotes, onReorderFolders, level = 0 }: {
  folders: NoteFolder[]; filteredNotes: Note[]; searchResults?: Map<string, SearchResult>; onNoteContextMenu: (e: React.MouseEvent, note: Note) => void; onCreateSubFolder?: (parentPath: string) => void; onDeleteFolder?: (folder: NoteFolder) => void; onFolderContextMenu?: (e: React.MouseEvent, folder: NoteFolder) => void; onOpenFolder?: (path: string) => void
  onReorderNotes?: (folderId: string, orderedIds: string[]) => void
  onReorderFolders?: (parentId: string | null, orderedIds: string[]) => void
  level?: number
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ f1: true, f2: true, 'local-root': true })
  const selectedFolderId = useAppStore((s) => s.selectedFolderId)
  const setSelectedFolderId = useAppStore((s) => s.setSelectedFolderId)
  const selectedNoteId = useAppStore((s) => s.selectedNoteId)
  const setSelectedNoteId = useAppStore((s) => s.setSelectedNoteId)

  /* ── 拖拽排序（仅同级：同一文件夹内的笔记 / 同一父级下的文件夹） ── */
  const [drag, setDrag] = useState<{ kind: 'note' | 'folder'; id: string; scope: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'top' | 'bottom' } | null>(null)

  const beginDrag = (e: React.DragEvent, kind: 'note' | 'folder', id: string, scope: string) => {
    e.stopPropagation()
    setDrag({ kind, id, scope })
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    } catch { /* Safari 下 setData 可能抛错，忽略 */ }
  }

  const hoverDrag = (e: React.DragEvent, kind: 'note' | 'folder', id: string, scope: string, siblingIds: string[]) => {
    if (!drag || drag.kind !== kind || drag.scope !== scope || drag.id === id) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    // 指示线与真实落点保持一致：向下拖 → 插到目标之后；向上拖 → 插到目标之前
    const pos: 'top' | 'bottom' = siblingIds.indexOf(drag.id) < siblingIds.indexOf(id) ? 'bottom' : 'top'
    setDropTarget((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }))
  }

  const endDrag = () => { setDrag(null); setDropTarget(null) }

  const dropOn = (e: React.DragEvent, kind: 'note' | 'folder', id: string, scope: string, siblingIds: string[]) => {
    if (!drag || drag.kind !== kind || drag.scope !== scope || drag.id === id) { endDrag(); return }
    e.preventDefault()
    e.stopPropagation()
    const next = reorderIds(siblingIds, drag.id, id)
    if (next !== siblingIds) {
      if (kind === 'note') onReorderNotes?.(scope, next)
      else onReorderFolders?.(scope === '__root__' ? null : scope, next)
    }
    endDrag()
  }

  const hintFor = (id: string): 'top' | 'bottom' | null =>
    dropTarget?.id === id ? dropTarget.pos : null

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

  const handleOpenFolder = useCallback((folder: NoteFolder) => {
    if (folder.path) onOpenFolder?.(folder.path)
  }, [onOpenFolder])

  const siblingFolderIds = folders.map((f) => f.id)
  const folderScope = folders.length ? (folders[0].parentId ?? '__root__') : '__root__'
  const foldersDraggable = !!onReorderFolders && folders.length > 1

  return (
    <>
      {folders.map((f) => {
        const isSelected = selectedFolderId === f.id
        const isExpanded = expanded[f.id] ?? false
        // Get notes in this folder (use filtered if searching, otherwise all)
        const folderNotes = filteredNotes
          .filter((n) => n.folderId === f.id)
          .slice()
          .sort(compareSidebarNotes)
        const folderNoteIds = folderNotes.map((n) => n.id)
        const notesDraggable = !!onReorderNotes && folderNotes.length > 1
        const folderHint = hintFor(f.id)
        // Collect child folder ids recursively
        const getChildFolderIds = (folder: NoteFolder): string[] => {
          if (!folder.children?.length) return []
          return folder.children.flatMap((c) => [c.id, ...getChildFolderIds(c)])
        }
        const childFolderIds = getChildFolderIds(f)
        const hasContent = folderNotes.length > 0 || childFolderIds.some((cid: string) =>
          folders.some((pf) => pf.id === cid) // has child folders
        ) || f.children?.length

        return (
          <div key={f.id}>
            <div
              className="folder-row"
              draggable={foldersDraggable}
              onDragStart={foldersDraggable ? (e) => beginDrag(e, 'folder', f.id, folderScope) : undefined}
              onDragOver={foldersDraggable ? (e) => hoverDrag(e, 'folder', f.id, folderScope, siblingFolderIds) : undefined}
              onDrop={foldersDraggable ? (e) => dropOn(e, 'folder', f.id, folderScope, siblingFolderIds) : undefined}
              onDragEnd={foldersDraggable ? endDrag : undefined}
              onContextMenu={(e) => {
                if (onFolderContextMenu) {
                  e.preventDefault()
                  onFolderContextMenu(e, f)
                }
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '3px 12px',
                paddingLeft: `${10 + level * 20}px`,
                gap: '2px',
                boxShadow: folderHint === 'top'
                  ? `inset 0 2px 0 0 ${C.primary}`
                  : folderHint === 'bottom'
                    ? `inset 0 -2px 0 0 ${C.primary}`
                    : 'none',
                opacity: drag?.kind === 'folder' && drag.id === f.id ? 0.4 : 1,
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
                onMouseEnter={(e) => { if (hasContent) e.currentTarget.style.background = 'var(--app-hover)' }}
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
                  color: isSelected ? C.primary : C.text,
                  fontWeight: isSelected ? 600 : 500,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                  borderRadius: '6px',
                  minWidth: 0,
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--app-hover)' }}
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
              {f.path && (
                <button
                  onClick={() => handleOpenFolder(f)}
                  title="在文件管理器中打开"
                  aria-label={`打开文件夹 ${f.name}`}
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
                    e.currentTarget.style.background = 'var(--app-hover)'
                    e.currentTarget.style.opacity = '1'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.opacity = '0.4'
                  }}
                >
                  <ExternalLink size={13} style={{ color: C.textSecondary }} />
                </button>
              )}

              {/* Add sub-folder button */}
              {onCreateSubFolder && f.path && (
                <button
                  onClick={() => {
                    if (f.path) onCreateSubFolder(f.path)
                  }}
                  title="新建子文件夹"
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
                  className="folder-add-btn"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--app-hover)'
                    e.currentTarget.style.opacity = '1'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.opacity = '0.4'
                  }}
                >
                  <Plus size={13} style={{ color: C.textSecondary }} />
                </button>
              )}

              {/* Delete folder button */}
              {onDeleteFolder && f.path && f.id !== 'local-root' && (
                <button
                  onClick={() => onDeleteFolder(f)}
                  title="删除文件夹"
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
                  className="folder-del-btn"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
                    e.currentTarget.style.opacity = '1'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.opacity = '0.4'
                  }}
                >
                  <Trash2 size={13} style={{ color: C.danger }} />
                </button>
              )}
            </div>
            {isExpanded && (
              <>
                {/* Notes inside this folder */}
                {folderNotes.map((note) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    isActive={selectedNoteId === note.id}
                    onSelect={() => setSelectedNoteId(note.id)}
                    onContextMenu={onNoteContextMenu}
                    searchSnippet={searchResults?.get(note.id)?.snippet}
                    level={level + 1}
                    dropHint={hintFor(note.id)}
                    isDragging={drag?.kind === 'note' && drag.id === note.id}
                    dragProps={notesDraggable ? {
                      draggable: true,
                      onDragStart: (e: any) => beginDrag(e, 'note', note.id, f.id),
                      onDragOver: (e: any) => hoverDrag(e, 'note', note.id, f.id, folderNoteIds),
                      onDrop: (e: any) => dropOn(e, 'note', note.id, f.id, folderNoteIds),
                      onDragEnd: endDrag,
                    } : undefined}
                  />
                ))}
                {/* Sub-folders */}
                {f.children?.length ? (
                  <FolderTree 
                    folders={f.children} 
                    filteredNotes={filteredNotes} 
                    searchResults={searchResults}
                    onNoteContextMenu={onNoteContextMenu} 
                    onCreateSubFolder={onCreateSubFolder}
                    onDeleteFolder={onDeleteFolder}
                    onFolderContextMenu={onFolderContextMenu}
                    onOpenFolder={onOpenFolder}
                    onReorderNotes={onReorderNotes}
                    onReorderFolders={onReorderFolders}
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
function ContextMenu({ x, y, note, onClose, onDelete, onRevealFile, onChangeType, onMove, onTogglePinned }: {
  x: number; y: number; note: any; onClose: () => void; onDelete: (note: any) => void; onRevealFile?: (filePath: string) => void; onChangeType?: (note: any, type: string) => void; onMove?: (note: any, delta: -1 | 1) => void; onTogglePinned?: (note: any) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showExportSubmenu, setShowExportSubmenu] = useState(false)
  const [showTypeSubmenu, setShowTypeSubmenu] = useState(false)
  const [exportTarget, setExportTarget] = useState<{ format: ExportFormat; title: string; html: string } | null>(null)
  const showToast = useAppStore((s) => s.showToast)
  const menuWidth = 196
  const menuHeight = 348
  const left = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
  const submenuOnLeft = left + menuWidth + 180 > window.innerWidth

  useEffect(() => {
    if (exportTarget) return
    const handleOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showExportSubmenu || showTypeSubmenu) {
        setShowExportSubmenu(false)
        setShowTypeSubmenu(false)
        return
      }
      onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [exportTarget, onClose, showExportSubmenu, showTypeSubmenu])

  const handleExport = async (format: ExportFormat) => {
    setShowExportSubmenu(false)
    if (!note) return
    const title = note.title || 'untitled'
    let htmlContent = note.content || ''

    // 本地文件：始终以磁盘最新内容为准（列表中的 content 可能陈旧或未加载）
    if (note._isLocalFile && note.filePath) {
      try {
        const disk = await readTextFile(note.filePath as string)
        if (disk && disk.trim()) htmlContent = disk
      } catch (err) {
        console.error('[Export] Failed to read local file:', err)
      }
    }

    if (!htmlContent || !htmlContent.trim()) {
      showToast('该笔记暂无内容可导出', 'info')
      onClose()
      return
    }

    setExportTarget({ format, title, html: htmlContent })
  }

  const canReveal = !!note?._isLocalFile && !!note?.filePath

  const menuItems = [
    { icon: note?.pinned ? PinOff : Pin, label: note?.pinned ? '取消固定' : '固定到顶部', action: () => onTogglePinned?.(note), danger: false, show: !!onTogglePinned },
    { icon: ArrowUp, label: '上移', action: () => onMove?.(note, -1), danger: false, show: !!onMove },
    { icon: ArrowDown, label: '下移', action: () => onMove?.(note, 1), danger: false, show: !!onMove },
    { icon: Download, label: '导出为...', action: () => setShowExportSubmenu(true), hasSubmenu: true, danger: false },
    { icon: FolderOpen, label: '在文件夹查看', action: () => { if (note?.filePath) onRevealFile?.(note.filePath); onClose() }, danger: false, show: canReveal },
    { icon: Edit3, label: '修改笔记类型', action: () => setShowTypeSubmenu(true), hasSubmenu: true, danger: false },
    { icon: Trash2, label: '删除', action: () => onDelete(note), danger: true },
  ]

  const exportFormats: { format: ExportFormat; label: string; icon: React.ComponentType<{ size?: number }>; ext: string }[] = [
    { format: 'markdown', label: 'Markdown 文档', icon: FileText, ext: '.md' },
    { format: 'html', label: 'HTML 网页', icon: FileCode, ext: '.html' },
    { format: 'word', label: 'Word 文档', icon: FileType, ext: '.docx' },
    { format: 'pdf', label: 'PDF 文档', icon: FileType, ext: '.pdf' },
  ]

  const submenuStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    [submenuOnLeft ? 'right' : 'left']: '100%',
    marginLeft: submenuOnLeft ? 0 : 4,
    marginRight: submenuOnLeft ? 4 : 0,
    background: C.surface,
    borderRadius: '10px',
    boxShadow: 'var(--app-shadow)',
    border: `1px solid ${C.border}`,
    padding: '6px',
    minWidth: '168px',
    maxWidth: 'calc(100vw - 16px)',
    zIndex: 61,
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="笔记操作"
      style={{
        position: 'fixed',
        left,
        top,
        background: C.surface,
        borderRadius: '10px',
        boxShadow: 'var(--app-shadow)',
        border: `1px solid ${C.border}`,
        padding: '6px 0',
        zIndex: 60,
        width: menuWidth,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
      }}
    >
      {menuItems.filter(m => m.show !== false).map(({ icon: Icon, label, action, hasSubmenu, danger }) => (
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
              e.currentTarget.style.background = danger ? 'var(--app-danger-bg)' : 'var(--app-hover)'
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
          {hasSubmenu && showExportSubmenu && label === '导出为...' && (
            <div
              role="menu"
              aria-label="导出格式"
              style={submenuStyle}
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
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

          {/* Type Submenu */}
          {hasSubmenu && showTypeSubmenu && label === '修改笔记类型' && (
            <div
              role="menu"
              aria-label="笔记类型"
              style={submenuStyle}
            >
              {noteTypes.map((type) => {
                const Icon = type.icon
                const active = note?.noteType === type.key || (!note?.noteType && type.key === 'normal')
                return (
                  <button
                    key={type.key}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onChangeType?.(note, type.key); onClose() }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: 'none',
                      background: active ? type.color + '14' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '13px',
                      color: active ? type.color : C.text,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--app-hover)' }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon size={15} style={{ color: type.color }} />
                    <span style={{ flex: 1 }}>{type.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {exportTarget && (
        <ExportSaveModal
          format={exportTarget.format}
          defaultTitle={exportTarget.title}
          onClose={() => setExportTarget(null)}
          onSave={async (filename) => {
            try {
              await exportToDownloads(exportTarget.title, exportTarget.html, exportTarget.format, filename)
              showToast(`已导出到下载文件夹：${filename}`, 'success')
              setExportTarget(null)
            } catch (err: any) {
              console.error('[Export] failed:', err)
              showToast('导出失败：' + (err?.message || err), 'error')
            }
          }}
          onChooseOther={async () => {
            try {
              const t = exportTarget
              setExportTarget(null)
              await exportNote(t.title, t.html, t.format)
              showToast('导出成功', 'success')
            } catch (err: any) {
              console.error('[Export] failed:', err)
              showToast('导出失败：' + (err?.message || err), 'error')
            }
          }}
        />
      )}
    </div>,
    document.body,
  )
}

/* ─── Folder Context Menu ─── */
function FolderContextMenu({ x, y, folder, onClose, onImport, onRevealFolder, onMove }: { x: number; y: number; folder: any; onClose: () => void; onImport: (folder: any) => void; onRevealFolder?: (path: string) => void; onMove?: (folder: any, delta: -1 | 1) => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const itemStyle: React.CSSProperties = {
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
    color: C.text,
    transition: 'background 0.15s',
  }
  const canMove = !!onMove && folder?.id !== 'local-root'
  const left = Math.max(8, Math.min(x, window.innerWidth - 184))
  const top = Math.max(8, Math.min(y, window.innerHeight - 190))

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="文件夹操作"
      style={{
        position: 'fixed',
        left,
        top,
        background: C.surface,
        borderRadius: '10px',
        boxShadow: 'var(--app-shadow)',
        border: `1px solid ${C.border}`,
        padding: '6px 0',
        zIndex: 60,
        minWidth: '168px',
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
      }}
    >
      {canMove && (
        <>
          <button
            onClick={() => { onMove?.(folder, -1); onClose() }}
            style={itemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <ArrowUp size={15} />
            <span style={{ flex: 1 }}>上移</span>
          </button>
          <button
            onClick={() => { onMove?.(folder, 1); onClose() }}
            style={itemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <ArrowDown size={15} />
            <span style={{ flex: 1 }}>下移</span>
          </button>
        </>
      )}
      <button
        onClick={() => { onImport(folder); onClose() }}
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
          color: C.text,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <Upload size={15} />
        <span style={{ flex: 1 }}>导入 Markdown 文件</span>
      </button>
      {folder?.path && (
        <button
          onClick={() => { if (folder?.path) onRevealFolder?.(folder.path); onClose() }}
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
            color: C.text,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <FolderOpen size={15} />
          <span style={{ flex: 1 }}>在文件夹查看</span>
        </button>
      )}
    </div>,
    document.body,
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
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {h.text}
        </button>
      ))}
    </div>
  )
}

interface LinkedNoteLink {
  title: string
  note: Note | null
}

function LinkedNotesPanel({
  outgoingLinks,
  backlinks,
  onOpenLink,
  onOpenBacklink,
}: {
  outgoingLinks: LinkedNoteLink[]
  backlinks: Note[]
  onOpenLink: (title: string) => void
  onOpenBacklink: (note: Note) => void
}) {
  if (outgoingLinks.length === 0 && backlinks.length === 0) return null

  return (
    <div className="outline-related">
      {outgoingLinks.length > 0 && (
        <section className="outline-related-section" aria-label="链接笔记">
          <div className="outline-related-heading">
            <Link2 size={13} aria-hidden="true" />
            <span>链接笔记</span>
            <span className="outline-related-count">{outgoingLinks.length}</span>
          </div>
          <div className="outline-related-list">
            {outgoingLinks.map(({ title, note }) => (
              <button
                key={title}
                type="button"
                className={`outline-related-link${note ? '' : ' is-unresolved'}`}
                onClick={() => onOpenLink(title)}
                title={note ? `打开「${title}」` : `创建并打开「${title}」`}
              >
                <span className="outline-related-dot" aria-hidden="true" />
                <span className="outline-related-title">{title}</span>
                {!note && <span className="outline-related-status">新建</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {backlinks.length > 0 && (
        <section className="outline-related-section" aria-label="反向链接">
          <div className="outline-related-heading">
            <Link2 size={13} aria-hidden="true" />
            <span>反向链接</span>
            <span className="outline-related-count">{backlinks.length}</span>
          </div>
          <div className="outline-related-list">
            {backlinks.map((note) => (
              <button
                key={note.id}
                type="button"
                className="outline-related-link"
                onClick={() => onOpenBacklink(note)}
                title={`打开「${note.title || '未命名笔记'}」`}
              >
                <span className="outline-related-dot" aria-hidden="true" />
                <span className="outline-related-title">{note.title || '未命名笔记'}</span>
              </button>
            ))}
          </div>
        </section>
      )}
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
    addHistoryEntry,
    setNotePinned,
  } = useAppStore()

  const confirm = useConfirm()

  const folders        = useAppStore((s) => s.folders)
  const addNote        = useAppStore((s) => s.addNote)
  const showToast      = useAppStore((s) => s.showToast)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; note: any } | null>(null)
  const [folderCtxMenu, setFolderCtxMenu] = useState<{ x: number; y: number; folder: any } | null>(null)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createNoteTitle, setCreateNoteTitle] = useState('')
  const [pendingNoteType, setPendingNoteType] = useState('normal')
  const typeMenuRef                 = useRef<HTMLDivElement>(null)
  const createInputRef              = useRef<HTMLInputElement>(null)
  const searchInputRef              = useRef<HTMLInputElement>(null)
  const searchRequestRef            = useRef(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  const [showQuickCapture, setShowQuickCapture] = useState(false)
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [readingMode, setReadingMode] = useState(false)
  const [typewriterMode, setTypewriterMode] = useState(() => readEditorPreferences().typewriterMode)
  const [showNoteAi, setShowNoteAi] = useState(false)
  const [noteAiBridge, setNoteAiBridge] = useState<NoteAiBridge | null>(null)
  
  // Local folder state (for Tauri desktop app)
  const [selectedLocalFolder, setSelectedLocalFolder] = useState<string | null>(null)
  const [localFolders, setLocalFolders] = useState<import('@/types').NoteFolder[]>([])
  const [localNotes, setLocalNotes] = useState<import('@/types').Note[]>([])
  // 恢复历史后 +1，强制 NoteEditor 重新加载当前笔记内容（note.id 不变时也刷新）
  const [reloadToken, setReloadToken] = useState(0)
  /** 历史弹窗打开时默认落在的页签（「实时历史恢复」按钮会指定 snapshots） */
  const [historyInitialTab, setHistoryInitialTab] = useState<'history' | 'snapshots'>('history')
  // 上次打开的文件夹无法访问（macOS 升级后 TCC 授权失效 / 目录被移动删除）时的提示
  const [folderAccessError, setFolderAccessError] = useState<string | null>(null)

  // 将当前打开的本地根文件夹同步到全局 store，供 Gitee 同步按相对路径分层存储
  const setLocalRootFolder = useAppStore((s) => s.setLocalRootFolder)
  useEffect(() => {
    setLocalRootFolder(selectedLocalFolder)
  }, [selectedLocalFolder, setLocalRootFolder])

  useEffect(() => {
    writeEditorPreferences({ typewriterMode })
  }, [typewriterMode])

  useEffect(() => {
    if (!selectedNoteId) setReadingMode(false)
  }, [selectedNoteId])

  useEffect(() => {
    if (!selectedNoteId) setShowNoteAi(false)
  }, [selectedNoteId])

  useEffect(() => {
    if (focusMode) setShowNoteAi(false)
  }, [focusMode])

  useEffect(() => {
    if (selectedNoteId) rememberRecentNote(selectedNoteId)
  }, [selectedNoteId])

  // New folder creation state
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newSubFolderParentPath, setNewSubFolderParentPath] = useState<string | null>(null)
  const newFolderInputRef             = useRef<HTMLInputElement>(null)

  // ─── Persist selected folder across sessions ───
  const CONFIG_FILE = 'dunote-config.json'

  // Absolute path to the persisted config file inside the AppConfig dir.
  // We create the dir before writing so writeTextFile never fails on a missing parent.
  const getConfigPath = useCallback(async () => join(await appConfigDir(), CONFIG_FILE), [])

  const refreshLocalTree = useCallback(async (root: string) => {
    const result = await scanLocalTree(root)
    setLocalFolders([{ ...result.rootFolder, expanded: true }])
    setLocalNotes((previous) => mergeScannedNotes(result.notes, previous))
    return result
  }, [])

  // Load saved folder on mount
  useEffect(() => {
    (async () => {
      try {
        const configPath = await getConfigPath()
        const configExists = await exists(configPath)
        if (configExists) {
          const raw = await readTextFile(configPath)
          const config = JSON.parse(raw)
          if (config.lastLocalFolder) {
            console.log(`[Persistence] Restoring folder: ${config.lastLocalFolder}`)
            // 先探测根目录是否真的可读：macOS 上 App 升级后代码签名变化会导致
            // 系统撤销之前授予的文件夹访问权限（TCC），此时 readDir 会直接抛错。
            // 不探测的话只会得到一棵空树，用户会以为笔记全丢了。
            try {
              await readDir(config.lastLocalFolder)
            } catch (probeErr) {
              console.warn('[Persistence] Folder not accessible:', probeErr)
              setFolderAccessError(config.lastLocalFolder)
              return
            }
            const result = await refreshLocalTree(config.lastLocalFolder)
            setSelectedLocalFolder(config.lastLocalFolder)
            setFolderAccessError(null)
            const requestedFolderId = typeof config.lastSelectedFolderId === 'string'
              ? config.lastSelectedFolderId
              : 'local-root'
            const folderStillExists = requestedFolderId === 'local-root'
              || !!findFolderNode([result.rootFolder], requestedFolderId)
            setSelectedFolderId(folderStillExists ? requestedFolderId : 'local-root')
            if (config.lastSelectedNoteId && result.notes.some((note) => note.id === config.lastSelectedNoteId)) {
              setSelectedNoteId(config.lastSelectedNoteId)
            } else {
              setSelectedNoteId(null)
            }
          }
        }
      } catch (err) {
        console.warn('[Persistence] Failed to load config:', err)
      }
    })()
  }, [getConfigPath, refreshLocalTree, setSelectedFolderId, setSelectedNoteId])

  // Save folder path when it changes
  useEffect(() => {
    if (selectedLocalFolder) {
      (async () => {
        try {
          const config = { 
            lastLocalFolder: selectedLocalFolder,
            lastSelectedFolderId: selectedFolderId,
            lastSelectedNoteId: selectedNoteId,
          }
          const configDir = await appConfigDir()
          await mkdir(configDir, { recursive: true })
          const configPath = await getConfigPath()
          await writeTextFile(configPath, JSON.stringify(config, null, 2))
          console.log(`[Persistence] Saved folder: ${selectedLocalFolder}, selectedId: ${selectedFolderId}, noteId: ${selectedNoteId}`)
        } catch (err) {
          console.warn('[Persistence] Failed to save config:', err)
        }
      })()
    }
  }, [selectedLocalFolder, selectedFolderId, selectedNoteId, getConfigPath])

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
  const normalizedSearchQuery = searchQuery.trim()
  const tagFacets = useMemo(() => {
    const counts = new Map<string, { tag: string; count: number }>()
    for (const note of allDisplayNotes) {
      for (const rawTag of note.tags || []) {
        const tag = normalizeTag(rawTag)
        if (!tag) continue
        const key = tag.toLocaleLowerCase('zh-CN')
        const current = counts.get(key)
        counts.set(key, {
          tag: current?.tag || tag,
          count: (current?.count || 0) + 1,
        })
      }
    }
    return Array.from(counts.values()).sort((left, right) => (
      right.count - left.count || left.tag.localeCompare(right.tag, 'zh-CN')
    ))
  }, [allDisplayNotes])

  const activeTagKey = activeTagFilter?.toLocaleLowerCase('zh-CN')
  const tagFilteredNotes = useMemo(() => {
    if (!activeTagKey) return allDisplayNotes
    return allDisplayNotes.filter((note) => (
      (note.tags || []).some((tag) => tag.toLocaleLowerCase('zh-CN') === activeTagKey)
    ))
  }, [activeTagKey, allDisplayNotes])

  useEffect(() => {
    setActiveTagFilter(null)
  }, [selectedLocalFolder])

  useEffect(() => {
    if (!activeTagFilter) return
    if (!tagFacets.some((facet) => (
      facet.tag.toLocaleLowerCase('zh-CN') === activeTagFilter.toLocaleLowerCase('zh-CN')
    ))) {
      setActiveTagFilter(null)
    }
  }, [activeTagFilter, tagFacets])

  useEffect(() => {
    const requestId = ++searchRequestRef.current
    if (!normalizedSearchQuery) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = window.setTimeout(() => {
      void searchNotes(tagFilteredNotes, normalizedSearchQuery)
        .then((results) => {
          if (requestId !== searchRequestRef.current) return
          setSearchResults(results)
        })
        .catch((error) => {
          if (requestId !== searchRequestRef.current) return
          console.error('[Search] failed:', error)
          setSearchResults([])
          showToast('搜索笔记失败，请稍后重试', 'error')
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) setIsSearching(false)
        })
    }, 250)

    return () => window.clearTimeout(timer)
  }, [normalizedSearchQuery, showToast, tagFilteredNotes])

  const filteredNotes = normalizedSearchQuery
    ? searchResults.map((result) => result.note)
    : tagFilteredNotes

  const searchResultMap = useMemo(
    () => new Map(searchResults.map((result) => [result.note.id, result])),
    [searchResults],
  )

  const displayFolders = useMemo<NoteFolder[]>(() => {
    if (selectedLocalFolder) return localFolders
    const regularTree = buildFolderTree(folders)
    return [
      { id: '', name: '未分类', parentId: null, children: [], order: -1 },
      ...regularTree,
    ]
  }, [folders, localFolders, selectedLocalFolder])

  // 缓存选中笔记：避免每次渲染都新建合并数组并线性查找（笔记数量多时是 O(n) 的重复开销）
  const selectedNote = useMemo(
    () => [...notes, ...localNotes].find((n) => n.id === selectedNoteId),
    [notes, localNotes, selectedNoteId],
  )
  const selectedNoteAiBridge = noteAiBridge?.noteId === selectedNote?.id
    ? noteAiBridge
    : null

  const wikiNoteByTitle = useMemo(() => {
    const index = new Map<string, Note>()
    for (const note of allDisplayNotes) {
      const key = normalizeWikiTitle(note.title || '')
      if (key && !index.has(key)) index.set(key, note)
    }
    return index
  }, [allDisplayNotes])

  const outgoingLinks = useMemo<LinkedNoteLink[]>(() => {
    if (!selectedNote) return []
    return extractWikiLinkTitlesFromHtml(selectedNote.content).map((title) => ({
      title,
      note: wikiNoteByTitle.get(normalizeWikiTitle(title)) ?? null,
    }))
  }, [selectedNote, wikiNoteByTitle])

  const backlinks = useMemo(() => {
    if (!selectedNote) return []
    const currentTitle = normalizeWikiTitle(selectedNote.title || '')
    if (!currentTitle) return []

    return allDisplayNotes.filter((note) => {
      if (note.id === selectedNote.id) return false
      return extractWikiLinkTitlesFromHtml(note.content)
        .some((title) => normalizeWikiTitle(title) === currentTitle)
    })
  }, [allDisplayNotes, selectedNote])

  // 本地文件笔记在编辑器里落盘后，同步更新内存中的 localNotes（selectedNote 来源），
  // 否则切换文档再切回时会读到旧内容，导致刚粘贴的图片丢失
  const handleLocalNotePersist = useCallback((noteId: string, content: string) => {
    setLocalNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n)),
    )
  }, [setLocalNotes])

  // 从磁盘重新载入笔记时只同步正文，不把一次读取误判为新的编辑时间。
  const handleLocalNoteLoad = useCallback((noteId: string, content: string) => {
    setLocalNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, content } : n)),
    )
  }, [setLocalNotes])

  // 本地文件笔记标题变更后，同步更新内存中的 localNotes（让侧栏立即显示新标题）
  const handleLocalTitlePersist = useCallback((noteId: string, title: string) => {
    setLocalNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, title, updatedAt: new Date().toISOString() } : n)),
    )
  }, [setLocalNotes])

  const handleLocalTagsPersist = useCallback(async (noteId: string, tags: string[]) => {
    const root = selectedLocalFolder
    const target = localNotes.find((note) => note.id === noteId)
    if (!root || !target?.filePath) {
      throw new Error('无法定位当前本地笔记')
    }

    const previousTags = target.tags || []
    const normalized = normalizeTagList(tags)
    if (sameTags(previousTags, normalized)) return

    const updatedAt = new Date().toISOString()
    setLocalNotes((prev) => prev.map((note) => (
      note.id === noteId ? { ...note, tags: normalized, updatedAt } : note
    )))

    try {
      await saveNoteTags(root, toRelPath(root, target.filePath), normalized)
    } catch (error) {
      setLocalNotes((prev) => prev.map((note) => (
        note.id === noteId && sameTags(note.tags || [], normalized)
          ? { ...note, tags: previousTags, updatedAt: target.updatedAt }
          : note
      )))
      console.error('[Tags] failed to save local note tags:', error)
      throw error
    }
  }, [localNotes, selectedLocalFolder])

  // 用文件管理器（访达 / 资源管理器）打开目录
  const revealFolder = useCallback(async (path: string) => {
    try {
      await shellOpen(path)
    } catch (err) {
      console.error('[Reveal] failed to open folder:', err)
      showToast('无法打开文件夹：' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }, [showToast])

  const revealFile = useCallback(async (filePath: string) => {
    try {
      const dir = await dirname(filePath)
      await shellOpen(dir)
    } catch (err) {
      console.error('[Reveal] failed to open containing folder:', err)
      showToast('无法打开文件夹：' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }, [showToast])

  const handleContextMenu = useCallback((e: React.MouseEvent, note: Note) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, note })
  }, [])

  const handleTogglePinned = useCallback(async (note: Note) => {
    if (!note) return
    const nextPinned = !note.pinned

    if (selectedLocalFolder && note._isLocalFile && note.filePath) {
      try {
        await saveNotePinned(
          selectedLocalFolder,
          toRelPath(selectedLocalFolder, note.filePath),
          nextPinned,
        )
        setLocalNotes((previous) => previous.map((item) => (
          item.id === note.id ? { ...item, pinned: nextPinned } : item
        )))
        showToast(nextPinned ? '已固定到顶部' : '已取消固定', 'success')
      } catch (error) {
        console.error('[Pin] failed to save local note pin state:', error)
        showToast('更新固定状态失败', 'error')
      }
      return
    }

    setNotePinned(note.id, nextPinned)
    showToast(nextPinned ? '已固定到顶部' : '已取消固定', 'success')
  }, [selectedLocalFolder, setNotePinned, showToast])

  const createNoteRecord = useCallback(async (
    title: string,
    htmlContent: string,
    noteType: string,
  ): Promise<boolean> => {
    if (selectedLocalFolder) {
      const targetFolder = findFolderNode(localFolders, selectedFolderId) ?? localFolders[0]
      const targetDir = targetFolder?.path || selectedLocalFolder
      const folderId = targetFolder?.id || 'local-root'

      try {
        const filePath = await uniqueHtmlPath(targetDir, title)
        await writeTextFile(filePath, htmlContent)
        await saveNoteType(selectedLocalFolder, toRelPath(selectedLocalFolder, filePath), noteType)
        const result = await refreshLocalTree(selectedLocalFolder)
        const createdNote = result.notes.find((note) => note.id === `local-${filePath}`)
        setSelectedFolderId(folderId)
        if (createdNote) setSelectedNoteId(createdNote.id)
        return true
      } catch (error) {
        console.error('[NoteCreate] Failed to create file:', error)
        showToast(
          '创建文件失败：' + (error instanceof Error ? error.message : String(error)),
          'error',
        )
        return false
      }
    }

    const now = new Date().toISOString()
    const newNote = {
      id: `note-${Date.now()}`,
      title,
      content: htmlContent,
      folderId: selectedFolderId || '',
      filePath: '',
      tags: [] as string[],
      createdAt: now,
      updatedAt: now,
      noteType,
    }
    addNote(newNote)
    setSelectedNoteId(newNote.id)
    return true
  }, [
    addNote,
    localFolders,
    refreshLocalTree,
    selectedFolderId,
    selectedLocalFolder,
    setSelectedFolderId,
    setSelectedNoteId,
    showToast,
  ])

  const handleWikiLinkClick = useCallback((rawTitle: string) => {
    const title = rawTitle.trim()
    if (!title) return

    const target = wikiNoteByTitle.get(normalizeWikiTitle(title))
    if (target) {
      setSelectedNoteId(target.id)
      return
    }

    setReadingMode(false)
    setPendingNoteType('normal')
    setCreateNoteTitle(title)
    setShowCreateDialog(true)
    setTimeout(() => createInputRef.current?.focus(), 50)
  }, [setSelectedNoteId, wikiNoteByTitle])

  const handleCreateNote = useCallback((typeKey: string) => {
    setShowTypeMenu(false)
    setPendingNoteType(typeKey)
    setCreateNoteTitle('')
    setShowCreateDialog(true)
    setTimeout(() => createInputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const target = event.target instanceof Element ? event.target : null
        const hasBlockingSurface = !!document.querySelector(
          '[role="dialog"], [role="menu"], .note-search-popover, .quick-capture-layer, .command-palette-layer',
        )
        const canHandleEscape = (
          !event.defaultPrevented
          && !hasBlockingSurface
          && !target?.closest('.note-search-popover')
        )
        if (canHandleEscape && showNoteAi) {
          event.preventDefault()
          setShowNoteAi(false)
        } else if (canHandleEscape && readingMode) {
          event.preventDefault()
          setReadingMode(false)
        } else if (canHandleEscape && focusMode) {
          event.preventDefault()
          setFocusMode(false)
        }
        return
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const hasBlockingShortcutSurface = (
        showQuickCapture
        || showCreateDialog
        || showQuickSwitcher
        || !!document.querySelector(
          '[role="dialog"], [role="menu"], .note-search-popover, .quick-capture-layer, .command-palette-layer',
        )
      )
      if (hasBlockingShortcutSurface) return

      const key = event.key.toLowerCase()

      if (key === 'n' && event.shiftKey) {
        event.preventDefault()
        setShowQuickCapture(true)
        return
      }

      if (key === 'a' && event.shiftKey) {
        if (!selectedNoteId) return
        event.preventDefault()
        setFocusMode(false)
        setShowNoteAi((current) => !current)
        return
      }

      if (key === 'r' && event.shiftKey) {
        if (!selectedNoteId) return
        event.preventDefault()
        setReadingMode((current) => !current)
        return
      }

      if (key === 'f' && event.shiftKey) {
        if (!selectedNoteId) return
        event.preventDefault()
        setFocusMode((current) => !current)
        return
      }

      if (key === 'p' && !event.shiftKey) {
        event.preventDefault()
        setShowQuickSwitcher(true)
        return
      }

      if (key === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      if (key === 'n' && !event.shiftKey) {
        event.preventDefault()
        handleCreateNote('normal')
      } else if (key === 'o' && event.shiftKey) {
        event.preventDefault()
        if (showNoteAi) {
          setShowNoteAi(false)
          setShowOutline(true)
        } else {
          setShowOutline(!showOutline)
        }
      }

      if (isEditableTarget(event.target)) return
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [
    focusMode,
    handleCreateNote,
    readingMode,
    selectedNoteId,
    setShowOutline,
    showCreateDialog,
    showNoteAi,
    showOutline,
    showQuickCapture,
    showQuickSwitcher,
  ])

  const confirmCreateNote = async () => {
    const title = createNoteTitle.trim()
    if (!title) return

    const created = await createNoteRecord(
      title,
      getTemplateContent(pendingNoteType, title),
      pendingNoteType,
    )
    if (created) {
      setShowCreateDialog(false)
      showToast('笔记已创建', 'success')
    }
  }

  const handleQuickCaptureSave = async (title: string, content: string): Promise<boolean> => {
    const firstLine = content
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim()
    const fallback = `快速记录 ${new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`
    const finalTitle = title.trim()
      || (firstLine ? Array.from(firstLine).slice(0, 48).join('') : fallback)

    const created = await createNoteRecord(
      finalTitle,
      getQuickCaptureContent(finalTitle, content),
      'normal',
    )
    if (created) {
      setReadingMode(false)
      showToast('已快速记录', 'success')
    }
    return created
  }

  /* ─── 笔记 / 文件夹手动排序 ─── */

  // 重排某个文件夹内的笔记：更新内存顺序 + 写入 .dunote-order.json
  const handleReorderNotes = useCallback(async (folderId: string, orderedIds: string[]) => {
    const root = selectedLocalFolder
    if (!root) return
    const rank = new Map(orderedIds.map((id, i) => [id, i]))
    setLocalNotes((prev) => {
      const scoped = prev
        .filter((n) => rank.has(n.id))
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        .map((n) => ({ ...n, order: rank.get(n.id) ?? 0 }))
      let k = 0
      return prev.map((n) => (rank.has(n.id) ? scoped[k++] : n))
    })
    try {
      const byId = new Map(localNotes.map((n) => [n.id, n]))
      const entries: Record<string, number> = {}
      orderedIds.forEach((id, i) => {
        const n = byId.get(id)
        if (n?.filePath) entries[toRelPath(root, n.filePath)] = i
      })
      await applyOrder(root, 'notes', entries)
    } catch (err) {
      console.error('[Order] 保存笔记排序失败:', err)
      showToast('保存排序失败', 'error')
    }
  }, [selectedLocalFolder, localNotes, showToast])

  // 重排同一父级下的文件夹
  const handleReorderFolders = useCallback(async (parentId: string | null, orderedIds: string[]) => {
    const root = selectedLocalFolder
    if (!root) return
    const rank = new Map(orderedIds.map((id, i) => [id, i]))
    const sortSiblings = (list: import('@/types').NoteFolder[]) =>
      list
        .slice()
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        .map((f) => ({ ...f, order: rank.get(f.id) ?? f.order }))
    const walk = (list: import('@/types').NoteFolder[], currentParent: string | null): import('@/types').NoteFolder[] => {
      const next = currentParent === parentId ? sortSiblings(list) : list
      return next.map((f) => ({
        ...f,
        children: f.children?.length ? walk(f.children, f.id) : f.children,
      }))
    }
    setLocalFolders((prev) => walk(prev, null))
    try {
      const entries: Record<string, number> = {}
      const collect = (list: import('@/types').NoteFolder[]) => {
        list.forEach((f) => {
          if (rank.has(f.id) && f.path) entries[toRelPath(root, f.path)] = rank.get(f.id)!
          if (f.children?.length) collect(f.children)
        })
      }
      collect(localFolders)
      await applyOrder(root, 'folders', entries)
    } catch (err) {
      console.error('[Order] 保存文件夹排序失败:', err)
      showToast('保存排序失败', 'error')
    }
  }, [selectedLocalFolder, localFolders, showToast])

  // 右键菜单「上移 / 下移」：笔记
  const handleMoveNote = useCallback((note: any, delta: -1 | 1) => {
    if (!selectedLocalFolder || !note) return
    const siblings = localNotes
      .filter((n) => n.folderId === note.folderId)
      .slice()
      .sort(compareSidebarNotes)
      .map((n) => n.id)
    const next = shiftId(siblings, note.id, delta)
    if (!next) return
    handleReorderNotes(note.folderId, next)
  }, [selectedLocalFolder, localNotes, handleReorderNotes])

  // 右键菜单「上移 / 下移」：文件夹
  const handleMoveFolder = useCallback((folder: any, delta: -1 | 1) => {
    if (!selectedLocalFolder || !folder) return
    let siblings: import('@/types').NoteFolder[] | null = null
    const find = (list: import('@/types').NoteFolder[]) => {
      if (list.some((f) => f.id === folder.id)) { siblings = list; return }
      list.forEach((f) => { if (f.children?.length) find(f.children) })
    }
    find(localFolders)
    if (!siblings) return
    const ids = (siblings as import('@/types').NoteFolder[]).map((f) => f.id)
    const next = shiftId(ids, folder.id, delta)
    if (!next) return
    handleReorderFolders(folder.parentId ?? null, next)
  }, [selectedLocalFolder, localFolders, handleReorderFolders])

  const handleSelectLocalFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择笔记文件夹',
      })
      if (!selected || typeof selected !== 'string') return

      const result = await refreshLocalTree(selected)
      setSelectedLocalFolder(selected)
      setFolderAccessError(null)
      setSelectedFolderId('local-root')
      setSelectedNoteId(null)
      setShowTypeMenu(false)
      showToast(
        `已打开「${basenameLocalPath(selected)}」，发现 ${result.notes.length} 篇笔记`,
        'success',
      )
    } catch (error) {
      console.error('Failed to open folder:', error)
      showToast(
        '打开文件夹失败：' + (error instanceof Error ? error.message : String(error)),
        'error',
      )
    }
  }, [refreshLocalTree, setSelectedFolderId, setSelectedNoteId, showToast])

  const quickSwitcherCommands = useMemo<QuickSwitcherCommand[]>(() => [
    {
      id: 'new-note',
      label: '新建普通笔记',
      description: '创建一篇空白笔记，快捷键 Ctrl/Cmd+N',
      keywords: ['创建', '新建', '空白'],
      icon: Plus,
      run: () => handleCreateNote('normal'),
    },
    {
      id: 'quick-capture',
      label: '快速记录',
      description: '先记下临时想法，稍后再整理',
      keywords: ['收集', '灵感', '待办', '速记'],
      icon: Zap,
      run: () => setShowQuickCapture(true),
    },
    {
      id: 'open-local-folder',
      label: '打开本地文件夹',
      description: '扫描本地目录中的笔记文件',
      keywords: ['目录', '文件', '工作区'],
      icon: FolderOpen,
      run: handleSelectLocalFolder,
    },
    {
      id: 'toggle-focus-mode',
      label: focusMode ? '退出专注模式' : '进入专注模式',
      description: '隐藏导航与次要控件，仅保留写作区域',
      keywords: ['沉浸', '写作', '全屏'],
      icon: Focus,
      active: focusMode,
      disabled: !selectedNote,
      run: () => setFocusMode((current) => !current),
    },
    {
      id: 'toggle-reading-mode',
      label: readingMode ? '退出阅读模式' : '进入阅读模式',
      description: '锁定编辑区域，获得更安静的阅读体验',
      keywords: ['预览', '只读', '沉浸'],
      icon: readingMode ? PencilLine : BookOpen,
      active: readingMode,
      disabled: !selectedNote,
      run: () => setReadingMode((current) => !current),
    },
    {
      id: 'toggle-typewriter-mode',
      label: typewriterMode ? '关闭打字机模式' : '开启打字机模式',
      description: readingMode
        ? '阅读模式下暂不生效'
        : '让当前光标尽量保持在编辑区中部',
      keywords: ['光标', '居中', '写作'],
      icon: TextCursorInput,
      active: typewriterMode,
      disabled: !selectedNote || readingMode,
      run: () => setTypewriterMode((current) => !current),
    },
    {
      id: 'toggle-note-ai',
      label: showNoteAi ? '关闭当前笔记 AI 助手' : '打开当前笔记 AI 助手',
      description: '围绕当前文档对话、总结、提取待办、润色或生成会议纪要',
      keywords: ['AI', '助手', '总结', '待办', '润色', '会议纪要'],
      icon: Sparkles,
      active: showNoteAi,
      disabled: !selectedNote,
      run: () => {
        setFocusMode(false)
        setShowNoteAi((current) => !current)
      },
    },
    {
      id: 'toggle-outline',
      label: showNoteAi
        ? '切换到大纲与关联'
        : showOutline
          ? '关闭笔记大纲'
          : '打开笔记大纲',
      description: '浏览文档标题、链接笔记与反向链接',
      keywords: ['目录', '导航', '标题', '链接', '关联', '反链'],
      icon: showOutline ? PanelRightClose : PanelRightOpen,
      active: showOutline && !showNoteAi,
      disabled: !selectedNote,
      run: () => {
        if (showNoteAi) {
          setShowNoteAi(false)
          setShowOutline(true)
          return
        }
        setShowOutline(!showOutline)
      },
    },
  ], [
    focusMode,
    handleCreateNote,
    handleSelectLocalFolder,
    readingMode,
    selectedNote,
    setShowOutline,
    showNoteAi,
    showOutline,
    typewriterMode,
  ])

  const handleCreateNewFolder = useCallback((parentPath?: string) => {
    setShowNewFolderDialog(true)
    setNewFolderName('')
    setNewSubFolderParentPath(parentPath || null)
    // Focus input after dialog opens
    setTimeout(() => {
      if (newFolderInputRef.current) {
        newFolderInputRef.current.focus()
      }
    }, 100)
  }, [])

  const confirmCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      showToast('请输入文件夹名称', 'info')
      return
    }
    if (!selectedLocalFolder) {
      showToast('请先打开一个本地文件夹', 'info')
      return
    }

    const folderName = sanitizeFileStem(newFolderName.trim(), '新建文件夹')
    try {
      const parentPath = newSubFolderParentPath || selectedLocalFolder
      const targetPath = await join(parentPath, folderName)
      await mkdir(targetPath, { recursive: true })
      const result = await refreshLocalTree(selectedLocalFolder)
      const createdFolder = result.folders.find((folder) => folder.path === targetPath)

      setShowNewFolderDialog(false)
      setNewFolderName('')
      setNewSubFolderParentPath(null)
      setSelectedFolderId(createdFolder?.id ?? 'local-root')
      showToast(`文件夹「${folderName}」已创建`, 'success')
    } catch (error) {
      console.error('Failed to create folder:', error)
      showToast(
        '创建文件夹失败：' + (error instanceof Error ? error.message : String(error)),
        'error',
      )
    }
  }, [
    newFolderName,
    newSubFolderParentPath,
    refreshLocalTree,
    selectedLocalFolder,
    setSelectedFolderId,
    showToast,
  ])

  // Handler for restoring a history version of a local file
  const handleRestoreLocalNote = useCallback(async (noteId: string, content: string, title: string) => {
    // 该回调对普通笔记与本地笔记都会被 HistoryModal 调用。
    const localNote = localNotes.find(n => n.id === noteId)
    if (!localNote?._isLocalFile || !localNote.filePath) {
      // 普通笔记：store.restoreFromHistory 已在此回调前同步更新内容，直接 bump 让编辑器立即刷新
      setReloadToken((t) => t + 1)
      return
    }

    // Create history entry with the CURRENT content (before restore) since
    // restoreFromHistory can't find local files in the Zustand store
    const currentContent = localNote.content || ''
    if (currentContent !== content) {
      addHistoryEntry({
        noteId,
        title: localNote.title || title,
        content: currentContent,
        action: 'edit',
      })
    }
    
    try {
      await writeTextFile(localNote.filePath, content)
      console.log(`[Restore] Wrote restored content to: ${localNote.filePath}`)
      setLocalNotes(prev => prev.map(n =>
        n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n
      ))
      // 本地笔记：必须在写盘成功后再 bump，否则编辑器 effect 读盘可能早于写盘，读到旧内容
      setReloadToken((t) => t + 1)
    } catch (error) {
      console.error('[Restore] Failed to write restored content:', error)
      showToast(
        '恢复历史版本失败：' + (error instanceof Error ? error.message : String(error)),
        'error',
      )
    }
  }, [localNotes, addHistoryEntry, showToast])

  // ─── Change note type ───
  const handleChangeNoteType = useCallback(async (note: any, noteType: string) => {
    if (!note) return
    if (note._isLocalFile && note.filePath && selectedLocalFolder) {
      try {
        await saveNoteType(selectedLocalFolder, toRelPath(selectedLocalFolder, note.filePath), noteType)
        setLocalNotes(prev => prev.map(n => n.id === note.id ? { ...n, noteType } : n))
      } catch (err) {
        console.error('[ChangeType] Failed:', err)
        showToast('修改笔记类型失败', 'error')
      }
    } else {
      updateNote(note.id, { noteType })
    }
  }, [selectedLocalFolder, showToast, updateNote])

  // ─── Delete handlers ───
  const handleDeleteNote = useCallback(async (note: any) => {
    const name = note.title || '未命名笔记'
    const ok = await confirm({
      title: '删除笔记',
      message: `确定要删除「${name}」吗？\n此操作不可撤销。`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return

    if (note._isLocalFile && note.filePath) {
      // Delete local file from disk
      try {
        await remove(note.filePath as string)
        console.log(`[Delete] Removed file: ${note.filePath}`)
      } catch (err) {
        console.error('[Delete] Failed to remove file:', err)
        showToast('删除失败: ' + (err instanceof Error ? err.message : String(err)), 'error')
        return
      }
      if (selectedLocalFolder) {
        await refreshLocalTree(selectedLocalFolder)
      } else {
        setLocalNotes(prev => prev.filter(n => n.id !== note.id))
      }
      if (selectedNoteId === note.id) setSelectedNoteId(null)
      showToast('笔记已删除', 'success')
    } else {
      // Delete from store
      deleteNote(note.id)
      showToast('笔记已删除', 'success')
    }
  }, [
    confirm,
    deleteNote,
    refreshLocalTree,
    selectedLocalFolder,
    selectedNoteId,
    setSelectedNoteId,
    showToast,
  ])

  const handleDeleteFolder = useCallback(async (folder: any) => {
    const name = folder.name || '未命名文件夹'
    if (!selectedLocalFolder || !folder.path) {
      showToast('请先打开一个本地文件夹', 'info')
      return
    }
    if (folder.id === 'local-root') {
      showToast('不能删除当前打开的根文件夹', 'info')
      return
    }
    const ok = await confirm({
      title: '删除文件夹',
      message: `确定要删除文件夹「${name}」及其所有内容吗？\n此操作不可撤销。`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return

    try {
      await remove(folder.path, { recursive: true })
      const result = await refreshLocalTree(selectedLocalFolder)
      if (
        selectedFolderId !== 'local-root'
        && !findFolderNode([result.rootFolder], selectedFolderId)
      ) {
        setSelectedFolderId('local-root')
      }
      if (selectedNoteId && !result.notes.some((note) => note.id === selectedNoteId)) {
        setSelectedNoteId(null)
      }
      showToast(`文件夹「${name}」已删除`, 'success')
    } catch (err) {
      console.error('[Delete] Failed to remove folder:', err)
      showToast('删除文件夹失败: ' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }, [
    confirm,
    refreshLocalTree,
    selectedFolderId,
    selectedLocalFolder,
    selectedNoteId,
    setSelectedFolderId,
    setSelectedNoteId,
    showToast,
  ])

  // ─── Folder context menu ───
  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folder: any) => {
    e.preventDefault()
    setFolderCtxMenu({ x: e.clientX, y: e.clientY, folder })
  }, [])

  // ─── Import Markdown files ───
  const handleImportMarkdown = useCallback(async (folder: any) => {
    if (!selectedLocalFolder || !folder.path) {
      showToast('请先打开一个本地文件夹', 'info')
      return
    }

    try {
      const selected = await open({
        multiple: true,
        title: '选择 Markdown 文件',
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      })

      if (!selected) return
      const files = Array.isArray(selected) ? selected : [selected]
      if (files.length === 0) return

      let imported = 0
      let errors = 0

      // 惰性加载：marked 仅在「导入 Markdown」时使用，避免启动时加载解析
      const { marked } = await import('marked')
      for (const filePath of files) {
        try {
          const mdContent = await readTextFile(filePath as string)
          const htmlBody = await marked(mdContent)
          const fileName = basenameLocalPath(filePath as string).replace(/\.(md|markdown)$/i, '')
          const stem = sanitizeFileStem(fileName)
          const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(stem)}</title></head><body>${htmlBody}</body></html>`
          const targetPath = await uniqueHtmlPath(folder.path, stem)

          await writeTextFile(targetPath, htmlContent)
          imported++
          console.log(`[Import] Converted: ${filePath} → ${targetPath}`)
        } catch (err) {
          console.error(`[Import] Failed to import ${filePath}:`, err)
          errors++
        }
      }

      await refreshLocalTree(selectedLocalFolder)

      if (errors > 0) {
        showToast(`导入完成：${imported} 个成功，${errors} 个失败`, imported > 0 ? 'info' : 'error')
      } else {
        showToast(`成功导入 ${imported} 个 Markdown 文件`, 'success')
      }
    } catch (err) {
      console.error('[Import] Failed:', err)
      showToast('导入失败：' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }, [refreshLocalTree, selectedLocalFolder, showToast])

  return (
    <div className={`notes-layout${selectedNote ? ' has-selected-note' : ''}${focusMode && selectedNote ? ' is-focus-mode' : ''}`}>

      {/* ─── Left: Note List ─── */}
      <div className="note-list-panel">
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
              background: selectedLocalFolder ? C.accent : 'var(--app-surface-muted)',
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
              if (!selectedLocalFolder) e.currentTarget.style.background = 'var(--app-hover)'
              else e.currentTarget.style.background = 'var(--app-accent-hover)'
            }}
            onMouseLeave={(e) => { 
              if (!selectedLocalFolder) e.currentTarget.style.background = 'var(--app-surface-muted)'
              else e.currentTarget.style.background = C.accent
            }}
          >
            <Folder size={18} />
          </button>

          {/* New Folder Button */}
          <button
            onClick={() => handleCreateNewFolder()}
            title="新建文件夹"
            style={{
              width: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              borderRadius: '8px',
              background: 'var(--app-surface-muted)',
              color: C.textSecondary,
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--app-surface-muted)' }}
          >
            <Plus size={18} />
          </button>

          <button
            onClick={() => setShowQuickSwitcher(true)}
            title="命令与笔记（Ctrl/Cmd+P）"
            aria-label="命令与笔记"
            style={{
              width: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              borderRadius: '8px',
              background: 'var(--app-surface-muted)',
              color: C.textSecondary,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--app-surface-muted)' }}
          >
            <Command size={17} />
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
            background: 'var(--app-surface-muted)',
          }}>
            <div style={{ 
              fontSize: '11px', 
              color: C.textMuted,
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <FolderOpen size={13} aria-hidden="true" />
                本地文件夹
              </span>
              <button
                onClick={async () => {
                  setSelectedLocalFolder(null)
                  setLocalFolders([])
                  setLocalNotes([])
                  setSelectedNoteId(null)
                  setSelectedFolderId('')
                  // Clear persisted config
                  try {
                    const configPath = await getConfigPath()
                    await writeTextFile(configPath, JSON.stringify({}))
                  } catch (e) { console.warn('Failed to clear config:', e) }
                }}
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
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-danger-bg)' }}
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
              background: 'var(--app-surface-muted)',
              borderRadius: '8px',
              padding: '8px 12px',
              border: '1px solid transparent',
            }}
          >
            {isSearching
              ? <Loader2 size={15} className="spin" style={{ color: C.primary, flexShrink: 0 }} />
              : <Search size={15} style={{ color: C.textMuted, flexShrink: 0 }} />}
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索标题、正文或标签（Ctrl+K）"
              aria-label="搜索笔记"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && searchQuery) {
                  event.preventDefault()
                  setSearchQuery('')
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '13px',
                color: C.text,
                fontFamily: 'inherit',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  searchInputRef.current?.focus()
                }}
                aria-label="清空搜索"
                title="清空搜索"
                style={{
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  borderRadius: '5px',
                  border: 'none',
                  background: 'transparent',
                  color: C.textMuted,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {tagFacets.length > 0 && (
            <div className="note-tag-filter-bar" aria-label="按标签筛选">
              <Tag size={13} aria-hidden="true" />
              <div className="note-tag-filter-list">
                <button
                  type="button"
                  className={`note-tag-filter${activeTagFilter ? '' : ' is-active'}`}
                  onClick={() => setActiveTagFilter(null)}
                  aria-pressed={!activeTagFilter}
                >
                  全部
                </button>
                {tagFacets.slice(0, 8).map((facet) => {
                  const active = activeTagFilter?.toLocaleLowerCase('zh-CN')
                    === facet.tag.toLocaleLowerCase('zh-CN')
                  return (
                    <button
                      key={facet.tag}
                      type="button"
                      className={`note-tag-filter${active ? ' is-active' : ''}`}
                      onClick={() => setActiveTagFilter(active ? null : facet.tag)}
                      aria-pressed={active}
                      title={`${facet.tag}（${facet.count} 篇笔记）`}
                    >
                      <span>#{facet.tag}</span>
                      <span className="note-tag-filter-count">{facet.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2.5 文件夹访问被系统拒绝时的提示（macOS 升级后 TCC 授权失效） */}
        {folderAccessError && (
          <div
            style={{
              margin: '0 8px 8px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'var(--app-warning-bg)',
              border: '1px solid var(--app-warning-border)',
            }}
          >
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--app-warning)', marginBottom: '4px' }}>
              无法访问上次的笔记文件夹
            </div>
            <div style={{ fontSize: '11.5px', color: C.textSecondary, lineHeight: 1.5, wordBreak: 'break-all', marginBottom: '8px' }}>
              {folderAccessError}
              <br />
              系统可能在软件更新后收回了访问授权，请重新选择同一个文件夹以恢复。
            </div>
            <button
              onClick={handleSelectLocalFolder}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--app-warning)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              重新授权文件夹
            </button>
          </div>
        )}

        {/* 3. Folder Tree with notes inside */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {normalizedSearchQuery && !isSearching && searchResults.length === 0 ? (
            <div
              role="status"
              style={{
                padding: '40px 24px',
                textAlign: 'center',
                color: C.textMuted,
              }}
            >
              <SearchX size={28} aria-hidden="true" style={{ margin: '0 auto 10px', opacity: 0.65 }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.textSecondary, marginBottom: '4px' }}>
                没有找到相关笔记
              </div>
              <div style={{ fontSize: '11.5px', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                尝试更换关键词，或清空搜索查看全部笔记
              </div>
            </div>
          ) : (
            <FolderTree
              folders={displayFolders}
              filteredNotes={filteredNotes}
              searchResults={searchResultMap}
              onNoteContextMenu={handleContextMenu}
              onCreateSubFolder={selectedLocalFolder ? handleCreateNewFolder : undefined}
              onDeleteFolder={selectedLocalFolder ? handleDeleteFolder : undefined}
              onFolderContextMenu={selectedLocalFolder ? handleFolderContextMenu : undefined}
              onOpenFolder={revealFolder}
              onReorderNotes={selectedLocalFolder ? handleReorderNotes : undefined}
              onReorderFolders={selectedLocalFolder ? handleReorderFolders : undefined}
            />
          )}
        </div>
      </div>

      {/* ─── Center: Editor ─── */}
      <div className="notes-editor-panel">
        {selectedNote ? (
          <NoteEditor
            note={selectedNote}
            onLocalLoad={handleLocalNoteLoad}
            onLocalPersist={handleLocalNotePersist}
            onLocalTitlePersist={handleLocalTitlePersist}
            onLocalTagsPersist={handleLocalTagsPersist}
            tagSuggestions={tagFacets.map((facet) => facet.tag)}
            wikiLinkNotes={allDisplayNotes}
            reloadToken={reloadToken}
            onOpenHistoryTab={setHistoryInitialTab}
            onBackToNotes={() => setSelectedNoteId(null)}
            onTogglePinned={handleTogglePinned}
            typewriterMode={typewriterMode}
            onToggleTypewriterMode={() => setTypewriterMode((current) => !current)}
            focusMode={focusMode}
            onToggleFocusMode={() => setFocusMode((current) => !current)}
            readingMode={readingMode}
            onToggleReadingMode={() => setReadingMode((current) => !current)}
            onWikiLinkClick={handleWikiLinkClick}
            aiPanelOpen={showNoteAi}
            onToggleAiPanel={() => {
              setFocusMode(false)
              setShowNoteAi((current) => !current)
            }}
            onAiBridgeChange={setNoteAiBridge}
          />
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
              <p style={{ fontSize: '14px', margin: '0 0 16px' }}>选择一篇笔记开始编辑</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleCreateNote('normal')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: C.primary,
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <Plus size={15} />
                  新建笔记
                </button>
                <button
                  type="button"
                  onClick={handleSelectLocalFolder}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${C.border}`,
                    background: C.surface,
                    color: C.textSecondary,
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <FolderOpen size={15} />
                  打开本地文件夹
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Right: Current-note AI ─── */}
      {showNoteAi && selectedNote && (
        <NoteAiPanel
          key={selectedNote.id}
          note={selectedNote}
          bridge={selectedNoteAiBridge}
          readingMode={readingMode}
          onClose={() => setShowNoteAi(false)}
        />
      )}

      {/* ─── Right: Outline ─── */}
      {!showNoteAi && showOutline && selectedNote && (
        <aside className="notes-outline" aria-label="笔记大纲与关联">
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
            <span style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>大纲与关联</span>
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
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              aria-label="关闭大纲与关联"
              title="关闭大纲与关联（Ctrl+Shift+O）"
            >
              <PanelRightClose size={15} style={{ color: C.textMuted }} />
            </button>
          </div>
          {/* Outline body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            <OutlineContent html={selectedNote.content} />
            <LinkedNotesPanel
              outgoingLinks={outgoingLinks}
              backlinks={backlinks}
              onOpenLink={handleWikiLinkClick}
              onOpenBacklink={(note) => setSelectedNoteId(note.id)}
            />
          </div>
        </aside>
      )}

      {/* Outline toggle button (when panel is closed) */}
      {!showNoteAi && !showOutline && (
        <button
          onClick={() => setShowOutline(true)}
          className="outline-toggle"
          aria-label="打开大纲与关联"
          title="打开大纲与关联（Ctrl+Shift+O）"
          style={{
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
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.surface }}
        >
          <PanelRightOpen size={16} style={{ color: C.textSecondary }} />
        </button>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} note={ctxMenu.note} onClose={() => setCtxMenu(null)} onDelete={handleDeleteNote} onRevealFile={revealFile} onChangeType={handleChangeNoteType} onMove={selectedLocalFolder ? handleMoveNote : undefined} onTogglePinned={handleTogglePinned} />
      )}

      {/* Folder Context Menu */}
      {folderCtxMenu && (
        <FolderContextMenu x={folderCtxMenu.x} y={folderCtxMenu.y} folder={folderCtxMenu.folder} onClose={() => setFolderCtxMenu(null)} onImport={handleImportMarkdown} onRevealFolder={revealFolder} onMove={selectedLocalFolder ? handleMoveFolder : undefined} />
      )}

      <QuickSwitcher
        open={showQuickSwitcher}
        notes={allDisplayNotes}
        commands={quickSwitcherCommands}
        onClose={() => setShowQuickSwitcher(false)}
        onSelect={(note) => setSelectedNoteId(note.id)}
      />

      <QuickCapture
        open={showQuickCapture}
        onClose={() => setShowQuickCapture(false)}
        onSave={handleQuickCaptureSave}
      />

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
      <HistoryModal onRestore={handleRestoreLocalNote} initialTab={historyInitialTab} />

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
              {newSubFolderParentPath 
                ? `将在 "${newSubFolderParentPath.split('/').pop() || newSubFolderParentPath.split('\\').pop()}" 中创建子文件夹`
                : selectedLocalFolder 
                  ? `将在 "${selectedLocalFolder.split('/').pop() || selectedLocalFolder.split('\\').pop()}" 中创建子文件夹`
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
