import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('auth') || sessionStorage.getItem('auth')
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem('auth')
        sessionStorage.removeItem('auth')
      }
    }
    setLoading(false)

    const handleLogout = () => setUser(null)
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  const login = (userData) => {
    setUser(userData)
    const serialized = JSON.stringify(userData)
    try { localStorage.setItem('auth', serialized) } catch {}
    try { sessionStorage.setItem('auth', serialized) } catch {}
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('auth')
    sessionStorage.removeItem('auth')
    // El historial del asistente vive en la sesión: al cerrar sesión se borra.
    // (Cerrar o minimizar el chat NO lo pierde.)
    ;['asistente_chat', 'asistente_ctx', 'asistente_modo', 'asistente_visto',
      'asistente_feedback'].forEach((clave) => sessionStorage.removeItem(clave))
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext debe usarse dentro de AuthProvider')
  return ctx
}
