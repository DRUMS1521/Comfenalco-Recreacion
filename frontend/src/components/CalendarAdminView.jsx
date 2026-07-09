import { useState, useEffect } from 'react'
import api from '../services/api'
import { formatHora } from '../utils/timeFormat'

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DIAS_FULL   = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/** Devuelve el lunes de la semana que contiene `date` */
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()                   // 0=dom … 6=sáb
  const diff = (day === 0 ? -6 : 1 - day) // retroceder al lunes
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Formatea YYYY-MM-DD a partir de un Date */
function toYMD(d) {
  return d.toISOString().split('T')[0]
}

/** Calcula horas decimales entre dos HH:MM */
function calcHours(inicio, fin) {
  if (!inicio || !fin) return 0
  const [h1, m1] = inicio.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
  return mins > 0 ? Math.max(mins / 60, 1) : 0
}

/** Tarjeta de evento dentro de la celda */
function EventCard({ sol, onClick }) {
  const dur = calcHours(sol.hora_inicio, sol.hora_fin)
  return (
    <button
      onClick={() => onClick(sol)}
      className="w-full text-left bg-primary-800 hover:bg-primary-900 text-white rounded-md px-2 py-1.5 text-[11px] transition-colors mb-1 last:mb-0"
    >
      <p className="font-bold truncate leading-tight">{sol.empresa}</p>
      <p className="text-primary-200 truncate leading-tight">
        {formatHora(sol.hora_inicio)}–{formatHora(sol.hora_fin)}
        {dur > 0 && <span className="ml-1 text-primary-300">({dur % 1 === 0 ? dur : dur.toFixed(1)}h)</span>}
      </p>
      <p className="text-primary-300 truncate leading-tight text-[10px]">{sol.tipo_servicio}</p>
    </button>
  )
}

/** Celda de un recreador sin tareas */
function EmptyCell() {
  return <div className="min-h-[52px]" />
}

export default function CalendarAdminView({ solicitudes, onVerDetalle }) {
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()))
  const [recreadores, setRecreadores] = useState([])
  const [loadingRec, setLoadingRec] = useState(true)

  // Cargar lista de recreadores
  useEffect(() => {
    api.get('/auth/recreadores')
      .then(({ data }) => setRecreadores(data))
      .catch(() => {})
      .finally(() => setLoadingRec(false))
  }, [])

  // Los 7 días de la semana actual
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }
  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }
  const goToday = () => setWeekStart(getMondayOf(new Date()))

  // Solicitudes programadas de esta semana
  const weekDayStrings = weekDays.map(toYMD)
  const programadas = solicitudes.filter(
    (s) => s.estado === 'programado' && weekDayStrings.includes(s.fecha_evento)
  )

  // Índice: recreador_id → día → [solicitudes]
  // Una solicitud aparece en la fila de CADA recreador asignado
  const byRecreadorDay = {}
  const horasPorRecreador = {}

  programadas.forEach((s) => {
    const ids = s.recreadores_asignados?.length
      ? s.recreadores_asignados.map((r) => r.id)
      : s.recreador_id ? [s.recreador_id] : []

    ids.forEach((recId) => {
      if (!byRecreadorDay[recId]) byRecreadorDay[recId] = {}
      if (!byRecreadorDay[recId][s.fecha_evento]) byRecreadorDay[recId][s.fecha_evento] = []
      byRecreadorDay[recId][s.fecha_evento].push(s)
      const hrs = calcHours(s.hora_inicio, s.hora_fin)
      horasPorRecreador[recId] = (horasPorRecreador[recId] || 0) + hrs
    })
  })

  const LIMITE_HORAS = 42

  // Solicitudes sin recreador asignado en esta semana
  const sinAsignar = programadas.filter(
    (s) => !s.recreador_id && !(s.recreadores_asignados?.length)
  )

  // Semana en texto: "24 – 30 Mar 2026" o "28 Mar – 3 Abr 2026"
  const weekLabel = (() => {
    const ini = weekDays[0]
    const fin = weekDays[6]
    if (ini.getMonth() === fin.getMonth()) {
      return `${ini.getDate()} – ${fin.getDate()} ${MESES_FULL[ini.getMonth()]} ${ini.getFullYear()}`
    }
    return `${ini.getDate()} ${MESES[ini.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`
  })()

  const today = toYMD(new Date())

  return (
    <div className="space-y-4">
      {/* Navegación de semana */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={prevWeek}
          className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center flex-1">
          <h3 className="font-bold text-ink-800 text-sm sm:text-base">{weekLabel}</h3>
          <p className="text-xs text-ink-400 mt-0.5">
            {programadas.length} tarea{programadas.length !== 1 ? 's' : ''} programada{programadas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={goToday}
            className="hidden sm:block text-xs text-primary-800 hover:text-accent-700 font-semibold uppercase tracking-wide px-2 py-1 rounded-md hover:bg-ink-100 transition-colors">
            Hoy
          </button>
          <button onClick={nextWeek}
            className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabla del cronograma */}
      {loadingRec ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
        </div>
      ) : recreadores.length === 0 ? (
        <div className="text-center py-10 text-ink-400">
          <p className="text-sm">No hay recreadores registrados</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-ink-200">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-ink-50">
                {/* Columna de recreadores */}
                <th className="text-left px-3 py-2.5 text-xs font-bold text-ink-500 uppercase tracking-wider border-b border-ink-200 w-32 sticky left-0 bg-ink-50 z-10">
                  Recreador
                </th>
                {/* Columnas de días */}
                {weekDays.map((day, idx) => {
                  const ymd = toYMD(day)
                  const isHoy = ymd === today
                  return (
                    <th key={ymd}
                      className={`px-2 py-2 text-center border-b border-ink-200 min-w-[110px] ${isHoy ? 'bg-primary-50' : ''}`}>
                      <p className={`text-xs font-bold uppercase tracking-wide ${isHoy ? 'text-primary-800' : 'text-ink-500'}`}>
                        {DIAS_SEMANA[idx]}
                      </p>
                      <p className={`text-sm font-bold mt-0.5 ${isHoy ? 'text-primary-800' : 'text-ink-700'}`}>
                        {day.getDate()}
                        {isHoy && <span className="ml-1 text-[9px] uppercase tracking-wide bg-accent-600 text-white px-1.5 py-0.5 rounded align-middle">Hoy</span>}
                      </p>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {recreadores.map((rec, rIdx) => {
                const tareasPorDia = byRecreadorDay[rec.id] || {}
                const tieneTareas = Object.keys(tareasPorDia).length > 0
                const horas = horasPorRecreador[rec.id] || 0
                const horasDisplay = horas % 1 === 0 ? horas : horas.toFixed(1)
                const pct = Math.min((horas / LIMITE_HORAS) * 100, 100)
                const barColor = horas >= LIMITE_HORAS ? 'bg-red-500' : horas >= LIMITE_HORAS * 0.8 ? 'bg-yellow-400' : 'bg-green-500'
                const textColor = horas >= LIMITE_HORAS ? 'text-red-600' : horas >= LIMITE_HORAS * 0.8 ? 'text-yellow-600' : 'text-ink-500'
                return (
                  <tr key={rec.id}
                    className={`border-b border-ink-100 last:border-b-0 ${rIdx % 2 === 0 ? 'bg-white' : 'bg-ink-50'}`}>

                    {/* Nombre del recreador */}
                    <td className={`px-3 py-2 sticky left-0 z-10 border-r border-ink-100 ${rIdx % 2 === 0 ? 'bg-white' : 'bg-ink-50'}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                          <span className="text-primary-700 text-xs font-bold">
                            {rec.full_name?.charAt(0) || rec.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-ink-800 leading-tight truncate">
                            {rec.full_name?.split(' ')[0] || rec.username}
                          </p>
                          {tieneTareas ? (
                            <>
                              <p className={`text-[10px] font-medium leading-tight ${textColor}`}>
                                {horasDisplay} / {LIMITE_HORAS} hrs
                              </p>
                              <div className="w-full bg-ink-100 rounded-full h-1 mt-0.5">
                                <div className={`h-1 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                            </>
                          ) : (
                            <p className="text-[10px] text-ink-300 leading-tight">Sin tareas</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Celda por cada día */}
                    {weekDays.map((day) => {
                      const ymd = toYMD(day)
                      const isHoy = ymd === today
                      const eventos = tareasPorDia[ymd] || []
                      return (
                        <td key={ymd}
                          className={`px-1.5 py-1.5 align-top border-r border-ink-100 last:border-r-0 min-h-[52px] ${isHoy ? 'bg-primary-50/30' : ''}`}>
                          {eventos.length === 0
                            ? <EmptyCell />
                            : eventos.map((ev) => (
                                <EventCard key={ev.id} sol={ev} onClick={onVerDetalle} />
                              ))
                          }
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Solicitudes programadas SIN recreador asignado */}
      {sinAsignar.length > 0 && (
        <div className="border border-orange-200 bg-orange-50 rounded-md overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="text-sm font-bold text-orange-800">
              {sinAsignar.length} tarea{sinAsignar.length !== 1 ? 's' : ''} sin recreador asignado esta semana
            </h4>
          </div>
          <div className="divide-y divide-orange-100">
            {sinAsignar.map((s) => (
              <button
                key={s.id}
                onClick={() => onVerDetalle(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-orange-100 transition flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-orange-900">{s.empresa}</p>
                  <p className="text-xs text-orange-600">{s.fecha_evento} · {s.hora_servicio} · {s.tipo_servicio}</p>
                </div>
                <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vacío total */}
      {programadas.length === 0 && !loadingRec && (
        <div className="text-center py-10 text-ink-400">
          <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Sin tareas programadas esta semana</p>
          <p className="text-xs mt-1">Navega a otra semana o programa solicitudes pendientes</p>
        </div>
      )}
    </div>
  )
}
