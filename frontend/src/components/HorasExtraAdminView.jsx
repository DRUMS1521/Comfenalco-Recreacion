import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { notify } from '../utils/notify'
import { getMondayOfDate, toYMD } from '../utils/hours'
import HoraExtraManualModal from './HoraExtraManualModal'

const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const TIPO_LABEL = { ordinaria: 'Extra Ordinaria', festiva: 'Extra Dominical/Festiva' }
const TIPO_CLS = { ordinaria: 'border-amber-600 text-amber-800', festiva: 'border-red-600 text-red-800' }

function fmt(h) {
  return h % 1 === 0 ? String(h) : Number(h).toFixed(2)
}

export default function HorasExtraAdminView() {
  const [weekStart, setWeekStart] = useState(() => getMondayOfDate(new Date()))
  const [resumen, setResumen] = useState([])
  const [manuales, setManuales] = useState([])
  const [recreadores, setRecreadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalRegistro, setModalRegistro] = useState(undefined) // undefined=cerrado, null=crear, {...}=editar

  const domingo = new Date(weekStart)
  domingo.setDate(weekStart.getDate() + 6)
  const fechaDesde = toYMD(weekStart)
  const fechaHasta = toYMD(domingo)
  const mismoMes = weekStart.getMonth() === domingo.getMonth()
  const weekLabel = mismoMes
    ? `${weekStart.getDate()} – ${domingo.getDate()} ${MESES_FULL[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()} ${MESES_FULL[weekStart.getMonth()]} – ${domingo.getDate()} ${MESES_FULL[domingo.getMonth()]} ${domingo.getFullYear()}`

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: r }, { data: m }] = await Promise.all([
        api.get('/horas-extra/admin/resumen', { params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta } }),
        api.get('/horas-extra/manuales', { params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta } }),
      ])
      setResumen(r)
      setManuales(m)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    api.get('/auth/recreadores').then(({ data }) => setRecreadores(data)).catch(() => {})
  }, [])

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }
  const goToday = () => setWeekStart(getMondayOfDate(new Date()))

  const handleDelete = async (id) => {
    try {
      await api.delete(`/horas-extra/manuales/${id}`)
      notify.success('Registro eliminado')
      fetchAll()
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      {/* Navegación de semana */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-ink-800 min-w-[200px]">{weekLabel}</span>
          <button onClick={nextWeek} className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={goToday} className="text-xs text-primary-800 hover:text-accent-700 font-semibold uppercase tracking-wide px-2 py-1 rounded-md hover:bg-ink-100 transition-colors">
            Esta semana
          </button>
        </div>
        <button onClick={() => setModalRegistro(null)} className="btn-primary btn-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo registro
        </button>
      </div>

      {/* Tabla informativa: recreadores x horas por categoría */}
      <div className="card-corp overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100">
          <h3 className="font-bold text-ink-700 text-sm">Horas por recreador (solo informativo)</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-700" />
          </div>
        ) : resumen.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-10">No hay recreadores activos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Recreador</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Ordinarias</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Recargo Nocturno</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Extra Ordinaria</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Extra Festiva</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {resumen.map((r) => {
                  const total = r.totales.ordinarias + r.totales.recargo_nocturno + r.totales.extra_ordinaria + r.totales.extra_festiva
                  return (
                    <tr key={r.recreador_id} className="hover:bg-ink-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-ink-800">{r.recreador_nombre}</td>
                      <td className="text-center px-3 py-3 text-ink-600">{fmt(r.totales.ordinarias)}h</td>
                      <td className="text-center px-3 py-3 text-ink-600">{fmt(r.totales.recargo_nocturno)}h</td>
                      <td className="text-center px-3 py-3 text-ink-600">{fmt(r.totales.extra_ordinaria)}h</td>
                      <td className="text-center px-3 py-3 text-ink-600">{fmt(r.totales.extra_festiva)}h</td>
                      <td className="text-center px-3 py-3 font-bold text-ink-800">{fmt(total)}h</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CRUD de registros manuales */}
      <div className="card-corp overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="font-bold text-ink-700 text-sm">Registros manuales de esta semana</h3>
          <span className="text-xs text-ink-400">{manuales.length} registro{manuales.length !== 1 ? 's' : ''}</span>
        </div>
        {manuales.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-10">Sin registros manuales en esta semana</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {manuales.map((m) => (
              <div key={m.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`badge-corp ${TIPO_CLS[m.tipo]}`}>{TIPO_LABEL[m.tipo]}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-800 text-sm truncate">{m.recreador_nombre} — {m.empresa}</p>
                    <p className="text-xs text-ink-400">{m.fecha} · {m.hora_inicio}–{m.hora_fin} · {fmt(m.horas)}h</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setModalRegistro(m)} title="Editar" className="btn-ghost p-2 rounded-md hover:bg-primary-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(m.id)} title="Eliminar" className="p-2 rounded-md text-ink-400 hover:text-red-700 hover:bg-red-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalRegistro !== undefined && (
        <HoraExtraManualModal
          registro={modalRegistro}
          recreadores={recreadores}
          onClose={() => setModalRegistro(undefined)}
          onSaved={fetchAll}
        />
      )}
    </div>
  )
}
