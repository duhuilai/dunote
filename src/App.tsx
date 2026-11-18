import { useEffect, lazy, Suspense } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { useAppStore } from '@/store'
import { loadPersonnel, loadTasks } from '@/utils/storage'
import { checkForUpdate } from '@/utils/update'
import { pruneAllSnapshotsOnStartup } from '@/utils/noteSnapshots'
import Sidebar from '@/components/layout/Sidebar'
import NotesPage from '@/components/notes/NotesPage'
import AiPage from '@/components/ai/AiPage'
import PersonnelPage from '@/components/personnel/PersonnelPage'
import TasksPage from '@/components/tasks/TasksPage'
import SettingsPage from '@/components/settings/SettingsPage'
import Toast from '@/components/ui/Toast'
import OverdueNotifier from '@/components/ui/OverdueNotifier'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import ErrorBoundary from '@/components/ui/ErrorBoundary'

// 统计页依赖 recharts（图表库，体积较大）且只在切到该页时才需要，
// 故用 React.lazy 拆包，避免启动时加载解析、常驻内存。
const LazyAnalyticsPage = lazy(() => import('@/components/analytics/AnalyticsPage'))

function App() {
  const currentPage = useAppStore((s) => s.currentPage)
  const setAppVersion = useAppStore((s) => s.setAppVersion)
  const setUpdateInfo = useAppStore((s) => s.setUpdateInfo)
  const setCheckingUpdate = useAppStore((s) => s.setCheckingUpdate)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const hydrateNotes = useAppStore((s) => s.hydrateNotes)
  const flushNotes = useAppStore((s) => s.flushNotes)
  const notesHydrated = useAppStore((s) => s.notesHydrated)
  const notesLoadError = useAppStore((s) => s.notesLoadError)
  const theme = useAppStore((s) => s.settings.theme)

  // 启动时并行加载设置与笔记数据。笔记完成水合前不渲染编辑区，
  // 避免空数组被自动保存覆盖磁盘上的真实数据。
  useEffect(() => {
    void loadSettings()
    void hydrateNotes()
  }, [hydrateNotes, loadSettings])

  // 主题随设置即时生效，system 模式跟随系统变化。
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }

    applyTheme()
    if (theme !== 'system') return
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  // 页面隐藏或失焦时主动提交尚未落盘的普通笔记，缩短意外退出的风险窗口。
  useEffect(() => {
    const flush = () => {
      void flushNotes().catch((error) => {
        console.error('[Notes] 退出前保存失败:', error)
      })
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [flushNotes])

  // 启动时从磁盘加载人员与任务数据（软件更新/重启后不丢）
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [personnel, tasks] = await Promise.all([loadPersonnel(), loadTasks()])
      if (cancelled) return
      const store = useAppStore.getState()
      store.setPersonnel(personnel)
      store.setTasks(tasks)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 启动时清理过期的本地实时保存版本（始终至少保留最近 5 版）
  useEffect(() => {
    void pruneAllSnapshotsOnStartup()
  }, [])

  // 启动时获取真实版本号并自动检查更新
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const v = await getVersion()
        if (cancelled) return
        setAppVersion(v)
        setCheckingUpdate(true)
        const info = await checkForUpdate(v)
        if (!cancelled) setUpdateInfo(info)
      } catch {
        /* 获取版本失败时使用默认值 */
      } finally {
        if (!cancelled) setCheckingUpdate(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setAppVersion, setUpdateInfo, setCheckingUpdate])

  const renderPage = () => {
    if (currentPage === 'notes' && !notesHydrated) {
      if (notesLoadError) {
        return (
          <div className="app-state-panel">
            <div>
              <h2>笔记数据暂时无法读取</h2>
              <p>为避免覆盖原文件，编辑功能已暂停。请检查数据目录权限后重试。</p>
              <code>{notesLoadError}</code>
              <button type="button" onClick={() => void hydrateNotes()}>重新读取</button>
            </div>
          </div>
        )
      }
      return (
        <div className="app-state-panel">
          <div>
            <div className="app-loading-dot" />
            <p>正在安全载入笔记…</p>
          </div>
        </div>
      )
    }

    switch (currentPage) {
      case 'notes': return <NotesPage />
      case 'ai': return <AiPage />
      case 'personnel': return <PersonnelPage />
      case 'tasks': return <TasksPage />
      case 'analytics': return <LazyAnalyticsPage />
      case 'settings': return <SettingsPage />
      default: return <NotesPage />
    }
  }

  return (
    <ConfirmProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
          <ErrorBoundary>
            {/* 统计页为懒加载包，首次进入时给出加载态 */}
            <Suspense
              fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 13 }}>
                  加载中…
                </div>
              }
            >
              {renderPage()}
            </Suspense>
          </ErrorBoundary>
        </div>
        <Toast />
        <OverdueNotifier />
      </div>
    </ConfirmProvider>
  )
}

export default App

