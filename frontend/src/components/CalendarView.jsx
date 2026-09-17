import { useState } from 'react'
import { formatHora } from '../utils/timeFormat'
import { toYMD } from '../utils/hours'
import useSolicitudesRango from '../hooks/useSolicitudesRango'
import { SkeletonWeekGrid } from './ui/Skeleton'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Chip compacto por evento dentro de la celda del día */
function EventChip({ evento, isAdmin, isSelected }) {
  const empresa = evento.empresa.length > 12
    ? evento.empresa.slice(0, 11) + '…'
    : evento.empresa

  const recreador = evento.recreador_full_name
    ? evento.recreador_full_name.split(' ')[0]   // solo primer nombre
    : evento.recreador_username
      ? `@${evento.recreador_username}`
      : null

  return (
    <div className={`w-full text-left px-1 py-0.5 rounded text-[10px] leading-tight truncate
      ${isSelected
        ? 'bg-white/20 text-white'
        : 'bg-primary-800 text-white'}`}
    >
      <span className="font-semibold truncate block">{empresa}</span>
      {isAdmin && recreador && (
        <span className={`truncate block ${isSelected ? 'text-white/80' : 'text-primary-200'}`}>
          {recreador}
        </span>
      )}
    </div>
  )
}

export default function CalendarView({ isAdmin = false, onVerDetalle }) {
  const today = new Date()
  const [current, setCurrent] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState(null)

  // Solo el mes visible (antes se recibía la lista completa de solicitudes)
  const desde = toYMD(new Date(current.year, current.month, 1))
  const hasta = toYMD(new Date(current.year, current.month + 1, 0))
  const { solicitudes, cargando } = useSolicitudesRango(desde, hasta)

  const programadas = solicitudes.filter((s) => s.estado === 'programado')

  const prevMonth = () =>
    setCurrent(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    )

  const nextMonth = () =>
    setCurrent(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    )

  const firstDay = new Date(current.year, current.month, 1).getDay()
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate()

  const eventsByDay = {}
  programadas.forEach((s) => {
    const d = parseLocalDate(s.fecha_evento)
    if (d.getFullYear() === current.year && d.getMonth() === current.month) {
      const key = d.getDate()
      if (!eventsByDay[key]) eventsByDay[key] = []
      eventsByDay[key].push(s)
    }
  })

  const selectedEvents = selected ? (eventsByDay[selected] || []) : []

  const isToday = (day) =>
    today.getDate() === day &&
    today.getMonth() === current.month &&
    today.getFullYear() === current.year

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="space-y-4">
      {cargando && <SkeletonWeekGrid rows={5} />}
      {/* Navegación */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth}
          className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <h3 className="font-bold text-ink-800 text-base sm:text-lg">
            {MESES[current.month]} {current.year}
          </h3>
          <p className="text-xs text-ink-400">
            {programadas.length} tarea{programadas.length !== 1 ? 's' : ''} programada{programadas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={nextMonth}
          className="p-2 rounded-md hover:bg-ink-100 transition-colors text-ink-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Grilla */}
      <div className="grid grid-cols-7 gap-1">
        {/* Cabeceras días */}
        {DIAS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-ink-400 py-1">
            {d}
          </div>
        ))}

        {/* Celdas */}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="min-h-[64px]" />

          const events = eventsByDay[day] || []
          const hasEvents = events.length > 0
          const isSelected = selected === day
          const MAX_VISIBLE = isAdmin ? 2 : 2
          const visibleEvents = events.slice(0, MAX_VISIBLE)
          const extra = events.length - MAX_VISIBLE

          return (
            <button
              key={day}
              onClick={() => setSelected(isSelected ? null : day)}
              className={`
                relative min-h-[64px] flex flex-col gap-0.5 p-1 rounded-md text-left align-top border transition-colors
                ${isToday(day) ? 'border-accent-600' : 'border-transparent'}
                ${isSelected
                  ? 'bg-primary-800'
                  : hasEvents
                    ? 'bg-primary-50 hover:bg-primary-100'
                    : 'hover:bg-ink-50'}
              `}
            >
              {/* Número del día */}
              <span className={`text-xs font-bold leading-none mb-0.5 ${
                isSelected ? 'text-white' : isToday(day) ? 'text-primary-800' : 'text-ink-600'
              }`}>
                {day}
              </span>

              {/* Chips de eventos */}
              {visibleEvents.map((ev) => (
                <EventChip key={ev.id} evento={ev} isAdmin={isAdmin} isSelected={isSelected} />
              ))}

              {/* "+N más" */}
              {extra > 0 && (
                <span className={`text-[10px] font-medium pl-1 ${isSelected ? 'text-white/70' : 'text-primary-500'}`}>
                  +{extra} más
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Panel de detalle del día seleccionado */}
      {selected && (
        <div className="border border-ink-200 rounded-md overflow-hidden">
          <div className="bg-ink-900 border-b-2 border-accent-500 px-4 py-3 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-white text-sm">
                {selected} de {MESES[current.month]}, {current.year}
              </h4>
              <p className="text-xs text-ink-300 mt-0.5">
                {selectedEvents.length} tarea{selectedEvents.length !== 1 ? 's' : ''} programada{selectedEvents.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={() => setSelected(null)}
              className="text-ink-300 hover:text-white p-1 rounded transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {selectedEvents.length === 0 ? (
            <p className="text-ink-400 text-sm text-center py-6">Sin tareas programadas</p>
          ) : (
            <div className="divide-y divide-ink-100">
              {selectedEvents.map((s) => (
                <div key={s.id}
                  onClick={() => onVerDetalle?.(s)}
                  className={`px-4 py-3.5 ${onVerDetalle ? 'cursor-pointer hover:bg-ink-50 transition' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Empresa y servicio */}
                      <div>
                        <p className="font-bold text-ink-800 text-sm">{s.empresa}</p>
                        <p className="text-primary-600 text-xs font-medium">{s.tipo_servicio}</p>
                      </div>

                      {/* Detalles del evento */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span className="text-xs text-ink-500 flex items-center gap-1">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatHora(s.hora_inicio)}{s.hora_fin ? ` – ${formatHora(s.hora_fin)}` : ''}
                        </span>
                        <span className="text-xs text-ink-500 flex items-center gap-1">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          {s.ciudad}
                        </span>
                        <span className="text-xs text-ink-500">
                          {s.cantidad_recreadores} recreador{s.cantidad_recreadores !== 1 ? 'es' : ''} · {s.cantidad_personas} personas
                        </span>
                      </div>

                      <p className="text-xs text-ink-400 truncate">{s.direccion}</p>

                      {/* Recreador asignado — visible siempre (para admin es clave) */}
                      {s.recreador_id ? (
                        <div className="flex items-center gap-2 mt-1 bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1.5">
                          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                            <span className="text-primary-700 text-[10px] font-bold">
                              {s.recreador_full_name?.charAt(0) || s.recreador_username?.charAt(0)?.toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-blue-800 truncate">
                              {s.recreador_full_name || s.recreador_username}
                            </p>
                            <p className="text-[10px] text-blue-400">Recreador asignado</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-orange-500">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Sin recreador asignado
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-ink-300">#{s.id}</span>
                      {onVerDetalle && (
                        <svg className="w-4 h-4 text-ink-300 group-hover:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {programadas.length === 0 && (
        <div className="text-center py-10 text-ink-400">
          <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm">No hay tareas programadas aún</p>
        </div>
      )}
    </div>
  )
}
