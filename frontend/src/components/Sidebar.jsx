import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import logo from '../assets/logo-comfenalco.svg'

function SidebarClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const hora  = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fecha = now.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="mt-1.5">
      <p className="font-mono text-sm font-bold text-white leading-none whitespace-nowrap">{hora}</p>
      <p className="text-[11px] text-primary-300 capitalize mt-0.5 whitespace-nowrap">{fecha}</p>
    </div>
  )
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

const NAV_ICONS = {
  empresas: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  lista: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  calendario: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  estadisticas: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  usuarios: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  'horas-extra': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  viaticos: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m-4 6h16a1 1 0 011 1v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a1 1 0 011-1z" />
    </svg>
  ),
}

export default function Sidebar({ tab, setTab, isAdmin, isRecreador, isPromotor, isSuperAdmin, badgeCount = 0, onNuevaSolicitud }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  // En móvil/tablet la navegación es una barra superior + cajón lateral: el rail
  // de iconos de escritorio (64 px, etiquetas al hover) no es usable en táctil.
  const [abierto, setAbierto] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const irA = (key) => { setTab(key); setAbierto(false) }
  const nuevaSolicitud = () => { setAbierto(false); onNuevaSolicitud?.() }

  // Bloquea el scroll del fondo y cierra con Escape mientras el cajón está abierto
  useEffect(() => {
    if (!abierto) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const alPulsar = (e) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alPulsar)
    return () => {
      document.body.style.overflow = previo
      window.removeEventListener('keydown', alPulsar)
    }
  }, [abierto])

  const navItems = isPromotor
    ? [{ key: 'lista', label: 'Mis Solicitudes' }]
    : [
        { key: 'lista',        label: isRecreador ? 'Mis Asignaciones' : 'Solicitudes' },
        { key: 'calendario',   label: 'Calendario', badge: badgeCount > 0 ? badgeCount : null },
        ...(isAdmin ? [{ key: 'empresas', label: 'Empresas' }] : []),
        { key: 'estadisticas', label: 'Estadísticas' },
        ...(isRecreador ? [{ key: 'horas-extra', label: 'Mis Horas Extras' }] : []),
        ...(isAdmin ? [{ key: 'horas-extra', label: 'Horas Extras y Recargos' }] : []),
        ...(isSuperAdmin ? [{ key: 'usuarios', label: 'Usuarios' }] : []),
        ...(isSuperAdmin ? [{ key: 'viaticos', label: 'Mis Viáticos' }] : []),
      ]

  return (
    <>
    {/* Barra superior solo en móvil/tablet (en escritorio manda el rail lateral) */}
    <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-ink-900 text-white
      flex items-center gap-2 px-2 border-b border-white/10">
      <button
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú de navegación"
        aria-expanded={abierto}
        className="w-11 h-11 flex items-center justify-center rounded-md text-ink-200
          hover:bg-white/10 hover:text-white transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <img src={logo} alt="" className="w-7 h-7 bg-white rounded p-0.5 shrink-0" />
        <p className="font-bold text-sm truncate">Comfenalco</p>
      </div>
      <div className="w-9 h-9 rounded-full bg-primary-800 flex items-center justify-center shrink-0
        text-white font-bold text-xs ring-1 ring-accent-500/40">
        {getInitials(user?.full_name || user?.username)}
      </div>
    </header>

    {/* Fondo del cajón (solo móvil) */}
    {abierto && (
      <div
        onClick={() => setAbierto(false)}
        aria-hidden="true"
        className="lg:hidden fixed inset-0 z-40 bg-ink-900/60"
      />
    )}

    {/* En escritorio el panel mide 240 px y lo que se anima es un clip-path: no
        hay animación de width, así que el navegador no recalcula el layout en cada
        frame. El recorte además limita los clics. En móvil el mismo panel es un
        cajón que entra deslizándose (transform). */}
    <div
      data-sidebar
      className={`group fixed left-0 top-0 h-screen z-50 flex flex-col w-60
        bg-ink-900 border-r border-white/10 shadow-[10px_0_30px_-12px_rgba(0,0,0,0.55)]
        transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
        ${abierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        lg:transition-[clip-path]
        lg:[clip-path:inset(0_176px_0_0)] lg:hover:[clip-path:inset(0_0_0_0)] lg:focus-within:[clip-path:inset(0_0_0_0)]
        motion-reduce:transition-none`}
      aria-hidden={!abierto ? undefined : false}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-white/10 shrink-0">
        <div className="w-10 h-10 bg-white rounded-md flex items-center justify-center shrink-0 p-1">
          <img src={logo} alt="Comfenalco Tolima" className="w-full h-full object-contain" />
        </div>
        <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity duration-200 lg:delay-75 whitespace-nowrap overflow-hidden">
          <p className="text-white font-bold text-sm leading-tight">Comfenalco</p>
          <p className="text-ink-400 text-[11px]">Servicios de Recreación</p>
        </div>
      </div>

      {/* Usuario + reloj */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-white/10 shrink-0">
        <div className="w-10 h-10 bg-primary-800 rounded-full flex items-center justify-center shrink-0
          text-white font-bold text-sm ring-1 ring-accent-500/40">
          {getInitials(user?.full_name || user?.username)}
        </div>
        <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity duration-200 lg:delay-75 whitespace-nowrap overflow-hidden min-w-0">
          <p className="text-white font-semibold text-sm truncate leading-tight">
            {user?.full_name || user?.username}
          </p>
          <SidebarClock />
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-hidden">
        {navItems.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => irA(key)}
            title={label}
            className={`w-full flex items-center gap-3 px-2 py-3 lg:py-2.5 rounded-md border-l-2 transition-colors duration-150 group/item
              focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 ${
              tab === key
                ? 'bg-primary-800/60 border-accent-500 text-white'
                : 'border-transparent text-ink-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="w-6 h-6 shrink-0 flex items-center justify-center">
              {NAV_ICONS[key]}
            </div>
            <span className="text-sm font-medium whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity duration-200 lg:delay-75 flex-1 text-left">
              {label}
            </span>
            {badge && (
              <span className="shrink-0 bg-accent-600 text-white text-[10px] w-5 h-5 rounded-full
                flex items-center justify-center font-bold
                opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity duration-200 lg:delay-75">
                {badge}
              </span>
            )}
          </button>
        ))}

        {/* Nueva solicitud (solo no-recreadores y no-promotores — promotor lo tiene en su dashboard) */}
        {!isRecreador && !isPromotor && (
          <>
            <div className="my-2 border-t border-white/10" />
            <button
              onClick={nuevaSolicitud}
              title="Nueva Solicitud"
              className="w-full flex items-center gap-3 px-2 py-3 lg:py-2.5 rounded-md border-l-2 border-transparent
                text-ink-400 hover:bg-white/5 hover:text-accent-400 hover:border-accent-500 transition-colors duration-150"
            >
              <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-medium whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity duration-200 lg:delay-75">
                Nueva Solicitud
              </span>
            </button>
          </>
        )}
      </nav>

      {/* Salir */}
      <div className="px-2 py-4 border-t border-white/10 shrink-0">
        <button
          onClick={handleLogout}
          title="Salir"
          className="w-full flex items-center gap-3 px-2 py-3 lg:py-2.5 rounded-md border-l-2 border-transparent
            text-ink-400 hover:bg-red-900/20 hover:text-red-400 hover:border-red-500 transition-colors duration-150"
        >
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </div>
          <span className="text-sm font-medium whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity duration-200 lg:delay-75">
            Salir
          </span>
        </button>
      </div>
    </div>
    </>
  )
}
