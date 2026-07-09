import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}
