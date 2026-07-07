import { create } from 'zustand';
import type { Note, NoteFolder, NoteHistory, Person, Task, AppSettings, PageKey } from '@/types';

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
}

/* ─── Mock Data ─── */
const mockFolders: NoteFolder[] = [
  { id: 'f1', name: '工作笔记', parentId: null, expanded: true, path: '/Users/du/Documents/duNote/工作笔记', children: [
    { id: 'f1-1', name: '项目文档', parentId: 'f1', expanded: false, path: '/Users/du/Documents/duNote/工作笔记/项目文档' },
    { id: 'f1-2', name: '会议记录', parentId: 'f1', expanded: false, path: '/Users/du/Documents/duNote/工作笔记/会议记录' },
  ]},
  { id: 'f2', name: '个人笔记', parentId: null, expanded: true, path: '/Users/du/Documents/duNote/个人笔记', children: [
    { id: 'f2-1', name: '学习资料', parentId: 'f2', expanded: false, path: '/Users/du/Documents/duNote/个人笔记/学习资料' },
  ]},
  { id: 'f3', name: '归档', parentId: null, expanded: false, path: '/Users/du/Documents/duNote/归档' },
];

const mockNotes: Note[] = [
  { id: 'n1', title: 'Tauri 2 开发指南', content: '<h1>Tauri 2 开发指南</h1><p>Tauri 2 是一个用于构建桌面和移动应用的框架，使用 Rust 作为后端。</p><h2>核心特性</h2><ul><li>跨平台支持：macOS、Windows、Linux、iOS、Android</li><li>安全性：基于 Rust 的安全保证</li><li>小体积：相比 Electron 更小的打包体积</li></ul><h2>快速开始</h2><p>使用以下命令创建新项目：</p><pre><code>npm create tauri-app@latest</code></pre><p>然后安装依赖并启动开发服务器。</p><blockquote>注意：需要先安装 Rust 工具链</blockquote>', folderId: 'f1-1', filePath: '/工作笔记/项目文档/', tags: ['开发', 'Tauri'], createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-05T09:30:00Z' },
  { id: 'n2', title: 'React 最佳实践总结', content: '<h1>React 最佳实践总结</h1><p>本文总结了在大型项目中使用的 React 最佳实践。</p><h2>组件设计</h2><p>保持组件小而专注，使用组合模式而非继承。</p><h2>状态管理</h2><p>优先使用本地状态，只在必要时使用全局状态管理。</p>', folderId: 'f1-1', filePath: '/工作笔记/项目文档/', tags: ['React', '前端'], createdAt: '2026-06-28T14:00:00Z', updatedAt: '2026-07-04T16:20:00Z' },
  { id: 'n3', title: 'Q3 季度会议记录', content: '<h1>Q3 季度会议记录</h1><p>日期：2026-07-03</p><h2>议题</h2><ol><li>项目进度回顾</li><li>下季度规划</li><li>资源分配</li></ol><h2>决议</h2><p>同意增加两名开发人员，加速移动端适配。</p>', folderId: 'f1-2', filePath: '/工作笔记/会议记录/', tags: ['会议'], createdAt: '2026-07-03T09:00:00Z', updatedAt: '2026-07-03T11:00:00Z' },
  { id: 'n4', title: 'TypeScript 高级类型笔记', content: '<h1>TypeScript 高级类型</h1><p>记录 TypeScript 中的高级类型用法。</p><h2>条件类型</h2><pre><code>type IsString&lt;T&gt; = T extends string ? true : false;</code></pre><h2>映射类型</h2><p>使用 <code>keyof</code> 和映射类型创建类型转换。</p>', folderId: 'f2-1', filePath: '/个人笔记/学习资料/', tags: ['TypeScript', '学习'], createdAt: '2026-06-20T08:00:00Z', updatedAt: '2026-07-02T10:15:00Z' },
  { id: 'n5', title: 'Rust 入门学习笔记', content: '<h1>Rust 入门</h1><p>开始学习 Rust 编程语言。</p><h2>所有权系统</h2><p>Rust 的核心特性是所有权系统，保证内存安全。</p>', folderId: 'f2-1', filePath: '/个人笔记/学习资料/', tags: ['Rust', '学习'], createdAt: '2026-06-15T10:00:00Z', updatedAt: '2026-06-30T14:00:00Z' },
];

const mockPersonnel: Person[] = [
  { id: 'p1', name: '张三', position: '前端工程师', hireDate: '2023-03-15', monthlySalary: 18000, phone: '138****1234', status: 'active' },
  { id: 'p2', name: '李四', position: '后端工程师', hireDate: '2022-08-20', monthlySalary: 22000, phone: '139****5678', status: 'active' },
  { id: 'p3', name: '王五', position: '产品经理', hireDate: '2021-11-01', monthlySalary: 25000, phone: '137****9012', status: 'active' },
  { id: 'p4', name: '赵六', position: 'UI 设计师', hireDate: '2024-01-10', monthlySalary: 15000, phone: '136****3456', status: 'active' },
  { id: 'p5', name: '孙七', position: '测试工程师', hireDate: '2022-05-18', monthlySalary: 16000, phone: '135****7890', status: 'resigned' },
  { id: 'p6', name: '周八', position: '运维工程师', hireDate: '2023-09-01', monthlySalary: 20000, phone: '134****2345', status: 'active' },
];

const mockTasks: Task[] = [
  { id: 't1', name: 'duNote 前端开发', content: '完成 duNote 笔记管理软件的前端界面开发，包含所有模块的 UI 实现和交互逻辑。', startTime: '2026-07-01', expectedEndTime: '2026-08-15', responsiblePerson: '张三', participants: ['李四', '赵六'], status: 'running', progress: 35 },
  { id: 't2', name: '后端 API 设计', content: '设计并实现笔记管理的后端 RESTful API，包含用户认证、笔记 CRUD、文件上传等功能。', startTime: '2026-07-05', expectedEndTime: '2026-08-01', responsiblePerson: '李四', participants: ['张三'], status: 'running', progress: 15 },
  { id: 't3', name: '产品需求文档', content: '编写 duNote 完整的产品需求文档，包含功能规格、用户故事、原型设计。', startTime: '2026-06-15', expectedEndTime: '2026-06-30', responsiblePerson: '王五', participants: ['张三', '赵六'], status: 'completed', completionDate: '2026-06-28', evaluation: '文档详尽，需求描述清晰，为后续开发提供了很好的指导。', score: 92, progress: 100 },
  { id: 't4', name: 'UI 设计稿', content: '完成 duNote 全套 UI 设计稿，包含 PC 端和移动端适配方案。', startTime: '2026-06-20', expectedEndTime: '2026-07-10', responsiblePerson: '赵六', participants: ['王五'], status: 'completed', completionDate: '2026-07-08', evaluation: '设计精美，交互流畅，符合品牌调性。', score: 88, progress: 100 },
  { id: 't5', name: '移动端适配', content: '完成 iOS 和 Android 平台的界面适配和性能优化。', startTime: '2026-08-01', expectedEndTime: '2026-09-15', responsiblePerson: '张三', participants: ['李四', '赵六'], status: 'pending', progress: 0 },
  { id: 't6', name: '测试方案制定', content: '制定完整的测试方案，包含单元测试、集成测试和端到端测试策略。', startTime: '2026-07-10', expectedEndTime: '2026-07-25', responsiblePerson: '周八', participants: ['张三', '李四'], status: 'pending', progress: 0 },
];

const mockHistory: NoteHistory[] = [
  { id: 'h1', noteId: 'n1', title: 'Tauri 2 开发指南', content: '<p>旧版本内容...</p>', timestamp: '2026-07-04T14:00:00Z', action: 'edit' },
  { id: 'h2', noteId: 'n1', title: 'Tauri 2 开发指南', content: '<p>更早版本...</p>', timestamp: '2026-07-02T10:00:00Z', action: 'edit' },
  { id: 'h3', noteId: 'n1', title: 'Tauri 2 开发指南', content: '<p>初始内容</p>', timestamp: '2026-07-01T10:00:00Z', action: 'create' },
];

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  currentPage: 'notes',
  setCurrentPage: (page) => set({ currentPage: page }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Notes
  notes: mockNotes,
  folders: mockFolders,
  selectedNoteId: 'n1',
  selectedFolderId: null,
  searchQuery: '',
  history: mockHistory,
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

  // Personnel
  personnel: mockPersonnel,
  addPerson: (person) => set((s) => ({ personnel: [...s.personnel, person] })),
  updatePerson: (id, updates) => set((s) => ({
    personnel: s.personnel.map((p) => (p.id === id ? { ...p, ...updates } : p)),
  })),
  deletePerson: (id) => set((s) => ({
    personnel: s.personnel.filter((p) => p.id !== id),
  })),

  // Tasks
  tasks: mockTasks,
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
      url: '',
      branch: 'main',
      username: '',
      token: '',
      autoSync: false,
      syncInterval: 30,
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
}));
