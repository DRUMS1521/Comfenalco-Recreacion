import { useState, useEffect } from 'react'
import api from '../services/api'
import { calcHours, LIMITE_HORAS } from '../utils/hours'

const ESTADO_CONFIG = {
  pendiente:       { label: 'Pendiente',    color: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  programado:      { label: 'Programado',   color: 'bg-blue-400',   text: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  'por corregir':  { label: 'Por Corregir', color: 'bg-orange-400', text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  eliminado:       { label: 'Eliminar',     color: 'bg-red-400',    text: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
}

const ESTADOS = Object.keys(ESTADO_CONFIG)

// Tipos con los que se clasifica el exceso sobre el límite semanal.
const TIPOS_HORA_EXTRA = [
  { value: 'diurnas',     label: 'Extras diurnas',     desc: 'Exceso en jornada diurna' },
  { value: 'dominicales', label: 'Extras dominicales', desc: 'Exceso en domingo' },
  { value: 'festivas',    label: 'Extras festivas',    desc: 'Exceso en día festivo' },
]


export default function EstadoModal({ solicitud, onClose, onConfirm }) {
  const [selected, setSelected]         = useState(solicitud.estado)
  // IDs seleccionados (multi-select)
  const [selectedIds, setSelectedIds]   = useState(
    solicitud.recreadores_asignados?.map((r) => r.id) ||
    (solicitud.recreador_id ? [solicitud.recreador_id] : [])
  )
  const [recreadores, setRecreadores]   = useState([])
  const [loadingRec, setLoadingRec]     = useState(false)
  // Horas de la semana y conflictos por recreador, resueltos por el servidor
  // (GET /solicitudes/{id}/validacion). Antes se calculaban en el navegador y
  // exigían tener descargadas TODAS las solicitudes.
  const [validaciones, setValidaciones] = useState({})
  const [limiteHoras, setLimiteHoras]   = useState(LIMITE_HORAS)
  const [confirming, setConfirming]         = useState(false)
  const [showCountWarning, setShowCountWarning] = useState(false)
  // Clasificación del exceso por recreador: { [recreadorId]: { tipo, horas } }.
  // Antes solo había un tipo único por solicitud, sin cantidad.
  const [clasificaciones, setClasificaciones] = useState(() => {
    const inicial = {}
    ;(solicitud.horas_extra_clasificadas || []).forEach((h) => {
      inicial[h.recreador_id] = { tipo: h.tipo, horas: String(h.horas) }
    })
    return inicial
  })
  const [loading, setLoading]           = useState(false)

  const needsRecreador = selected === 'programado'

  const horasNuevasServidor = validaciones[selectedIds[0]]?.horas_nuevas
  const horasNuevas = horasNuevasServidor ?? calcHours(solicitud.hora_inicio, solicitud.hora_fin)

  useEffect(() => {
    if (selected !== 'programado') return
    let cancelado = false
    setLoadingRec(true)
    api.get('/auth/recreadores')
      .then(({ data }) => {
        if (cancelado) return data
        setRecreadores(data)
        return data
      })
      .then((lista) => {
        if (cancelado || !lista?.length) return
        // Una sola petición con todos los candidatos: el servidor devuelve sus
        // horas de la semana y los conflictos de horario.
        return api.get(`/solicitudes/${solicitud.id}/validacion`, {
          params: { recreador_ids: lista.map((r) => r.id).join(',') },
        }).then(({ data }) => {
          if (cancelado) return
          const mapa = {}
          data.recreadores.forEach((v) => { mapa[v.id] = v })
          setValidaciones(mapa)
          if (data.limite_horas) setLimiteHoras(data.limite_horas)
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setLoadingRec(false) })
    return () => { cancelado = true }
  }, [selected, solicitud.id])

  const toggleRecreador = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const setClasificacion = (id, campo, valor) => {
    setClasificaciones((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { tipo: '', horas: '' }), [campo]: valor },
    }))
  }

  const horasDe = (id) => validaciones[id]?.horas_semana ?? 0
  const conflictosDe = (id) => validaciones[id]?.conflictos ?? []

  // Verificar exceso para cualquiera de los seleccionados
  const excedencias = selectedIds.map((id) => {
    const v = validaciones[id]
    const actual = horasDe(id)
    const total  = v ? v.total : actual + horasNuevas
    const rec    = recreadores.find((r) => r.id === id)
    return {
      id,
      nombre: v?.nombre || rec?.full_name || rec?.username || `#${id}`,
      actual,
      total,
      excede: v ? v.excede_limite : total > limiteHoras,
      // Horas que sobran: es el valor por defecto que se propone clasificar.
      exceso: v?.exceso_horas ?? Math.max(0, Number((total - limiteHoras).toFixed(2))),
    }
  })
  const hayExceso   = excedencias.some((e) => e.excede)
  const excedidos   = excedencias.filter((e) => e.excede)

  // Al detectarse un exceso se propone la cantidad sobrante como valor inicial
  // (el admin puede ajustarla) y el tipo queda por elegir.
  useEffect(() => {
    if (!hayExceso) return
    setClasificaciones((prev) => {
      let cambios = null
      excedidos.forEach((e) => {
        if (!prev[e.id]) {
          cambios = cambios || { ...prev }
          cambios[e.id] = { tipo: '', horas: String(e.exceso ?? 0) }
        }
      })
      return cambios || prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayExceso, excedidos.map((e) => `${e.id}:${e.exceso}`).join(',')])


  // Conflictos de horario para recreadores seleccionados (los calcula el servidor)
  const conflictos = selectedIds
    .map((id) => {
      const lista = conflictosDe(id)
      const rec = recreadores.find((r) => r.id === id)
      return {
        id,
        nombre: validaciones[id]?.nombre || rec?.full_name || rec?.username || `#${id}`,
        conflicto: lista[0] || null,
      }
    })
    .filter((c) => c.conflicto)
  const hayConflicto = conflictos.length > 0

  // Cada recreador que se pasa del límite debe tener tipo y cantidad de horas.
  const clasificacionCompleta = excedidos.every((e) => {
    const c = clasificaciones[e.id]
    return c?.tipo && Number(c.horas) > 0
  })

  // Clasificar un exceso pendiente también es un cambio válido, aunque el estado
  // y la asignación sigan iguales. Sin esto, el exceso de una actividad YA
  // programada no se podía guardar nunca (el botón Continuar quedaba bloqueado).
  const clasificacionCambiada = excedidos.some((e) => {
    const c = clasificaciones[e.id]
    if (!c?.tipo || !(Number(c.horas) > 0)) return false
    const guardada = (solicitud.horas_extra_clasificadas || []).find(
      (h) => h.recreador_id === e.id && h.tipo === c.tipo
    )
    return !guardada || Number(guardada.horas) !== Number(c.horas)
  })

  const cambioAsignacion = needsRecreador &&
    JSON.stringify([...selectedIds].sort()) !== JSON.stringify(
      (solicitud.recreadores_asignados?.map((r) => r.id) || []).sort()
    )
  const changed = selected !== solicitud.estado || cambioAsignacion || clasificacionCambiada
  const canContinue = changed && (!needsRecreador || selectedIds.length > 0)
  const canProceed  = canContinue && (!hayExceso || clasificacionCompleta)

  const selectedRecreadores = recreadores.filter((r) => selectedIds.includes(r.id))
  const cfg = ESTADO_CONFIG[selected]
  const fmt = (h) => (h % 1 === 0 ? String(h) : Number(h).toFixed(1))

  const handleContinue = () => {
    if (needsRecreador && selectedIds.length < Number(solicitud.cantidad_recreadores)) {
      setShowCountWarning(true)
      setConfirming(true)
    } else {
      setConfirming(true)
    }
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      // Se envía la clasificación por recreador; el campo legado tipo_hora_extra
      // solo se conserva cuando todos coinciden en un mismo tipo.
      const horasExtra = hayExceso
        ? excedidos
            .filter((e) => clasificaciones[e.id]?.tipo && Number(clasificaciones[e.id].horas) > 0)
            .map((e) => ({
              recreador_id: e.id,
              tipo: clasificaciones[e.id].tipo,
              horas: Number(clasificaciones[e.id].horas),
            }))
        : null
      const tiposUsados = [...new Set((horasExtra || []).map((h) => h.tipo))]
      await onConfirm(
        solicitud.id,
        selected,
        needsRecreador && selectedIds.length > 0 ? selectedIds : null,
        tiposUsados.length === 1 ? tiposUsados[0] : null,
        horasExtra,
      )
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-md border border-ink-200 w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-ink-900 border-b-2 border-accent-500 px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-bold text-base">Cambiar Estado</h3>
            <p className="text-ink-300 text-xs mt-0.5 truncate max-w-[220px]">{solicitud.empresa}</p>
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-white p-2 sm:p-1 -m-1 rounded-md hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!confirming ? (
            <>
              {/* Estado actual */}
              <div>
                <p className="text-xs text-ink-400 mb-1.5">Estado actual</p>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${ESTADO_CONFIG[solicitud.estado]?.bg || 'bg-ink-50 border-ink-200'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${ESTADO_CONFIG[solicitud.estado]?.color || 'bg-ink-400'}`} />
                  <span className={`text-sm font-semibold ${ESTADO_CONFIG[solicitud.estado]?.text || 'text-ink-700'}`}>
                    {ESTADO_CONFIG[solicitud.estado]?.label || solicitud.estado}
                  </span>
                </div>
              </div>

              {/* Selector de estado */}
              <div>
                <p className="text-xs text-ink-400 mb-1.5">Nuevo estado</p>
                <div className="grid grid-cols-2 gap-2">
                  {ESTADOS.map((e) => {
                    const c = ESTADO_CONFIG[e]
                    const isActive = selected === e
                    return (
                      <button key={e} onClick={() => { setSelected(e); setConfirming(false); setTipoHoraExtra('') }}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm font-medium transition-colors
                          ${isActive ? `border-current ${c.bg} ${c.text}` : 'border-ink-200 text-ink-600 hover:border-ink-400 hover:bg-ink-50'}`}>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.color}`} />
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Asignación de recreadores (multi-select) */}
              {needsRecreador && (
                <div className="border border-blue-100 bg-blue-50 rounded-md p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Asignar recreadores <span className="text-red-500">*</span>
                    {selectedIds.length > 0 && (
                      <span className="ml-auto bg-blue-200 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                  {loadingRec ? (
                    <div className="flex items-center gap-2 text-xs text-blue-500 py-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400" />
                      Cargando recreadores...
                    </div>
                  ) : recreadores.length === 0 ? (
                    <p className="text-xs text-ink-500">No hay recreadores disponibles</p>
                  ) : (
                    <div className="space-y-1.5">
                      {recreadores.map((r) => {
                        const isChecked = selectedIds.includes(r.id)
                        const hActual = horasDe(r.id)
                        const hTotal  = validaciones[r.id]?.total ?? (hActual + horasNuevas)
                        const excRec  = validaciones[r.id]?.excede_limite ?? (hTotal > limiteHoras)
                        const pct     = Math.min((hActual / limiteHoras) * 100, 100)
                        const barCol  = excRec ? 'bg-red-400' : hActual >= limiteHoras * 0.8 ? 'bg-yellow-400' : 'bg-green-400'
                        const conflictoRec = conflictosDe(r.id).length > 0
                        return (
                          <button
                            key={r.id}
                            onClick={() => toggleRecreador(r.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition text-left
                              ${conflictoRec && isChecked
                                ? 'border-red-400 bg-red-50 text-red-700 font-semibold shadow-sm'
                                : isChecked
                                ? 'border-blue-400 bg-white text-blue-700 font-semibold shadow-sm'
                                : 'border-transparent bg-white/60 text-ink-700 hover:bg-white hover:border-ink-200'}`}
                          >
                            {/* Checkbox visual */}
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition
                              ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-ink-300 bg-white'}`}>
                              {isChecked && (
                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                                </svg>
                              )}
                            </div>
                            <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                              <span className="text-primary-700 text-xs font-bold">
                                {r.full_name?.charAt(0) || r.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate leading-tight">{r.full_name || r.username}</p>
                                {conflictoRec && (
                                  <span className="shrink-0 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                                    Ocupado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="flex-1 bg-ink-100 rounded-full h-1">
                                  <div className={`h-1 rounded-full ${barCol}`} style={{ width: `${pct}%` }} />
                                </div>
                                <p className={`text-[10px] shrink-0 ${excRec ? 'text-red-600 font-semibold' : 'text-ink-400'}`}>
                                  {fmt(hActual)}/{limiteHoras}h
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Alerta de conflicto de horario */}
              {needsRecreador && hayConflicto && (
                <div className="border border-red-200 bg-red-50 rounded-md p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-xs font-bold text-red-800">Conflicto de horario</p>
                      <div className="mt-1 space-y-1">
                        {conflictos.map((c) => (
                          <p key={c.id} className="text-xs text-red-600">
                            <strong>{c.nombre}</strong> ya tiene una actividad en{' '}
                            <strong>{c.conflicto.empresa}</strong> de{' '}
                            {c.conflicto.hora_inicio} a {c.conflicto.hora_fin}h ese día.
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Advertencia de exceso de horas */}
              {needsRecreador && selectedIds.length > 0 && hayExceso && (
                <div className="border border-orange-200 bg-orange-50 rounded-md p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-xs font-bold text-orange-800">Se superan las {limiteHoras} horas semanales</p>
                      <div className="mt-1 space-y-0.5">
                        {excedencias.filter((e) => e.excede).map((e) => (
                          <p key={e.id} className="text-xs text-orange-600">
                            <strong>{e.nombre}</strong>: {fmt(e.total)}h (+{fmt(e.total - limiteHoras)}h excedente)
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-orange-800">
                      Clasifica el excedente de cada recreador: <span className="text-red-500">*</span>
                    </p>
                    {excedidos.map((e) => {
                      const c = clasificaciones[e.id] || { tipo: '', horas: '' }
                      const dif = c.horas === '' ? 0 : Number((Number(c.horas) - (e.exceso ?? 0)).toFixed(2))
                      return (
                        <div key={e.id} className="bg-white rounded-md border border-orange-200 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-xs font-semibold text-ink-800">{e.nombre}</p>
                            <span className="text-[11px] text-orange-700">
                              excede {fmt(e.exceso ?? 0)}h (total {fmt(e.total)}h / {limiteHoras}h)
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-[11px] text-ink-500 shrink-0">Horas a clasificar</label>
                            <input
                              type="number" min="0.5" step="0.5"
                              value={c.horas}
                              onChange={(ev) => setClasificacion(e.id, 'horas', ev.target.value)}
                              className="field-input py-1.5 text-xs w-24"
                            />
                            <span className="text-[11px] text-ink-400">h</span>
                            {c.horas !== '' && dif !== 0 && (
                              <span className={`text-[11px] ${dif > 0 ? 'text-red-600 font-semibold' : 'text-ink-400'}`}>
                                {dif > 0
                                  ? `+${fmt(dif)}h por encima del exceso`
                                  : `${fmt(Math.abs(dif))}h menos que el exceso`}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {TIPOS_HORA_EXTRA.map((t) => (
                              <button key={t.value} onClick={() => setClasificacion(e.id, 'tipo', t.value)}
                                title={t.desc}
                                className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition
                                  ${c.tipo === t.value
                                    ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                                    : 'border-ink-200 bg-white text-ink-600 hover:border-orange-300'}`}>
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button onClick={handleContinue} disabled={!canProceed} className="btn-primary flex-1">
                  Continuar
                </button>
              </div>
            </>
          ) : showCountWarning ? (
            /* ── Alerta: menos recreadores de los solicitados ── */
            <div className="space-y-4">
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h4 className="text-ink-800 font-bold text-base">Cantidad incompleta</h4>
                <p className="text-ink-500 text-sm mt-2 leading-relaxed">
                  La solicitud requiere{' '}
                  <span className="font-black text-ink-800">{solicitud.cantidad_recreadores}</span>{' '}
                  recreador{solicitud.cantidad_recreadores !== 1 ? 'es' : ''} y solo has asignado{' '}
                  <span className="font-black text-amber-600">{selectedIds.length}</span>.
                </p>
                <p className="text-ink-400 text-xs mt-2">¿Deseas continuar de todas formas?</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowCountWarning(false); setConfirming(false) }} className="btn-secondary flex-1">
                  Volver
                </button>
                <button onClick={() => { setShowCountWarning(false); setConfirming(true) }}
                  className="btn flex-1 bg-amber-600 text-white border border-amber-600 hover:bg-amber-700 hover:border-amber-700">
                  Sí, continuar
                </button>
              </div>
            </div>
          ) : (
            /* ── Confirmación final ── */
            <div className="space-y-4">
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="text-ink-800 font-bold text-base">¿Estás seguro?</h4>
                {needsRecreador && selectedRecreadores.length > 0 ? (
                  <p className="text-ink-500 text-sm mt-1 leading-relaxed">
                    Estás asignando una actividad de{' '}
                    <span className="font-black text-primary-600">{fmt(horasNuevas)}h</span>{' '}
                    a{' '}
                    <span className="font-black text-ink-800">{selectedRecreadores.length}</span>{' '}
                    recreador{selectedRecreadores.length !== 1 ? 'es' : ''}.
                  </p>
                ) : (
                  <p className="text-ink-500 text-sm mt-1">
                    Solicitud de <span className="font-semibold text-ink-700">{solicitud.empresa}</span>
                  </p>
                )}
                <div className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full border ${cfg.bg} ${cfg.text}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
                  <span className="font-bold text-sm">{cfg.label}</span>
                </div>

                {/* Recreadores en confirmación */}
                {needsRecreador && selectedRecreadores.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedRecreadores.map((r) => {
                      const e = excedencias.find((x) => x.id === r.id)
                      return (
                        <div key={r.id} className="flex items-center gap-2 justify-center bg-blue-50 border border-blue-100 rounded-md px-4 py-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                            <span className="text-primary-700 text-xs font-bold">
                              {r.full_name?.charAt(0) || r.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-blue-800">{r.full_name || r.username}</p>
                            <p className="text-xs text-blue-500">
                              {fmt(e?.total || 0)}h / {limiteHoras}h
                              {e?.excede && ` · +${fmt(e.total - limiteHoras)}h extra`}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {hayConflicto && (
                  <div className="mt-3 text-left border border-red-200 bg-red-50 rounded-md p-3 space-y-1">
                    <p className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Atención: conflicto de horario
                    </p>
                    {conflictos.map((c) => (
                      <p key={c.id} className="text-xs text-red-600">
                        <strong>{c.nombre}</strong> ya está ocupado de {c.conflicto.hora_inicio} a {c.conflicto.hora_fin}h en <strong>{c.conflicto.empresa}</strong>.
                      </p>
                    ))}
                  </div>
                )}

                {hayExceso && clasificacionCompleta && (
                  <div className="mt-3 text-left border border-orange-200 bg-orange-50 rounded-md p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-xs font-bold text-orange-800">Aviso de horas extras</p>
                    </div>
                    {excedidos.map(e => {
                      const c = clasificaciones[e.id] || {}
                      return (
                        <p key={e.id} className="text-xs text-orange-700 leading-relaxed">
                          <span className="font-bold">{e.nombre}</span> se pasará del total de horas{' '}
                          <span className="font-bold">({fmt(e.total)}h / {limiteHoras}h)</span>: se
                          registran{' '}
                          <span className="font-bold">{fmt(Number(c.horas) || 0)}h</span> como{' '}
                          <span className="font-bold">
                            {TIPOS_HORA_EXTRA.find(t => t.value === c.tipo)?.label || '—'}
                          </span>{' '}
                          en esa semana.
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setConfirming(false); setShowCountWarning(false) }} disabled={loading} className="btn-secondary flex-1">
                  Volver
                </button>
                <button onClick={handleConfirm} disabled={loading} className="btn-primary flex-1">
                  {loading
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Guardando...</>
                    : 'Sí, confirmar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
