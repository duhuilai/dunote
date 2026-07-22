import { useEffect } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { useAppStore } from '@/store'
import { loadPersonnel, loadTasks } from '@/utils/storage'
import { checkForUpdate } from '@/utils/update'
import Sidebar from '@/components/layout/Sidebar'
import NotesPage from '@/components/notes/NotesPage'
import PersonnelPage from '@/components/personnel/PersonnelPage'
import TasksPage from '@/components/tasks/TasksPage'
import AnalyticsPage from '@/components/analytics/AnalyticsPage'
import SettingsPage from '@/components/settings/SettingsPage'
import Toast from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'

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
      case 'analytics': return <AnalyticsPage />
      case 'settings': return <SettingsPage />
      default: return <NotesPage />
    }
  }

  return (
    <ConfirmProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFC' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
          {renderPage()}
        </div>
        <Toast />
      </div>
    </ConfirmProvider>
  )
}

export default App

