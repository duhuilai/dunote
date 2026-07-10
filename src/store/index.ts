import { create } from 'zustand';
import type { Note, NoteFolder, NoteHistory, Person, Task, AppSettings, PageKey } from '@/types';
import type { UpdateInfo, UpdateDownloadState } from '@/utils/update';
import { initialUpdateDownload } from '@/utils/update';

interface AppState {
  // Navigation
  currentPage: PageKey;
  setCurrentPage: (page: PageKey) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Notes
  notes: Note[];
  folders: NoteFolder[];
  selectedNoteId: string | null;
  selectedFolderId: string | null;
  searchQuery: string;
  history: NoteHistory[];
  showHistory: boolean;
  showOutline: boolean;

  setSelectedNoteId: (id: string | null) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setShowHistory: (show: boolean) => void;
  setShowOutline: (show: boolean) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  addHistoryEntry: (entry: Omit<NoteHistory, 'id' | 'timestamp'>) => void;
  restoreFromHistory: (historyId: string) => void;
  deleteHistoryEntry: (historyId: string) => void;
  /** 用远程拉取的历史替换该笔记的远程条目（保留本地条目） */
  mergeRemoteHistory: (noteId: string, entries: NoteHistory[]) => void;
  /** 更新某条历史记录的内容（还原远程条目前刷新最新内容） */
  updateHistoryContent: (historyId: string, content: string) => void;

  /* ─── Toast 通知 ─── */
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;

  // Personnel
  personnel: Person[];
  addPerson: (person: Person) => void;
  updatePerson: (id: string, updates: Partial<Person>) => void;
  deletePerson: (id: string) => void;

  // Tasks
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // App version & update
  appVersion: string;
  setAppVersion: (v: string) => void;
  updateInfo: UpdateInfo | null;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  checkingUpdate: boolean;
  setCheckingUpdate: (v: boolean) => void;
  /** 新版本安装包下载状态（进度/安装按钮共享） */
  updateDownload: UpdateDownloadState;
  setUpdateDownload: (patch: Partial<UpdateDownloadState>) => void;
  resetUpdateDownload: () => void;

  // 当前打开的本地根文件夹（用于 Gitee 同步按相对路径分层存储）
  localRootFolder: string | null;
  setLocalRootFolder: (p: string | null) => void;
}


export const useAppStore = create<AppState>((set) => ({
  // Navigation
  currentPage: 'notes',
  setCurrentPage: (page) => set({ currentPage: page }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Notes
  notes: [],
  folders: [],
  selectedNoteId: null,
  selectedFolderId: null,
  searchQuery: '',
  history: [],
  showHistory: false,
  showOutline: true,

  setSelectedNoteId: (id) => set({ selectedNoteId: id }),
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setShowHistory: (show) => set({ showHistory: show }),
  setShowOutline: (show) => set({ showOutline: show }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  updateNote: (id, updates) => set((s) => ({
    notes: s.notes.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n)),
  })),
  deleteNote: (id) => set((s) => ({
    notes: s.notes.filter((n) => n.id !== id),
    selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
  })),
  addHistoryEntry: (entry: Omit<NoteHistory, 'id' | 'timestamp'>) => set((s) => ({
    history: [{
      ...entry,
      id: `h-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }, ...s.history],
  })),
  restoreFromHistory: (historyId: string) => set((s) => {
    const historyEntry = s.history.find((h) => h.id === historyId);
    if (!historyEntry) return s;
    
    // Find the current note to record its content BEFORE restoration
    const currentNote = s.notes.find((n) => n.id === historyEntry.noteId);
    
    // If note not in store (e.g., local file), skip creating history entry here —
    // it will be handled by the caller (handleRestoreLocalNote) with correct content
    if (!currentNote) {
      return {
        notes: s.notes,
        history: s.history,
        showHistory: false,
      };
    }
    
    // If content is the same, no need to create a new history entry
    const contentChanged = currentNote.content !== historyEntry.content;
    
    return {
      notes: s.notes.map((n) => 
        n.id === historyEntry.noteId 
          ? { ...n, content: historyEntry.content, title: historyEntry.title, updatedAt: new Date().toISOString() }
          : n
      ),
      history: contentChanged ? [{
        id: `h-${Date.now()}`,
        noteId: historyEntry.noteId,
        title: historyEntry.title,
        content: currentNote.content,
        timestamp: new Date().toISOString(),
        action: 'edit',
      }, ...s.history] : s.history,
      showHistory: false,
    };
  }),
  deleteHistoryEntry: (historyId: string) => set((s) => ({
    history: s.history.filter((h) => h.id !== historyId),
  })),
  mergeRemoteHistory: (noteId, entries) => set((s) => {
    // 移除该笔记旧的远程条目，替换为刚拉取的远程条目，本地条目原样保留
    const localOnly = s.history.filter((h) => h.noteId !== noteId || !h.remote)
    // 远程条目与本地已有的（按 remotePath 去重，避免重复）
    const existingRemotePaths = new Set(localOnly.map((h) => h.remotePath).filter(Boolean))
    const freshRemote = entries.filter((e) => !existingRemotePaths.has(e.remotePath))
    return { history: [...freshRemote, ...localOnly] }
  }),
  updateHistoryContent: (historyId, content) => set((s) => ({
    history: s.history.map((h) => (h.id === historyId ? { ...h, content } : h)),
  })),

  /* ─── Toast ─── */
  toast: null,
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } })
    if (typeof window !== 'undefined') {
      window.clearTimeout((useAppStore as any)._toastTimer)
      ;(useAppStore as any)._toastTimer = window.setTimeout(() => {
        set({ toast: null })
      }, 2600)
    }
  },
  hideToast: () => set({ toast: null }),

  // Personnel
  personnel: [],
  addPerson: (person) => set((s) => ({ personnel: [...s.personnel, person] })),
  updatePerson: (id, updates) => set((s) => ({
    personnel: s.personnel.map((p) => (p.id === id ? { ...p, ...updates } : p)),
  })),
  deletePerson: (id) => set((s) => ({
    personnel: s.personnel.filter((p) => p.id !== id),
  })),

  // Tasks
  tasks: [],
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, updates) => set((s) => ({
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  deleteTask: (id) => set((s) => ({
    tasks: s.tasks.filter((t) => t.id !== id),
  })),

  // Settings
  settings: {
    language: 'zh-CN',
    syncConfig: {
      type: 'local',
      url: 'https://gitee.com/api/v5',
      repo: '',
      branch: '',
      token: '',
    },
    customColors: {
      '标签-重要': '#EF4444',
      '标签-工作': '#2563EB',
      '标签-学习': '#10B981',
      '标签-生活': '#F59E0B',
      '标签-灵感': '#8B5CF6',
      '标签-归档': '#64748B',
    },
    theme: 'light',
  },
  updateSettings: (updates) => set((s) => ({
    settings: { ...s.settings, ...updates },
  })),

  // App version & update
  appVersion: '0.0.0',
  setAppVersion: (v) => set({ appVersion: v }),

  // 当前打开的本地根文件夹（用于 Gitee 同步按相对路径分层存储）
  localRootFolder: null as string | null,
  setLocalRootFolder: (p: string | null) => set({ localRootFolder: p }),
  updateInfo: null,
  setUpdateInfo: (info) => set({ updateInfo: info }),
  checkingUpdate: false,
  setCheckingUpdate: (v) => set({ checkingUpdate: v }),
  updateDownload: initialUpdateDownload(),
  setUpdateDownload: (patch) =>
    set((s) => ({ updateDownload: { ...s.updateDownload, ...patch } })),
  resetUpdateDownload: () => set({ updateDownload: initialUpdateDownload() }),
}));
