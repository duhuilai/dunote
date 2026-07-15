import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/store'
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronRight as ChevronRightIcon, Folder,
  Clock, Upload, Download, Trash2, Edit3, PanelRightOpen, PanelRightClose,
  FileText, FileCode, FileType, Users, BookOpen, ExternalLink, FolderOpen
} from 'lucide-react'
import NoteEditor from './NoteEditor'
import HistoryModal from './HistoryModal'
import { exportNote, exportToDownloads, type ExportFormat } from '@/utils/exportNote'
import { ExportSaveModal } from './ExportSaveModal'
import { open, message } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile, mkdir, exists, remove } from '@tauri-apps/plugin-fs'
import { appConfigDir, join, dirname } from '@tauri-apps/api/path'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { marked } from 'marked'

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

/* ── Note Item (inside folder) ─── */
function NoteItem({ note, isActive, onSelect, onContextMenu, onNoteSelect, level = 0 }: {
  note: any; isActive: boolean; onSelect: () => void; onContextMenu: (e: React.MouseEvent, note: any) => void; onNoteSelect?: (noteId: string, filePath: string) => void; level?: number
}) {
  const noteType = getNoteType(note.noteType)
  const TypeIcon = noteType.icon
  const noteIndent = 28 + level * 20
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
        padding: '7px 12px',
        paddingLeft: `${noteIndent}px`,
        border: 'none',
        borderLeft: `3px solid ${isActive ? C.primary : 'transparent'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: isActive ? C.primaryLight : 'transparent',
        display: 'block',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#F1F5F9' }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <TypeIcon size={13} style={{ color: isActive ? C.primary : '#64748B', flexShrink: 0 }} />
        <span style={{
          fontSize: '12.5px', fontWeight: 400, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isActive ? C.primary : '#475569',
        }}>
          {note.title}
        </span>
        <span style={{
          fontSize: '9px', fontWeight: 500, color: '#94A3B8',
          background: '#F1F5F9', borderRadius: '3px', padding: '1px 5px',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {noteType.label}
        </span>
      </div>
    </button>
  )
}

/* ─── Folder Tree (with notes inside) ─── */
function FolderTree({ folders, filteredNotes, onNoteContextMenu, onNoteSelect, onCreateSubFolder, onDeleteFolder, onFolderContextMenu, level = 0 }: {
  folders: any[]; filteredNotes: any[]; onNoteContextMenu: (e: React.MouseEvent, note: any) => void; onNoteSelect?: (noteId: string, filePath: string) => void; onCreateSubFolder?: (parentPath: string) => void; onDeleteFolder?: (folder: any) => void; onFolderContextMenu?: (e: React.MouseEvent, folder: any) => void; level?: number
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
                  background: isSelected ? 'rgba(217,119,6,0.08)' : 'transparent',
                  color: isSelected ? '#92400E' : '#78716C',
                  fontWeight: isSelected ? 600 : 500,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                  borderRadius: '6px',
                  minWidth: 0,
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#FAFAF9' }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <Folder
                  size={14}
                  style={{ color: isSelected ? '#D97706' : '#A8A29E', flexShrink: 0 }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {f.name}
                </span>
                <span style={{ fontSize: '10px', color: '#A8A29E', flexShrink: 0 }}>
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

              {/* Add sub-folder button */}
              {onCreateSubFolder && f.path && (
                <button
                  onClick={() => onCreateSubFolder(f.path)}
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
                    e.currentTarget.style.background = '#E2E8F0'
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
                {folderNotes.map((note: any) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    isActive={selectedNoteId === note.id}
                    onSelect={() => setSelectedNoteId(note.id)}
                    onContextMenu={onNoteContextMenu}
                    onNoteSelect={onNoteSelect}
                    level={level + 1}
                  />
                ))}
                {/* Sub-folders */}
                {f.children?.length ? (
                  <FolderTree 
                    folders={f.children} 
                    filteredNotes={filteredNotes} 
                    onNoteContextMenu={onNoteContextMenu} 
                    onNoteSelect={onNoteSelect}
                    onCreateSubFolder={onCreateSubFolder}
                    onDeleteFolder={onDeleteFolder}
                    onFolderContextMenu={onFolderContextMenu}
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
function ContextMenu({ x, y, note, onClose, onDelete, onRevealFile }: {
  x: number; y: number; note: any; onClose: () => void; onDelete: (note: any) => void; onRevealFile?: (filePath: string) => void
}) {
  const [showExportSubmenu, setShowExportSubmenu] = useState(false)
  const [exportTarget, setExportTarget] = useState<{ format: ExportFormat; title: string; html: string } | null>(null)
  const showToast = useAppStore((s) => s.showToast)

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
      alert('该笔记暂无内容可导出')
      onClose()
      return
    }

    setExportTarget({ format, title, html: htmlContent })
  }

  const canReveal = !!note?._isLocalFile && !!note?.filePath

  const menuItems = [
    { icon: Download, label: '导出为...', action: () => setShowExportSubmenu(true), hasSubmenu: true, danger: false },
    { icon: FolderOpen, label: '在文件夹查看', action: () => { if (note?.filePath) onRevealFile?.(note.filePath); onClose() }, danger: false, show: canReveal },
    { icon: Edit3, label: '重命名', action: () => {}, danger: false },
    { icon: Trash2, label: '删除', action: () => onDelete(note), danger: true },
  ]

  const exportFormats: { format: ExportFormat; label: string; icon: React.ComponentType<{ size?: number }>; ext: string }[] = [
    { format: 'markdown', label: 'Markdown 文档', icon: FileText, ext: '.md' },
    { format: 'html', label: 'HTML 网页', icon: FileCode, ext: '.html' },
    { format: 'word', label: 'Word 文档', icon: FileType, ext: '.docx' },
    { format: 'pdf', label: 'PDF 文档', icon: FileType, ext: '.pdf' },
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
    </div>
  )
}

/* ─── Folder Context Menu ─── */
function FolderContextMenu({ x, y, folder, onClose, onImport, onRevealFolder }: { x: number; y: number; folder: any; onClose: () => void; onImport: (folder: any) => void; onRevealFolder?: (path: string) => void }) {
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
        minWidth: '160px',
      }}
      onMouseLeave={onClose}
    >
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
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
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
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <FolderOpen size={15} />
          <span style={{ flex: 1 }}>在文件夹查看</span>
        </button>
      )}
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
    addHistoryEntry,
  } = useAppStore()

  const folders        = useAppStore((s) => s.folders)
  const addNote        = useAppStore((s) => s.addNote)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; note: any } | null>(null)
  const [folderCtxMenu, setFolderCtxMenu] = useState<{ x: number; y: number; folder: any } | null>(null)
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
  // 恢复历史后 +1，强制 NoteEditor 重新加载当前笔记内容（note.id 不变时也刷新）
  const [reloadToken, setReloadToken] = useState(0)

  // 将当前打开的本地根文件夹同步到全局 store，供 Gitee 同步按相对路径分层存储
  const setLocalRootFolder = useAppStore((s) => s.setLocalRootFolder)
  useEffect(() => {
    setLocalRootFolder(selectedLocalFolder)
  }, [selectedLocalFolder, setLocalRootFolder])

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
            // Re-scan the saved folder to rebuild the tree
            const result = await scanDirectory(config.lastLocalFolder, null, config.lastLocalFolder)
            const rootFolderName = config.lastLocalFolder.split('/').pop() || config.lastLocalFolder.split('\\').pop() || config.lastLocalFolder
            const rootFolder: import('@/types').NoteFolder = {
              id: 'local-root', name: rootFolderName, parentId: null,
              path: config.lastLocalFolder, expanded: true, children: [],
            }
            const buildChildren = (folder: import('@/types').NoteFolder, allFolders: import('@/types').NoteFolder[]) => {
              const children = allFolders.filter(f => f.parentId === folder.id)
              folder.children = children.map(f => {
                const child = { ...f }
                buildChildren(child, allFolders)
                return child
              })
            }
            buildChildren(rootFolder, result.folders)
            setLocalFolders([rootFolder])
            setLocalNotes(prev => mergeScannedNotes(result.notes, prev))
            setSelectedLocalFolder(config.lastLocalFolder)
            // Restore the selected folder ID (sub-folder or root)
            setSelectedFolderId(config.lastSelectedFolderId || 'local-root')
            // Restore the last opened note (if any)
            if (config.lastSelectedNoteId) {
              setSelectedNoteId(config.lastSelectedNoteId)
            }
            console.log(`[Persistence] Restored ${result.folders.length} folders, ${result.notes.length} notes`)
          }
        }
      } catch (err) {
        console.warn('[Persistence] Failed to load config:', err)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [selectedLocalFolder, selectedFolderId, selectedNoteId])

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

  // 本地文件笔记在编辑器里落盘后，同步更新内存中的 localNotes（selectedNote 来源），
  // 否则切换文档再切回时会读到旧内容，导致刚粘贴的图片丢失
  const handleLocalNotePersist = useCallback((noteId: string, content: string) => {
    setLocalNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n)),
    )
  }, [setLocalNotes])

  // 用文件管理器（访达 / 资源管理器）打开目录
  const revealFolder = useCallback(async (path: string) => {
    try {
      await shellOpen(path)
    } catch (err) {
      console.error('[Reveal] failed to open folder:', err)
      alert('无法打开文件夹：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

  const revealFile = useCallback(async (filePath: string) => {
    try {
      const dir = await dirname(filePath)
      await shellOpen(dir)
    } catch (err) {
      console.error('[Reveal] failed to open containing folder:', err)
      alert('无法打开文件夹：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

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

  const confirmCreateNote = async () => {
    const title = createNoteTitle.trim()
    if (!title) return
    setShowCreateDialog(false)
    const now = new Date().toISOString()
    const htmlContent = getTemplateContent(pendingNoteType, title)

    if (selectedLocalFolder) {
      // Determine target directory based on selected folder
      let targetDir = selectedLocalFolder
      if (selectedFolderId && selectedFolderId.startsWith('local-folder-')) {
        targetDir = selectedFolderId.replace('local-folder-', '')
      }
      const filePath = `${targetDir}/${title}.html`

      try {
        await writeTextFile(filePath, htmlContent)
        console.log(`[NoteCreate] Created local file: ${filePath}`)
      } catch (err) {
        console.error('[NoteCreate] Failed to create file:', err)
        alert('创建文件失败: ' + (err instanceof Error ? err.message : String(err)))
        return
      }

      const newNote: any = {
        id: `local-${filePath}`,
        title,
        content: htmlContent,
        filePath,
        folderId: selectedFolderId || 'local-root',
        tags: [],
        createdAt: now,
        updatedAt: now,
        noteType: pendingNoteType,
        _isLocalFile: true,
      }
      setLocalNotes(prev => [newNote, ...prev])
      setSelectedNoteId(newNote.id)
    } else {
      const newNote = {
        id: `note-${Date.now()}`,
        title,
        content: htmlContent,
        folderId: selectedFolderId || '',
        filePath: '/未分类',
        tags: [] as string[],
        createdAt: now,
        updatedAt: now,
        noteType: pendingNoteType,
      }
      addNote(newNote)
      setSelectedNoteId(newNote.id)
    }
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
          if (name.endsWith('.html')) {
            const fullPath = currentPath + '/' + entry.name
            const now = new Date().toISOString()
            notes.push({
              id: `local-${fullPath}`,
              title: entry.name.replace(/\.html$/i, ''),
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

  // Merge newly scanned notes with existing localNotes to preserve loaded content
  const mergeScannedNotes = useCallback((newNotes: import('@/types').Note[], prevNotes: import('@/types').Note[]) => {
    const prevMap = new Map(prevNotes.map(n => [n.id, n]))
    return newNotes.map(n => {
      const prev = prevMap.get(n.id)
      // Preserve content from previously loaded notes so re-scans don't wipe editor data
      if (prev && prev.content) {
        return { ...n, content: prev.content }
      }
      return n
    })
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
        setLocalNotes(prev => mergeScannedNotes(result.notes, prev))
        
        // Select the root folder
        setSelectedFolderId('local-root')
        
        console.log(`Scanned ${selected}: ${result.folders.length} folders, ${result.notes.length} files`)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      alert('打开文件夹失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [scanDirectory, mergeScannedNotes])

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
      alert('请输入文件夹名称')
      return
    }

    const folderName = newFolderName.trim()
    
    // Determine where to create the folder
    let targetPath = ''
    try {
      if (newSubFolderParentPath) {
        // Create subfolder inside the specified parent folder
        targetPath = `${newSubFolderParentPath}/${folderName}`
        await mkdir(targetPath)
      } else if (selectedLocalFolder) {
        // Create subfolder in selected root folder
        targetPath = `${selectedLocalFolder}/${folderName}`
        await mkdir(targetPath)
      } else {
        // Create in current directory or app data directory
        targetPath = `./${folderName}`
        await mkdir(folderName, { recursive: true })
      }

      console.log(`Created folder: ${targetPath}`)
      setShowNewFolderDialog(false)
      setNewFolderName('')
      setNewSubFolderParentPath(null)

      // Re-scan to refresh the sidebar tree
      if (selectedLocalFolder) {
        const result = await scanDirectory(selectedLocalFolder, null, selectedLocalFolder)
        const rootFolderName = selectedLocalFolder.split('/').pop() || selectedLocalFolder.split('\\').pop() || selectedLocalFolder
        const rootFolder: import('@/types').NoteFolder = {
          id: 'local-root', name: rootFolderName, parentId: null,
          path: selectedLocalFolder, expanded: true, children: [],
        }
        const buildChildren = (folder: import('@/types').NoteFolder, allFolders: import('@/types').NoteFolder[]) => {
          const children = allFolders.filter(f => f.parentId === folder.id)
          folder.children = children.map(f => {
            const child = { ...f }
            buildChildren(child, allFolders)
            return child
          })
        }
        buildChildren(rootFolder, result.folders)
        setLocalFolders([rootFolder])
        setLocalNotes(prev => mergeScannedNotes(result.notes, prev))
      }
    } catch (error) {
      console.error('Failed to create folder:', error)
      alert('创建文件夹失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [newFolderName, newSubFolderParentPath, selectedLocalFolder, scanDirectory, mergeScannedNotes])

  // Handler for selecting a local file note
  const handleSelectLocalNote = useCallback(async (noteId: string, filePath: string) => {
    try {
      console.log(`[handleSelectLocalNote] Loading: ${filePath}`)
      
      // Read file content directly (HTML files, no conversion needed)
      const content = await readTextFile(filePath)
      
      // Check if it's a local note (in localNotes state) or a store note
      const isLocalNote = localNotes.some(n => n.id === noteId)
      if (isLocalNote) {
        setLocalNotes(prev => prev.map(n => 
          n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n
        ))
      } else {
        updateNote(noteId, { content })
      }
      
      console.log(`Loaded file content: ${filePath} (length: ${content.length})`)
    } catch (error) {
      console.error('Failed to read file:', error)
      alert('读取文件失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [updateNote, localNotes])

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
    }
  }, [localNotes, addHistoryEntry])

  // ─── Delete handlers ───
  const handleDeleteNote = useCallback(async (note: any) => {
    const name = note.title || '未命名笔记'
    if (!confirm(`确定要删除「${name}」吗？\n此操作不可撤销。`)) return

    if (note._isLocalFile && note.filePath) {
      // Delete local file from disk
      try {
        await remove(note.filePath as string)
        console.log(`[Delete] Removed file: ${note.filePath}`)
      } catch (err) {
        console.error('[Delete] Failed to remove file:', err)
        alert('删除失败: ' + (err instanceof Error ? err.message : String(err)))
        return
      }
      // Remove from localNotes state
      setLocalNotes(prev => prev.filter(n => n.id !== note.id))
      if (selectedNoteId === note.id) setSelectedNoteId(null)
    } else {
      // Delete from store
      deleteNote(note.id)
    }
  }, [deleteNote, selectedNoteId, setSelectedNoteId])

  const handleDeleteFolder = useCallback(async (folder: any) => {
    const name = folder.name || '未命名文件夹'
    if (!confirm(`确定要删除文件夹「${name}」及其所有内容吗？\n此操作不可撤销。`)) return

    if (!folder.path) return

    try {
      await remove(folder.path as string, { recursive: true })
      console.log(`[Delete] Removed folder: ${folder.path}`)
    } catch (err) {
      console.error('[Delete] Failed to remove folder:', err)
      alert('删除文件夹失败: ' + (err instanceof Error ? err.message : String(err)))
      return
    }

    // Re-scan to refresh the tree
    if (selectedLocalFolder) {
      const result = await scanDirectory(selectedLocalFolder, null, selectedLocalFolder)
      const rootFolderName = selectedLocalFolder.split('/').pop() || selectedLocalFolder.split('\\').pop() || selectedLocalFolder
      const rootFolder: import('@/types').NoteFolder = {
        id: 'local-root', name: rootFolderName, parentId: null,
        path: selectedLocalFolder, expanded: true, children: [],
      }
      const buildChildren = (f: import('@/types').NoteFolder, allFolders: import('@/types').NoteFolder[]) => {
        const children = allFolders.filter(cf => cf.parentId === f.id)
        f.children = children.map(c => { const child = { ...c }; buildChildren(child, allFolders); return child })
      }
      buildChildren(rootFolder, result.folders)
      setLocalFolders([rootFolder])
      setLocalNotes(prev => mergeScannedNotes(result.notes, prev))
      // If the deleted folder was selected, fall back to root
      if (selectedFolderId === folder.id) {
        setSelectedFolderId('local-root')
      }
    }
  }, [selectedLocalFolder, selectedFolderId, setSelectedFolderId, scanDirectory, mergeScannedNotes])

  // ─── Folder context menu ───
  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folder: any) => {
    e.preventDefault()
    setFolderCtxMenu({ x: e.clientX, y: e.clientY, folder })
  }, [])

  // ─── Import Markdown files ───
  const handleImportMarkdown = useCallback(async (folder: any) => {
    if (!folder.path) return

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

      for (const filePath of files) {
        try {
          const mdContent = await readTextFile(filePath as string)
          const htmlBody = await marked(mdContent)
          const fileName = (filePath as string).split('/').pop()!.split('\\').pop()!.replace(/\.(md|markdown)$/i, '')
          const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title></head><body>${htmlBody}</body></html>`
          const targetPath = `${folder.path}/${fileName}.html`

          await writeTextFile(targetPath, htmlContent)
          imported++
          console.log(`[Import] Converted: ${filePath} → ${targetPath}`)
        } catch (err) {
          console.error(`[Import] Failed to import ${filePath}:`, err)
          errors++
        }
      }

      // Re-scan to refresh the tree
      if (selectedLocalFolder) {
        const result = await scanDirectory(selectedLocalFolder, null, selectedLocalFolder)
        const rootFolderName = selectedLocalFolder.split('/').pop() || selectedLocalFolder.split('\\').pop() || selectedLocalFolder
        const rootFolder: import('@/types').NoteFolder = {
          id: 'local-root', name: rootFolderName, parentId: null,
          path: selectedLocalFolder, expanded: true, children: [],
        }
        const buildChildren = (f: import('@/types').NoteFolder, allFolders: import('@/types').NoteFolder[]) => {
          const children = allFolders.filter(cf => cf.parentId === f.id)
          f.children = children.map(c => { const child = { ...c }; buildChildren(child, allFolders); return child })
        }
        buildChildren(rootFolder, result.folders)
        setLocalFolders([rootFolder])
        setLocalNotes(prev => mergeScannedNotes(result.notes, prev))
      }

      if (errors > 0) {
        await message(`导入完成：${imported} 个成功，${errors} 个失败`, { title: '导入结果', kind: 'warning' })
      } else {
        await message(`成功导入 ${imported} 个 Markdown 文件`, { title: '导入完成', kind: 'info' })
      }
    } catch (err) {
      console.error('[Import] Failed:', err)
      await message('导入失败: ' + (err instanceof Error ? err.message : String(err)), { title: '错误', kind: 'error' })
    }
  }, [selectedLocalFolder, scanDirectory, mergeScannedNotes])

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
            onClick={() => handleCreateNewFolder()}
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
                onClick={async () => {
                  setSelectedLocalFolder(null)
                  setLocalFolders([])
                  setLocalNotes([])
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
            onCreateSubFolder={selectedLocalFolder ? handleCreateNewFolder : undefined}
            onDeleteFolder={selectedLocalFolder ? handleDeleteFolder : undefined}
            onFolderContextMenu={selectedLocalFolder ? handleFolderContextMenu : undefined}
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
          <NoteEditor note={selectedNote} onLocalPersist={handleLocalNotePersist} reloadToken={reloadToken} />
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
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} note={ctxMenu.note} onClose={() => setCtxMenu(null)} onDelete={handleDeleteNote} onRevealFile={revealFile} />
      )}

      {/* Folder Context Menu */}
      {folderCtxMenu && (
        <FolderContextMenu x={folderCtxMenu.x} y={folderCtxMenu.y} folder={folderCtxMenu.folder} onClose={() => setFolderCtxMenu(null)} onImport={handleImportMarkdown} onRevealFolder={revealFolder} />
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
      <HistoryModal onRestore={handleRestoreLocalNote} />

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
