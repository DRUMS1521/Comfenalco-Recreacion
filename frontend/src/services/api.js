import axios from 'axios'

// En desarrollo se usa el proxy de Vite ('/api' -> http://localhost:8000): así la
// aplicación funciona igual desde localhost o desde la IP de la red (celular,
// tablet) sin depender del CORS. En producción VITE_API_URL apunta al backend.
const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('auth') || sessionStorage.getItem('auth')
  if (stored) {
    const { access_token } = JSON.parse(stored)
    if (access_token) {
      config.headers.Authorization = `Bearer ${access_token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth')
      sessionStorage.removeItem('auth')
      window.dispatchEvent(new Event('auth:logout'))
    }
    return Promise.reject(err)
  }
)

export default api
