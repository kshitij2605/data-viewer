import { useEffect } from 'react'
import { useAuthStore } from './stores/authStore.ts'

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Login placeholder — to be replaced by LoginPage component</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem' }}>
      <p>Main App placeholder — to be replaced by layout and route components</p>
    </div>
  )
}

export default App
