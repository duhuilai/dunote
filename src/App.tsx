import { useAppStore } from '@/store'
import Sidebar from '@/components/layout/Sidebar'
import NotesPage from '@/components/notes/NotesPage'
import PersonnelPage from '@/components/personnel/PersonnelPage'
import TasksPage from '@/components/tasks/TasksPage'
import AnalyticsPage from '@/components/analytics/AnalyticsPage'
import SettingsPage from '@/components/settings/SettingsPage'
import Toast from '@/components/ui/Toast'

function App() {
  const currentPage = useAppStore((s) => s.currentPage)

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFC' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        {renderPage()}
      </div>
      <Toast />
    </div>
  )
}

export default App
