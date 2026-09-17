import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../services/api'
import { notify } from '../utils/notify'
import { SkeletonTable } from './ui/Skeleton'

const ESTADOS = {
  borrador:  { label: 'Borrador',  cls: 'border-ink-400 text-ink-600' },
  enviada:   { label: 'Enviada',   cls: 'border-blue-600 text-blue-800' },
  aprobada:  { label: 'Aprobada',  cls: 'border-primary-700 text-primary-800' },
  rechazada: { label: 'Rechazada', cls: 'border-red-600 text-red-800' },
  anulada:   { label: 'Anulada',   cls: 'border-ink-300 text-ink-400' },
}

const money = (n) => `$ ${Number(n || 0).toLocaleString('es-CO')}`
const ESTADO_KEYS = Object.keys(ESTADOS)

function EstadoBadge({ estado }) {
  const cfg = ESTADOS[estado] || { label: estado, cls: 'border-ink-400 text-ink-600' }
  return <span className={`badge-corp ${cfg.cls}`}>{cfg.label}</span>
}

/* ── Selector de productos del portafolio ── */
function CatalogoPicker({ catalogo, onAgregar }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState(null)

  const categorias = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return catalogo
    return catalogo
      .map((c) => ({
        ...c,
        productos: c.productos.filter(
          (p) =>
            (p.nombre || '').toLowerCase().includes(t) ||
            (p.descripcion || '').toLowerCase().includes(t) ||
            (p.observaciones || '').toLowerCase().includes(t)
        ),
      }))
      .filter((c) => c.productos.length > 0)
  }, [catalogo, busqueda])

  return (
    <div className="card-corp overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100">
        <label className="field-label">Portafolio del proveedor</label>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto (ej. mojarra, refrigerio, menú…)"
          className="field-input text-sm"
        />
      </div>
      <div className="max-h-[320px] overflow-y-auto scroll-area divide-y divide-ink-100">
        {categorias.length === 0 && (
          <p className="text-sm text-ink-400 text-center py-8">Sin coincidencias</p>
        )}
        {categorias.map((c) => (
          <div key={c.id}>
            <button
              onClick={() => setAbierta(abierta === c.id ? null : c.id)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-ink-50 hover:bg-ink-100 transition-colors text-left"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-ink-600 truncate">
                {c.nombre}
              </span>
              <span className="text-[11px] text-ink-400 shrink-0">
                {c.productos.length} · {abierta === c.id ? '▲' : '▼'}
              </span>
            </button>
            {(abierta === c.id || busqueda.trim()) && (
              <div className="divide-y divide-ink-100">
                {c.productos.map((p) => (
                  <div key={p.id} className="px-4 py-2.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-800 leading-tight">
                        {p.nombre || p.descripcion}
                      </p>
                      <p className="text-[11px] text-ink-400 mt-0.5">
                        {money(p.precio)}
                        {p.precio_empacado ? ` · empacado ${money(p.precio_empacado)}` : ''}
                        {p.cantidad_minima ? ` · mín ${p.cantidad_minima}` : ''}
                        {p.tipo_montaje ? ` · ${p.tipo_montaje}` : ''}
                      </p>
                    </div>
                    <button onClick={() => onAgregar(p)} className="btn-secondary btn-sm shrink-0">
                      Añadir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Editor de cotización (crear y editar) ── */
function CotizacionEditor({ cotizacion, onClose, onSaved }) {
  const esNueva = !cotizacion?.id
  const [proveedores, setProveedores] = useState([])
  const [catalogo, setCatalogo] = useState([])
  const [cargandoCat, setCargandoCat] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    proveedor_id: cotizacion?.proveedor_id || '',
    cliente: cotizacion?.cliente || '',
    nit_cliente: cotizacion?.nit_cliente || '',
    contacto: cotizacion?.contacto || '',
    telefono_email: cotizacion?.telefono_email || '',
    ciudad: cotizacion?.ciudad || '',
    direccion: cotizacion?.direccion || '',
    fecha_evento: cotizacion?.fecha_evento || '',
    hora: cotizacion?.hora || '',
    cantidad_personas: cotizacion?.cantidad_personas || '',
    observaciones: cotizacion?.observaciones || '',
    condiciones: cotizacion?.condiciones || '',
  })
  const [lineas, setLineas] = useState(cotizacion?.items || [])

  useEffect(() => {
    api.get('/catalogo/proveedores', { params: { solo_activos: true } })
      .then(({ data }) => {
        setProveedores(data)
        setForm((f) => ({ ...f, proveedor_id: f.proveedor_id || data[0]?.id || '' }))
      })
      .catch(() => notify.error('No se pudieron cargar los proveedores'))
  }, [])

  useEffect(() => {
    if (!form.proveedor_id) return
    setCargandoCat(true)
    api.get(`/catalogo/proveedores/${form.proveedor_id}`)
      .then(({ data }) => setCatalogo(data.categorias || []))
      .catch(() => notify.error('No se pudo cargar el portafolio'))
      .finally(() => setCargandoCat(false))
  }, [form.proveedor_id])

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  const agregarProducto = (p) => {
    setLineas((prev) => [...prev, {
      producto_id: p.id,
      descripcion: p.nombre || p.descripcion,
      categoria: p.categoria_nombre,
      presentacion: p.precio_empacado ? 'servido' : null,
      precio_base: p.precio,
      precio_empacado: p.precio_empacado,
      precio_unitario: p.precio,
      cantidad: 1,
      inc_empaque: false,
      inc_bebida: false,
      inc_jugo: false,
      monto_empaque: p.incremento_empaque || 0,
      monto_bebida: p.incremento_bebida || 0,
      monto_jugo: p.incremento_jugo || 0,
      cantidad_minima: p.cantidad_minima,
      notas: '',
    }])
  }

  const agregarLibre = () => {
    setLineas((prev) => [...prev, {
      descripcion: '', precio_unitario: '', cantidad: 1,
      inc_empaque: false, inc_bebida: false, inc_jugo: false, libre: true,
    }])
  }

  const actualizarLinea = (idx, campo, valor) =>
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))

  const cambiarPresentacion = (idx, presentacion) =>
    setLineas((prev) => prev.map((l, i) => {
      if (i !== idx) return l
      const precio = presentacion === 'empacado' && l.precio_empacado ? l.precio_empacado : l.precio_base
      return { ...l, presentacion, precio_unitario: precio ?? l.precio_unitario }
    }))

  const quitarLinea = (idx) => setLineas((prev) => prev.filter((_, i) => i !== idx))

  const unitarioDe = (l) =>
    Number(l.precio_unitario || 0) +
    (l.inc_empaque ? l.monto_empaque || 0 : 0) +
    (l.inc_bebida ? l.monto_bebida || 0 : 0) +
    (l.inc_jugo ? l.monto_jugo || 0 : 0)

  const total = lineas.reduce((s, l) => s + unitarioDe(l) * Number(l.cantidad || 0), 0)

  const guardar = async () => {
    if (!form.proveedor_id) return notify.error('Selecciona un proveedor')
    if (!form.cliente.trim()) return notify.error('El cliente es obligatorio')
    if (lineas.length === 0) return notify.error('Añade al menos un producto')

    const items = lineas.map((l) => ({
      producto_id: l.producto_id || null,
      descripcion: l.producto_id ? undefined : l.descripcion,
      presentacion: l.presentacion || undefined,
      precio_unitario: l.producto_id ? undefined : Number(l.precio_unitario || 0),
      cantidad: Number(l.cantidad || 0),
      inc_empaque: !!l.inc_empaque,
      inc_bebida: !!l.inc_bebida,
      inc_jugo: !!l.inc_jugo,
      notas: l.notas || undefined,
    }))

    setGuardando(true)
    try {
      const payload = {
        ...form,
        proveedor_id: Number(form.proveedor_id),
        cantidad_personas: form.cantidad_personas ? Number(form.cantidad_personas) : null,
        items,
      }
      const { data } = esNueva
        ? await api.post('/cotizaciones/', payload)
        : await api.patch(`/cotizaciones/${cotizacion.id}`, payload)
      notify.success(esNueva ? `Cotización ${data.numero} creada` : 'Cotización actualizada')
      onSaved(data)
    } catch (err) {
      notify.error(err.response?.data?.detail || 'No se pudo guardar la cotización')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay items-end sm:items-center p-0 sm:p-4">
      <div className="relative bg-white rounded-t-md sm:rounded-md border border-ink-200 w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-ink-900 border-b-2 border-accent-500 px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-white font-bold text-base">
              {esNueva ? 'Nueva cotización' : `Cotización ${cotizacion.numero}`}
            </h3>
            <p className="text-ink-300 text-xs mt-0.5 truncate">
              Portafolio del proveedor · precios fijos del catálogo
            </p>
          </div>
          <button onClick={onClose}
            className="text-ink-300 hover:text-white p-2 sm:p-1 -m-1 rounded-md hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-area p-4 sm:p-5 space-y-5">
          {/* Datos del cliente */}
          <div className="card-corp p-4 space-y-3">
            <h4 className="text-xs font-bold text-ink-400 uppercase tracking-wider">Datos del cliente</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Proveedor *</label>
                <select value={form.proveedor_id} onChange={(e) => cambiar('proveedor_id', e.target.value)}
                  className="field-select">
                  <option value="">Selecciona…</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Cliente / empresa *</label>
                <input value={form.cliente} onChange={(e) => cambiar('cliente', e.target.value)}
                  placeholder="Nombre de la empresa" className="field-input" />
              </div>
              <div>
                <label className="field-label">NIT</label>
                <input value={form.nit_cliente} onChange={(e) => cambiar('nit_cliente', e.target.value)}
                  className="field-input" />
              </div>
              <div>
                <label className="field-label">Contacto</label>
                <input value={form.contacto} onChange={(e) => cambiar('contacto', e.target.value)}
                  className="field-input" />
              </div>
              <div>
                <label className="field-label">Teléfono / email</label>
                <input value={form.telefono_email} onChange={(e) => cambiar('telefono_email', e.target.value)}
                  className="field-input" />
              </div>
              <div>
                <label className="field-label">Ciudad</label>
                <input value={form.ciudad} onChange={(e) => cambiar('ciudad', e.target.value)}
                  placeholder="Ej: Ibagué" className="field-input" />
              </div>
              <div>
                <label className="field-label">Fecha del evento</label>
                <input type="date" value={form.fecha_evento} onChange={(e) => cambiar('fecha_evento', e.target.value)}
                  className="field-input" />
              </div>
              <div>
                <label className="field-label">Hora</label>
                <input type="time" value={form.hora} onChange={(e) => cambiar('hora', e.target.value)}
                  className="field-input" />
              </div>
              <div>
                <label className="field-label">Cantidad de personas</label>
                <input type="number" min="1" value={form.cantidad_personas}
                  onChange={(e) => cambiar('cantidad_personas', e.target.value)} className="field-input" />
              </div>
              <div>
                <label className="field-label">Dirección</label>
                <input value={form.direccion} onChange={(e) => cambiar('direccion', e.target.value)}
                  className="field-input" />
              </div>
            </div>
          </div>

          {/* Catálogo */}
          {form.proveedor_id && (
            cargandoCat ? (
              <div className="card-corp p-6 text-center text-sm text-ink-400">Cargando portafolio…</div>
            ) : (
              <CatalogoPicker catalogo={catalogo} onAgregar={agregarProducto} />
            )
          )}

          {/* Líneas */}
          <div className="card-corp overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-xs font-bold text-ink-400 uppercase tracking-wider">
                Productos de la cotización ({lineas.length})
              </h4>
              <button onClick={agregarLibre} className="btn-secondary btn-sm">+ Línea libre</button>
            </div>

            {lineas.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-8">
                Añade productos desde el portafolio
              </p>
            ) : (
              <div className="divide-y divide-ink-100">
                {lineas.map((l, idx) => {
                  const aviso = l.cantidad_minima && Number(l.cantidad) < l.cantidad_minima
                  return (
                    <div key={idx} className="p-4 space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {l.libre ? (
                            <input value={l.descripcion}
                              onChange={(e) => actualizarLinea(idx, 'descripcion', e.target.value)}
                              placeholder="Descripción (domicilio, loza, transporte…)"
                              className="field-input text-sm" />
                          ) : (
                            <>
                              <p className="text-sm font-medium text-ink-800 leading-tight">{l.descripcion}</p>
                              <p className="text-[11px] text-ink-400 mt-0.5">
                                {money(unitarioDe(l))} por unidad
                                {l.inc_empaque || l.inc_bebida || l.inc_jugo ? ' (con incrementos)' : ''}
                              </p>
                            </>
                          )}
                        </div>
                        <button onClick={() => quitarLinea(idx)} title="Quitar"
                          className="p-2 rounded-md text-ink-400 hover:text-red-700 hover:bg-red-50 transition-colors shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {l.libre && (
                          <input type="number" min="0" value={l.precio_unitario}
                            onChange={(e) => actualizarLinea(idx, 'precio_unitario', e.target.value)}
                            placeholder="Precio" className="field-input w-28 text-sm" />
                        )}
                        <label className="text-[11px] text-ink-500">Cantidad</label>
                        <input type="number" min="1" value={l.cantidad}
                          onChange={(e) => actualizarLinea(idx, 'cantidad', e.target.value)}
                          className="field-input w-20 text-sm" />

                        {l.precio_empacado && (
                          <select value={l.presentacion || 'servido'}
                            onChange={(e) => cambiarPresentacion(idx, e.target.value)}
                            className="field-select w-auto text-sm">
                            <option value="servido">Servido — {money(l.precio_base)}</option>
                            <option value="empacado">Empacado — {money(l.precio_empacado)}</option>
                          </select>
                        )}

                        {!l.libre && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {l.monto_empaque > 0 && (
                              <button onClick={() => actualizarLinea(idx, 'inc_empaque', !l.inc_empaque)}
                                className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors
                                  ${l.inc_empaque ? 'border-accent-600 bg-accent-400/20 text-primary-800' : 'border-ink-200 text-ink-500'}`}>
                                + empaque {money(l.monto_empaque)}
                              </button>
                            )}
                            {l.monto_bebida > 0 && (
                              <button onClick={() => actualizarLinea(idx, 'inc_bebida', !l.inc_bebida)}
                                className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors
                                  ${l.inc_bebida ? 'border-accent-600 bg-accent-400/20 text-primary-800' : 'border-ink-200 text-ink-500'}`}>
                                + bebida {money(l.monto_bebida)}
                              </button>
                            )}
                            {l.monto_jugo > 0 && (
                              <button onClick={() => actualizarLinea(idx, 'inc_jugo', !l.inc_jugo)}
                                className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors
                                  ${l.inc_jugo ? 'border-accent-600 bg-accent-400/20 text-primary-800' : 'border-ink-200 text-ink-500'}`}>
                                + jugo natural {money(l.monto_jugo)}
                              </button>
                            )}
                          </div>
                        )}

                        <span className="ml-auto text-sm font-bold text-ink-800">
                          {money(unitarioDe(l) * Number(l.cantidad || 0))}
                        </span>
                      </div>

                      {aviso && (
                        <p className="text-[11px] text-orange-700 bg-orange-50 border-l-2 border-orange-400 px-2 py-1">
                          Mínimo de despacho {l.cantidad_minima}: con menos unidades el domicilio se cobra aparte.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Observaciones y condiciones */}
          <div className="card-corp p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Observaciones</label>
              <textarea rows="3" value={form.observaciones}
                onChange={(e) => cambiar('observaciones', e.target.value)} className="field-input" />
            </div>
            <div>
              <label className="field-label">Condiciones comerciales</label>
              <textarea rows="3" value={form.condiciones}
                onChange={(e) => cambiar('condiciones', e.target.value)} className="field-input" />
            </div>
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-ink-400 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-ink-900 leading-none">{money(total)}</p>
          </div>
          <button onClick={onClose} className="btn-secondary sm:w-auto w-full">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary sm:w-auto w-full">
            {guardando ? 'Guardando…' : esNueva ? 'Crear cotización' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Vista principal ── */
export default function CotizacionesView() {
  const [pagina, setPagina] = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [resumen, setResumen] = useState({ total: 0, por_estado: {}, valor_total: 0 })
  const [estado, setEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [editor, setEditor] = useState(null)
  const [detalle, setDetalle] = useState(null)

  const fetchResumen = useCallback(async () => {
    try {
      const { data } = await api.get('/cotizaciones/resumen')
      setResumen(data)
    } catch (e) { console.error(e) }
  }, [])

  const fetchPagina = useCallback(async () => {
    setCargando(true)
    try {
      const params = { page, page_size: 10 }
      if (estado) params.estado = estado
      if (busquedaDebounced) params.q = busquedaDebounced
      const { data } = await api.get('/cotizaciones/', { params })
      setPagina(data)
    } catch (e) {
      notify.error('No se pudieron cargar las cotizaciones')
    } finally {
      setCargando(false)
    }
  }, [page, estado, busquedaDebounced])

  useEffect(() => { fetchResumen() }, [fetchResumen])
  useEffect(() => { fetchPagina() }, [fetchPagina])
  useEffect(() => { setPage(1) }, [estado, busquedaDebounced])
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const refrescar = async () => { await Promise.all([fetchPagina(), fetchResumen()]) }

  const cambiarEstado = async (cot, nuevo) => {
    try {
      await api.patch(`/cotizaciones/${cot.id}/estado`, { estado: nuevo })
      notify.success(`Cotización ${cot.numero} → ${ESTADOS[nuevo]?.label || nuevo}`)
      refrescar()
    } catch (err) {
      notify.error(err.response?.data?.detail || 'No se pudo cambiar el estado')
    }
  }

  const eliminar = async (cot) => {
    if (!window.confirm(`¿Eliminar la cotización ${cot.numero}?`)) return
    try {
      await api.delete(`/cotizaciones/${cot.id}`)
      notify.success('Cotización eliminada')
      refrescar()
    } catch (err) {
      notify.error(err.response?.data?.detail || 'No se pudo eliminar')
    }
  }

  const KPIS = [
    { label: 'Cotizaciones', valor: resumen.total, cls: 'bg-ink-50 text-ink-700' },
    { label: 'En borrador', valor: resumen.por_estado?.borrador || 0, cls: 'bg-white text-ink-600' },
    { label: 'Enviadas', valor: resumen.por_estado?.enviada || 0, cls: 'bg-blue-50 text-blue-700' },
    { label: 'Aprobadas', valor: resumen.por_estado?.aprobada || 0, cls: 'bg-primary-50 text-primary-800' },
  ]

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-ink-800 font-bold text-base">Cotizaciones de proveedores</h2>
          <p className="text-xs text-ink-400 mt-0.5">
            Valor cotizado (sin anuladas): <span className="font-semibold text-ink-600">{money(resumen.valor_total)}</span>
          </p>
        </div>
        <button onClick={() => setEditor({})} className="btn-primary w-full sm:w-auto justify-center">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva cotización
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 [&>*]:min-w-0">
        {KPIS.map((k) => (
          <div key={k.label} className={`rounded-md border border-ink-200 p-3 sm:p-4 min-w-0 ${k.cls}`}>
            <p className="text-xl sm:text-2xl font-bold leading-none">{k.valor}</p>
            <p className="text-[11px] sm:text-xs mt-0.5 leading-tight opacity-80">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="card-corp overflow-hidden">
        {/* Filtros */}
        <div className="px-4 sm:px-5 py-3 border-b border-ink-100 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, número, contacto…" className="field-input pl-8 py-2.5 sm:py-2 text-xs" />
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}
            className="field-select w-full sm:w-44 text-xs">
            <option value="">Todos los estados</option>
            {ESTADO_KEYS.map((k) => <option key={k} value={k}>{ESTADOS[k].label}</option>)}
          </select>
          <span className="text-xs text-ink-400 shrink-0">{pagina.total} resultado{pagina.total !== 1 ? 's' : ''}</span>
        </div>

        {cargando ? (
          <SkeletonTable rows={5} cols={4} />
        ) : pagina.items.length === 0 ? (
          <div className="text-center py-14 px-4">
            <p className="text-sm font-medium text-ink-600">
              {busqueda || estado ? 'Sin resultados con este filtro' : 'Aún no hay cotizaciones'}
            </p>
            <p className="text-xs text-ink-400 mt-1">
              Crea la primera con el portafolio de EVALB
            </p>
          </div>
        ) : (
          <>
            {/* Tabla en escritorio, tarjetas en móvil */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Número</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Cliente</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Evento</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Estado</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Total</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {pagina.items.map((c) => (
                    <tr key={c.id} className="hover:bg-ink-50 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-ink-500">{c.numero}</td>
                      <td className="px-3 py-3.5">
                        <button onClick={() => setDetalle(c)} className="font-semibold text-ink-800 hover:text-primary-800 text-left">
                          {c.cliente}
                        </button>
                        <p className="text-[11px] text-ink-400">{c.proveedor_nombre} · {c.items.length} línea{c.items.length !== 1 ? 's' : ''}</p>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-ink-600">
                        {c.fecha_evento || '—'}
                        {c.ciudad ? ` · ${c.ciudad}` : ''}
                      </td>
                      <td className="px-3 py-3.5"><EstadoBadge estado={c.estado} /></td>
                      <td className="px-3 py-3.5 text-right font-bold text-ink-800">{money(c.total)}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditor(c)} title="Editar"
                            className="btn-ghost p-2 rounded-md hover:bg-primary-50">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => eliminar(c)} title="Eliminar"
                            className="p-2 rounded-md text-ink-400 hover:text-red-700 hover:bg-red-50 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-ink-100">
              {pagina.items.map((c) => (
                <div key={c.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-800 text-sm truncate">{c.cliente}</p>
                      <p className="text-[11px] text-ink-400 font-mono">{c.numero} · {c.proveedor_nombre}</p>
                    </div>
                    <EstadoBadge estado={c.estado} />
                  </div>
                  <p className="text-xs text-ink-500">
                    {c.fecha_evento || 'Sin fecha'}{c.ciudad ? ` · ${c.ciudad}` : ''} · {c.items.length} línea{c.items.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink-900">{money(c.total)}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setDetalle(c)} className="btn-secondary btn-sm">Ver</button>
                      <button onClick={() => setEditor(c)} className="btn-secondary btn-sm">Editar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {pagina.pages > 1 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-5 py-3 border-t border-ink-100">
                <span className="text-xs text-ink-400">Página {pagina.page} de {pagina.pages}</span>
                <div className="flex items-center justify-center gap-1 flex-wrap">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagina.page === 1}
                    className="btn-secondary btn-sm disabled:opacity-40">Anterior</button>
                  <button onClick={() => setPage((p) => Math.min(pagina.pages, p + 1))} disabled={pagina.page === pagina.pages}
                    className="btn-secondary btn-sm disabled:opacity-40">Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detalle */}
      {detalle && (
        <div className="modal-overlay">
          <div className="relative bg-white rounded-md border border-ink-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-ink-900 border-b-2 border-accent-500 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-white font-bold text-base truncate">{detalle.cliente}</h3>
                <p className="text-ink-300 text-xs mt-0.5">
                  {detalle.numero} · {detalle.proveedor_nombre} · {detalle.creado_por_nombre}
                </p>
              </div>
              <button onClick={() => setDetalle(null)}
                className="text-ink-300 hover:text-white p-2 sm:p-1 -m-1 rounded-md hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scroll-area p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <EstadoBadge estado={detalle.estado} />
                {detalle.fecha_evento && <span className="text-xs text-ink-500">Evento: {detalle.fecha_evento} {detalle.hora || ''}</span>}
                {detalle.cantidad_personas ? <span className="text-xs text-ink-500">· {detalle.cantidad_personas} personas</span> : null}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {detalle.nit_cliente && <p><span className="text-ink-400 text-xs">NIT: </span>{detalle.nit_cliente}</p>}
                {detalle.contacto && <p><span className="text-ink-400 text-xs">Contacto: </span>{detalle.contacto}</p>}
                {detalle.telefono_email && <p><span className="text-ink-400 text-xs">Tel/email: </span>{detalle.telefono_email}</p>}
                {detalle.ciudad && <p><span className="text-ink-400 text-xs">Ciudad: </span>{detalle.ciudad}</p>}
                {detalle.direccion && <p className="sm:col-span-2"><span className="text-ink-400 text-xs">Dirección: </span>{detalle.direccion}</p>}
              </div>

              <div className="divide-y divide-ink-100 border border-ink-200 rounded-md overflow-hidden">
                {detalle.items.map((i) => (
                  <div key={i.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-800">{i.descripcion}</p>
                      <p className="text-[11px] text-ink-400">
                        {i.cantidad} × {money(i.precio_unitario)}
                        {i.inc_empaque || i.inc_bebida || i.inc_jugo
                          ? ` + (${[i.inc_empaque && 'empaque', i.inc_bebida && 'bebida', i.inc_jugo && 'jugo'].filter(Boolean).join(', ')})`
                          : ''}
                        {i.presentacion ? ` · ${i.presentacion}` : ''}
                      </p>
                      {i.aviso_minimo && <p className="text-[11px] text-orange-700 mt-0.5">{i.aviso_minimo}</p>}
                    </div>
                    <span className="text-sm font-semibold text-ink-800 shrink-0">{money(i.subtotal)}</span>
                  </div>
                ))}
              </div>

              {detalle.observaciones && (
                <p className="text-sm text-ink-600"><span className="text-ink-400 text-xs">Observaciones: </span>{detalle.observaciones}</p>
              )}
              {detalle.condiciones && (
                <p className="text-sm text-ink-600"><span className="text-ink-400 text-xs">Condiciones: </span>{detalle.condiciones}</p>
              )}

              <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="text-xs uppercase tracking-wide text-ink-400">Total</span>
                <span className="text-xl font-bold text-ink-900">{money(detalle.total)}</span>
              </div>

              <div>
                <label className="field-label">Cambiar estado</label>
                <div className="flex flex-wrap gap-1.5">
                  {ESTADO_KEYS.map((k) => (
                    <button key={k} onClick={() => { cambiarEstado(detalle, k); setDetalle(null) }}
                      className={`px-3 py-2 rounded-md border text-[11px] font-semibold transition-colors
                        ${detalle.estado === k ? 'border-primary-800 bg-primary-50 text-primary-800' : 'border-ink-200 text-ink-500 hover:border-ink-400'}`}>
                      {ESTADOS[k].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-ink-100 flex gap-3">
              <button onClick={() => setDetalle(null)} className="btn-secondary flex-1">Cerrar</button>
              <button onClick={() => { setEditor(detalle); setDetalle(null) }} className="btn-primary flex-1">Editar</button>
            </div>
          </div>
        </div>
      )}

      {editor && (
        <CotizacionEditor
          cotizacion={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); refrescar() }}
        />
      )}
    </div>
  )
}
