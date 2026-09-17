import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../services/api'
import { formatHora } from '../utils/timeFormat'

const PIE_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#14b8a6']

// Mismas opciones que el formulario de crear solicitud
const TIPOS_SERVICIO = [
  'Pausa Activa',
  'Cardio Rumba',
  'Recreación Corporativa',
  'Carrera de Observación',
  'Dance Ball Fit',
  'Rumba Kids',
  'Rumba Dorada',
  'Otro',
]

const POR_PAGINA = 10

export default function StatsRecreador() {
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [fechaDesde, setFechaDesde]   = useState('')
  const [fechaHasta, setFechaHasta]   = useState('')
  const [tipoServicio, setTipoServicio] = useState('')
  const [pagina, setPagina]           = useState(1)
  const [modalSol, setModalSol]       = useState(null)

  const fetchStats = async (fd = fechaDesde, fh = fechaHasta, ts = tipoServicio) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fd) params.append('fecha_desde', fd)
      if (fh) params.append('fecha_hasta', fh)
      if (ts) params.append('tipo_servicio', ts)
      const { data: res } = await api.get(`/stats/recreador?${params}`)
      setData(res)
      setPagina(1)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [])

  const handleFilter = (e) => {
    e.preventDefault()
    fetchStats()
  }

  const clearFilters = () => {
    setFechaDesde('')
    setFechaHasta('')
    setTipoServicio('')
    fetchStats('', '', '')
  }

  const hasFilters = fechaDesde || fechaHasta || tipoServicio

  // KPIs calculados desde las solicitudes_finalizadas (siempre refleja el filtro)
  const kpis = useMemo(() => {
    const finalizadas = data?.solicitudes_finalizadas ?? []
    const horas = finalizadas.reduce((sum, s) => sum + (s.horas ?? 0), 0)
    return {
      total:       data?.total ?? 0,
      finalizadas: finalizadas.length,
      programadas: data?.programadas ?? 0,
      horas:       Math.round(horas * 10) / 10,
    }
  }, [data])

  // Lista paginada: backend ya devuelve orden descendente por fecha
  const listaOrdenada = data?.solicitudes_finalizadas ?? []
  const totalPaginas  = Math.ceil(listaOrdenada.length / POR_PAGINA)
  const paginaActual  = listaOrdenada.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* KPIs — se actualizan con cada filtro */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total actividades',
            value: kpis.total,
            accent: 'border-ink-300',
            iconCls: 'text-ink-600',
            icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
          },
          {
            label: 'Finalizadas',
            value: kpis.finalizadas,
            accent: 'border-primary-700',
            iconCls: 'text-primary-800',
            icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
          },
          {
            label: 'Programadas',
            value: kpis.programadas,
            accent: 'border-blue-600',
            iconCls: 'text-blue-800',
            icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
          },
          {
            label: 'Horas trabajadas',
            value: `${kpis.horas}h`,
            accent: 'border-accent-600',
            iconCls: 'text-accent-700',
            icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
          },
        ].map(({ label, value, accent, iconCls, icon }) => (
          <div key={label} className={`card-corp border-l-2 ${accent} p-5 flex items-start gap-4`}>
            <div className="w-11 h-11 rounded-md border border-ink-200 flex items-center justify-center shrink-0">
              <svg className={`w-5 h-5 ${iconCls}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-800 leading-none">{value}</p>
              <p className="text-sm font-medium text-ink-600 mt-0.5">{label}</p>
              {hasFilters && <p className="text-[10px] text-accent-700 mt-0.5 font-medium uppercase tracking-wide">filtrado</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card-corp p-5">
        <h3 className="font-bold text-ink-700 text-sm mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtrar actividades
          {hasFilters && <span className="ml-auto badge-corp border-accent-600 text-accent-800">Filtro activo</span>}
        </h3>
        <form onSubmit={handleFilter} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="field-input py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="field-input py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Tipo de servicio</label>
            <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)} className="field-select py-2 min-w-[200px]">
              <option value="">Todos los tipos</option>
              {TIPOS_SERVICIO.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary btn-sm">
            Aplicar
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters}
              className="text-sm text-ink-400 hover:text-ink-700 px-2 py-2 transition-colors underline underline-offset-2">
              Limpiar filtros
            </button>
          )}
        </form>
      </div>

      {/* Gráfico circular por tipo de servicio */}
      {data?.por_tipo_servicio?.length > 0 && (
        <div className="card-corp p-5">
          <h3 className="font-bold text-ink-700 text-sm mb-1">Distribución por tipo de servicio</h3>
          <p className="text-xs text-ink-400 mb-4">
            {kpis.finalizadas} actividad{kpis.finalizadas !== 1 ? 'es' : ''} · {kpis.horas}h totales
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-6">

            {/* Pie */}
            <div className="shrink-0 w-44 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.por_tipo_servicio}
                    dataKey="count"
                    nameKey="tipo"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {data.por_tipo_servicio.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} actividad${value !== 1 ? 'es' : ''}`, name]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Leyenda + resumen */}
            <div className="flex-1 w-full space-y-2">
              {data.por_tipo_servicio.map((item, i) => {
                const total = data.por_tipo_servicio.reduce((s, x) => s + x.count, 0)
                const pct   = Math.round((item.count / total) * 100)
                return (
                  <div key={item.tipo} className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-ink-600 flex-1 truncate">{item.tipo}</span>
                    <span className="text-xs font-bold text-ink-800">{item.count}</span>
                    <span className="text-[10px] text-ink-400 w-8 text-right">{pct}%</span>
                  </div>
                )
              })}
            </div>

          </div>
        </div>
      )}

      {/* Lista de actividades paginada */}
      <div className="card-corp overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink-700 text-sm">Actividades finalizadas</h3>
            {listaOrdenada.length > 0 && (
              <p className="text-xs text-ink-400 mt-0.5">
                {listaOrdenada.length} actividad{listaOrdenada.length !== 1 ? 'es' : ''}
                {totalPaginas > 1 && ` · página ${pagina} de ${totalPaginas}`}
              </p>
            )}
          </div>
          {loading && <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin" />}
        </div>

        {listaOrdenada.length === 0 ? (
          <div className="text-center py-14 text-ink-400">
            <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium">Sin actividades finalizadas</p>
            <p className="text-xs mt-1">
              {hasFilters ? 'Intenta cambiar los filtros' : 'Aquí aparecerán tus actividades completadas'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-ink-100">
              {paginaActual.map((sol) => (
                <button
                  key={sol.id}
                  onClick={() => setModalSol(sol)}
                  className="w-full text-left px-5 py-4 hover:bg-ink-50 transition-colors flex items-start gap-3"
                >
                  <div className="w-2 h-2 rounded-full bg-primary-700 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink-800 text-sm">{sol.empresa}</span>
                      <span className="badge-corp border-primary-700 text-primary-800">
                        Finalizada
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-ink-500 text-xs">{sol.fecha_evento} · {formatHora(sol.hora_inicio)}–{formatHora(sol.hora_fin)}</span>
                      <span className="text-ink-500 text-xs">{sol.tipo_servicio}</span>
                      <span className="text-primary-800 text-xs font-semibold">{sol.horas}h</span>
                    </div>
                    {sol.observacion_final && (
                      <p className="text-xs text-ink-400 mt-1 truncate">"{sol.observacion_final}"</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-ink-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="px-5 py-4 border-t border-ink-100 flex items-center justify-between">
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-primary-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Anterior
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPagina(p)}
                      className={`w-8 h-8 rounded-md text-xs font-semibold transition-colors ${
                        p === pagina
                          ? 'bg-primary-800 text-white'
                          : 'text-ink-500 hover:bg-ink-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  className="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-primary-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de detalle */}
      {modalSol && (
        <div className="modal-overlay">
          <div className="absolute inset-0" onClick={() => setModalSol(null)} />
          <div className="relative bg-white rounded-md border border-ink-200 w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-ink-900 border-b-2 border-accent-500 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-lg leading-tight truncate">{modalSol.empresa}</h2>
                  <p className="text-ink-300 text-sm mt-0.5">{modalSol.tipo_servicio}</p>
                </div>
                <button onClick={() => setModalSol(null)}
                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <span className="mt-3 inline-block text-[10px] uppercase tracking-wide px-2.5 py-1 font-semibold border-l-2 border-accent-500 text-accent-400">
                Finalizada
              </span>
            </div>

            {/* Cuerpo */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-ink-200 rounded-md p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Fecha</p>
                  <p className="text-sm font-semibold text-ink-800">{modalSol.fecha_evento}</p>
                </div>
                <div className="border border-ink-200 rounded-md p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Horario</p>
                  <p className="text-sm font-semibold text-ink-800">{formatHora(modalSol.hora_inicio)} – {formatHora(modalSol.hora_fin)}</p>
                </div>
                <div className="border border-ink-200 rounded-md p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Ciudad</p>
                  <p className="text-sm font-semibold text-ink-800">{modalSol.ciudad}</p>
                </div>
                <div className="border-l-2 border-primary-700 bg-primary-50 rounded-md p-3">
                  <p className="text-xs text-primary-700 mb-0.5">Horas trabajadas</p>
                  <p className="text-sm font-bold text-primary-800">{modalSol.horas}h</p>
                </div>
              </div>

              {modalSol.fecha_finalizacion && (
                <p className="text-xs text-ink-400">
                  Finalizada el {new Date(modalSol.fecha_finalizacion).toLocaleDateString('es-CO', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              )}

              {modalSol.observacion_final && (
                <div>
                  <p className="field-label">Observación</p>
                  <p className="text-sm text-ink-600 border border-ink-200 rounded-md px-4 py-3 leading-relaxed">
                    "{modalSol.observacion_final}"
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <button onClick={() => setModalSol(null)} className="btn-secondary w-full">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
