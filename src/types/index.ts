/* ─── Note Types ─── */
export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string;
  filePath: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  noteType?: string;
  _isLocalFile?: boolean;
}

export interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  children?: NoteFolder[];
  expanded?: boolean;
  path?: string;
}

export interface NoteHistory {
  id: string;
  noteId: string;
  title: string;
  content: string;
  timestamp: string;
  action: 'create' | 'edit' | 'delete';
  /** 标记为来自远程(Gitee)的历史记录 */
  remote?: boolean;
  /** 远程文件在仓库中的路径，用于还原时重新拉取最新内容 */
  remotePath?: string;
}

/* ─── Personnel Types ─── */
export interface Person {
  id: string;
  name: string;
  position: string;
  hireDate: string;
  monthlySalary: number;
  phone: string;
  status: 'active' | 'resigned';
  avatar?: string;
}

/* ─── Task Types ─── */
export interface Task {
  id: string;
  name: string;
  content: string;
  startTime: string;
  expectedEndTime: string;
  responsiblePerson: string;
  participants: string[];
  status: 'pending' | 'running' | 'completed';
  completionDate?: string;
  evaluation?: string;
  score?: number;
  progress: number;
}

/* ─── Settings Types ─── */
export interface SyncConfig {
  type: 'local' | 'gitee';
  /** Gitee OpenAPI 基地址（软件内置默认，一般无需修改） */
  url: string;
  /** 仓库名，格式：owner/repo */
  repo: string;
  /** 分支，留空则自动使用仓库默认分支 */
  branch: string;
  /** 私人访问令牌 (Private Token) */
  token: string;
}

export interface AppSettings {
  language: 'zh-CN' | 'en' | 'ja';
  syncConfig: SyncConfig;
  customColors: Record<string, string>;
  theme: 'light' | 'dark';
}

/* ─── Navigation ─── */
export type PageKey = 'notes' | 'personnel' | 'tasks' | 'analytics' | 'settings';
