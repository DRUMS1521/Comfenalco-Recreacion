import { useState, useEffect, useCallback, useMemo } from 'react'
import useAuth from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import SolicitudModal from '../components/SolicitudModal'
import CalendarView from '../components/CalendarView'
import CalendarAdminView from '../components/CalendarAdminView'
import CalendarRecreadorView from '../components/CalendarRecreadorView'
import EstadoModal from '../components/EstadoModal'
import SolicitudDetailModal from '../components/SolicitudDetailModal'
import FinalizarModal from '../components/FinalizarModal'
import StatsRecreador from '../components/StatsRecreador'
import StatsAdmin from '../components/StatsAdmin'
import EmpresasView from '../components/EmpresasView'
import PromotorDashboard from '../components/PromotorDashboard'
import UsersView from '../components/UsersView'
import HorasExtraRecreadorView from '../components/HorasExtraRecreadorView'
import HorasExtraAdminView from '../components/HorasExtraAdminView'
import api from '../services/api'
import { notify } from '../utils/notify'
import { formatHora } from '../utils/timeFormat'
import WelcomeModal from '../components/WelcomeModal'

const ESTADO_CONFIG = {
  pendiente:       { label: 'Pendiente',    cls: 'border-yellow-500 text-yellow-800' },
  programado:      { label: 'Programado',   cls: 'border-blue-600 text-blue-800' },
  'por corregir':  { label: 'Por Corregir', cls: 'border-orange-500 text-orange-800' },
  eliminado:       { label: 'Eliminado',    cls: 'border-red-600 text-red-800' },
  finalizado:      { label: 'Finalizado',   cls: 'border-primary-700 text-primary-800' },
}

function EstadoBadge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] || { label: estado, cls: 'border-ink-400 text-ink-600' }
  return (
    <span className={`badge-corp ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

const DIAS_ES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function toYMD(d) { return d.toISOString().split('T')[0] }

function getSemanaActual() {
  const hoy = new Date()
  const day = hoy.getDay()
  const diffLunes = day === 0 ? -6 : 1 - day
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diffLunes)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return { desde: toYMD(lunes), hasta: toYMD(domingo) }
}

function puedeFinalizarSol(sol) {
  if (sol.estado !== 'programado') return false
  const ahora = new Date()
  const finEvento = new Date(`${sol.fecha_evento}T${sol.hora_fin}:00`)
  return ahora > finEvento
}

/* ── Card mejorada para admin ── */
function AdminSolicitudCard({ sol, onVerDetalle, onCambiarEstado }) {
  const asignados = sol.recreadores_asignados?.length ?? 0
  const necesarios = Number(sol.cantidad_recreadores ?? 0)
  const esPorCorregir = sol.estado === 'por corregir'

  const recFill = necesarios > 0 && sol.estado === 'programado'
    ? asignados >= necesarios ? 'full' : 'partial'
    : null

  return (
    <div className={`flex items-stretch group border-l-2 transition-colors
      ${esPorCorregir
        ? 'border-l-orange-400 bg-orange-50/40'
        : 'border-l-transparent hover:border-l-primary-300'
      }`}>
      <button
        onClick={() => onVerDetalle(sol)}
        className="flex-1 text-left px-4 sm:px-5 py-3.5 hover:bg-primary-50/30 transition flex items-start gap-3"
      >
        {/* Dot de estado */}
        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
          sol.estado === 'pendiente'    ? 'bg-yellow-400' :
          sol.estado === 'programado'   ? 'bg-blue-400' :
          sol.estado === 'por corregir' ? 'bg-orange-400' :
          sol.estado === 'finalizado'   ? 'bg-emerald-500' :
          'bg-red-300'
        }`} />

        <div className="flex-1 min-w-0">
          {/* Empresa + badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink-800 text-sm">{sol.empresa}</span>
            <EstadoBadge estado={sol.estado} />
            {esPorCorregir && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-800 border-l-2 border-orange-500 bg-orange-50 px-1.5 py-0.5">
                Requiere atención
              </span>
            )}
          </div>

          {/* Detalles */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            <span className="text-ink-500 text-xs flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {sol.fecha_evento} · {formatHora(sol.hora_inicio)}{sol.hora_fin ? `–${formatHora(sol.hora_fin)}` : ''}
            </span>
            <span className="text-ink-400 text-xs">{sol.ciudad} · {sol.tipo_servicio}</span>
          </div>

          {/* Recreadores fill */}
          {necesarios > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <svg className="w-3 h-3 text-ink-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className={`text-xs font-semibold ${
                recFill === 'full'    ? 'text-emerald-600' :
                recFill === 'partial' ? 'text-orange-500' :
                'text-ink-400'
              }`}>
                {asignados}/{necesarios} recreador{necesarios !== 1 ? 'es' : ''}
              </span>
              {/* Pills de avatares */}
              {sol.recreadores_asignados?.length > 0 && (
                <div className="flex -space-x-1">
                  {sol.recreadores_asignados.slice(0, 3).map((r) => (
                    <div key={r.id}
                      title={r.full_name || r.username}
                      className="w-4 h-4 rounded-full bg-primary-100 border border-white flex items-center justify-center shrink-0">
                      <span className="text-[8px] font-bold text-primary-700">
                        {(r.full_name || r.username).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  ))}
                  {sol.recreadores_asignados.length > 3 && (
                    <div className="w-4 h-4 rounded-full bg-ink-200 border border-white flex items-center justify-center shrink-0">
                      <span className="text-[8px] font-bold text-ink-500">+{sol.recreadores_asignados.length - 3}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Acción rápida cambiar estado */}
      <button
        onClick={() => onCambiarEstado(sol)}
        title="Cambiar estado"
        className="px-3.5 flex items-center text-ink-300 hover:text-primary-500 hover:bg-primary-50 transition opacity-0 group-hover:opacity-100"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </button>
    </div>
  )
}

/* ── Card para recreador/empresa ── */
function SolicitudCard({ sol, isAdmin, onVerDetalle, onCambiarEstado, onFinalizar }) {
  return (
    <div className={`flex items-stretch divide-x divide-ink-100 ${sol.estado === 'eliminado' ? 'opacity-40' : ''}`}>
      <button
        onClick={() => onVerDetalle(sol)}
        className="flex-1 text-left px-4 sm:px-5 py-3.5 hover:bg-primary-50/40 transition flex items-start gap-3"
      >
        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
          sol.estado === 'pendiente'    ? 'bg-yellow-400' :
          sol.estado === 'programado'   ? 'bg-blue-400' :
          sol.estado === 'por corregir' ? 'bg-orange-400' :
          sol.estado === 'finalizado'   ? 'bg-emerald-500' :
          'bg-red-300'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink-800 text-sm">{sol.empresa}</span>
            <EstadoBadge estado={sol.estado} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            <span className="text-ink-500 text-xs flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {sol.fecha_evento} · {formatHora(sol.hora_inicio)}{sol.hora_fin ? `–${formatHora(sol.hora_fin)}` : ''}
            </span>
            <span className="text-ink-500 text-xs">{sol.ciudad} · {sol.tipo_servicio}</span>
            <span className="text-ink-400 text-xs">{sol.cantidad_recreadores} recreador{sol.cantidad_recreadores !== 1 ? 'es' : ''}</span>
          </div>
        </div>
      </button>

      {isAdmin && (
        <button onClick={() => onCambiarEstado(sol)} title="Cambiar estado"
          className="px-3 text-ink-300 hover:text-orange-500 hover:bg-orange-50 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      )}

      {!isAdmin && onFinalizar && puedeFinalizarSol(sol) && (
        <button onClick={(e) => { e.stopPropagation(); onFinalizar(sol) }} title="Finalizar actividad"
          className="px-3 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
    </div>
  )
}

const PAGE_SIZE = 10

export default function DashboardPage() {
  const { user } = useAuth()
  const [showSolicitudModal, setShowSolicitudModal] = useState(false)
  const [solicitudes, setSolicitudes] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('lista')
  const [calView, setCalView] = useState('semana')
  const [estadoTarget, setEstadoTarget] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [finalizarTarget, setFinalizarTarget] = useState(null)
  const [recreadores, setRecreadores] = useState([])
  const [diaSeleccionado, setDiaSeleccionado] = useState(() => toYMD(new Date()))
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [showWelcome, setShowWelcome] = useState(false)

  // Admin list controls
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('asc')   // 'asc' | 'desc' por fecha_evento
  const [page, setPage] = useState(1)
  const [dismissedHoy, setDismissedHoy] = useState(false)

  const fetchSolicitudes = useCallback(async () => {
    try {
      const { data } = await api.get('/solicitudes/')
      setSolicitudes(data)
      setFiltroEstado('pendiente')
      setPage(1)
      if (!sessionStorage.getItem('welcomeShown')) {
        sessionStorage.setItem('welcomeShown', '1')
        setShowWelcome(true)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSolicitudes() }, [fetchSolicitudes])

  useEffect(() => {
    if (user?.is_admin) {
      api.get('/auth/recreadores').then(({ data }) => setRecreadores(data)).catch(() => {})
    }
  }, [user?.is_admin])

  // Reset page cuando cambia filtro o búsqueda
  useEffect(() => { setPage(1) }, [filtroEstado, search])

  const handleEstadoChange = async (id, estado, recreadorIds = null, tipoHoraExtra = null) => {
    try {
      const body = { estado }
      if (recreadorIds?.length) body.recreador_ids = recreadorIds
      if (tipoHoraExtra) body.tipo_hora_extra = tipoHoraExtra
      const { data } = await api.patch(`/solicitudes/${id}/estado`, body)
      setSolicitudes((prev) => prev.map((s) => (s.id === id ? data : s)))
      notify.success(`Estado actualizado: ${ESTADO_CONFIG[estado]?.label || estado}`)
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Error al actualizar estado')
    }
  }

  const handleFinalizar = async (id, observacion) => {
    try {
      const { data } = await api.patch(`/solicitudes/${id}/finalizar`, { observacion })
      setSolicitudes((prev) => prev.map((s) => (s.id === id ? data : s)))
      setFinalizarTarget(null)
      notify.success('Actividad marcada como finalizada')
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Error al finalizar')
    }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const isRecreador = user?.is_recreador
  const isAdmin = user?.is_admin
  const isPromotor = user?.is_promotor
  const isSuperAdmin = user?.is_super_admin

  const hoy = toYMD(new Date())

  // Eventos programados para hoy
  const eventosHoy = useMemo(
    () => solicitudes.filter((s) => s.fecha_evento === hoy && s.estado === 'programado'),
    [solicitudes, hoy]
  )

  // Solicitudes por corregir urgentes
  const porCorregir = useMemo(
    () => solicitudes.filter((s) => s.estado === 'por corregir'),
    [solicitudes]
  )

  // Contadores para el admin
  const ADMIN_STATS = [
    {
      estado: 'pendiente',
      label: 'Pendientes',
      value: solicitudes.filter((s) => s.estado === 'pendiente').length,
      inactiveCls: 'bg-white border-ink-200 text-ink-600 hover:border-yellow-500',
      activeCls:   'bg-yellow-50 border-yellow-600 text-yellow-800',
      iconBgInactive: 'bg-yellow-50 text-yellow-700',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      estado: 'programado',
      label: 'Programadas',
      value: solicitudes.filter((s) => s.estado === 'programado').length,
      inactiveCls: 'bg-white border-ink-200 text-ink-600 hover:border-blue-600',
      activeCls:   'bg-blue-50 border-blue-700 text-blue-800',
      iconBgInactive: 'bg-blue-50 text-blue-700',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      estado: 'por corregir',
      label: 'Por Corregir',
      value: solicitudes.filter((s) => s.estado === 'por corregir').length,
      inactiveCls: 'bg-white border-ink-200 text-ink-600 hover:border-orange-500',
      activeCls:   'bg-orange-50 border-orange-600 text-orange-800',
      iconBgInactive: 'bg-orange-50 text-orange-700',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      estado: 'finalizado',
      label: 'Finalizadas esta semana',
      value: (() => {
        const { desde, hasta } = getSemanaActual()
        return solicitudes.filter(
          (s) => s.estado === 'finalizado' && s.fecha_evento >= desde && s.fecha_evento <= hasta
        ).length
      })(),
      total: solicitudes.filter((s) => s.estado === 'finalizado').length,
      inactiveCls: 'bg-white border-ink-200 text-ink-600 hover:border-primary-700',
      activeCls:   'bg-primary-50 border-primary-800 text-primary-900',
      iconBgInactive: 'bg-primary-50 text-primary-800',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  const statsRecreador = [
    { label: 'Asignadas', value: solicitudes.length, dot: 'bg-blue-400' },
    { label: 'Próximas',  value: solicitudes.filter((s) => s.fecha_evento >= hoy).length, dot: 'bg-green-400' },
  ]

  // Lista filtrada + búsqueda + orden para admin
  const solicitudesFiltradas = useMemo(() => {
    let list = filtroEstado
      ? solicitudes.filter((s) => s.estado === filtroEstado)
      : solicitudes

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((s) =>
        s.empresa?.toLowerCase().includes(q) ||
        s.ciudad?.toLowerCase().includes(q) ||
        s.tipo_servicio?.toLowerCase().includes(q)
      )
    }

    list = [...list].sort((a, b) => {
      const cmp = a.fecha_evento.localeCompare(b.fecha_evento) || a.hora_inicio.localeCompare(b.hora_inicio)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [solicitudes, filtroEstado, search, sortDir])

  const totalPages = Math.max(1, Math.ceil(solicitudesFiltradas.length / PAGE_SIZE))
  const paginadas = solicitudesFiltradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const PAGE_TITLES = {
    lista:        isRecreador ? 'Mis Asignaciones' : isPromotor ? 'Mis Solicitudes' : 'Solicitudes',
    calendario:   'Calendario',
    estadisticas: 'Estadísticas',
    empresas:     'Empresas',
    usuarios:     'Gestión de Usuarios',
    'horas-extra': isRecreador ? 'Mis Horas Extras' : 'Horas Extras y Recargos',
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar
        tab={tab}
        setTab={setTab}
        isAdmin={isAdmin}
        isRecreador={isRecreador}
        isPromotor={isPromotor}
        isSuperAdmin={isSuperAdmin}
        badgeCount={solicitudes.filter((s) => s.estado === 'programado').length}
        onNuevaSolicitud={() => setShowSolicitudModal(true)}
      />

      <div className="flex-1 ml-16">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">

          {/* Header de página */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-ink-400 text-sm">{greeting()}, {user?.full_name?.split(' ')[0] || user?.username}</p>
              <h1 className="text-2xl font-bold text-ink-900 mt-0.5">{PAGE_TITLES[tab]}</h1>
            </div>
            <button
              onClick={fetchSolicitudes}
              className="btn-ghost text-xs uppercase tracking-wider font-semibold px-3 py-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar
            </button>
          </div>

          {/* Stats / Filtros */}
          {tab !== 'estadisticas' && tab !== 'empresas' && !isPromotor && (
            isAdmin ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ADMIN_STATS.map((s) => {
                  const activo = filtroEstado === s.estado
                  return (
                    <button
                      key={s.estado}
                      onClick={() => setFiltroEstado(s.estado)}
                      className={`relative text-left rounded-md border p-4 flex items-center gap-3
                        transition-colors duration-150
                        ${activo ? s.activeCls : s.inactiveCls}`}
                    >
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${s.iconBgInactive}`}>
                        {s.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-2xl font-bold leading-none">
                          {s.value}
                        </p>
                        <p className="text-xs mt-0.5 truncate opacity-80">
                          {s.label}
                        </p>
                        {s.total !== undefined && (
                          <p className="text-[10px] mt-0.5 opacity-50">
                            {s.total} en total
                          </p>
                        )}
                      </div>
                      {s.estado === 'por corregir' && s.value > 0 && !activo && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                          {s.value}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {statsRecreador.map((s) => (
                  <div key={s.label} className="card-corp p-4 flex items-center gap-3">
                    <span className={`w-2 h-8 rounded-sm shrink-0 ${s.dot}`} />
                    <div>
                      <p className="text-2xl font-bold text-ink-800 leading-none">{s.value}</p>
                      <p className="text-xs text-ink-400 mt-0.5">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Banner: Eventos de hoy (solo admin, tab lista) */}
          {isAdmin && tab === 'lista' && eventosHoy.length > 0 && !dismissedHoy && (
            <div className="bg-ink-900 border-l-2 border-accent-500 rounded-md px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-md flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">
                  {eventosHoy.length === 1
                    ? '1 actividad programada para hoy'
                    : `${eventosHoy.length} actividades programadas para hoy`}
                </p>
                <p className="text-ink-300 text-xs mt-0.5">
                  {eventosHoy.map((s) => s.empresa).join(' · ')}
                </p>
              </div>
              <button
                onClick={() => setFiltroEstado('programado')}
                className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-900 bg-accent-500 hover:bg-accent-400 px-3 py-1.5 rounded-md transition-colors"
              >
                Ver
              </button>
              <button
                onClick={() => setDismissedHoy(true)}
                className="text-ink-400 hover:text-white transition-colors p-1 rounded"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Contenido principal */}
          <div className="card-corp overflow-hidden">

            {/* Tab: Lista */}
            {tab === 'lista' && (
              <>
                {isPromotor ? (
                  <div className="p-4 sm:p-6">
                    <PromotorDashboard />
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : isAdmin ? (
                  /* ───── Vista Admin ───── */
                  <>
                    {/* Toolbar: búsqueda + sort + contador */}
                    <div className="px-4 sm:px-5 py-3 border-b border-ink-100 flex items-center gap-3 flex-wrap">
                      {/* Búsqueda */}
                      <div className="relative flex-1 min-w-[160px]">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300"
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar empresa, ciudad, servicio..."
                          className="field-input pl-8 py-2 text-xs"
                        />
                        {search && (
                          <button onClick={() => setSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-600">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Sort */}
                      <button
                        onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                        title={sortDir === 'asc' ? 'Más recientes primero' : 'Más antiguas primero'}
                        className="btn-secondary btn-sm shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d={sortDir === 'asc'
                              ? 'M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12'
                              : 'M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4'
                            } />
                        </svg>
                        {sortDir === 'asc' ? 'Fecha ↑' : 'Fecha ↓'}
                      </button>

                      {/* Contador */}
                      <span className="text-xs text-ink-400 shrink-0">
                        {solicitudesFiltradas.length} resultado{solicitudesFiltradas.length !== 1 ? 's' : ''}
                      </span>

                      {/* Ver todas */}
                      {filtroEstado && (
                        <button
                          onClick={() => { setFiltroEstado(null); setSearch('') }}
                          className="text-xs text-primary-800 hover:text-accent-700 font-semibold uppercase tracking-wide shrink-0 hover:underline"
                        >
                          Ver todas
                        </button>
                      )}
                    </div>

                    {/* Lista */}
                    {solicitudesFiltradas.length === 0 ? (
                      <div className="text-center py-14 px-4">
                        <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d={search
                                ? 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
                                : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-ink-600">
                          {search
                            ? `Sin resultados para "${search}"`
                            : filtroEstado === 'pendiente'
                              ? 'Sin solicitudes pendientes'
                              : 'No hay solicitudes en este estado'}
                        </p>
                        <p className="text-xs text-ink-400 mt-1">
                          {search ? 'Intenta con otro término' : 'Todo al día por aquí'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-ink-100">
                          {paginadas.map((sol) => (
                            <AdminSolicitudCard
                              key={sol.id}
                              sol={sol}
                              onVerDetalle={setDetailTarget}
                              onCambiarEstado={setEstadoTarget}
                            />
                          ))}
                        </div>

                        {/* Paginación */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between px-5 py-3 border-t border-ink-100">
                            <span className="text-xs text-ink-400">
                              Página {page} de {totalPages}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-1.5 rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                const p = totalPages <= 7
                                  ? i + 1
                                  : page <= 4
                                    ? i + 1
                                    : page >= totalPages - 3
                                      ? totalPages - 6 + i
                                      : page - 3 + i
                                return (
                                  <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`w-7 h-7 rounded-md text-xs font-semibold transition-colors ${
                                      p === page
                                        ? 'bg-primary-800 text-white'
                                        : 'text-ink-500 hover:bg-ink-100'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                )
                              })}
                              <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-1.5 rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : isRecreador ? (
                  /* ───── Vista Recreador por día ───── */
                  (() => {
                    const diaDate = new Date(diaSeleccionado + 'T12:00:00')
                    const esHoy = diaSeleccionado === hoy
                    const labelDia = `${DIAS_ES[diaDate.getDay()]} ${diaDate.getDate()} de ${MESES_ES[diaDate.getMonth()]} ${diaDate.getFullYear()}`

                    const prevDia = () => {
                      const d = new Date(diaSeleccionado + 'T12:00:00')
                      d.setDate(d.getDate() - 1)
                      setDiaSeleccionado(toYMD(d))
                    }
                    const nextDia = () => {
                      const d = new Date(diaSeleccionado + 'T12:00:00')
                      d.setDate(d.getDate() + 1)
                      setDiaSeleccionado(toYMD(d))
                    }

                    const tareasDelDia = solicitudes.filter(
                      (s) => s.fecha_evento === diaSeleccionado && s.estado !== 'eliminado'
                    ).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))

                    return (
                      <div>
                        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-ink-100">
                          <button onClick={prevDia}
                            className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>

                          <div className="text-center">
                            <p className={`text-sm font-bold ${esHoy ? 'text-primary-800' : 'text-ink-800'}`}>
                              {esHoy ? 'Hoy — ' : ''}{labelDia}
                            </p>
                            <p className="text-xs text-ink-400 mt-0.5">
                              {tareasDelDia.length === 0
                                ? 'Sin actividades'
                                : `${tareasDelDia.length} actividad${tareasDelDia.length !== 1 ? 'es' : ''}`}
                            </p>
                          </div>

                          <div className="flex items-center gap-1">
                            {!esHoy && (
                              <button onClick={() => setDiaSeleccionado(hoy)}
                                className="text-xs text-primary-800 hover:text-accent-700 font-semibold uppercase tracking-wide px-2 py-1 rounded-md hover:bg-ink-100 transition-colors">
                                Hoy
                              </button>
                            )}
                            <button onClick={nextDia}
                              className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-500">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {tareasDelDia.length === 0 ? (
                          <div className="text-center py-14 text-ink-400">
                            <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <p className="text-sm font-medium">Sin actividades para este día</p>
                            <p className="text-xs mt-1">Usa las flechas para navegar a otro día</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-ink-100 max-h-[420px] overflow-y-auto">
                            {tareasDelDia.map((sol) => (
                              <SolicitudCard
                                key={sol.id}
                                sol={sol}
                                isAdmin={false}
                                onVerDetalle={setDetailTarget}
                                onCambiarEstado={null}
                                onFinalizar={setFinalizarTarget}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()
                ) : (
                  /* ───── Vista empresa/usuario normal ───── */
                  solicitudes.length === 0 ? (
                    <div className="text-center py-16 px-4">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <h3 className="text-ink-700 font-semibold mb-1">Aún no tienes solicitudes</h3>
                      <p className="text-ink-400 text-sm mb-4">Crea tu primera solicitud de servicio de recreación</p>
                      <button onClick={() => setShowSolicitudModal(true)} className="btn-primary">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Nueva solicitud
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-[480px] overflow-y-auto divide-y divide-ink-100 scrollbar-thin">
                      {solicitudes.filter((s) => s.estado !== 'eliminado').map((sol) => (
                        <SolicitudCard
                          key={sol.id}
                          sol={sol}
                          isAdmin={false}
                          onVerDetalle={setDetailTarget}
                          onCambiarEstado={null}
                        />
                      ))}
                    </div>
                  )
                )}
              </>
            )}

            {/* Tab: Empresas */}
            {tab === 'empresas' && isAdmin && <EmpresasView />}

            {/* Tab: Usuarios (super admin) */}
            {tab === 'usuarios' && isSuperAdmin && <UsersView />}

            {/* Tab: Estadísticas */}
            {tab === 'estadisticas' && (
              <div className="p-4 sm:p-6">
                {isAdmin
                  ? <StatsAdmin recreadores={recreadores} />
                  : <StatsRecreador />
                }
              </div>
            )}

            {/* Tab: Horas Extras y Recargos */}
            {tab === 'horas-extra' && (
              <div className="p-4 sm:p-6">
                {isAdmin
                  ? <HorasExtraAdminView />
                  : <HorasExtraRecreadorView />
                }
              </div>
            )}

            {/* Tab: Calendario */}
            {tab === 'calendario' && (
              <div>
                {isAdmin && (
                  <div className="flex border-b border-ink-100 px-4 pt-3 gap-1">
                    {[
                      { key: 'semana', label: 'Cronograma semanal', icon: 'M3 10h18M3 14h18M10 3v18M14 3v18' },
                      { key: 'mes',    label: 'Vista mensual',      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                    ].map(({ key, label, icon }) => (
                      <button key={key} onClick={() => setCalView(key)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${
                          calView === key
                            ? 'border-accent-600 text-primary-800'
                            : 'border-transparent text-ink-400 hover:text-ink-600'
                        }`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                        </svg>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="p-4 sm:p-6">
                  {isAdmin
                    ? calView === 'semana'
                      ? <CalendarAdminView solicitudes={solicitudes} onVerDetalle={setDetailTarget} />
                      : <CalendarView solicitudes={solicitudes} isAdmin={true} onVerDetalle={setDetailTarget} />
                    : isRecreador
                      ? <CalendarRecreadorView solicitudes={solicitudes} userId={user?.id} onVerDetalle={setDetailTarget} onFinalizar={setFinalizarTarget} />
                      : <CalendarView solicitudes={solicitudes} isAdmin={false} />
                  }
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modales */}
      {showSolicitudModal && (
        <SolicitudModal onClose={() => setShowSolicitudModal(false)} onSuccess={fetchSolicitudes} />
      )}

      {estadoTarget && (
        <EstadoModal
          solicitud={estadoTarget}
          solicitudes={solicitudes}
          onClose={() => setEstadoTarget(null)}
          onConfirm={handleEstadoChange}
        />
      )}

      {detailTarget && (
        <SolicitudDetailModal
          solicitud={detailTarget}
          onClose={() => setDetailTarget(null)}
          onCambiarEstado={isAdmin ? (sol) => { setDetailTarget(null); setEstadoTarget(sol) } : null}
        />
      )}

      {finalizarTarget && (
        <FinalizarModal
          solicitud={finalizarTarget}
          onClose={() => setFinalizarTarget(null)}
          onConfirm={handleFinalizar}
        />
      )}

      {showWelcome && (
        <WelcomeModal
          user={user}
          solicitudes={solicitudes}
          onClose={() => setShowWelcome(false)}
        />
      )}
    </div>
  )
}
