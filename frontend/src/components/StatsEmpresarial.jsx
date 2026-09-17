import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../services/api'
import { formatHora } from '../utils/timeFormat'

const PIE_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#14b8a6']

const TIPOS_SERVICIO = [
  'Pausa Activa','Cardio Rumba','Recreación Corporativa','Carrera de Observación',
  'Dance Ball Fit','Rumba Kids','Rumba Dorada','Otro',
]

const ESTADO_CLS = {
  finalizado:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  programado:     'bg-blue-100 text-blue-700 border-blue-200',
  pendiente:      'bg-yellow-100 text-yellow-700 border-yellow-200',
  'por corregir': 'bg-orange-100 text-orange-700 border-orange-200',
}
const ESTADO_LABEL = {
  finalizado: 'Finalizada', programado: 'Programada',
  pendiente: 'Pendiente', 'por corregir': 'Por corregir',
}
const ESTADO_BAR = {
  pendiente: 'bg-yellow-400', programado: 'bg-blue-500',
  finalizado: 'bg-emerald-500', 'por corregir': 'bg-orange-400',
}
const ESTADO_LABELS_ES = {
  pendiente: 'Pendientes', programado: 'Programadas',
  finalizado: 'Finalizadas', 'por corregir': 'Por corregir',
}

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

export default function StatsEmpresarial() {
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [empresas, setEmpresas]       = useState([])
  const [fechaDesde, setFechaDesde]   = useState('')
  const [fechaHasta, setFechaHasta]   = useState('')
  const [tipoServicio, setTipoServicio] = useState('')
  const [empresaNombre, setEmpresaNombre] = useState('')
  const [modalSol, setModalSol]       = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')

  // Cargar lista de empresas registradas para el filtro
  useEffect(() => {
    api.get('/empresas/').then(({ data }) => setEmpresas(data)).catch(() => {})
  }, [])

  const fetchStats = async (fd = fechaDesde, fh = fechaHasta, ts = tipoServicio, en = empresaNombre) => {
    setLoading(true)
    setFiltroEstado('pendiente')
    try {
      const params = new URLSearchParams()
      if (fd) params.append('fecha_desde', fd)
      if (fh) params.append('fecha_hasta', fh)
      if (ts) params.append('tipo_servicio', ts)
      if (en) params.append('empresa', en)
      const { data: res } = await api.get(`/stats/empresarial?${params}`)
      setData(res)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [])

  // Resumen filtrado de la empresa seleccionada — calculado desde solicitudes
  const resumenEmpresa = useMemo(() => {
    if (!empresaNombre || !data?.solicitudes) return null
    const sols = data.solicitudes
    const finalizadas = sols.filter(s => s.estado === 'finalizado').length
    const programadas = sols.filter(s => s.estado === 'programado').length
    const horas = sols.reduce((sum, s) => sum + (s.horas ?? 0), 0)
    return { total: sols.length, finalizadas, programadas, horas: Math.round(horas * 10) / 10 }
  }, [empresaNombre, data])

  const clearFilters = () => {
    setFechaDesde(''); setFechaHasta(''); setTipoServicio(''); setEmpresaNombre('')
    fetchStats('', '', '', '')
  }

  const hasFilters = fechaDesde || fechaHasta || tipoServicio || empresaNombre

  const pieData = (data?.por_tipo_servicio ?? []).map(item => ({
    name: item.tipo,
    value: item.count,
    pct: data?.total ? Math.round((item.count / data.total) * 100) : 0,
  }))

  // Botones de estado (orden fijo)
  const ESTADO_BTNS = [
    { estado: 'pendiente',     label: 'Pendientes',   dot: 'bg-yellow-400', activeCls: 'bg-yellow-50 border-yellow-400 text-yellow-700' },
    { estado: 'programado',    label: 'Programadas',  dot: 'bg-blue-400',   activeCls: 'bg-blue-50 border-blue-400 text-blue-700' },
    { estado: 'finalizado',    label: 'Finalizadas',  dot: 'bg-emerald-400',activeCls: 'bg-emerald-50 border-emerald-400 text-emerald-700' },
  ]

  const solicitudesFiltradas = filtroEstado
    ? (data?.solicitudes ?? []).filter(s => s.estado === filtroEstado)
    : (data?.solicitudes ?? [])

  return (
    <div className="space-y-6">

      {/* Botones de estado filtrables */}
      <div className="grid grid-cols-3 gap-3">
        {ESTADO_BTNS.map(({ estado, label, dot, activeCls }) => {
          const count = data?.por_estado?.[estado] ?? 0
          const activo = filtroEstado === estado
          return (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className={`relative text-left rounded-md border p-4 flex items-center gap-3
                transition-colors duration-150
                ${activo ? activeCls : 'bg-white border-ink-200 text-ink-800 hover:border-ink-400'}`}
            >
              <span className={`w-3 h-3 rounded-full shrink-0 ${dot}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-2xl font-bold leading-none ${activo ? '' : 'text-ink-800'}`}>{count}</p>
                <p className={`text-xs mt-0.5 ${activo ? 'opacity-80' : 'text-ink-400'}`}>{label}</p>
              </div>
              {activo && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-current opacity-60" />}
            </button>
          )
        })}
      </div>

      {/* Indicador filtro activo */}
      {filtroEstado && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-ink-500">
            Mostrando <span className="font-semibold text-ink-800">{solicitudesFiltradas.length}</span> solicitud{solicitudesFiltradas.length !== 1 ? 'es' : ''} en estado{' '}
            <span className="font-semibold text-ink-800 capitalize">{filtroEstado}</span>
          </p>
          <button
            onClick={() => setFiltroEstado(null)}
            className="text-xs text-primary-800 hover:text-accent-700 font-semibold uppercase tracking-wide transition-colors"
          >
            Ver todas
          </button>
        </div>
      )}

      {/* KPI horas (siempre visible) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard label="Total solicitudes" value={data?.total ?? 0} colorClass="border-ink-300"
          icon={<svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>}
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
        <form onSubmit={e => { e.preventDefault(); fetchStats() }} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="field-input py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="field-input py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Tipo de actividad</label>
            <select value={tipoServicio} onChange={e => setTipoServicio(e.target.value)} className="field-select py-2 min-w-[160px]">
              <option value="">Todas</option>
              {TIPOS_SERVICIO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-500">Empresa</label>
            <select value={empresaNombre} onChange={e => setEmpresaNombre(e.target.value)} className="field-select py-2 min-w-[200px]">
              <option value="">Todas</option>
              {empresas.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
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

      {/* Gráfico circular */}
      <div className="card-corp p-5">
        <h3 className="font-bold text-ink-700 text-sm mb-1">Actividades por tipo de servicio</h3>
        <p className="text-xs text-ink-400 mb-4">Distribución de todas las solicitudes</p>
        {pieData.length === 0 ? (
          <div className="flex items-center justify-center h-52 text-ink-300 text-sm">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Resumen empresa filtrada */}
      {resumenEmpresa && (
        <div className="card-corp p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-md bg-primary-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-ink-700 text-sm leading-tight">{empresaNombre}</h3>
              <p className="text-xs text-ink-400">Resumen según filtros aplicados</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-ink-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-ink-800">{resumenEmpresa.total}</p>
              <p className="text-xs text-ink-500 mt-0.5">Total actividades</p>
            </div>
            <div className="bg-emerald-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{resumenEmpresa.finalizadas}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Finalizadas</p>
            </div>
            <div className="bg-blue-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{resumenEmpresa.programadas}</p>
              <p className="text-xs text-blue-600 mt-0.5">Programadas</p>
            </div>
            <div className="bg-purple-50 rounded-md p-3 text-center">
              <p className="text-xl font-bold text-purple-700">{resumenEmpresa.horas}h</p>
              <p className="text-xs text-purple-600 mt-0.5">Horas realizadas</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabla global por empresa (sin filtro de empresa) */}
      {!empresaNombre && (data?.por_empresa?.length ?? 0) > 0 && (
        <div className="card-corp overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100">
            <h3 className="font-bold text-ink-700 text-sm">Actividad por empresa</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50 text-xs text-ink-500 font-semibold uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Empresa</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center">Finalizadas</th>
                  <th className="px-4 py-3 text-center">Programadas</th>
                  <th className="px-4 py-3 text-center">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.por_empresa.map((e) => (
                  <tr key={e.nombre} className="hover:bg-ink-50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {e.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-ink-800">{e.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-ink-700">{e.total}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${e.finalizadas > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-400'}`}>
                        {e.finalizadas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${e.programadas > 0 ? 'bg-blue-100 text-blue-700' : 'bg-ink-100 text-ink-400'}`}>
                        {e.programadas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-ink-700 font-semibold">{e.horas}h</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista de actividades filtradas por estado */}
      {(data?.solicitudes?.length ?? 0) > 0 && (
        <div className="card-corp overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-ink-700 text-sm">
                {empresaNombre ? `Actividades — ${empresaNombre}` : 'Actividades'}
              </h3>
              <p className="text-xs text-ink-400 mt-0.5">
                {solicitudesFiltradas.length} actividad{solicitudesFiltradas.length !== 1 ? 'es' : ''}{filtroEstado ? ` en estado ${filtroEstado}` : ''}
              </p>
            </div>
          </div>
          {solicitudesFiltradas.length === 0 ? (
            <div className="text-center py-10 text-ink-400">
              <p className="text-sm">No hay solicitudes en estado <span className="font-semibold capitalize">{filtroEstado}</span></p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100 max-h-[480px] overflow-y-auto">
              {solicitudesFiltradas.map(sol => (
                <button key={sol.id} onClick={() => setModalSol(sol)}
                  className="w-full text-left px-5 py-4 hover:bg-primary-50/40 transition flex items-start gap-3">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    sol.estado === 'finalizado' ? 'bg-emerald-500' :
                    sol.estado === 'programado' ? 'bg-blue-400' :
                    sol.estado === 'pendiente'  ? 'bg-yellow-400' : 'bg-orange-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink-800 text-sm">{sol.empresa}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ESTADO_CLS[sol.estado] ?? 'bg-ink-100 text-ink-600 border-ink-200'}`}>
                        {ESTADO_LABEL[sol.estado] ?? sol.estado}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-ink-500 text-xs">{sol.fecha_evento} · {formatHora(sol.hora_inicio)}–{formatHora(sol.hora_fin)}</span>
                      <span className="text-ink-400 text-xs">{sol.tipo_servicio} · {sol.ciudad}</span>
                      <span className="text-primary-600 text-xs font-semibold">{sol.horas}h</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spinner */}
      {loading && data && (
        <div className="fixed bottom-6 right-6 bg-white border border-ink-200 rounded-md shadow-lg px-4 py-2.5 flex items-center gap-2 text-sm text-ink-600">
          <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          Actualizando...
        </div>
      )}

      {/* Modal detalle */}
      {modalSol && (
        <div className="modal-overlay">
          <div className="absolute inset-0" onClick={() => setModalSol(null)} />
          <div className="relative bg-white rounded-md border border-ink-200 w-full max-w-md overflow-hidden">
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
              <span className={`mt-3 inline-block text-[10px] uppercase tracking-wide px-2.5 py-1 font-semibold border-l-2 ${
                modalSol.estado === 'finalizado' ? 'border-primary-500 text-primary-200' :
                modalSol.estado === 'programado' ? 'border-blue-400 text-blue-200' : 'border-white/40 text-white'
              }`}>
                {ESTADO_LABEL[modalSol.estado] ?? modalSol.estado}
              </span>
            </div>
            <div className="p-6 space-y-4">
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
                  <p className="text-xs text-primary-400 mb-0.5">Horas</p>
                  <p className="text-sm font-bold text-primary-700">{modalSol.horas}h</p>
                </div>
              </div>
              {modalSol.recreadores?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Recreadores</p>
                  <div className="flex flex-wrap gap-2">
                    {modalSol.recreadores.map(r => (
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
    </div>
  )
}
