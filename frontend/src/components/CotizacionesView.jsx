import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api'
import { notify } from '../utils/notify'
import { SkeletonTable } from './ui/Skeleton'

const ESTADOS = {
  borrador:  { label: 'Borrador',  cls: 'border-ink-400 text-ink-600',  dot: 'bg-ink-400' },
  enviada:   { label: 'Enviada',   cls: 'border-blue-600 text-blue-800', dot: 'bg-blue-500' },
  aprobada:  { label: 'Aprobada',  cls: 'border-primary-700 text-primary-800', dot: 'bg-emerald-500' },
  rechazada: { label: 'Rechazada', cls: 'border-red-600 text-red-800',   dot: 'bg-red-500' },
  anulada:   { label: 'Anulada',   cls: 'border-ink-300 text-ink-400',   dot: 'bg-ink-300' },
}
const ESTADO_KEYS = Object.keys(ESTADOS)
const money = (n) => `$ ${Number(n || 0).toLocaleString('es-CO')}`
const corto = (n) => {
  const v = Number(n || 0)
  return v >= 1_000_000 ? `$ ${(v / 1_000_000).toFixed(1)} M` : money(v)
}

function EstadoBadge({ estado }) {
  const cfg = ESTADOS[estado] || { label: estado, cls: 'border-ink-400 text-ink-600' }
  return <span className={`badge-corp ${cfg.cls}`}>{cfg.label}</span>
}

function Icono({ d, className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

const ICONOS = {
  total: 'M9 12h6m-6 4h4M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z',
  borrador: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  enviada: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  aprobada: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  dinero: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}

/* ── Selector de productos del portafolio ── */
function CatalogoPicker({ catalogo, onAgregar }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState(catalogo[0]?.id ?? null)

  useEffect(() => { setAbierta(catalogo[0]?.id ?? null) }, [catalogo])

  const categorias = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return catalogo
    return catalogo
      .map((c) => ({
        ...c,
        productos: c.productos.filter((p) =>
          (p.nombre || '').toLowerCase().includes(t) ||
          (p.descripcion || '').toLowerCase().includes(t) ||
          (p.observaciones || '').toLowerCase().includes(t)),
      }))
      .filter((c) => c.productos.length > 0)
  }, [catalogo, busqueda])

  const totalCoincidencias = categorias.reduce((s, c) => s + c.productos.length, 0)

  return (
    <section className="card-corp overflow-hidden flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-ink-100 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">
            Portafolio del proveedor
          </h4>
          <span className="text-[11px] text-ink-400">{totalCoincidencias} productos</span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300">
            <Icono d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-3.5 h-3.5" />
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, ingrediente u observación…"
            className="field-input pl-8 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-area">
        {categorias.length === 0 && (
          <p className="text-sm text-ink-400 text-center py-10">Sin coincidencias</p>
        )}
        {categorias.map((c) => (
          <div key={c.id} className="border-b border-ink-100 last:border-0">
            <button
              onClick={() => setAbierta(abierta === c.id ? null : c.id)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-primary-50/40 transition-colors text-left"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-ink-600 truncate">
                {c.nombre}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-ink-400">{c.productos.length}</span>
                <span className={`text-ink-300 transition-transform duration-200 ${abierta === c.id ? 'rotate-180' : ''}`}>
                  <Icono d="M19 9l-7 7-7-7" className="w-3.5 h-3.5" />
                </span>
              </span>
            </button>
            {abierta === c.id && (
              <div className="divide-y divide-ink-100 bg-ink-50/40">
                {c.productos.map((p) => (
                  <div key={p.id} className="px-3 py-2 flex items-start gap-2 hover:bg-white transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-ink-800 leading-tight">{p.nombre || p.descripcion}</p>
                      <p className="text-[11px] text-ink-400 mt-0.5 truncate">
                        {money(p.precio)}
                        {p.precio_empacado ? ` · empacado ${money(p.precio_empacado)}` : ''}
                        {p.cantidad_minima ? ` · mín ${p.cantidad_minima}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => onAgregar(p)}
                      title="Añadir a la cotización"
                      className="shrink-0 w-8 h-8 rounded-md border border-ink-200 text-primary-800
                        hover:bg-primary-800 hover:text-white hover:border-primary-800
                        flex items-center justify-center transition-colors"
                    >
                      <Icono d="M12 4v16m8-8H4" className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Editor de cotización ── */
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

  useEffect(() => {
    const alPulsar = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onClose])

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  const agregarProducto = (p) => {
    setLineas((prev) => [...prev, {
      producto_id: p.id,
      descripcion: p.nombre || p.descripcion,
      presentacion: p.precio_empacado ? 'servido' : null,
      precio_base: p.precio,
      precio_empacado: p.precio_empacado,
      precio_unitario: p.precio,
      cantidad: 1,
      inc_empaque: false, inc_bebida: false, inc_jugo: false,
      monto_empaque: p.incremento_empaque || 0,
      monto_bebida: p.incremento_bebida || 0,
      monto_jugo: p.incremento_jugo || 0,
      cantidad_minima: p.cantidad_minima,
      notas: '',
    }])
  }

  const agregarLibre = () => setLineas((prev) => [...prev, {
    descripcion: '', precio_unitario: '', cantidad: 1,
    inc_empaque: false, inc_bebida: false, inc_jugo: false, libre: true,
  }])

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
  const totalUnidades = lineas.reduce((s, l) => s + Number(l.cantidad || 0), 0)
  const proveedorActual = proveedores.find((p) => Number(p.id) === Number(form.proveedor_id))

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

  const campo = (etiqueta, nombre, { colSpan, ...props } = {}) => (
    <div className={colSpan ? 'sm:col-span-2' : ''}>
      <label className="field-label">{etiqueta}</label>
      <input
        value={form[nombre]}
        onChange={(e) => cambiar(nombre, e.target.value)}
        className="field-input py-2 text-sm"
        {...props}
      />
    </div>
  )

  return createPortal(
    <div className="modal-overlay">
      <div className="relative bg-white rounded-md border border-ink-200 shadow-xl
        w-full max-w-5xl h-[94vh] sm:h-[92vh] flex flex-col overflow-hidden">

        {/* Cabecera fija */}
        <header className="relative z-10 bg-ink-900 border-b-2 border-accent-500 px-4 sm:px-5 py-3
          flex items-center justify-between gap-3 shrink-0 shadow-[0_8px_16px_-12px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md bg-white/10 flex items-center justify-center shrink-0 text-accent-400">
              <Icono d={ICONOS.total} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-white font-bold text-sm sm:text-base leading-tight truncate">
                {esNueva ? 'Nueva cotización' : `Cotización ${cotizacion.numero}`}
              </h3>
              <p className="text-ink-300 text-[11px] truncate">
                {proveedorActual ? `${proveedorActual.nombre} · precios fijos del portafolio` : 'Selecciona el proveedor'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!esNueva && <EstadoBadge estado={cotizacion.estado} />}
            <button onClick={onClose} title="Cerrar"
              className="text-ink-300 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors">
              <Icono d="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Cuerpo con scroll propio */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-area bg-ink-50/60 p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Columna izquierda: cliente + portafolio */}
            <div className="space-y-4 min-w-0">
              <section className="card-corp overflow-hidden">
                <div className="px-4 py-3 border-b border-ink-100 flex items-center gap-2">
                  <span className="text-primary-800"><Icono d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></span>
                  <h4 className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Datos del cliente</h4>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="field-label">Proveedor *</label>
                    <select value={form.proveedor_id} onChange={(e) => cambiar('proveedor_id', e.target.value)}
                      className="field-select py-2 text-sm">
                      <option value="">Selecciona…</option>
                      {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  {campo('Cliente / empresa *', 'cliente', { placeholder: 'Nombre de la empresa', colSpan: true })}
                  {campo('NIT', 'nit_cliente')}
                  {campo('Contacto', 'contacto')}
                  {campo('Teléfono / email', 'telefono_email')}
                  {campo('Ciudad', 'ciudad', { placeholder: 'Ej: Ibagué' })}
                  <div>
                    <label className="field-label">Fecha del evento</label>
                    <input type="date" value={form.fecha_evento}
                      onChange={(e) => cambiar('fecha_evento', e.target.value)}
                      className="field-input py-2 text-sm" />
                  </div>
                  <div>
                    <label className="field-label">Hora</label>
                    <input type="time" value={form.hora}
                      onChange={(e) => cambiar('hora', e.target.value)}
                      className="field-input py-2 text-sm" />
                  </div>
                  <div>
                    <label className="field-label">Personas</label>
                    <input type="number" min="1" value={form.cantidad_personas}
                      onChange={(e) => cambiar('cantidad_personas', e.target.value)}
                      className="field-input py-2 text-sm" />
                  </div>
                  {campo('Dirección', 'direccion')}
                </div>
              </section>

            </div>

            {/* Columna derecha: portafolio → líneas → notas */}
            <div className="space-y-4 min-w-0">
              {form.proveedor_id && (
                cargandoCat ? (
                  <section className="card-corp p-6 text-center text-sm text-ink-400">
                    Cargando portafolio…
                  </section>
                ) : (
                  <div className="max-h-[45vh] lg:max-h-none lg:h-[300px] flex flex-col min-h-0">
                    <CatalogoPicker catalogo={catalogo} onAgregar={agregarProducto} />
                  </div>
                )
              )}

              <section className="card-corp overflow-hidden">
                <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-primary-800"><Icono d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></span>
                    <h4 className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">
                      Líneas ({lineas.length})
                    </h4>
                  </div>
                  <button onClick={agregarLibre} className="btn-secondary btn-sm">+ Línea libre</button>
                </div>

                {lineas.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="w-11 h-11 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
                      <Icono d="M12 4v16m8-8H4" className="w-5 h-5" />
                    </div>
                    <p className="text-sm text-ink-500">Añade productos desde el portafolio</p>
                    <p className="text-xs text-ink-400 mt-1">El precio sale del catálogo; solo cambias cantidades</p>
                  </div>
                ) : (
                  <div className="divide-y divide-ink-100">
                    {lineas.map((l, idx) => {
                      const aviso = l.cantidad_minima && Number(l.cantidad) < l.cantidad_minima
                      return (
                        <div key={idx} className="p-3 sm:p-4">
                          <div className="flex items-start gap-2">
                            <span className="w-6 h-6 rounded-md bg-ink-100 text-ink-500 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              {l.libre ? (
                                <input value={l.descripcion}
                                  onChange={(e) => actualizarLinea(idx, 'descripcion', e.target.value)}
                                  placeholder="Descripción (domicilio, loza, transporte…)"
                                  className="field-input py-2 text-sm" />
                              ) : (
                                <>
                                  <p className="text-sm text-ink-800 leading-tight">{l.descripcion}</p>
                                  <p className="text-[11px] text-ink-400 mt-0.5">
                                    {money(unitarioDe(l))} por unidad
                                    {l.presentacion ? ` · ${l.presentacion}` : ''}
                                  </p>
                                </>
                              )}
                            </div>
                            <span className="text-sm font-bold text-ink-800 shrink-0 mt-1">
                              {money(unitarioDe(l) * Number(l.cantidad || 0))}
                            </span>
                            <button onClick={() => quitarLinea(idx)} title="Quitar línea"
                              className="p-2 -mr-1 rounded-md text-ink-300 hover:text-red-700 hover:bg-red-50 transition-colors shrink-0">
                              <Icono d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="mt-2 pl-8 flex flex-wrap items-center gap-2">
                            {l.libre && (
                              <div className="flex items-center gap-1.5">
                                <label className="text-[11px] text-ink-500">Precio</label>
                                <input type="number" min="0" value={l.precio_unitario}
                                  onChange={(e) => actualizarLinea(idx, 'precio_unitario', e.target.value)}
                                  className="field-input py-1.5 text-sm w-28" />
                              </div>
                            )}

                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] text-ink-500">Cant.</label>
                              <input type="number" min="1" value={l.cantidad}
                                onChange={(e) => actualizarLinea(idx, 'cantidad', e.target.value)}
                                className="field-input py-1.5 text-sm w-20" />
                            </div>

                            {l.precio_empacado && (
                              <select value={l.presentacion || 'servido'}
                                onChange={(e) => cambiarPresentacion(idx, e.target.value)}
                                className="field-select py-1.5 text-sm w-auto">
                                <option value="servido">Servido</option>
                                <option value="empacado">Empacado</option>
                              </select>
                            )}

                            {!l.libre && (l.monto_empaque > 0 || l.monto_bebida > 0 || l.monto_jugo > 0) && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[['empaque', 'monto_empaque', 'inc_empaque', l.monto_empaque],
                                  ['bebida', 'monto_bebida', 'inc_bebida', l.monto_bebida],
                                  ['jugo', 'monto_jugo', 'inc_jugo', l.monto_jugo]]
                                  .filter(([, , , monto]) => monto > 0)
                                  .map(([etiqueta, , flag, monto]) => (
                                    <button key={etiqueta}
                                      onClick={() => actualizarLinea(idx, flag, !l[flag])}
                                      className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors
                                        ${l[flag]
                                          ? 'border-accent-600 bg-accent-400/25 text-primary-800'
                                          : 'border-ink-200 text-ink-500 hover:border-ink-400'}`}>
                                      + {etiqueta} {money(monto)}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>

                          {aviso && (
                            <p className="mt-2 ml-8 text-[11px] text-orange-700 bg-orange-50 border-l-2 border-orange-400 px-2 py-1">
                              Mínimo de despacho {l.cantidad_minima}: con menos unidades el domicilio se cobra aparte.
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="card-corp p-4 space-y-3">
                <h4 className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">
                  Notas y condiciones
                </h4>
                <div>
                  <label className="field-label">Observaciones</label>
                  <textarea rows="2" value={form.observaciones}
                    onChange={(e) => cambiar('observaciones', e.target.value)}
                    className="field-input py-2 text-sm" />
                </div>
                <div>
                  <label className="field-label">Condiciones comerciales</label>
                  <textarea rows="2" value={form.condiciones}
                    onChange={(e) => cambiar('condiciones', e.target.value)}
                    className="field-input py-2 text-sm" />
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Pie fijo: total siempre visible */}
        <footer className="relative z-10 shrink-0 bg-white border-t border-ink-200 px-4 sm:px-5 py-3
          flex flex-col sm:flex-row sm:items-center gap-3 shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.35)]">
          <div className="flex items-baseline gap-3 flex-1">
            <span className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Total</span>
            <span className="text-2xl font-bold text-ink-900 leading-none">{money(total)}</span>
            <span className="text-[11px] text-ink-400">
              {lineas.length} línea{lineas.length !== 1 ? 's' : ''} · {totalUnidades} unidad{totalUnidades !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 sm:flex-none">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 sm:flex-none">
              {guardando ? 'Guardando…' : esNueva ? 'Crear cotización' : 'Guardar cambios'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
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
      setDetalle(null)
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

  const KPI = [
    { key: 'total', label: 'Cotizaciones', valor: resumen.total, tile: 'bg-ink-100 text-ink-600' },
    { key: 'borrador', label: 'En borrador', valor: resumen.por_estado?.borrador || 0, tile: 'bg-amber-50 text-amber-700' },
    { key: 'enviada', label: 'Enviadas', valor: resumen.por_estado?.enviada || 0, tile: 'bg-blue-50 text-blue-700' },
    { key: 'aprobada', label: 'Aprobadas', valor: resumen.por_estado?.aprobada || 0, tile: 'bg-primary-50 text-primary-800' },
  ]

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-ink-800 font-bold text-base">Cotizaciones de proveedores</h2>
          <p className="text-xs text-ink-400 mt-0.5">
            Portafolio vigente 2026 · precios fijos por proveedor
          </p>
        </div>
        <button onClick={() => setEditor({})} className="btn-primary w-full sm:w-auto justify-center">
          <Icono d="M12 4v16m8-8H4" />
          Nueva cotización
        </button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 [&>*]:min-w-0">
        {KPI.map((k) => (
          <div key={k.key} className="card-corp p-3 sm:p-4 flex items-center gap-3 min-w-0">
            <div className={`hidden sm:flex w-9 h-9 rounded-md items-center justify-center shrink-0 ${k.tile}`}>
              <Icono d={ICONOS[k.key] || ICONOS.total} />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold text-ink-900 leading-none">{k.valor}</p>
              <p className="text-[11px] sm:text-xs text-ink-500 mt-0.5 leading-tight">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Valor cotizado */}
      <div className="bg-ink-900 border-l-2 border-accent-500 rounded-md px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-white/10 flex items-center justify-center shrink-0 text-accent-400">
          <Icono d={ICONOS.dinero} className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold text-sm leading-tight">
            {money(resumen.valor_total)} cotizados
          </p>
          <p className="text-ink-300 text-[11px] mt-0.5">
            Suma de todas las cotizaciones vigentes (sin contar las anuladas)
          </p>
        </div>
      </div>

      <div className="card-corp overflow-hidden">
        {/* Filtros */}
        <div className="px-4 sm:px-5 py-3 border-b border-ink-100 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300">
              <Icono d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-3.5 h-3.5" />
            </span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, número, contacto…"
              className="field-input pl-8 py-2.5 sm:py-2 text-xs" />
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}
            className="field-select w-full sm:w-44 py-2.5 sm:py-2 text-xs">
            <option value="">Todos los estados</option>
            {ESTADO_KEYS.map((k) => <option key={k} value={k}>{ESTADOS[k].label}</option>)}
          </select>
          <span className="text-xs text-ink-400 shrink-0">{pagina.total} resultado{pagina.total !== 1 ? 's' : ''}</span>
        </div>

        {cargando ? (
          <SkeletonTable rows={5} cols={5} />
        ) : pagina.items.length === 0 ? (
          <div className="text-center py-14 px-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-md border border-ink-200 flex items-center justify-center text-ink-300">
              <Icono d={ICONOS.total} className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-ink-600">
              {busqueda || estado ? 'Sin resultados con este filtro' : 'Aún no hay cotizaciones'}
            </p>
            <p className="text-xs text-ink-400 mt-1 mb-4">
              {busqueda || estado ? 'Prueba con otro término' : 'El portafolio de EVALB ya está cargado y listo'}
            </p>
            {!busqueda && !estado && (
              <button onClick={() => setEditor({})} className="btn-primary">Crear la primera</button>
            )}
          </div>
        ) : (
          <>
            {/* Escritorio */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">Número</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">Cliente</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">Evento</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">Estado</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">Total</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {pagina.items.map((c) => (
                    <tr key={c.id} className="group hover:bg-primary-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] text-ink-500 bg-ink-100 rounded px-1.5 py-0.5">
                          {c.numero}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => setDetalle(c)}
                          className="font-semibold text-ink-800 hover:text-primary-800 text-left leading-tight">
                          {c.cliente}
                        </button>
                        <p className="text-[11px] text-ink-400 mt-0.5">
                          {c.proveedor_nombre} · {c.items.length} línea{c.items.length !== 1 ? 's' : ''}
                          {c.cantidad_personas ? ` · ${c.cantidad_personas} personas` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-600 whitespace-nowrap">
                        {c.fecha_evento || '—'}
                        {c.ciudad ? <span className="block text-[11px] text-ink-400">{c.ciudad}</span> : null}
                      </td>
                      <td className="px-3 py-3"><EstadoBadge estado={c.estado} /></td>
                      <td className="px-3 py-3 text-right font-bold text-ink-900 whitespace-nowrap">{money(c.total)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                          <button onClick={() => setDetalle(c)} title="Ver detalle"
                            className="btn-ghost p-2 rounded-md hover:bg-primary-50">
                            <Icono d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </button>
                          <button onClick={() => setEditor(c)} title="Editar"
                            className="btn-ghost p-2 rounded-md hover:bg-primary-50">
                            <Icono d={ICONOS.borrador} />
                          </button>
                          <button onClick={() => eliminar(c)} title="Eliminar"
                            className="p-2 rounded-md text-ink-400 hover:text-red-700 hover:bg-red-50 transition-colors">
                            <Icono d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil */}
            <div className="md:hidden divide-y divide-ink-100">
              {pagina.items.map((c) => (
                <button key={c.id} onClick={() => setDetalle(c)}
                  className="w-full text-left p-4 hover:bg-primary-50/40 transition-colors space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-800 text-sm truncate">{c.cliente}</p>
                      <p className="text-[11px] text-ink-400 font-mono mt-0.5">{c.numero}</p>
                    </div>
                    <EstadoBadge estado={c.estado} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-ink-500">
                      {c.fecha_evento || 'Sin fecha'} · {c.items.length} línea{c.items.length !== 1 ? 's' : ''}
                    </span>
                    <span className="font-bold text-ink-900">{money(c.total)}</span>
                  </div>
                </button>
              ))}
            </div>

            {pagina.pages > 1 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-5 py-3 border-t border-ink-100">
                <span className="text-xs text-ink-400 text-center sm:text-left">
                  Página {pagina.page} de {pagina.pages}
                </span>
                <div className="flex items-center justify-center gap-2">
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
      {detalle && createPortal(
        <div className="modal-overlay">
          <div className="relative bg-white rounded-md border border-ink-200 shadow-xl
            w-full max-w-2xl h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
            <header className="bg-ink-900 border-b-2 border-accent-500 px-4 sm:px-5 py-3 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-white font-bold text-sm sm:text-base truncate">{detalle.cliente}</h3>
                <p className="text-ink-300 text-[11px] mt-0.5 truncate">
                  {detalle.numero} · {detalle.proveedor_nombre} · {detalle.creado_por_nombre}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} title="Cerrar"
                className="text-ink-300 hover:text-white p-2 -m-1 rounded-md hover:bg-white/10 transition-colors shrink-0">
                <Icono d="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto scroll-area p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <EstadoBadge estado={detalle.estado} />
                {detalle.fecha_evento && (
                  <span className="text-xs text-ink-500">{detalle.fecha_evento} {detalle.hora || ''}</span>
                )}
                {detalle.cantidad_personas ? <span className="text-xs text-ink-400">· {detalle.cantidad_personas} personas</span> : null}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {detalle.nit_cliente && <p><span className="text-[11px] text-ink-400 block">NIT</span>{detalle.nit_cliente}</p>}
                {detalle.contacto && <p><span className="text-[11px] text-ink-400 block">Contacto</span>{detalle.contacto}</p>}
                {detalle.telefono_email && <p className="col-span-2"><span className="text-[11px] text-ink-400 block">Teléfono / email</span>{detalle.telefono_email}</p>}
                {detalle.ciudad && <p><span className="text-[11px] text-ink-400 block">Ciudad</span>{detalle.ciudad}</p>}
                {detalle.direccion && <p><span className="text-[11px] text-ink-400 block">Dirección</span>{detalle.direccion}</p>}
              </div>

              <div className="border border-ink-200 rounded-md overflow-hidden divide-y divide-ink-100">
                {detalle.items.map((i, idx) => (
                  <div key={i.id} className="px-3 py-2.5 flex items-start gap-3">
                    <span className="w-5 h-5 rounded bg-ink-100 text-ink-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-800 leading-tight">{i.descripcion}</p>
                      <p className="text-[11px] text-ink-400 mt-0.5">
                        {i.cantidad} × {money(i.precio_unitario)}
                        {i.presentacion ? ` · ${i.presentacion}` : ''}
                      </p>
                      {i.aviso_minimo && <p className="text-[11px] text-orange-700 mt-0.5">{i.aviso_minimo}</p>}
                    </div>
                    <span className="text-sm font-semibold text-ink-800 shrink-0">{money(i.subtotal)}</span>
                  </div>
                ))}
              </div>

              {(detalle.observaciones || detalle.condiciones) && (
                <div className="space-y-2">
                  {detalle.observaciones && (
                    <p className="text-sm text-ink-600"><span className="text-[11px] text-ink-400 block">Observaciones</span>{detalle.observaciones}</p>
                  )}
                  {detalle.condiciones && (
                    <p className="text-sm text-ink-600"><span className="text-[11px] text-ink-400 block">Condiciones</span>{detalle.condiciones}</p>
                  )}
                </div>
              )}

              <div>
                <label className="field-label">Cambiar estado</label>
                <div className="flex flex-wrap gap-1.5">
                  {ESTADO_KEYS.map((k) => (
                    <button key={k} onClick={() => cambiarEstado(detalle, k)}
                      className={`px-3 py-2 rounded-md border text-[11px] font-semibold transition-colors
                        ${detalle.estado === k
                          ? 'border-primary-800 bg-primary-50 text-primary-800'
                          : 'border-ink-200 text-ink-500 hover:border-ink-400'}`}>
                      {ESTADOS[k].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <footer className="relative z-10 shrink-0 border-t border-ink-200 px-4 sm:px-5 py-3
              flex items-center gap-3 shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.35)]">
              <div className="flex-1">
                <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Total</p>
                <p className="text-xl font-bold text-ink-900 leading-none">{money(detalle.total)}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="btn-secondary">Cerrar</button>
              <button onClick={() => { setEditor(detalle); setDetalle(null) }} className="btn-primary">Editar</button>
            </footer>
          </div>
        </div>,
        document.body
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
