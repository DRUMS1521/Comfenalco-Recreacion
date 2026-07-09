import { useState, useEffect, useMemo } from 'react'
import api from '../services/api'
import SolicitudModal from './SolicitudModal'
import SolicitudDetailModal from './SolicitudDetailModal'
import { formatHora } from '../utils/timeFormat'

const ESTADO_CONFIG = {
  pendiente:      { label: 'Pendiente',    cls: 'border-yellow-500 text-yellow-800' },
  programado:     { label: 'Programado',   cls: 'border-blue-600 text-blue-800' },
  'por corregir': { label: 'Por Corregir', cls: 'border-orange-500 text-orange-800' },
  finalizado:     { label: 'Finalizado',   cls: 'border-primary-700 text-primary-800' },
}

const FILTER_BTNS = [
  { estado: 'pendiente',    label: 'Pendientes',   dot: 'bg-yellow-400', activeCls: 'bg-yellow-50 border-yellow-400 text-yellow-700' },
  { estado: 'programado',   label: 'Programadas',  dot: 'bg-blue-400',   activeCls: 'bg-blue-50 border-blue-400 text-blue-700' },
  { estado: 'por corregir', label: 'Por Corregir', dot: 'bg-orange-400', activeCls: 'bg-orange-50 border-orange-400 text-orange-700' },
  { estado: 'finalizado',   label: 'Finalizadas',  dot: 'bg-emerald-400',activeCls: 'bg-emerald-50 border-emerald-400 text-emerald-700' },
]

const PAGE_SIZE = 10

export default function PromotorDashboard() {
  const [solicitudes, setSolicitudes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendiente')
  const [page, setPage] = useState(1)
  const [modalSol, setModalSol] = useState(null)
  const [showNueva, setShowNueva] = useState(false)

  const fetchSolicitudes = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/solicitudes/')
      setSolicitudes(data)
    } catch {
      //
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSolicitudes() }, [])

  const stats = useMemo(() => ({
    pendiente:      solicitudes.filter(s => s.estado === 'pendiente').length,
    programado:     solicitudes.filter(s => s.estado === 'programado').length,
    'por corregir': solicitudes.filter(s => s.estado === 'por corregir').length,
    finalizado:     solicitudes.filter(s => s.estado === 'finalizado').length,
  }), [solicitudes])

  const filtered = useMemo(() =>
    filtro ? solicitudes.filter(s => s.estado === filtro) : solicitudes
  , [solicitudes, filtro])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFiltro = (estado) => {
    setFiltro(prev => prev === estado ? null : estado)
    setPage(1)
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-400">
            {solicitudes.length} solicitud{solicitudes.length !== 1 ? 'es' : ''} en total
          </p>
        </div>
        <button onClick={() => setShowNueva(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Solicitud
        </button>
      </div>

      {/* Botones de estado filtrables */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FILTER_BTNS.map(({ estado, label, dot, activeCls }) => {
          const count = stats[estado] ?? 0
          const activo = filtro === estado
          return (
            <button
              key={estado}
              onClick={() => handleFiltro(estado)}
              className={`flex items-center gap-3 p-3.5 rounded-md border transition-colors text-left ${
                activo
                  ? activeCls
                  : 'bg-white border-ink-200 text-ink-600 hover:border-ink-400'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
              <div className="min-w-0">
                <p className="text-xs opacity-70 leading-none">{label}</p>
                <p className="text-2xl font-bold leading-tight mt-0.5">{count}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Indicator bar */}
      {filtro && (
        <div className="flex items-center justify-between text-sm bg-ink-50 rounded-md px-4 py-2.5 border border-ink-100">
          <span className="text-ink-600">
            Mostrando <span className="font-semibold text-ink-900">{filtered.length}</span> solicitud{filtered.length !== 1 ? 'es' : ''} ·{' '}
            {FILTER_BTNS.find(b => b.estado === filtro)?.label}
          </span>
          <button
            onClick={() => { setFiltro(null); setPage(1) }}
            className="text-primary-800 font-semibold uppercase tracking-wide hover:text-accent-700 text-xs"
          >
            Ver todas
          </button>
        </div>
      )}

      {/* Lista */}
      <div className="card-corp overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="text-center py-16 px-4 text-ink-400">
            <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="font-medium text-ink-500">
              {filtro
                ? `No tienes solicitudes ${FILTER_BTNS.find(b => b.estado === filtro)?.label.toLowerCase()}`
                : 'Aún no tienes solicitudes'}
            </p>
            {!filtro && (
              <button onClick={() => setShowNueva(true)} className="btn-primary mt-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nueva Solicitud
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {paginated.map(sol => {
              const cfg = ESTADO_CONFIG[sol.estado] || { label: sol.estado, cls: 'border-ink-400 text-ink-600' }
              const recreadores = sol.recreadores_asignados ?? []
              return (
                <button
                  key={sol.id}
                  onClick={() => setModalSol(sol)}
                  className="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-ink-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Dot de estado */}
                    <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                      sol.estado === 'pendiente'    ? 'bg-yellow-400' :
                      sol.estado === 'programado'   ? 'bg-blue-400'   :
                      sol.estado === 'por corregir' ? 'bg-orange-400' :
                      sol.estado === 'finalizado'   ? 'bg-emerald-400': 'bg-ink-300'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink-800 text-sm">{sol.empresa}</span>
                        <span className={`badge-corp ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <span className="text-ink-500 text-xs">
                          {sol.fecha_evento} · {formatHora(sol.hora_inicio)}–{formatHora(sol.hora_fin)}
                        </span>
                        <span className="text-ink-400 text-xs">{sol.ciudad} · {sol.tipo_servicio}</span>
                      </div>

                      {/* Recreador asignado (solo si programado) */}
                      {sol.estado === 'programado' && recreadores.length > 0 && (
                        <p className="text-xs text-blue-600 font-medium mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {recreadores.length === 1
                            ? (recreadores[0].full_name || recreadores[0].username)
                            : `${recreadores.length} recreadores asignados`}
                        </p>
                      )}

                      {/* Nota devuelta por corregir */}
                      {sol.estado === 'por corregir' && (
                        <p className="text-xs text-orange-600 font-medium mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Devuelta para corrección
                          {sol.observaciones ? ` · ${sol.observaciones}` : ''}
                        </p>
                      )}

                      {/* Observación de finalización */}
                      {sol.estado === 'finalizado' && sol.observacion_final && (
                        <p className="text-xs text-emerald-600 mt-1 truncate">
                          "{sol.observacion_final}"
                        </p>
                      )}
                    </div>

                    <svg className="w-4 h-4 text-ink-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-ink-100">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-secondary btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-ink-400 px-2">
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {modalSol && (
        <SolicitudDetailModal
          solicitud={modalSol}
          onClose={() => setModalSol(null)}
        />
      )}

      {/* Modal nueva solicitud */}
      {showNueva && (
        <SolicitudModal
          onClose={() => setShowNueva(false)}
          onSuccess={() => { setFiltro('pendiente'); fetchSolicitudes() }}
        />
      )}
    </div>
  )
}
