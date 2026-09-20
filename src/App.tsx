import { useEffect, lazy, Suspense } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { useAppStore } from '@/store'
import { loadPersonnel, loadTasks } from '@/utils/storage'
import { checkForUpdate } from '@/utils/update'
import { pruneAllSnapshotsOnStartup } from '@/utils/noteSnapshots'
import Sidebar from '@/components/layout/Sidebar'
import NotesPage from '@/components/notes/NotesPage'
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

  // 启动时加载持久化设置并获取真实版本号/检查更新
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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
    switch (currentPage) {
      case 'notes': return <NotesPage />
      case 'personnel': return <PersonnelPage />
      case 'tasks': return <TasksPage />
      case 'analytics': return <LazyAnalyticsPage />
      case 'settings': return <SettingsPage />
      default: return <NotesPage />
    }
  }

  return (
    <ConfirmProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFC' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
          <ErrorBoundary>
            {/* 统计页为懒加载包，首次进入时给出加载态 */}
            <Suspense
              fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: 13 }}>
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

