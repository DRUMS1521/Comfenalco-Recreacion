import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '../services/api'
import { getMondayOfDate, toYMD } from '../utils/hours'
import HoraExtraDetailModal from './HoraExtraDetailModal'

const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const CATEGORIAS = [
  { key: 'ordinarias',       label: 'Horas Ordinarias',                  dot: 'bg-primary-700' },
  { key: 'recargo_nocturno', label: 'Recargo Nocturno',                  dot: 'bg-purple-600' },
  { key: 'extra_ordinaria',  label: 'Extras Ordinarias',                 dot: 'bg-amber-600' },
  { key: 'extra_festiva',    label: 'Extras Dominicales/Festivas',       dot: 'bg-red-600' },
]

function fmt(h) {
  return h % 1 === 0 ? String(h) : Number(h).toFixed(2)
}

export default function HorasExtraRecreadorView() {
  const [periodo, setPeriodo] = useState('semana') // 'semana' | 'mes'
  const [referencia, setReferencia] = useState(() => new Date())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)

  const { fechaDesde, fechaHasta, label } = useMemo(() => {
    if (periodo === 'semana') {
      const lunes = getMondayOfDate(referencia)
      const domingo = new Date(lunes)
      domingo.setDate(lunes.getDate() + 6)
      const mismolMes = lunes.getMonth() === domingo.getMonth()
      return {
        fechaDesde: toYMD(lunes),
        fechaHasta: toYMD(domingo),
        label: mismolMes
          ? `${lunes.getDate()} – ${domingo.getDate()} ${MESES_FULL[lunes.getMonth()]} ${lunes.getFullYear()}`
          : `${lunes.getDate()} ${MESES_FULL[lunes.getMonth()]} – ${domingo.getDate()} ${MESES_FULL[domingo.getMonth()]} ${domingo.getFullYear()}`,
      }
    }
    const primero = new Date(referencia.getFullYear(), referencia.getMonth(), 1)
    const ultimo = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0)
    return {
      fechaDesde: toYMD(primero),
      fechaHasta: toYMD(ultimo),
      label: `${MESES_FULL[primero.getMonth()]} ${primero.getFullYear()}`,
    }
  }, [periodo, referencia])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/horas-extra/mias', { params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta } })
      setData(res)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta])

  useEffect(() => { fetchData() }, [fetchData])

  const navegar = (delta) => {
    const d = new Date(referencia)
    if (periodo === 'semana') d.setDate(d.getDate() + delta * 7)
    else d.setMonth(d.getMonth() + delta)
    setReferencia(d)
  }

  const registrosPorDia = useMemo(() => {
    const map = {}
    for (const r of data?.registros ?? []) {
      if (!map[r.fecha]) map[r.fecha] = []
      map[r.fecha].push(r)
    }
    return map
  }, [data])

  const dias = Object.keys(registrosPorDia).sort().reverse()
  const totales = data?.totales ?? { ordinarias: 0, recargo_nocturno: 0, extra_ordinaria: 0, extra_festiva: 0 }

  return (
    <div className="space-y-4">
      {/* Selector de periodo */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 border border-ink-200 rounded-md p-1 w-fit">
          {[{ key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }].map(({ key, label: l }) => (
            <button
              key={key}
              onClick={() => setPeriodo(key)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
                periodo === key ? 'bg-primary-800 text-white' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navegar(-1)} className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-ink-800 min-w-[180px] text-center">{label}</span>
          <button onClick={() => navegar(1)} className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Totales por categoría */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-3 [&>*]:min-w-0">
        {CATEGORIAS.map((c) => (
          <div key={c.key} className="card-corp p-4 flex items-center gap-3">
            <span className={`w-2 h-8 rounded-sm shrink-0 ${c.dot}`} />
            <div>
              <p className="text-2xl font-bold text-ink-800 leading-none">{fmt(totales[c.key] || 0)}h</p>
              <p className="text-xs text-ink-400 mt-0.5">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lista por día */}
      <div className="card-corp overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100">
          <h3 className="font-bold text-ink-700 text-sm">Detalle por día</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
          </div>
        ) : dias.length === 0 ? (
          <div className="text-center py-14 text-ink-400">
            <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium">Sin horas registradas en este periodo</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {dias.map((fecha) => {
              const registros = registrosPorDia[fecha]
              const totalDia = registros.reduce((sum, r) => sum + r.horas, 0)
              const categoriasDia = [...new Set(registros.map((r) => r.categoria))]
              return (
                <button
                  key={fecha}
                  onClick={() => setDiaSeleccionado(fecha)}
                  className="w-full text-left px-5 py-3.5 hover:bg-ink-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex -space-x-0.5 shrink-0">
                      {categoriasDia.map((cat) => {
                        const cfg = CATEGORIAS.find((c) => c.key === cat)
                        return <span key={cat} className={`w-2 h-2 rounded-full ${cfg?.dot || 'bg-ink-300'}`} />
                      })}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-800 text-sm">{fecha}</p>
                      <p className="text-xs text-ink-400 truncate">
                        {registros.length} registro{registros.length !== 1 ? 's' : ''} · {[...new Set(registros.map(r => r.empresa))].join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-ink-800">{fmt(totalDia)}h</span>
                    <svg className="w-4 h-4 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {diaSeleccionado && (
        <HoraExtraDetailModal
          fecha={diaSeleccionado}
          registros={registrosPorDia[diaSeleccionado] || []}
          onClose={() => setDiaSeleccionado(null)}
        />
      )}
    </div>
  )
}
