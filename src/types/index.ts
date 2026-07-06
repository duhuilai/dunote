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
  type: 'local' | 'git' | 'gitee' | 'server';
  url: string;
  branch: string;
  username: string;
  token: string;
  autoSync: boolean;
  syncInterval: number;
}

export interface AppSettings {
  language: 'zh-CN' | 'en' | 'ja';
  syncConfig: SyncConfig;
  customColors: Record<string, string>;
  theme: 'light' | 'dark';
}

/* ─── Navigation ─── */
export type PageKey = 'notes' | 'personnel' | 'tasks' | 'analytics' | 'settings';
