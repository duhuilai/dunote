import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { DataTable } from '@/extensions/dataTable'
import { SearchExtension, searchPluginKey } from '@/extensions/search'
import { WikiLink } from '@/extensions/wikiLink'
import { WikiLinkSuggestion } from '@/extensions/wikiLinkSuggestion'
import { ImeGuard, imeGrace, IME_GRACE_MS as GRACE_MS, IME_EXTENDED_GRACE_MS as EXT_GRACE_MS } from '@/extensions/imeGuard'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import { FontSize } from '@/extensions/FontSize'
import { SlashCommand } from './SlashCommand'
import TagEditor from './TagEditor'
import { showPrompt } from '@/utils/prompt'
import { pickImageFile } from '@/utils/imageEmbed'
import { saveNoteTitle, toRelPath } from '@/utils/noteMeta'
import { saveSnapshot } from '@/utils/noteSnapshots'
import { normalizeTagList, sameTags } from '@/utils/noteTags'
import type { Note } from '@/types'

/**
 * 自动保存的空闲判定时长（毫秒）。
 * 触发自动保存需同时满足「文档发生变化」，共两种情况：
 *   1. 停止操作满本时长（每次编辑都会重置计时器，即「5 秒内没有任何操作」）；
 *   2. 切换文档（由 switch effect 中的 flushPending 立即落盘）。
 */
const AUTOSAVE_IDLE_MS = 1500
const TITLE_SAVE_IDLE_MS = 650
type SaveVisualState = 'saved' | 'saving' | 'error'

function mergeSaveState(...states: SaveVisualState[]): SaveVisualState {
  if (states.includes('error')) return 'error'
  if (states.includes('saving')) return 'saving'
  return 'saved'
}

/* ─── 将图片文件转为 dataURL（base64），用于把粘贴/拖入的图片内嵌进笔记，避免 blob: 临时地址丢失 ─── */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * 从剪贴板 / 拖放数据中拿到真实图片字节。
 * 优先用 files 与 items（kind==='file'）——浏览器在复制网页图片时通常把图片以 item 形式提供，
 * 这种方式能跨源拿到真实字节，绝不会拿到会失效的 blob: 地址。
 */
function getImageFilesFromData(data: DataTransfer): File[] {
  const files: File[] = []
  for (const f of Array.from(data.files)) {
    if (f.type.startsWith('image/')) files.push(f)
  }
  const items = (data as any).items as DataTransferItem[] | undefined
  if (items) {
    for (const it of Array.from(items)) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) files.push(f)
      }
    }
  }
  return files
}

/**
 * 把 HTML 片段中的 blob: 图片（从网页复制图片时常为 <img src="blob:...">）转为 base64 内嵌。
 * 否则 blob: 地址随会话结束失效，重启/更新后图片丢失。http(s) 跨域可能失败，保留原地址。
 */
async function embedHtmlImages(html: string): Promise<string> {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const imgs = Array.from(doc.querySelectorAll('img'))
    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute('src') || ''
        if (!src.startsWith('blob:')) return
        try {
          const res = await fetch(src)
          const blob = await res.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader()
            r.onloadend = () => resolve(r.result as string)
            r.onerror = () => reject(new Error('readAsDataURL failed'))
            r.readAsDataURL(blob)
          })
          img.setAttribute('src', dataUrl)
        } catch {
          // 转换失败：移除该图片，避免残留会失效的 blob: 地址（否则重启/切换后图片丢失）
          img.remove()
        }
      }),
    )
    return doc.body.innerHTML
  } catch {
    return html
  }
}
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  List, ListOrdered, Quote, Code, CodeSquare,
  Link2, Image as ImageIcon, Highlighter, Palette, ChevronDown,
  Undo, Redo, Minus, Download, FileText, FileCode, FileType, Clock, History,
  AlignLeft, AlignCenter, AlignRight, Plus, Trash2, Table as TableIcon, X, Search,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Loader2, Save,
  Pin, PinOff, Focus, Minimize2, TextCursorInput, BookOpen, PencilLine,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react'
import { exportNote, exportToDownloads, type ExportFormat } from '@/utils/exportNote'
import { ExportSaveModal } from './ExportSaveModal'
import { toRelativePath, resolveGiteeRemoteUrl } from '@/utils/sync'
import {
  commitNoteFile,
  listHistory,
  readVersion,
  pushToRemote,
  pullRemote,
  GITEE_REMOTE,
} from '@/utils/gitBackup'
import { useAppStore } from '@/store'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { calculateNoteStats, EMPTY_NOTE_STATS } from '@/utils/noteStats'
import type { NoteAiBridge } from './noteAiBridge'

/* ─── Color Tokens ─── */
const C = {
  primary: 'var(--app-primary)',
  primaryHover: 'var(--app-primary-hover)',
  primaryLight: 'var(--app-primary-light)',
  primaryLightHover: 'var(--app-primary-light-hover)',
  accent: 'var(--app-accent)',
  bg: 'var(--app-bg)',
  border: 'var(--app-border)',
  text: 'var(--app-text)',
  textSecondary: 'var(--app-text-secondary)',
  textMuted: 'var(--app-text-muted)',
  success: 'var(--app-success)',
  warning: 'var(--app-warning)',
  danger: 'var(--app-danger)',
  dangerBg: 'var(--app-danger-bg)',
  surface: 'var(--app-surface)',
  shadow: 'var(--app-shadow)',
} as const

type EditorTarget = {
  noteId: string
  isLocal: boolean
  path: string | null
  root: string | null
  title: string
}

type SavedAiSelection = {
  noteId: string
  from: number
  to: number
  text: string
}

function noteTitleFromPath(filePath: string | null): string {
  if (!filePath) return '未命名'
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || '未命名'
  return fileName.replace(/\.html?$/i, '') || '未命名'
}

/**
 * 下拉/弹出层展开时，点击容器外部自动收起。
 *
 * 关键约定：一个 ref 只能绑定到一个 DOM 元素。若同一个 ref 绑到多处（例如主工具栏与
 * 浮动工具栏共用），后挂载的元素会覆盖 ref.current，且它在卸载时会被 React 置回 null，
 * 而先挂载的元素不会重新 attach —— 结果是 ref.current 永久为 null，
 * 判断 `!contains(target)` 恒不成立，弹层再也关不掉。
 * 因此这里在 ref 为空时直接收起（而不是跳过），保证任何情况下点击外部都能关闭。
 */
function useAutoDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  containerRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && containerRef.current && containerRef.current.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, setOpen, containerRef])
}

interface NoteEditorProps {
  note: Note
  /** 本地文件读取成功后同步内存数据，供大纲、搜索和侧栏使用最新内容 */
  onLocalLoad?: (noteId: string, content: string) => void
  /** 本地文件笔记落盘后，同步更新内存中的 localNotes（selectedNote 来源），避免切回时读到旧内容导致图片丢失 */
  onLocalPersist?: (noteId: string, content: string) => void
  /** 本地文件笔记标题变更后，同步更新内存中的 localNotes（让侧栏显示新标题） */
  onLocalTitlePersist?: (noteId: string, title: string) => void
  /** 本地文件笔记标签变更后，写入 .dunote-meta.json 并同步内存 */
  onLocalTagsPersist?: (noteId: string, tags: string[]) => void | Promise<void>
  /** 当前笔记列表中的全部标签，用于编辑器内自动补全 */
  tagSuggestions?: string[]
  /** 当前可链接的笔记，用于 [[标题]] 自动补全 */
  wikiLinkNotes?: Note[]
  /** 外部强制重载信号：恢复历史后 +1，让当前笔记（note.id 不变）重新从磁盘/内存加载最新内容 */
  reloadToken?: number
  /** 打开历史弹窗时指定默认页签：'snapshots' = 本地实时保存版本 */
  onOpenHistoryTab?: (tab: 'history' | 'snapshots') => void
  /** 窄屏下返回笔记列表 */
  onBackToNotes?: () => void
  /** 切换当前笔记的固定状态 */
  onTogglePinned?: (note: Note) => void | Promise<void>
  /** 打字机模式偏好由页面统一管理，供编辑器按钮与命令面板共享 */
  typewriterMode: boolean
  /** 切换打字机模式 */
  onToggleTypewriterMode: () => void
  /** 隐藏导航与次要控件，只保留沉浸式写作区域 */
  focusMode: boolean
  /** 切换专注模式 */
  onToggleFocusMode: () => void
  /** 阅读模式仅锁定编辑层，不修改或重新写入笔记内容 */
  readingMode: boolean
  /** 切换阅读模式 */
  onToggleReadingMode: () => void
  /** 打开正文中的 [[标题]] 链接；不存在时由页面决定是否新建 */
  onWikiLinkClick?: (title: string) => void | Promise<boolean>
  /** 笔记内 AI 会话面板是否打开 */
  aiPanelOpen: boolean
  /** 切换当前笔记的 AI 会话面板 */
  onToggleAiPanel: () => void
  /** 向笔记页发布实时编辑桥；加载、切换或卸载时传 null */
  onAiBridgeChange: (bridge: NoteAiBridge | null) => void
}

export default function NoteEditor({
  note,
  onLocalLoad,
  onLocalPersist,
  onLocalTitlePersist,
  onLocalTagsPersist,
  tagSuggestions = [],
  wikiLinkNotes = [],
  reloadToken = 0,
  onOpenHistoryTab,
  onBackToNotes,
  onTogglePinned,
  typewriterMode,
  onToggleTypewriterMode,
  focusMode,
  onToggleFocusMode,
  readingMode,
  onToggleReadingMode,
  onWikiLinkClick,
  aiPanelOpen,
  onToggleAiPanel,
  onAiBridgeChange,
}: NoteEditorProps) {
  const {
    updateNote,
    flushNotes,
    setShowHistory,
    setHistory,
    settings,
    showToast,
    localRootFolder,
    setSelectedNoteId,
  } = useAppStore()
  // 标题受控：与 note.title 同步，但允许本地临时编辑态（输入中文时如果直接绑 note.title，每次输入都会触发 store 更新，可能干扰 IME/光标）
  const [titleDraft, setTitleDraft] = useState<string>(note.title || '')
  // 供 persistContent（useCallback，闭包会过期）读取最新标题写入快照
  const titleRef = useRef<string>(note.title || '')
  const titleDraftRef = useRef<string>(note.title || '')
  const titleDraftNoteIdRef = useRef<string>(note.id)
  const noteRef = useRef(note)
  noteRef.current = note
  useEffect(() => { titleRef.current = titleDraft || note.title || '' }, [titleDraft, note.title])
  const [contentSaveState, setContentSaveState] = useState<SaveVisualState>('saved')
  const [titleSaveState, setTitleSaveState] = useState<SaveVisualState>('saved')
  const overallSaveState = mergeSaveState(contentSaveState, titleSaveState)
  const typewriterModeRef = useRef(typewriterMode)
  const typewriterFrameRef = useRef<number | null>(null)
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const readingModeRef = useRef(readingMode)
  readingModeRef.current = readingMode
  const onWikiLinkClickRef = useRef(onWikiLinkClick)
  onWikiLinkClickRef.current = onWikiLinkClick
  const wikiLinkNotesRef = useRef(wikiLinkNotes)
  wikiLinkNotesRef.current = wikiLinkNotes
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportTarget, setExportTarget] = useState<{ format: ExportFormat; title: string; html: string } | null>(null)
  const [isCreatingHistory, setIsCreatingHistory] = useState(false)
  const creatingHistoryRef = useRef(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 本地文件写入与普通笔记落盘按顺序执行，避免较慢的旧保存覆盖较新的内容。
  const contentSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const titleSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const titleSaveRevisionRef = useRef(0)
  // 笔记切换串行执行：先保存旧笔记，确认成功后才加载目标笔记。
  const transitionQueueRef = useRef<Promise<void>>(Promise.resolve())
  const switchRequestRef = useRef(0)
  // 让 onLocalTitlePersist 闭包也能拿到最新值（避免 useCallback 闭包陷阱）
  const onLocalTitlePersistRef = useRef(onLocalTitlePersist)
  onLocalTitlePersistRef.current = onLocalTitlePersist
  const onLocalTagsPersistRef = useRef(onLocalTagsPersist)
  onLocalTagsPersistRef.current = onLocalTagsPersist
  const baselineContentRef = useRef<string>(note.content || '')
  const lastEmittedRef = useRef<string>('') // 记录编辑器最近一次输出的 HTML，用于区分“自编辑”与“外部内容变更”
  const editorRef = useRef<Editor | null>(null)
  const aiPanelOpenRef = useRef(aiPanelOpen)
  aiPanelOpenRef.current = aiPanelOpen
  const onAiBridgeChangeRef = useRef(onAiBridgeChange)
  onAiBridgeChangeRef.current = onAiBridgeChange
  const publishAiBridgeRef = useRef<() => void>(() => {})
  const lastAiSelectionRef = useRef<SavedAiSelection | null>(null)
  // 记录“当前编辑器里加载的是哪个笔记”，用于切文档/卸载时把未保存的编辑正确落盘，避免图片等丢失
  const editorMetaRef = useRef<EditorTarget>({
    noteId: note.id,
    isLocal: !!note._isLocalFile,
    path: note.filePath ?? null,
    root: localRootFolder,
    title: note.title || '',
  })
  // 记录“编辑器已经加载并（对本地文件）从磁盘读取过的最新笔记 id”。
  // 用于区分“首次/切换进入”与“同一篇的外部变更”：前者以磁盘为权威重新读取，后者仅外部变更才重载，避免光标跳动。
  const loadedNoteIdRef = useRef<string | null>(null)
  // 加载/切换进行中的标志：本地文件笔记读取磁盘是异步的，期间编辑器仍显示旧内容但新笔记 meta 尚未生效。
  // 置位期间禁用编辑 + 让 onUpdate 排程的落盘失效，避免用户在卡顿间隙的输入被误落到旧笔记 / 以新笔记 meta 覆盖。
  const loadingRef = useRef(false)
  // 记录已处理过的 reloadToken，用于检测“恢复历史”等外部强制重载信号
  const reloadTokenRef = useRef<number>(reloadToken)
  // 让 useEditor 配置闭包里也能拿到最新的 onLocalPersist（避免闭包捕获初始值）
  const onLocalPersistRef = useRef(onLocalPersist)
  onLocalPersistRef.current = onLocalPersist
  const onLocalLoadRef = useRef(onLocalLoad)
  onLocalLoadRef.current = onLocalLoad
  const onOpenHistoryTabRef = useRef(onOpenHistoryTab)
  onOpenHistoryTabRef.current = onOpenHistoryTab
  // 标题落盘去抖：避免连续输入时把整个 meta 文件重写 N 次
  const titleCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 最近一次提交到磁盘/store 的标题（用于跳过未变更的写入）
  const lastCommittedTitleRef = useRef<string>(note.title || '')
  const lastCommittedTitleNoteIdRef = useRef<string>(note.id)
  useEffect(() => {
    document.body.classList.toggle('dunote-focus-mode', focusMode)
    return () => document.body.classList.remove('dunote-focus-mode')
  }, [focusMode])

  useEffect(() => {
    typewriterModeRef.current = typewriterMode
  }, [typewriterMode])

  // 卸载清理时读取最新闭包，同时保证保存 Promise 不会被提前丢弃。
  const flushPendingRef = useRef<() => Promise<boolean>>(async () => true)
  const flushPendingTitleRef = useRef<() => Promise<boolean>>(async () => true)
  // IME 合成状态：handleDOMEvents 追踪，handleKeyDown 据此放行所有按键。
  // macOS WKWebView 的 IME 事件时序与 Chromium 不同：确认键 keydown 常在 compositionend 之后、
  // 且 isComposing=false / keyCode≠229 才到达，单纯依赖 compositionstart/end 不够。
  // 故采用「合成态 + 宽限期」双信号，并在合成期间的 input/beforeinput 上持续续期，覆盖 macOS 时序差异。
  const composingRef = useRef<boolean>(false)
  const composingTimerRef = useRef<number | null>(null)
  // 最近一次合成活动时间戳（用于诊断：若确认键在宽限期外到达，可据此判断差多少 ms）
  const lastComposeTsRef = useRef<number>(0)
  // 合成态宽限期时长：远大于 Chromium 默认量级，给 macOS 确认键留足到达窗口。
  // 期间只拦截 Tab/Enter/空格等会移动光标/换行的键，正常连续输入极少被吞。
  // 注：实测 macOS WKWebView 上 IME 确认键晚到可达 700~1000ms，600ms 不够；提到 1200ms。
  const IME_GRACE_MS = GRACE_MS
  // 扩展宽限：宽限期到期后，再多保留 800ms 仅拦截「会移动光标/换行的键」。
  // 这样既不吞正常字符输入，又能在 macOS 极慢的确认键到达时仍拦住 splitBlock / goToNextCell。
  const IME_EXTENDED_GRACE_MS = EXT_GRACE_MS
  const armComposing = () => {
    composingRef.current = true
    lastComposeTsRef.current = Date.now()
    // 同步写入 ImeGuard 扩展的模块状态，供 filterTransaction 读取
    imeGrace.arm()
    if (composingTimerRef.current) clearTimeout(composingTimerRef.current)
    composingTimerRef.current = window.setTimeout(() => {
      composingRef.current = false
      // 必须同步结束 ImeGuard 的合成态：否则 imeGrace.composing 永久为 true，
      // filterTransaction 会长期拦截（表现为表格插入行/列失效、单元格内回车失效）。
      // end() 会把 lastTs 续到此刻，扩展宽限期据此再保留 IME_EXTENDED_GRACE_MS。
      imeGrace.end()
    }, IME_GRACE_MS)
  }

  // ─── 检索（Ctrl+F / Cmd+F） ───
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [matchIndex, setMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const lastSearchedRef = useRef('')

  const editorInstance = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false },
      }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: '输入/显示菜单或直接录入' }),
      // allowBase64 必须为 true：否则 TipTap 从 HTML 解析（setContent）时会丢弃 data:image/...;base64 图片，
      // 导致切换/重启后重新加载磁盘内容时图片消失（文本正常）。首次用 setImage 命令插入不受此限制，故只在重载时暴露。
      Image.configure({ allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      DataTable,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      SlashCommand,
      SearchExtension,
      WikiLink,
      WikiLinkSuggestion.configure({
        getNotes: () => wikiLinkNotesRef.current,
        getCurrentNoteId: () => noteRef.current.id,
        maxItems: 12,
      }),
      ImeGuard,
    ],
    // 初始内容留空：挂载后的加载 effect 一定会为当前笔记重新 setContent（本地笔记以磁盘为权威）。
    // 若这里传 note.content，大文档（含 base64 图片）会在启动时被解析两遍（一次在这里、
    // 一次在 effect 的 setContent），白白翻倍启动耗时与内存峰值。
    content: '',
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
      // 追踪 IME 合成状态：合成开始/结束都武装宽限期；合成期间的 input/beforeinput 持续续期，
      // 覆盖 macOS WKWebView 的 compositionstart/end 时序不稳、确认键晚到的情况。
      handleDOMEvents: {
        compositionstart: () => {
          armComposing()
          return false
        },
        compositionend: () => {
          armComposing()
          return false
        },
        // macOS WKWebView 上 compositionstart/end 时序不稳，但合成期间的 input/beforeinput
        // 会持续触发且 isComposing=true，借此续期合成态，确保确认键落在宽限期内被拦截。
        beforeinput: (_view, ev) => {
          const e = ev as InputEvent
          if (e.isComposing) armComposing()
          // 兜底拦截：宽限期内若浏览器派发 insertParagraph / insertLineBreak /
          // insertFromComposition，阻止默认行为（避免 ProseMirror 转成 splitBlock）。
          // ImeGuard.filterTransaction 是主防线，这里是前置拦截（部分浏览器在
          // filterTransaction 看到事务前可能已经派发 beforeinput）。
          if (!e.isComposing && imeGrace.isInGrace()) {
            const t = e.inputType
            if (t === 'insertParagraph' || t === 'insertLineBreak' || t === 'insertFromComposition') {
              e.preventDefault()
              return true
            }
          }
          return false
        },
        input: (_view, ev) => {
          const e = ev as InputEvent
          if (e.isComposing) armComposing()
          return false
        },
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-wiki-link]')
          : null
        if (!target) return false
        const title = target.dataset.wikiLink?.trim()
        if (!title || !onWikiLinkClickRef.current) return false
        if (!readingModeRef.current && !(event.ctrlKey || event.metaKey)) return false
        event.preventDefault()
        event.stopPropagation()
        void onWikiLinkClickRef.current(title)
        return true
      },
      handleKeyDown: (view, event) => {
        const ed = editorRef.current
        if (!ed) return false
        // ProseMirror 内部合成标记（view.composing）比 DOM 事件更可靠，覆盖部分浏览器合成态滞后场景。
        const pmComposing = (view as unknown as { composing?: boolean }).composing === true
        // IME 合成态识别（按键级）：合成中 isComposing / keyCode===229 / key==='Process' 任一命中即视为合成中。
        // 在“合成中的每一次按键”上把 composingRef 置 true 并续期宽限期，
        // 即使 compositionstart 不触发也能靠按键本身识别合成态，避免确认键漏过守卫。
        const imeKey = event.isComposing || event.keyCode === 229 || event.key === 'Process'
        // 合成中：拦截「所有键」，彻底阻止 ProseMirror keymap（goToNextCell / splitBlock 等）。
        // 返回 true 只阻止 ProseMirror 自身的 keymap；浏览器/OS 层的 IME 仍正常接收按键（互不干涉）。
        if (imeKey || pmComposing) {
          armComposing()
          return true
        }
        // 合成刚结束的「宽限期」（composingRef 仍为 true，最近一次合成活动后 IME_GRACE_MS 内）：
        // 拦截会移动光标/换行的 Tab / Enter / 空格——macOS 中文输入法用「空格」确认候选，
        // 确认键 keydown 上 isComposing===false 且 keyCode===32（非229），会落到此处宽限期分支；
        // 若不拦截，空格/Enter 进入 ProseMirror 触发 splitBlock（换行）或 Tab 触发 goToNextCell（光标跳格）。
        // 其余按键正常放行，避免误吞用户紧跟 IME 之后的正常输入。
        if (
          composingRef.current &&
          (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ' || event.code === 'Space')
        ) {
          return true
        }
        // 扩展宽限期（宽限到期后，再保留 IME_EXTENDED_GRACE_MS 时间窗口）：
        // macOS 上 IME 确认键可能晚于 1200ms 宽限期到达（实测可达 1500ms+），
        // 此时若不拦截，Enter 会触发 splitBlock 在单元格内插入新段，光标跳到新段开头，
        // 表现就是「文字插到了原段落但光标在新段开头 + 多出一个空行」。
        // 这里仅拦截会移动光标/换行的键，不吞普通字符输入。
        const isNavKey = event.key === 'Tab' || event.key === 'Enter' || event.key === ' ' || event.code === 'Space'
        const inExtendedGrace =
          lastComposeTsRef.current > 0 &&
          Date.now() - lastComposeTsRef.current < IME_EXTENDED_GRACE_MS
        if (isNavKey && inExtendedGrace) {
          return true
        }
        // ── 诊断（仅 macOS 等时序异常时触发）──
        // 若近期有合成活动、但确认键/导航键在扩展宽限期外才到达而未被拦截，记录事件特征，
        // 用于定位 macOS IME 时序（dtMs=距上次合成活动毫秒数）。正常流程不会进入此分支。
        if (
          isNavKey &&
          !inExtendedGrace &&
          lastComposeTsRef.current > 0 &&
          Date.now() - lastComposeTsRef.current < 4000
        ) {
          console.warn('[IME-DIAG] uncaught nav/confirm key after compose:', {
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            isComposing: event.isComposing,
            composingRef: composingRef.current,
            pmComposing,
            dtMs: Date.now() - lastComposeTsRef.current,
          })
        }
        // 智能表格等节点内的输入框/下拉，Tab 等按键应交由原生控件处理，不要被编辑器拦截
        const tgt = event.target as HTMLElement | null
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) {
          return false
        }
        if (event.key === 'Tab') {
          // In table: navigate between cells
          if (ed.isActive('table')) {
            event.preventDefault()
            if (event.shiftKey) {
              ed.commands.goToPreviousCell()
            } else {
              ed.commands.goToNextCell()
            }
            return true
          }
          // In code block: insert 2 spaces
          if (ed.isActive('codeBlock')) {
            event.preventDefault()
            ed.commands.insertContent('  ')
            return true
          }
          // In list / task item: let TipTap handle sink/lift natively
          if (ed.isActive('listItem') || ed.isActive('taskItem')) {
            return false
          }
          // Default: insert indentation (2 em-spaces for visible tab width)
          event.preventDefault()
          ed.commands.insertContent('\u2003\u2003')
          return true
        }
        return false
      },
      // 粘贴 / 拖入图片：转为 base64 内嵌，避免 blob: 临时地址随软件重启或更新丢失
      handlePaste: (_view, event) => {
        const data = event.clipboardData
        if (!data) return false
        // 1) 直接从剪贴板拿到图片真实字节（文件复制 / 网页复制图片常以 item(kind=file) 形式提供，
        //    可跨源拿到字节，不会拿到会失效的 blob: 地址）
        const imgFiles = getImageFilesFromData(data)
        if (imgFiles.length > 0) {
          event.preventDefault()
          const ed = editorRef.current
          if (!ed) return true
          const targetNoteId = editorMetaRef.current.noteId
          Promise.all(imgFiles.map((f) => fileToDataUrl(f).catch(() => null)))
            .then((srcs) => {
              const valid = srcs.filter((s): s is string => !!s)
              // 若粘贴/读取期间已切换到其它文档，丢弃本次插入，避免污染其它笔记
              if (editorMetaRef.current.noteId !== targetNoteId || valid.length === 0) return
              const chain = ed.chain().focus()
              valid.forEach((src) => chain.setImage({ src }))
              chain.run()
            })
          return true
        }
        // 2) 退路：剪贴板 HTML 含 blob: 图片（极少数环境取不到文件字节时）。
        //    把 blob: 转 base64；转换失败的图片直接移除，绝不保留失效的 blob: 地址（否则重启/切换后图片丢失）
        const html = data.getData('text/html')
        if (html && /<img[^>]+src\s*=\s*["']?blob:/i.test(html)) {
          event.preventDefault()
          const ed = editorRef.current
          if (!ed) return true
          const targetNoteId = editorMetaRef.current.noteId
          embedHtmlImages(html).then((clean) => {
            if (editorMetaRef.current.noteId !== targetNoteId) return
            ed.chain().focus().insertContent(clean).run()
          })
          return true
        }
        return false
      },
      handleDrop: (_view, event) => {
        const drag = event as DragEvent
        const data = drag.dataTransfer
        if (!data) return false
        const imgFiles = getImageFilesFromData(data)
        if (imgFiles.length > 0) {
          event.preventDefault()
          const ed = editorRef.current
          if (!ed) return true
          const targetNoteId = editorMetaRef.current.noteId
          Promise.all(imgFiles.map((f) => fileToDataUrl(f).catch(() => null)))
            .then((srcs) => {
              const valid = srcs.filter((s): s is string => !!s)
              if (editorMetaRef.current.noteId !== targetNoteId || valid.length === 0) return
              const chain = ed.chain().focus()
              valid.forEach((src) => chain.setImage({ src }))
              chain.run()
            })
          return true
        }
        // 拖入的 HTML 含 blob: 图片，同样转 base64；转换失败的图片移除
        const html = data.getData('text/html')
        if (html && /<img[^>]+src\s*=\s*["']?blob:/i.test(html)) {
          event.preventDefault()
          const ed = editorRef.current
          if (!ed) return true
          const targetNoteId = editorMetaRef.current.noteId
          embedHtmlImages(html).then((clean) => {
            if (editorMetaRef.current.noteId !== targetNoteId) return
            ed.chain().focus().insertContent(clean).run()
          })
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      // 切换/加载进行中：旧笔记已由 flushPending 捕获落盘，新笔记内容尚未加载，
      // 此阶段的 onUpdate 是“卡顿间隙的误输入”，不应排程落盘（否则可能以新笔记 meta 覆盖旧笔记内容）。
      if (loadingRef.current) return
      // 自动保存触发条件（两条，均要求「文档确实发生变化」）：
      //   1) 停止操作满 AUTOSAVE_IDLE_MS（5 秒）；
      //   2) 切换文档（由下方 switch effect 的 flushPending 触发）。
      // 每次编辑都会重置计时器，因此是「5 秒内没有任何操作」才落盘，而非固定每 5 秒写一次。
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      publishAiBridgeRef.current()
      saveTimeoutRef.current = setTimeout(() => {
        const content = editor.getHTML()
        // 记录编辑器本次产出的 HTML，供下方 effect 判断是否为自编辑（自编辑不回灌 setContent）
        lastEmittedRef.current = content
        // 仅当内容相对基线（上次加载/保存的内容）确有变化才落盘——对应“文档发生变化”
        if (content !== baselineContentRef.current) {
          void persistContent(content).then((saved) => {
            if (saved) baselineContentRef.current = content
          })
        }
      }, AUTOSAVE_IDLE_MS)
    },
    onSelectionUpdate: ({ editor }) => {
      if (
        !loadingRef.current
        && loadedNoteIdRef.current === editorMetaRef.current.noteId
        && editor.state.selection.from !== editor.state.selection.to
      ) {
        lastAiSelectionRef.current = {
          noteId: editorMetaRef.current.noteId,
          from: editor.state.selection.from,
          to: editor.state.selection.to,
          text: editor.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
            '\n',
            '\n',
          ),
        }
      }
      publishAiBridgeRef.current()
    },
  })

  // Keep editorRef in sync for use inside handleKeyDown (TipTap v3 passes (view, event), not ({editor, event}))
  const editor = editorInstance as Editor
  editorRef.current = editorInstance

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed) return
    if (loadingRef.current) return
    try {
      editorInstance.setEditable(!readingMode)
    } catch {
      // 编辑器正在切换时由文档切换 effect 在结束时恢复正确状态。
    }
  }, [editorInstance, readingMode])

  const publishAiBridge = useCallback(() => {
    const ed = editorRef.current
    const expectedNoteId = note.id
    const noteMatches = Boolean(
      ed
      && !ed.isDestroyed
      && noteRef.current.id === expectedNoteId
      && editorMetaRef.current.noteId === expectedNoteId
      && loadedNoteIdRef.current === expectedNoteId,
    )

    if (!aiPanelOpenRef.current || !noteMatches || !ed) {
      onAiBridgeChangeRef.current?.(null)
      return
    }

    const canWrite = () => Boolean(
      aiPanelOpenRef.current
      && !readingModeRef.current
      && !loadingRef.current
      && !ed.isDestroyed
      && noteRef.current.id === expectedNoteId
      && editorMetaRef.current.noteId === expectedNoteId
      && loadedNoteIdRef.current === expectedNoteId,
    )

    const finishWrite = (changed: boolean): boolean => {
      if (!changed) return false
      lastAiSelectionRef.current = null
      publishAiBridgeRef.current()
      return true
    }

    const expectedSelection = lastAiSelectionRef.current
    const hasSelection = Boolean(
      expectedSelection
      && expectedSelection.noteId === expectedNoteId
      && expectedSelection.from < expectedSelection.to
      && expectedSelection.text.trim(),
    )

    const bridge: NoteAiBridge = {
      noteId: expectedNoteId,
      characterCount: Array.from(
        ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n'),
      ).length,
      selectionCharacterCount: hasSelection && expectedSelection
        ? Array.from(expectedSelection.text).length
        : 0,
      hasSelection,
      readOnly: readingMode,
      ready: true,
      getPlainText: () => {
        if (ed.isDestroyed || editorMetaRef.current.noteId !== expectedNoteId) return ''
        return ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n')
      },
      getSelectedText: () => {
        const selection = lastAiSelectionRef.current
        if (
          !selection
          || selection.noteId !== expectedNoteId
          || selection.from >= selection.to
          || selection.to > ed.state.doc.content.size
        ) return ''
        return ed.state.doc.textBetween(selection.from, selection.to, '\n', '\n')
      },
      insertHtml: (html) => {
        if (!html.trim() || !canWrite()) return false
        try {
          const position = Math.min(ed.state.selection.to, ed.state.doc.content.size)
          const changed = ed.chain()
            .setTextSelection(position)
            .focus()
            .insertContent(html)
            .run()
          return finishWrite(changed)
        } catch {
          return false
        }
      },
      replaceSelection: (html) => {
        if (!html.trim() || !canWrite()) return false
        const selection = lastAiSelectionRef.current
        if (
          !selection
          || selection.noteId !== expectedNoteId
          || selection.from >= selection.to
          || selection.to > ed.state.doc.content.size
        ) return false
        const currentText = ed.state.doc.textBetween(selection.from, selection.to, '\n', '\n')
        if (currentText !== selection.text) {
          lastAiSelectionRef.current = null
          publishAiBridgeRef.current()
          return false
        }
        try {
          const changed = ed.chain()
            .setTextSelection({ from: selection.from, to: selection.to })
            .focus()
            .deleteSelection()
            .insertContent(html)
            .run()
          return finishWrite(changed)
        } catch {
          return false
        }
      },
      appendHtml: (html) => {
        if (!html.trim() || !canWrite()) return false
        try {
          const end = ed.state.doc.content.size
          const separator = ed.isEmpty ? '' : '<p></p>'
          const changed = ed.chain()
            .setTextSelection(end)
            .focus()
            .insertContent(`${separator}${html}`)
            .run()
          return finishWrite(changed)
        } catch {
          return false
        }
      },
    }

    onAiBridgeChangeRef.current?.(bridge)
  }, [note.id, readingMode])
  publishAiBridgeRef.current = publishAiBridge

  useEffect(() => {
    publishAiBridgeRef.current()
  }, [aiPanelOpen, note.id, readingMode, reloadToken])

  useEffect(() => () => {
    onAiBridgeChangeRef.current?.(null)
  }, [])

  // 立即把当前编辑器里“尚未落盘”的内容（如刚粘贴、自动保存空闲未触发的图片）写入 editorMetaRef 所指的笔记。
  // 用于“切到其它文档前”与“组件卸载前”，避免未保存的编辑丢失（对应自动保存第 2 种触发：切换文档且已变化）。
  const persistContent = useCallback((content: string, target = editorMetaRef.current): Promise<boolean> => {
    setContentSaveState('saving')

    const write = async (): Promise<boolean> => {
      try {
        if (target.isLocal) {
          if (!target.path) throw new Error('本地笔记缺少文件路径')
          await writeTextFile(target.path, content)
          // 只有磁盘写入成功后才更新内存与快照，避免界面展示与真实文件不一致。
          onLocalPersistRef.current?.(target.noteId, content)
        } else {
          updateNote(target.noteId, { content })
          await flushNotes()
        }

        void saveSnapshot(
          target.noteId,
          target.title || titleRef.current || '未命名',
          content,
        ).catch((error) => {
          console.warn('[NoteEditor] 写入实时快照失败:', error)
        })

        if (editorMetaRef.current.noteId === target.noteId) {
          setContentSaveState('saved')
        }
        return true
      } catch (error) {
        console.error('[NoteEditor] 保存笔记失败:', error)
        if (editorMetaRef.current.noteId === target.noteId) {
          setContentSaveState('error')
        }
        showToast(
          `保存失败：${error instanceof Error ? error.message : String(error)}`,
          'error',
        )
        return false
      }
    }

    const task = contentSaveQueueRef.current.then(write, write)
    contentSaveQueueRef.current = task.then(() => undefined, () => undefined)
    return task
  }, [flushNotes, showToast, updateNote])

  // 立即把当前编辑器里“尚未落盘”的内容写入 editorMetaRef 所指的笔记。
  // 用于“切到其它文档前”与“组件卸载前”，避免未保存的编辑丢失（对应自动保存第 2 种触发：切换文档且已变化）。
  const flushPending = useCallback(async (): Promise<boolean> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return true
    // The initial document load is async; do not persist the empty editor shell.
    if (loadedNoteIdRef.current === null) return true
    let content: string
    try {
      content = ed.getHTML()
    } catch {
      return false
    }
    if (content === baselineContentRef.current) return true
    // 切换笔记 / 卸载前的落盘，同样会触发实时保存版本留档
    const saved = await persistContent(content)
    if (saved) baselineContentRef.current = content
    return saved
  }, [persistContent])

  const commitTitle = useCallback((target: EditorTarget, value: string): Promise<boolean> => {
    const trimmed = (value || '').trim()
    if (
      lastCommittedTitleNoteIdRef.current === target.noteId
      && lastCommittedTitleRef.current === trimmed
    ) {
      return Promise.resolve(true)
    }

    const revision = ++titleSaveRevisionRef.current
    if (editorMetaRef.current.noteId === target.noteId) {
      setTitleSaveState('saving')
    }

    const write = async (): Promise<boolean> => {
      try {
        if (target.isLocal) {
          if (!target.root || !target.path) {
            throw new Error('本地笔记缺少根目录或文件路径')
          }
          await saveNoteTitle(target.root, toRelPath(target.root, target.path), trimmed)
          // 磁盘成功后再更新界面；空标题沿用文件名作为可见标题。
          onLocalTitlePersistRef.current?.(
            target.noteId,
            trimmed || noteTitleFromPath(target.path),
          )
        } else {
          updateNote(target.noteId, { title: trimmed })
          await flushNotes()
        }

        if (editorMetaRef.current.noteId === target.noteId) {
          lastCommittedTitleNoteIdRef.current = target.noteId
          lastCommittedTitleRef.current = trimmed
          editorMetaRef.current.title = trimmed
          titleRef.current = trimmed
          if (revision === titleSaveRevisionRef.current) {
            setTitleSaveState('saved')
          }
        }
        return true
      } catch (error) {
        console.error('[NoteEditor] 保存标题失败:', error)
        if (editorMetaRef.current.noteId === target.noteId) {
          setTitleSaveState('error')
        }
        showToast(
          `标题保存失败：${error instanceof Error ? error.message : String(error)}`,
          'error',
        )
        return false
      }
    }

    const task = titleSaveQueueRef.current.then(write, write)
    titleSaveQueueRef.current = task.then(() => undefined, () => undefined)
    return task
  }, [flushNotes, showToast, updateNote])

  const handleTagsChange = useCallback((nextTags: string[]) => {
    const normalized = normalizeTagList(nextTags)
    if (sameTags(note.tags || [], normalized)) return

    if (note._isLocalFile) {
      void Promise.resolve(onLocalTagsPersistRef.current?.(note.id, normalized)).catch((error) => {
        console.error('[NoteEditor] 保存标签失败:', error)
        showToast(
          `标签保存失败：${error instanceof Error ? error.message : String(error)}`,
          'error',
        )
      })
      return
    }

    updateNote(note.id, { tags: normalized })
  }, [note._isLocalFile, note.id, note.tags, showToast, updateNote])

  const flushPendingTitle = useCallback(async (): Promise<boolean> => {
    if (titleCommitTimerRef.current) {
      clearTimeout(titleCommitTimerRef.current)
      titleCommitTimerRef.current = null
    }
    const target = { ...editorMetaRef.current }
    const title = titleDraftNoteIdRef.current === target.noteId
      ? titleDraftRef.current
      : target.title
    return commitTitle(target, title)
  }, [commitTitle])

  flushPendingRef.current = flushPending
  flushPendingTitleRef.current = flushPendingTitle

  // 用 layout effect：内容切换（flush 旧笔记 + 锁定编辑 + setContent）在浏览器绘制前完成，
  // 避免先绘制出上一篇/空内容再跳变，同时消除「初始 content 为空」带来的空帧窗口。
  useLayoutEffect(() => {
    if (!editor) return
    const targetId = note.id
    const isLocal = !!note._isLocalFile
    const path = note.filePath ?? null
    const targetTitle = note.title || ''

    // 检测外部强制重载信号（恢复历史）：token 变化时即使是同一篇笔记也要重新加载
    const forceReload = reloadTokenRef.current !== reloadToken
    reloadTokenRef.current = reloadToken

    // 同一篇笔记已加载过且无强制重载信号：不重载，避免光标跳动 / 覆盖自身编辑内容
    if (loadedNoteIdRef.current === targetId && !forceReload) return

    const request = ++switchRequestRef.current
    loadingRef.current = true
    lastAiSelectionRef.current = null
    onAiBridgeChangeRef.current?.(null)
    try {
      editor.setEditable(false)
    } catch {
      /* 编辑器尚未就绪，忽略 */
    }
    const runTransition = async () => {
      if (request !== switchRequestRef.current || noteRef.current.id !== targetId) return

      const previous = { ...editorMetaRef.current }
      try {
        // 切换文档前先保存旧文档。首次打开和强制恢复历史时不回写旧内容。
        if (loadedNoteIdRef.current !== null && !forceReload) {
          const titleSaved = await flushPendingTitleRef.current()
          if (!titleSaved) throw new Error('上一笔记的标题尚未保存')
          if (request !== switchRequestRef.current) return

          const contentSaved = await flushPendingRef.current()
          if (!contentSaved) throw new Error('上一笔记的内容尚未保存')
          if (request !== switchRequestRef.current) return
        }

        const content = isLocal
          ? path
            ? await readTextFile(path)
            : (() => { throw new Error('本地笔记缺少文件路径') })()
          : (note.content || '')

        // 读取是异步的，完成时必须再次校验最新请求，避免 A→B→C 的旧结果覆盖 C。
        if (
          editor.isDestroyed
          || request !== switchRequestRef.current
          || noteRef.current.id !== targetId
        ) return

        baselineContentRef.current = content
        lastEmittedRef.current = content
        editor.commands.setContent(content)
        editorMetaRef.current = {
          noteId: targetId,
          isLocal,
          path,
          root: localRootFolder,
          title: targetTitle,
        }
        loadedNoteIdRef.current = targetId
        titleDraftNoteIdRef.current = targetId
        titleDraftRef.current = targetTitle
        titleRef.current = targetTitle
        lastCommittedTitleNoteIdRef.current = targetId
        lastCommittedTitleRef.current = targetTitle
        setTitleDraft(targetTitle)
        setContentSaveState('saved')
        setTitleSaveState('saved')

        if (isLocal) {
          onLocalLoadRef.current?.(targetId, content)
        }
      } catch (error) {
        console.error('[NoteEditor] 切换笔记失败:', error)
        if (request === switchRequestRef.current) {
          // 保存或读取失败时保持原编辑器内容，并把选择恢复到内容真正所属的笔记。
          if (loadedNoteIdRef.current !== null) {
            setSelectedNoteId(previous.noteId)
          }
          showToast(
            `无法打开或保存笔记：${error instanceof Error ? error.message : String(error)}`,
            'error',
          )
        }
      } finally {
        if (request === switchRequestRef.current) {
          loadingRef.current = false
          try {
            if (!editor.isDestroyed) editor.setEditable(!readingModeRef.current)
          } catch {
            /* 忽略 */
          }
          publishAiBridgeRef.current()
        }
      }
    }

    const task = transitionQueueRef.current.then(runTransition, runTransition)
    transitionQueueRef.current = task.then(() => undefined, () => undefined)
  }, [editor, note._isLocalFile, note.content, note.filePath, note.id, note.title, reloadToken, localRootFolder, setSelectedNoteId, showToast])

  // 标题编辑：立即保留草稿，空闲 650ms 后串行写入。切换笔记时由过渡队列强制 flush。
  const handleTitleChange = useCallback((value: string) => {
    const target = { ...editorMetaRef.current }
    if (target.noteId !== note.id) return
    titleDraftRef.current = value
    titleDraftNoteIdRef.current = target.noteId
    target.title = value
    editorMetaRef.current.title = value
    setTitleDraft(value)
    if (titleCommitTimerRef.current) clearTimeout(titleCommitTimerRef.current)
    titleCommitTimerRef.current = setTimeout(() => {
      titleCommitTimerRef.current = null
      void commitTitle(target, value)
    }, TITLE_SAVE_IDLE_MS)
  }, [commitTitle, note.id])

  const saveAll = useCallback(async (): Promise<boolean> => {
    const titleSaved = await flushPendingTitle()
    const contentSaved = await flushPending()
    if (!titleSaved || !contentSaved) return false
    try {
      await flushNotes()
      showToast('已保存', 'success')
      return true
    } catch (error) {
      showToast(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
        'error',
      )
      return false
    }
  }, [flushNotes, flushPending, flushPendingTitle, showToast])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (
        event.repeat
        || !(event.ctrlKey || event.metaKey)
        || event.altKey
        || event.key.toLowerCase() !== 's'
      ) return
      event.preventDefault()
      void saveAll()
    }

    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [saveAll])

  // Cleanup 只注册一次；通过 ref 调用最新 flush，避免切换笔记时反复执行卸载清理。
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (titleCommitTimerRef.current) clearTimeout(titleCommitTimerRef.current)
      void flushPendingTitleRef.current()
      void flushPendingRef.current()
    }
  }, [])

  // ─── 检索功能：打开 / 检索 / 上一个下一个 / 关闭 ───
  const clearSearchState = useCallback(() => {
    const ed = editorRef.current
    if (ed) ed.view.dispatch(ed.state.tr.setMeta(searchPluginKey, { query: '' }))
    setSearchQuery('')
    setMatchCount(0)
    setMatchIndex(0)
    lastSearchedRef.current = ''
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    // 预填当前选中的文本作为检索词（不立即检索，等回车 / 按钮）
    const ed = editorRef.current
    if (ed) {
      const { from, to } = ed.state.selection
      if (from !== to) {
        const sel = ed.state.doc.textBetween(from, to, ' ')
        if (sel) setSearchQuery(sel)
      }
    }
    lastSearchedRef.current = ''
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const runSearch = useCallback((q: string, navigate = false) => {
    const ed = editorRef.current
    if (!ed) return
    // 关键词未变且已检索过 → 跳到下一个匹配；否则按新关键词重新检索并定位到第一个
    if (navigate && q === lastSearchedRef.current) {
      ed.view.dispatch(ed.state.tr.setMeta(searchPluginKey, { step: 1 }))
      const st = searchPluginKey.getState(ed.state)
      setMatchIndex(st && st.matches.length ? st.current + 1 : 0)
      return
    }
    ed.view.dispatch(ed.state.tr.setMeta(searchPluginKey, { query: q }))
    lastSearchedRef.current = q
    const st = searchPluginKey.getState(ed.state)
    const count = st?.matches.length ?? 0
    setMatchCount(count)
    setMatchIndex(count ? 1 : 0)
    if (q && count === 0) showToast('无匹配信息', 'info')
  }, [showToast])

  const gotoMatch = useCallback((step: number) => {
    const ed = editorRef.current
    if (!ed) return
    const st0 = searchPluginKey.getState(ed.state)
    if (!st0 || st0.matches.length === 0) return
    ed.view.dispatch(ed.state.tr.setMeta(searchPluginKey, { step }))
    const st = searchPluginKey.getState(ed.state)
    setMatchCount(st?.matches.length ?? 0)
    setMatchIndex(st && st.matches.length ? st.current + 1 : 0)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    clearSearchState()
  }, [clearSearchState])

  // Ctrl+F / Cmd+F 打开检索，并阻止浏览器默认查找
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey)
        && !e.altKey
        && !e.shiftKey
        && (e.key === 'f' || e.key === 'F')
      ) {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch])

  // 切换笔记时清除检索状态，避免把上一篇的匹配带到新笔记
  useEffect(() => {
    clearSearchState()
    setSearchOpen(false)
  }, [note.id, clearSearchState])

  // 所有 Hook 必须无条件执行。TipTap 首次渲染时 editor 暂时为 null，
  // 把唯一的提前返回放在 Hook 区域之后，避免切换笔记时 Hook 顺序变化。
  useAutoDismiss(showExportMenu, setShowExportMenu, exportMenuRef)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showColorPicker, setShowColorPicker, colorPickerRef)

  const [showTableColorPicker, setShowTableColorPicker] = useState(false)
  const tableColorPickerRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showTableColorPicker, setShowTableColorPicker, tableColorPickerRef)

  const [showTextFontFamilyMenu, setShowTextFontFamilyMenu] = useState(false)
  const textFontFamilyRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showTextFontFamilyMenu, setShowTextFontFamilyMenu, textFontFamilyRef)

  const [showTextFontSizeMenu, setShowTextFontSizeMenu] = useState(false)
  const textFontSizeRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showTextFontSizeMenu, setShowTextFontSizeMenu, textFontSizeRef)

  const [showTextColorPicker, setShowTextColorPicker] = useState(false)
  const textColorPickerRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showTextColorPicker, setShowTextColorPicker, textColorPickerRef)

  const [showFontFamilyMenu, setShowFontFamilyMenu] = useState(false)
  const fontFamilyRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showFontFamilyMenu, setShowFontFamilyMenu, fontFamilyRef)

  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false)
  const fontSizeRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showFontSizeMenu, setShowFontSizeMenu, fontSizeRef)

  const { currentFontFamily, currentFontSize } = useEditorState({
    editor: editorInstance,
    selector: ({ editor: ed }) => {
      if (!ed) return { currentFontFamily: '', currentFontSize: '' }
      const attrs = ed.getAttributes('textStyle')
      return {
        currentFontFamily: (attrs.fontFamily as string | null) || '',
        currentFontSize: (attrs.fontSize as string | null) || '',
      }
    },
  }) || { currentFontFamily: '', currentFontSize: '' }

  const noteStats = useEditorState({
    editor: editorInstance,
    selector: ({ editor: ed }) => {
      if (!ed) return EMPTY_NOTE_STATS
      try {
        const text = ed.state.doc.textBetween(
          0,
          ed.state.doc.content.size,
          '\n',
          '\n',
        )
        return calculateNoteStats(text)
      } catch {
        return EMPTY_NOTE_STATS
      }
    },
  }) ?? EMPTY_NOTE_STATS

  const centerTypewriterCursor = useCallback((editor: Editor) => {
    const scroll = editorScrollRef.current
    if (
      !typewriterModeRef.current
      || !scroll
      || composingRef.current
      || !editor.view.hasFocus()
    ) return

    const selection = editor.state.selection
    if (!selection.empty) return

    try {
      const coords = editor.view.coordsAtPos(selection.head)
      const rect = scroll.getBoundingClientRect()
      if (rect.height < 120) return
      const caretY = (coords.top + coords.bottom) / 2
      const targetY = rect.top + rect.height / 2
      const delta = caretY - targetY
      if (Math.abs(delta) < 8) return

      const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
      scroll.scrollTop = Math.min(maxScrollTop, Math.max(0, scroll.scrollTop + delta))
    } catch {
      // 文档切换或布局瞬时变化时，坐标可能暂时不可用。
    }
  }, [])

  useEffect(() => {
    typewriterModeRef.current = typewriterMode
    if (typewriterFrameRef.current !== null) {
      window.cancelAnimationFrame(typewriterFrameRef.current)
      typewriterFrameRef.current = null
    }
    if (!typewriterMode || !editorInstance || readingMode) return

    const scheduleCenter = () => {
      if (!typewriterModeRef.current) return
      if (typewriterFrameRef.current !== null) {
        window.cancelAnimationFrame(typewriterFrameRef.current)
      }
      typewriterFrameRef.current = window.requestAnimationFrame(() => {
        typewriterFrameRef.current = null
        centerTypewriterCursor(editorInstance)
      })
    }

    editorInstance.on('selectionUpdate', scheduleCenter)
    editorInstance.on('update', scheduleCenter)
    scheduleCenter()

    return () => {
      editorInstance.off('selectionUpdate', scheduleCenter)
      editorInstance.off('update', scheduleCenter)
      if (typewriterFrameRef.current !== null) {
        window.cancelAnimationFrame(typewriterFrameRef.current)
        typewriterFrameRef.current = null
      }
    }
  }, [centerTypewriterCursor, editorInstance, focusMode, readingMode, typewriterMode])

  const [showCellColorPicker, setShowCellColorPicker] = useState(false)
  const cellColorRef = useRef<HTMLDivElement>(null)
  useAutoDismiss(showCellColorPicker, setShowCellColorPicker, cellColorRef)

  const [showTableContextMenu, setShowTableContextMenu] = useState(false)
  const [tableContextMenuPos, setTableContextMenuPos] = useState({ x: 0, y: 0 })
  const tableContextMenuRef = useRef<HTMLDivElement>(null)

  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const insertMenuRef = useRef<HTMLDivElement>(null)
  const [insertCount, setInsertCount] = useState(1)

  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const deleteMenuRef = useRef<HTMLDivElement>(null)

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

  const [showTextContextMenu, setShowTextContextMenu] = useState(false)
  const [textContextMenuPos, setTextContextMenuPos] = useState({ x: 0, y: 0 })
  const textContextMenuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (showTableContextMenu) return
    setShowTableColorPicker(false)
    setShowCellColorPicker(false)
    setShowInsertMenu(false)
    setShowDeleteMenu(false)
  }, [showTableContextMenu])

  useEffect(() => {
    if (showTextContextMenu) return
    setShowTextFontFamilyMenu(false)
    setShowTextFontSizeMenu(false)
    setShowTextColorPicker(false)
  }, [showTextContextMenu])

  if (!editorInstance) return null

  const handleExport = (format: ExportFormat) => {
    setShowExportMenu(false)
    setExportTarget({ format, title: note.title || 'untitled', html: editor.getHTML() })
  }

  // 计算当前笔记在备份仓库中的相对路径
  const hasLocalHistoryTarget = note._isLocalFile === true && !!note.filePath

  const requireLocalHistoryTarget = (): boolean => {
    if (hasLocalHistoryTarget) return true
    showToast('仅本地文件夹中的笔记支持版本备份', 'info')
    return false
  }

  const resolveBackupTarget = (): { repoDir: string; relPath: string } | null => {
    const repoDir = localRootFolder
    if (!repoDir || !hasLocalHistoryTarget) return null
    const rel = toRelativePath(note.filePath, repoDir).replace(/\\/g, '/')
    return rel ? { repoDir, relPath: rel } : null
  }

  // 生成版本 = 把当前笔记真实文件提交进 git 仓库（Gitee 模式再 push）
  const handleCreateHistory = async () => {
    if (!requireLocalHistoryTarget()) return
    if (creatingHistoryRef.current) return
    creatingHistoryRef.current = true
    setIsCreatingHistory(true)
    try {
      const target = resolveBackupTarget()
      if (!target) {
        showToast('无法定位当前笔记的本地文件', 'error')
        return
      }
      const content = editor.getHTML()
      const ts = new Date().toLocaleString('zh-CN')
      const commitRes = await commitNoteFile({
        repoDir: target.repoDir,
        relPath: target.relPath,
        content,
        message: `duNote 备份: ${note.title} @ ${ts}`,
      })
      if (!commitRes.success) {
        showToast('生成本地版本失败：' + (commitRes.message || ''), 'error')
        return
      }

      const syncConfig = settings.syncConfig
      const useGitee = syncConfig.type === 'gitee' && syncConfig.token && syncConfig.repo
      if (useGitee) {
        showToast('正在同步到 Gitee…', 'info')
        const remote = await resolveGiteeRemoteUrl(syncConfig)
        if (!remote) {
          showToast('Gitee 仓库名无效，请检查设置', 'error')
          return
        }
        const pushRes = await pushToRemote({
          repoDir: target.repoDir,
          remoteUrl: remote.url,
          token: syncConfig.token,
          username: remote.owner,
          branch: syncConfig.branch || 'main',
        })
        if (!pushRes.success) {
          showToast('Gitee 同步失败：' + (pushRes.message || ''), 'error')
          return
        }
      }

      showToast(useGitee ? '已生成版本（本地 + Gitee）' : '已生成本地版本', 'success')
    } finally {
      creatingHistoryRef.current = false
      setIsCreatingHistory(false)
    }
  }

  // 打开「实时保存版本」：直接落在本地实时保存版本页签，可从任意一次自动保存找回
  const handleOpenRealtimeHistory = () => {
    if (!requireLocalHistoryTarget()) return
    setSelectedNoteId(note.id)
    onOpenHistoryTabRef.current?.('snapshots')
    setShowHistory(true)
  }

  // 打开历史面板：从 git log 取版本（Gitee 模式先拉取远程最新）
  const handleOpenHistory = async () => {
    if (!requireLocalHistoryTarget()) return
    onOpenHistoryTabRef.current?.('history')
    try {
      setSelectedNoteId(note.id)
      const target = resolveBackupTarget()
      if (!target) {
        showToast('无法定位当前笔记的本地文件', 'error')
        return
      }

      const syncConfig = settings.syncConfig
      const useGitee = syncConfig.type === 'gitee' && syncConfig.token && syncConfig.repo
      if (useGitee) {
        showToast('正在从 Gitee 拉取…', 'info')
        const remote = await resolveGiteeRemoteUrl(syncConfig)
        if (remote) {
          const pull = await pullRemote({
            repoDir: target.repoDir,
            remoteUrl: remote.url,
            token: syncConfig.token,
            username: remote.owner,
            branch: syncConfig.branch || 'main',
          })
          if (!pull.success) {
            showToast('Gitee 拉取失败：' + (pull.message || '') + '（将仅显示本地版本）', 'error')
          }
        }
      }

      // 合并本地 HEAD 与远程跟踪引用的版本（按 oid 去重）
      const local = await listHistory(target.repoDir, target.relPath, 'HEAD', 100)
      const remoteRef = `refs/remotes/${GITEE_REMOTE}/${syncConfig.branch || 'main'}`
      const remote = useGitee ? await listHistory(target.repoDir, target.relPath, remoteRef, 100) : []
      const byOid = new Map<string, (typeof local)[number]>()
      for (const v of [...local, ...remote]) byOid.set(v.oid, v)
      const all = Array.from(byOid.values()).sort((a, b) => b.timestamp - a.timestamp)

      // 读取每个版本的真实内容用于预览（串行读取，避免大量并发 git readBlob 导致 WebView 卡死）
      const entries: any[] = []
      for (const v of all) {
        try {
          const content = (await readVersion(target.repoDir, target.relPath, v.oid)) || ''
          entries.push({
            id: v.oid,
            noteId: note.id,
            title: note.title,
            content,
            timestamp: new Date(v.timestamp).toISOString(),
            action: 'edit' as const,
            oid: v.oid,
            repoDir: target.repoDir,
            relPath: target.relPath,
          })
        } catch (err) {
          console.warn('[History] readVersion skipped for', v.oid, err)
        }
      }

      setHistory(entries)
    } catch (err) {
      console.error('[History] handleOpenHistory failed:', err)
      showToast('打开历史记录失败：' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setShowHistory(true)
    }
  }

  const presetColors = [
    '#000000', '#434343', '#666666', '#999999', '#CCCCCC', '#EFEFEF', '#F3F3F3', '#FFFFFF',
    '#FF0000', '#FF5733', '#FF914D', '#FFDA79', '#FFE082', '#FFFF00', '#A3E635', '#4ADE80',
    '#22D3EE', '#3B82F6', '#2563EB', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#FB7185',
  ]

  const handleColorChange = (color: string) => {
    editor.chain().focus().setColor(color).run()
    setShowColorPicker(false)
  }

  // Font family functionality
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

  // Font size functionality
  // 字号：中文字号标准（GB/T 9851）—— 从初号到八号，pt 单位。
  // 两个下拉（主工具栏 1182、备工具栏 2149）共用同一数组。
  const fontSizes = [
    { label: '初号', value: '42pt' },
    { label: '小初', value: '36pt' },
    { label: '一号', value: '26pt' },
    { label: '小一', value: '24pt' },
    { label: '二号', value: '22pt' },
    { label: '小二', value: '18pt' },
    { label: '三号', value: '16pt' },
    { label: '小三', value: '15pt' },
    { label: '四号', value: '14pt' },
    { label: '小四', value: '12pt' },
    { label: '五号', value: '10.5pt' },
    { label: '小五', value: '9pt' },
    { label: '六号', value: '7.5pt' },
    { label: '小六', value: '6.5pt' },
    { label: '七号', value: '5.5pt' },
    { label: '八号', value: '5pt' },
  ]

  const currentFontFamilyLabel =
    fontFamilies.find((f) => f.value === currentFontFamily)?.label ?? '字体'
  const currentFontSizeLabel =
    fontSizes.find((s) => s.value === currentFontSize)?.label ?? '字号'

  const handleFontSizeChange = (size: string) => {
    editor.chain().focus().setFontSize(size).run()
    setShowFontSizeMenu(false)
  }

  // Cell background color functionality
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

  // Context menu for table
  const handleEditorContextMenu = (event: React.MouseEvent) => {
    if (editor.isActive('table')) {
      event.preventDefault()
      setTableContextMenuPos({ x: event.clientX, y: event.clientY })
      setShowTableContextMenu(true)
    }
  }

  // Text selection context menu
  const handleTextContextMenu = (event: React.MouseEvent) => {
    const selection = editor.state.selection
    const hasSelection = !selection.empty
    
    if (!editor.isActive('table') && hasSelection) {
      event.preventDefault()
      setTextContextMenuPos({ x: event.clientX, y: event.clientY })
      setShowTextContextMenu(true)
    }
  }

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
        if (!active) e.currentTarget.style.background = 'var(--app-hover)'
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
    <div
      className={`note-editor-shell${focusMode ? ' is-focus-mode' : ''}${typewriterMode && !readingMode ? ' is-typewriter-mode' : ''}${readingMode ? ' is-reading-mode' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >

      {/* ─── Title Section ─── */}
      <div
        className="note-title-section"
        style={{
          padding: '16px 24px 8px',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div className="note-title-row">
          {onBackToNotes && (
            <button
              type="button"
              className="note-mobile-back"
              onClick={onBackToNotes}
              aria-label="返回笔记列表"
              title="返回笔记列表"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          <input
            key={note.id}
            type="text"
            value={titleDraft}
            onChange={(e) => handleTitleChange(e.target.value)}
            readOnly={readingMode}
            placeholder="笔记标题"
            aria-label={readingMode ? '笔记标题，阅读模式下只读' : '笔记标题'}
            style={{
              minWidth: 0,
              flex: 1,
              width: 'auto',
              fontSize: '20px',
              fontWeight: 700,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: C.text,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            className={`note-title-action note-ai-toggle${aiPanelOpen ? ' is-active' : ''}`}
            onClick={onToggleAiPanel}
            aria-label={aiPanelOpen ? '关闭笔记 AI 助手' : '打开笔记 AI 助手'}
            aria-pressed={aiPanelOpen}
            title={aiPanelOpen ? '关闭笔记 AI 助手' : '笔记 AI 助手（Ctrl/Cmd+Shift+A）'}
          >
            <Sparkles size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`note-title-action note-typewriter-toggle${typewriterMode ? ' is-active' : ''}`}
            onClick={onToggleTypewriterMode}
            aria-label={typewriterMode ? '关闭打字机模式' : '开启打字机模式'}
            aria-pressed={typewriterMode}
            title={typewriterMode ? '关闭打字机模式' : '打字机模式：让光标保持在编辑区中部'}
          >
            <TextCursorInput size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`note-title-action note-reading-toggle${readingMode ? ' is-active' : ''}`}
            onClick={onToggleReadingMode}
            aria-label={readingMode ? '退出阅读模式' : '进入阅读模式'}
            aria-pressed={readingMode}
            title={readingMode ? '退出阅读模式（Esc）' : '阅读模式（Ctrl/Cmd+Shift+R）'}
          >
            {readingMode
              ? <PencilLine size={16} aria-hidden="true" />
              : <BookOpen size={16} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={`note-title-action${focusMode ? ' is-active' : ''}`}
            onClick={onToggleFocusMode}
            aria-label={focusMode ? '退出专注模式' : '进入专注模式'}
            aria-pressed={focusMode}
            title={focusMode ? '退出专注模式（Esc）' : '进入专注模式（Ctrl/Cmd+Shift+F）'}
          >
            {focusMode
              ? <Minimize2 size={16} aria-hidden="true" />
              : <Focus size={16} aria-hidden="true" />}
          </button>
          {onTogglePinned && (
            <button
              type="button"
              className="note-title-action note-pin-toggle"
              onClick={() => void onTogglePinned(note)}
              aria-label={note.pinned ? '取消固定' : '固定到顶部'}
              title={note.pinned ? '取消固定' : '固定到顶部'}
              style={{
                marginLeft: '8px',
                background: note.pinned ? 'var(--app-primary-light)' : 'var(--app-surface)',
                color: note.pinned ? C.primary : C.textMuted,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--app-hover)'
                event.currentTarget.style.color = note.pinned ? C.primary : C.text
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = note.pinned ? 'var(--app-primary-light)' : 'var(--app-surface)'
                event.currentTarget.style.color = note.pinned ? C.primary : C.textMuted
              }}
            >
              {note.pinned
                ? <PinOff size={16} aria-hidden="true" />
                : <Pin size={16} aria-hidden="true" />}
            </button>
          )}
        </div>
        <div className="note-meta-row">
          <span
            className={`note-save-state is-${overallSaveState}`}
            aria-live="polite"
          >
            {overallSaveState === 'saving' ? (
              <Loader2 size={12} className="spin" aria-hidden="true" />
            ) : overallSaveState === 'error' ? (
              <AlertCircle size={12} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={12} aria-hidden="true" />
            )}
            <span>
              {overallSaveState === 'saving'
                ? '保存中…'
                : overallSaveState === 'error'
                  ? '保存失败'
                  : '已保存'}
            </span>
            <button
              type="button"
              className="note-save-button"
              onClick={() => void saveAll()}
              disabled={overallSaveState === 'saving'}
              title="保存（Ctrl/Cmd+S）"
              aria-label="立即保存笔记"
            >
              <Save size={12} aria-hidden="true" />
              <span>保存</span>
            </button>
          </span>
          <span
            className="note-document-stats"
            title="字符数不含空白；中文按字、英文按词统计；阅读时间按每分钟 300 词估算"
          >
            <span>{noteStats.characters.toLocaleString('zh-CN')} 字符</span>
            <span aria-hidden="true">·</span>
            <span>{noteStats.words.toLocaleString('zh-CN')} 词</span>
            <span aria-hidden="true">·</span>
            <span>{noteStats.paragraphs.toLocaleString('zh-CN')} 段</span>
            <span aria-hidden="true">·</span>
            <span>
              {noteStats.readingMinutes > 0 ? `约 ${noteStats.readingMinutes} 分钟` : '0 分钟'}
            </span>
          </span>
          <span
            className="note-file-path"
            title={note._isLocalFile && note.filePath ? note.filePath : '应用内笔记'}
          >
            {note._isLocalFile && note.filePath ? note.filePath : '应用内笔记'}
          </span>
          <span className="note-updated-at">
            更新于 {new Date(note.updatedAt).toLocaleString('zh-CN')}
          </span>
        </div>
      </div>

      {/* ─── Toolbar ─── */}
      <div
        className="note-toolbar"
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
        <ToolBtn
          active={editor.isActive('heading', { level: 4 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          title="标题 4"
        >
          <Heading4 size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('heading', { level: 5 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()}
          title="标题 5"
        >
          <Heading5 size={16} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('heading', { level: 6 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 6 }).run()}
          title="标题 6"
        >
          <Heading6 size={16} />
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
              if (!showFontFamilyMenu) e.currentTarget.style.background = 'var(--app-hover)'
            }}
            onMouseLeave={(e) => {
              if (!showFontFamilyMenu) e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>{currentFontFamilyLabel}</span>
            <ChevronDown size={12} />
          </button>

          {showFontFamilyMenu && (
            <div
              style={{
                position: 'fixed',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: C.shadow,
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
              {fontFamilies.map(({ label, value }) => {
                const isActive = value === currentFontFamily
                return (
                <button
                  key={value || 'default'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFontFamilyChange(value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    background: isActive ? C.primaryLight : 'transparent',
                    cursor: 'pointer',
                    fontFamily: value || 'inherit',
                    fontSize: '13px',
                    color: isActive ? C.primary : C.text,
                    fontWeight: isActive ? 600 : 'normal',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = isActive ? C.primaryLight : 'var(--app-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? C.primaryLight : 'transparent' }}
                >
                  {label}
                </button>
                )
              })}
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
              if (!showFontSizeMenu) e.currentTarget.style.background = 'var(--app-hover)'
            }}
            onMouseLeave={(e) => {
              if (!showFontSizeMenu) e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>{currentFontSizeLabel}</span>
            <ChevronDown size={12} />
          </button>

          {showFontSizeMenu && (
            <div
              style={{
                position: 'fixed',
                background: C.surface,
                borderRadius: '10px',
                boxShadow: C.shadow,
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
              {fontSizes.map(({ label, value }) => {
                const isActive = value === currentFontSize
                return (
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
                    background: isActive ? C.primaryLight : 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    color: isActive ? C.primary : C.text,
                    fontWeight: isActive ? 600 : 'normal',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = isActive ? C.primaryLight : 'var(--app-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? C.primaryLight : 'transparent' }}
                >
                  {label}
                </button>
                )
              })}
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
          onClick={async () => {
            const url = await showPrompt('输入链接地址:', 'https://')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
          title="链接"
        >
          <Link2 size={16} />
        </ToolBtn>
        <ToolBtn
          onClick={async () => {
            const src = await pickImageFile()
            if (!src) return
            editor.chain().focus().setImage({ src }).run()
          }}
          title="图片（从本地选择并自动保存到笔记内）"
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
        <ToolBtn
          onClick={openSearch}
          title="检索（Ctrl+F / Cmd+F）"
        >
          <Search size={16} />
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
                boxShadow: C.shadow,
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
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              background: C.surface,
              borderRadius: '10px',
              boxShadow: C.shadow,
              border: `1px solid ${C.border}`,
              padding: '6px',
              zIndex: 40,
              minWidth: '180px',
            }}>
              {[
                { format: 'markdown' as ExportFormat, label: 'Markdown 文档', icon: FileText, ext: '.md' },
                { format: 'html' as ExportFormat, label: 'HTML 网页', icon: FileCode, ext: '.html' },
                { format: 'word' as ExportFormat, label: 'Word 文档', icon: FileType, ext: '.docx' },
                { format: 'pdf' as ExportFormat, label: 'PDF 文档', icon: FileType, ext: '.pdf' },
              ].map(({ format, label, icon: Icon, ext }) => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <Icon size={15} style={{ color: C.textSecondary }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  <span style={{ fontSize: '11px', color: C.textMuted }}>{ext}</span>
                </button>
              ))}
            </div>
          )}
        </div>

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

      {/* ─── Editor Content ─── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {searchOpen && (
          <div
            className="note-search-popover"
            style={{
              position: 'absolute',
              top: 12,
              right: 16,
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: '10px',
              boxShadow: C.shadow,
              padding: '6px 8px',
            }}
          >
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  runSearch(searchQuery, true)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  closeSearch()
                }
              }}
              placeholder="检索当前笔记…"
              style={{
                width: '200px',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '13px',
                color: C.text,
                fontFamily: 'inherit',
              }}
            />
            <ToolBtn onClick={() => runSearch(searchQuery, true)} title="检索">
              <Search size={15} />
            </ToolBtn>
            <ToolBtn onClick={() => gotoMatch(-1)} title="上一个匹配">
              <ArrowUp size={15} />
            </ToolBtn>
            <ToolBtn onClick={() => gotoMatch(1)} title="下一个匹配">
              <ArrowDown size={15} />
            </ToolBtn>
            <span style={{ fontSize: '12px', color: C.textMuted, minWidth: '46px', textAlign: 'center' }}>
              {matchCount === 0 ? (searchQuery ? '无匹配' : '') : `${matchIndex}/${matchCount}`}
            </span>
            <ToolBtn onClick={closeSearch} title="关闭检索">
              <X size={15} />
            </ToolBtn>
          </div>
        )}
        <div
          ref={editorScrollRef}
          className="note-editor-scroll"
          style={{ height: '100%', overflowY: 'auto' }}
        >
          <EditorContent 
            editor={editor} 
            onContextMenu={(e) => {
              if (readingMode) return
              if (editor.isActive('dataTable')) return // 智能表格自带工具栏，不弹编辑器菜单
              if (editor.isActive('table')) {
                handleEditorContextMenu(e)
              } else {
                handleTextContextMenu(e)
              }
            }}
          />
        </div>
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
            boxShadow: C.shadow,
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
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
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
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--app-hover)' }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={16} style={{ color: active ? C.primary : C.textSecondary }} />
            </button>
          ))}

          <div style={{ width: '1px', height: '24px', background: C.border, margin: '0 2px' }} />

          {/* Text Color */}
          <div style={{ position: 'relative' }} ref={tableColorPickerRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowTableColorPicker((v) => !v)}
              title="文本颜色"
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: showTableColorPicker ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showTableColorPicker ? C.primaryLight : C.surface,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Palette size={16} style={{ color: C.textSecondary }} />
            </button>

            {showTableColorPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: C.shadow,
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
                        setShowTableColorPicker(false)
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
                  boxShadow: C.shadow,
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
                  boxShadow: C.shadow,
                  border: `1px solid ${C.border}`,
                  padding: '8px',
                  zIndex: 10000,
                  minWidth: '168px',
                }}
              >
                {/* Insert count selector */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '2px 4px 8px',
                    borderBottom: `1px solid ${C.border}`,
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: C.textMuted, whiteSpace: 'nowrap' }}>插入数量</span>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setInsertCount((v) => Math.max(1, v - 1))}
                    disabled={insertCount <= 1}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '4px',
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      cursor: insertCount <= 1 ? 'not-allowed' : 'pointer',
                      color: C.text,
                      fontSize: '14px',
                      lineHeight: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >−</button>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={insertCount}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === '') {
                        setInsertCount(1)
                        return
                      }
                      const v = parseInt(raw, 10)
                      if (!isNaN(v)) setInsertCount(Math.max(1, Math.min(100, v)))
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      width: '48px',
                      height: '22px',
                      padding: '2px 4px',
                      fontSize: '13px',
                      textAlign: 'center',
                      border: `1px solid ${C.border}`,
                      borderRadius: '4px',
                      fontFamily: 'inherit',
                      color: C.text,
                      background: C.surface,
                      outline: 'none',
                    }}
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setInsertCount((v) => Math.min(100, v + 1))}
                    disabled={insertCount >= 100}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '4px',
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      cursor: insertCount >= 100 ? 'not-allowed' : 'pointer',
                      color: C.text,
                      fontSize: '14px',
                      lineHeight: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >+</button>
                </div>

                {[
                  { icon: ArrowUp, label: '上方插行', action: () => {
                    for (let i = 0; i < insertCount; i++) editor.chain().focus().addRowBefore().run()
                  } },
                  { icon: ArrowDown, label: '下方插行', action: () => {
                    for (let i = 0; i < insertCount; i++) editor.chain().focus().addRowAfter().run()
                  } },
                  { icon: ArrowLeft, label: '左侧插列', action: () => {
                    for (let i = 0; i < insertCount; i++) editor.chain().focus().addColumnBefore().run()
                  } },
                  { icon: ArrowRight, label: '右侧插列', action: () => {
                    for (let i = 0; i < insertCount; i++) editor.chain().focus().addColumnAfter().run()
                  } },
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon size={14} style={{ color: C.primary }} />
                    <span>{label}</span>
                    {insertCount > 1 && (
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: C.textMuted }}>×{insertCount}</span>
                    )}
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
                background: showDeleteMenu ? C.dangerBg : C.surface,
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
                  boxShadow: C.shadow,
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.dangerBg }}
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
            boxShadow: C.shadow,
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
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
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
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--app-hover)' }}
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
          <div style={{ position: 'relative' }} ref={textFontFamilyRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowTextFontFamilyMenu((v) => !v)}
              title="字体"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: showTextFontFamilyMenu ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showTextFontFamilyMenu ? C.primaryLight : C.surface,
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

            {showTextFontFamilyMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: C.shadow,
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
                      setShowTextFontFamilyMenu(false)
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Font Size Dropdown */}
          <div style={{ position: 'relative' }} ref={textFontSizeRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowTextFontSizeMenu((v) => !v)}
              title="字号"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: showTextFontSizeMenu ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showTextFontSizeMenu ? C.primaryLight : C.surface,
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

            {showTextFontSizeMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: C.shadow,
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
                      setShowTextFontSizeMenu(false)
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
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
          <div style={{ position: 'relative' }} ref={textColorPickerRef}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowTextColorPicker((v) => !v)}
              title="文本颜色"
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: showTextColorPicker ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: showTextColorPicker ? C.primaryLight : C.surface,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Palette size={16} style={{ color: C.textSecondary }} />
            </button>

            {showTextColorPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: C.surface,
                  borderRadius: '8px',
                  boxShadow: C.shadow,
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
                        setShowTextColorPicker(false)
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
        className="note-footer"
        style={{
          padding: '8px 24px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: History buttons */}
        <div className="note-footer-actions">
          <button
            onClick={handleCreateHistory}
            disabled={isCreatingHistory}
            title={isCreatingHistory ? '正在生成历史…' : '生成历史记录'}
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
              cursor: isCreatingHistory ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              opacity: isCreatingHistory ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (isCreatingHistory) return
              e.currentTarget.style.background = C.primaryLight
              e.currentTarget.style.borderColor = C.primary
            }}
            onMouseLeave={(e) => {
              if (isCreatingHistory) return
              e.currentTarget.style.background = C.surface
              e.currentTarget.style.borderColor = C.border
            }}
          >
            <Clock size={14} />
            <span>{isCreatingHistory ? '生成中…' : '生成历史'}</span>
          </button>

          <button
            onClick={handleOpenRealtimeHistory}
            title="按每次自动保存留档的版本找回内容"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: `1px solid ${C.primary}`,
              background: C.primaryLight,
              color: C.primary,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C.primaryLightHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = C.primaryLight
            }}
          >
            <History size={14} />
            <span>实时历史恢复</span>
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
              e.currentTarget.style.background = 'var(--app-hover)'
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
        <TagEditor
          tags={note.tags || []}
          suggestions={tagSuggestions}
          onChange={handleTagsChange}
        />
      </div>
    </div>
  )
}
