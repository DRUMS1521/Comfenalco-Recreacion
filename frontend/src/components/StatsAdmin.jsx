import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../services/api'
import StatsEmpresarial from './StatsEmpresarial'
import { formatHora } from '../utils/timeFormat'

const PIE_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#14b8a6']

function KpiCard({ label, value, sub, colorClass, icon }) {
  return (
    <div className={`card-corp border-l-2 p-5 flex items-start gap-4 ${colorClass}`}>
      <div className="w-11 h-11 rounded-md border border-ink-200 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-ink-800 leading-none">{value}</p>
        <p className="text-sm font-medium text-ink-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-ink-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-ink-100 rounded-md shadow-lg px-4 py-3">
        <p className="font-semibold text-ink-700 text-sm">{payload[0].name}</p>
        <p className="text-ink-500 text-xs mt-0.5">
          <span className="font-bold text-ink-800">{payload[0].value}</span> actividades
          <span className="ml-2">({payload[0].payload.pct}%)</span>
        </p>
      </div>
    )
  }
  return null
}

const CustomLegend = ({ payload }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-2">
    {payload.map((entry, i) => (
      <div key={i} className="flex items-center gap-1.5 text-xs text-ink-600">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: entry.color }} />
        <span>{entry.value}</span>
      </div>
    ))}
  </div>
)

export default function StatsAdmin({ recreadores }) {
  const [subTab, setSubTab] = useState('recreacion')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [tipoServicio, setTipoServicio] = useState('')
  const [recreadorId, setRecreadorId] = useState('')
  const [modalSol, setModalSol] = useState(null)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fechaDesde) params.append('fecha_desde', fechaDesde)
      if (fechaHasta) params.append('fecha_hasta', fechaHasta)
      if (tipoServicio) params.append('tipo_servicio', tipoServicio)
      if (recreadorId) params.append('recreador_id', recreadorId)
      const { data: res } = await api.get(`/stats/admin?${params}`)
      setData(res)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [])

  // Stats del recreador calculadas directamente de las solicitudes filtradas
  // (siempre coincide con la lista de actividades, independiente del backend)
  const resumenFiltrado = useMemo(() => {
    if (!recreadorId || !data?.solicitudes) return null
    const sols = data.solicitudes
    const finalizadas = sols.filter(s => s.estado === 'finalizado').length
    const programadas = sols.filter(s => s.estado === 'programado').length
    const horas = sols.reduce((sum, s) => sum + (s.horas ?? 0), 0)
    return { total: sols.length, finalizadas, programadas, horas: Math.round(horas * 10) / 10 }
  }, [recreadorId, data])

  const handleFilter = (e) => {
    e.preventDefault()
    fetchStats()
  }

  const clearFilters = () => {
    setFechaDesde(''); setFechaHasta(''); setTipoServicio(''); setRecreadorId('')
    setTimeout(fetchStats, 50)
  }

  const hasFilters = fechaDesde || fechaHasta || tipoServicio || recreadorId

  const pieData = (data?.por_tipo_servicio ?? []).map((item) => ({
    name: item.tipo,
    value: item.count,
    pct: data?.total ? Math.round((item.count / data.total) * 100) : 0,
  }))

  const estadoLabels = {
    pendiente: 'Pendientes',
    programado: 'Programadas',
    finalizado: 'Finalizadas',
    'por corregir': 'Por corregir',
  }

  return (
    <div className="space-y-6">

      {/* Sub-tabs */}
      <div className="flex gap-1 border border-ink-200 rounded-md p-1 w-fit">
        {[
          { key: 'recreacion', label: 'Recreación' },
          { key: 'empresarial', label: 'Empresarial' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-5 py-2 rounded-md text-sm font-semibold uppercase tracking-wide transition-colors ${
              subTab === key
                ? 'bg-primary-800 text-white'
                : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'empresarial' && <StatsEmpresarial />}
      {subTab !== 'empresarial' && <>
      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total solicitudes" value={data?.total ?? 0} colorClass="border-ink-300"
          icon={<svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>}
        />
        <KpiCard label="Finalizadas" value={data?.por_estado?.finalizado ?? 0} colorClass="border-primary-700"
          icon={<svg className="w-5 h-5 text-primary-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <KpiCard label="Programadas" value={data?.por_estado?.programado ?? 0} colorClass="border-blue-600"
          icon={<svg className="w-5 h-5 text-blue-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
        />
        <KpiCard label="Horas finalizadas" value={`${data?.horas_totales ?? 0}h`} colorClass="border-accent-600"
          icon={<svg className="w-5 h-5 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
      </div>

      {/* Filtros */}
      <div className="card-corp p-5">
        <h3 className="font-bold text-ink-700 text-sm mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtros
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
            <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)} className="field-select py-2 min-w-[160px]">
              <option value="">Todos</option>
              {(data?.por_tipo_servicio?.map(t => t.tipo) ?? []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Recreador</label>
            <select value={recreadorId} onChange={(e) => setRecreadorId(e.target.value)} className="field-select py-2 min-w-[180px]">
              <option value="">Todos</option>
              {(recreadores ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.full_name || r.username}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary btn-sm">
            Aplicar
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters}
              className="text-sm text-ink-400 hover:text-ink-700 px-2 py-2 transition-colors">
              Limpiar
            </button>
          )}
        </form>
      </div>

      {/* Gráfico circular + resumen por estado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="card-corp p-5">
          <h3 className="font-bold text-ink-700 text-sm mb-1">Actividades por tipo de servicio</h3>
          <p className="text-xs text-ink-400 mb-4">Distribución de todas las solicitudes</p>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-ink-300 text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend content={<CustomLegend />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Resumen por estado */}
        <div className="card-corp p-5">
          <h3 className="font-bold text-ink-700 text-sm mb-1">Resumen por estado</h3>
          <p className="text-xs text-ink-400 mb-4">Distribución actual de solicitudes</p>
          <div className="space-y-3">
            {Object.entries(data?.por_estado ?? {}).map(([estado, count]) => {
              const total = data?.total || 1
              const pct = Math.round((count / total) * 100)
              const colores = {
                pendiente: 'bg-yellow-400',
                programado: 'bg-blue-500',
                finalizado: 'bg-emerald-500',
                'por corregir': 'bg-orange-400',
              }
              return (
                <div key={estado}>
                  <div className="flex justify-between text-xs text-ink-600 mb-1">
                    <span className="font-medium capitalize">{estadoLabels[estado] ?? estado}</span>
                    <span className="font-bold">{count} <span className="text-ink-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="w-full bg-ink-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${colores[estado] ?? 'bg-ink-400'} transition-all`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {Object.keys(data?.por_estado ?? {}).length === 0 && (
              <p className="text-sm text-ink-400 text-center py-8">Sin datos</p>
            )}
          </div>
        </div>
      </div>

      {/* Resumen del recreador filtrado — calculado desde las actividades filtradas */}
      {resumenFiltrado && (
        <div className="card-corp p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold shrink-0">
              {(data?.por_recreador?.[0]?.nombre ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-ink-700 text-sm leading-tight">
                {data?.por_recreador?.[0]?.nombre ?? 'Recreador'}
              </h3>
              <p className="text-xs text-ink-400">Resumen según filtros aplicados</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-ink-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-ink-800">{resumenFiltrado.total}</p>
              <p className="text-xs text-ink-500 mt-0.5">Total actividades</p>
            </div>
            <div className="bg-emerald-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{resumenFiltrado.finalizadas}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Finalizadas</p>
            </div>
            <div className="bg-blue-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{resumenFiltrado.programadas}</p>
              <p className="text-xs text-blue-600 mt-0.5">Programadas</p>
            </div>
            <div className="bg-purple-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-purple-700">{resumenFiltrado.horas}h</p>
              <p className="text-xs text-purple-600 mt-0.5">Horas trabajadas</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de rendimiento global (solo cuando no hay recreador seleccionado) */}
      {!recreadorId && data?.por_recreador?.length > 0 && (
        <div className="card-corp overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100">
            <h3 className="font-bold text-ink-700 text-sm">Rendimiento por recreador</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50 text-xs text-ink-500 font-semibold uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Recreador</th>
                  <th className="px-4 py-3 text-center">Finalizadas</th>
                  <th className="px-4 py-3 text-center">Programadas</th>
                  <th className="px-4 py-3 text-center">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.por_recreador.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {r.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-ink-800">{r.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                        ${r.finalizadas > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-400'}`}>
                        {r.finalizadas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                        ${r.programadas > 0 ? 'bg-blue-100 text-blue-700' : 'bg-ink-100 text-ink-400'}`}>
                        {r.programadas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-ink-700 font-semibold">{r.horas}h</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista de actividades del recreador filtrado */}
      {recreadorId && data?.solicitudes?.length > 0 && (
        <div className="card-corp overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-ink-700 text-sm">
                Actividades de {data.por_recreador?.[0]?.nombre ?? 'recreador'}
              </h3>
              <p className="text-xs text-ink-400 mt-0.5">{data.solicitudes.length} actividad{data.solicitudes.length !== 1 ? 'es' : ''} encontrada{data.solicitudes.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="divide-y divide-ink-100 max-h-[480px] overflow-y-auto">
            {data.solicitudes.map((sol) => {
              const estadoCls = {
                finalizado:      'bg-emerald-100 text-emerald-700 border-emerald-200',
                programado:      'bg-blue-100 text-blue-700 border-blue-200',
                pendiente:       'bg-yellow-100 text-yellow-700 border-yellow-200',
                'por corregir':  'bg-orange-100 text-orange-700 border-orange-200',
              }[sol.estado] ?? 'bg-ink-100 text-ink-600 border-ink-200'

              const estadoLabel = {
                finalizado: 'Finalizada', programado: 'Programada',
                pendiente: 'Pendiente', 'por corregir': 'Por corregir',
              }[sol.estado] ?? sol.estado

              return (
                <button key={sol.id}
                  onClick={() => setModalSol(sol)}
                  className="w-full text-left px-5 py-4 hover:bg-primary-50/40 transition flex items-start gap-3 cursor-pointer">
                  {/* Dot */}
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    sol.estado === 'finalizado' ? 'bg-emerald-500' :
                    sol.estado === 'programado' ? 'bg-blue-400' : 'bg-ink-400'
                  }`} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink-800 text-sm">{sol.empresa}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${estadoCls}`}>
                        {estadoLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-ink-500 text-xs flex items-center gap-1">
                        <svg className="w-3 h-3 shrink-0 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {sol.fecha_evento} · {formatHora(sol.hora_inicio)}–{formatHora(sol.hora_fin)}
                      </span>
                      <span className="text-ink-500 text-xs">{sol.tipo_servicio}</span>
                      <span className="text-ink-400 text-xs">{sol.ciudad}</span>
                      <span className="text-primary-600 text-xs font-semibold">{sol.horas}h</span>
                    </div>
                    {sol.recreadores?.length > 1 && (
                      <p className="text-xs text-ink-400 mt-1">
                        Con: {sol.recreadores.map(r => r.nombre.split(' ')[0]).join(', ')}
                      </p>
                    )}
                  </div>

                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Cargando overlay */}
      {loading && data && (
        <div className="fixed bottom-6 right-6 bg-white border border-ink-200 rounded-md shadow-lg px-4 py-2.5 flex items-center gap-2 text-sm text-ink-600">
          <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          Actualizando...
        </div>
      )}

      {/* Modal detalle de actividad */}
      {modalSol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalSol(null)} />
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
              {/* Estado badge */}
              <span className={`mt-3 inline-block text-[10px] uppercase tracking-wide px-2.5 py-1 font-semibold border-l-2 ${
                modalSol.estado === 'finalizado' ? 'border-primary-500 text-primary-200' :
                modalSol.estado === 'programado' ? 'border-blue-400 text-blue-200' :
                'border-white/40 text-white'
              }`}>
                {{ finalizado: 'Finalizada', programado: 'Programada', pendiente: 'Pendiente' }[modalSol.estado] ?? modalSol.estado}
              </span>
            </div>

            {/* Cuerpo */}
            <div className="p-6 space-y-4">
              {/* Info principal */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-ink-50 rounded-md p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Fecha</p>
                  <p className="text-sm font-semibold text-ink-800">{modalSol.fecha_evento}</p>
                </div>
                <div className="bg-ink-50 rounded-md p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Horario</p>
                  <p className="text-sm font-semibold text-ink-800">{formatHora(modalSol.hora_inicio)} – {formatHora(modalSol.hora_fin)}</p>
                </div>
                <div className="bg-ink-50 rounded-md p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Ciudad</p>
                  <p className="text-sm font-semibold text-ink-800">{modalSol.ciudad}</p>
                </div>
                <div className="bg-primary-50 rounded-md p-3">
                  <p className="text-xs text-primary-400 mb-0.5">Horas trabajadas</p>
                  <p className="text-sm font-bold text-primary-700">{modalSol.horas}h</p>
                </div>
              </div>

              {/* Recreadores */}
              {modalSol.recreadores?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Recreadores asignados</p>
                  <div className="flex flex-wrap gap-2">
                    {modalSol.recreadores.map((r) => (
                      <div key={r.id} className="flex items-center gap-1.5 bg-ink-50 rounded-lg px-2.5 py-1.5 border border-ink-100">
                        <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {r.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-ink-700">{r.nombre}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observación final */}
              {modalSol.observacion_final && (
                <div>
                  <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Observación final</p>
                  <p className="text-sm text-ink-600 bg-emerald-50 border border-emerald-100 rounded-md px-4 py-3 leading-relaxed">
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
      </>}
    </div>
  )
}
