import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api'
import useAuth from '../hooks/useAuth'
import logo from '../assets/logo-comfenalco.svg'

/**
 * Asistente flotante.
 *
 * - Saluda con el nombre del usuario y ofrece ejemplos según su rol.
 * - Responde con datos reales del sistema (agenda de recreadores, solicitudes,
 *   horas, cotizaciones) respetando el alcance por rol: el backend decide qué
 *   puede ver cada quien.
 * - Se monta en <body> con un portal para que ninguna capa o recorte del
 *   contenedor afecte su posición ni su apilado.
 */

const CLAVE_CHAT = 'asistente_chat'
const CLAVE_VISTO = 'asistente_visto'

function hora(fecha = new Date()) {
  return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

/** Renderiza **negritas** simples sin traer un parser de markdown. */
function Texto({ children }) {
  const partes = String(children || '').split('**')
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold">{parte}</strong>
          : <span key={i}>{parte}</span>
      )}
    </>
  )
}

const ESTADOS = {
  programado: 'border-blue-600 text-blue-800',
  finalizado: 'border-primary-700 text-primary-800',
  borrador:   'border-ink-400 text-ink-600',
  enviada:    'border-blue-600 text-blue-800',
  aprobada:   'border-primary-700 text-primary-800',
  rechazada:  'border-red-600 text-red-800',
  anulada:    'border-ink-300 text-ink-400',
  libre:      'border-emerald-600 text-emerald-700',
}

function Tarjeta({ item }) {
  return (
    <div className="bg-white border-l-2 border-primary-700 rounded-sm px-3 py-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink-800 leading-tight">{item.titulo}</p>
        {item.estado && (
          <span className={`badge-corp shrink-0 ${ESTADOS[item.estado] || 'border-ink-400 text-ink-600'}`}>
            {item.estado}
          </span>
        )}
      </div>
      {item.subtitulo && <p className="text-[11px] text-ink-500 mt-0.5">{item.subtitulo}</p>}
      <div className="flex items-center gap-2 mt-0.5">
        {item.meta && <p className="text-[11px] text-ink-400">{item.meta}</p>}
        {item.horas ? <p className="text-[11px] font-semibold text-primary-700">{item.horas} h</p> : null}
      </div>
    </div>
  )
}

function Conteos({ conteos }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {conteos.map((c) => (
        <div key={c.etiqueta} className="bg-white border border-ink-200 rounded-md px-2.5 py-1.5">
          <p className="text-[15px] font-bold text-ink-900 leading-none">{c.valor}</p>
          <p className="text-[10px] text-ink-400 uppercase tracking-wide mt-0.5">{c.etiqueta}</p>
        </div>
      ))}
    </div>
  )
}

export default function AsistenteChat({ onNavegar }) {
  const { user } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [sinVer, setSinVer] = useState(() => sessionStorage.getItem(CLAVE_VISTO) !== '1')
  const finRef = useRef(null)
  const inputRef = useRef(null)

  const nombre = (user?.full_name || user?.username || '').split(' ')[0] || 'compañero'

  // Recupera la conversación de la sesión
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CLAVE_CHAT)
      if (guardado) setMensajes(JSON.parse(guardado))
    } catch { /* conversación corrupta: se empieza de cero */ }
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(CLAVE_CHAT, JSON.stringify(mensajes.slice(-40))) } catch { /* sin espacio */ }
  }, [mensajes])

  // Saludo inicial personalizado la primera vez que se abre
  const saludar = useCallback(async () => {
    try {
      const { data } = await api.get('/asistente/saludo')
      setMensajes([{
        autor: 'asistente',
        texto: data.respuesta,
        contexto: data.contexto,
        sugerencias: data.sugerencias,
        hora: hora(),
      }])
    } catch {
      setMensajes([{
        autor: 'asistente',
        texto: `¡Hola, ${nombre}! Soy el asistente de Comfenalco Tolima.`,
        hora: hora(),
      }])
    }
  }, [nombre])

  useEffect(() => {
    if (abierto && mensajes.length === 0) saludar()
  }, [abierto, mensajes.length, saludar])

  useEffect(() => {
    if (abierto) {
      setSinVer(false)
      sessionStorage.setItem(CLAVE_VISTO, '1')
      setTimeout(() => inputRef.current?.focus(), 250)
    }
  }, [abierto])

  useEffect(() => {
    if (finRef.current) finRef.current.scrollTop = finRef.current.scrollHeight
  }, [mensajes, pensando, abierto])

  useEffect(() => {
    const alPulsar = (e) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [])

  const preguntar = async (pregunta) => {
    const limpio = pregunta.trim()
    if (!limpio || pensando) return
    setTexto('')
    setMensajes((prev) => [...prev, { autor: 'usuario', texto: limpio, hora: hora() }])
    setPensando(true)
    try {
      const { data } = await api.post('/asistente/consultar', { pregunta: limpio })
      setMensajes((prev) => [...prev, {
        autor: 'asistente',
        texto: data.respuesta,
        tipo: data.tipo,
        items: data.items,
        conteos: data.conteos,
        extra: data.extra,
        sugerencias: data.sugerencias,
        hora: hora(),
      }])
    } catch (err) {
      setMensajes((prev) => [...prev, {
        autor: 'asistente',
        texto: err.response?.data?.detail || 'No pude consultar en este momento. Intenta de nuevo.',
        hora: hora(),
      }])
    } finally {
      setPensando(false)
    }
  }

  const limpiar = () => { setMensajes([]); saludar() }

  const destino = (m) => {
    if (m.tipo === 'cotizaciones') return { tab: 'cotizaciones', etiqueta: 'Ir a Cotizaciones' }
    if (m.tipo === 'actividades' || m.tipo === 'personas') return { tab: 'calendario', etiqueta: 'Ver calendario' }
    return null
  }

  const burbujaAsistente = (m, i) => (
    <div key={i} className="msg-entra flex gap-2 items-start">
      <div className="w-7 h-7 rounded-md bg-white border border-ink-200 flex items-center justify-center shrink-0 p-0.5 mt-0.5">
        <img src={logo} alt="" className="w-full h-full object-contain" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="bg-white border border-ink-200 rounded-md rounded-tl-sm px-3 py-2 shadow-sm">
          {m.contexto && (
            <p className="text-[10px] uppercase tracking-wide text-ink-400 mb-1">{m.contexto}</p>
          )}
          <p className="text-[13px] text-ink-700 leading-relaxed"><Texto>{m.texto}</Texto></p>
        </div>

        {m.conteos?.length > 0 && <Conteos conteos={m.conteos} />}
        {m.items?.length > 0 && (
          <div className="space-y-1.5">
            {m.items.map((it, k) => <Tarjeta key={k} item={it} />)}
            {m.extra && <p className="text-[11px] text-ink-400 pl-1">{m.extra}</p>}
          </div>
        )}

        {m.items?.length > 0 && destino(m) && onNavegar && (
          <button
            onClick={() => { onNavegar(destino(m).tab); setAbierto(false) }}
            className="text-[11px] font-semibold uppercase tracking-wide text-primary-800 hover:text-accent-700 hover:underline"
          >
            {destino(m).etiqueta} →
          </button>
        )}

        {m.sugerencias?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {m.sugerencias.slice(0, 4).map((s, k) => (
              <button key={k} onClick={() => preguntar(s)}
                className="text-[11px] text-primary-800 bg-primary-50 border border-primary-200
                  hover:bg-primary-100 hover:border-primary-300 rounded-full px-2.5 py-1 transition-colors text-left">
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-ink-300 pl-1">{m.hora}</p>
      </div>
    </div>
  )

  const burbujaUsuario = (m, i) => (
    <div key={i} className="msg-entra flex justify-end">
      <div className="max-w-[85%]">
        <div className="bg-primary-800 text-white rounded-md rounded-tr-sm px-3 py-2 shadow-sm">
          <p className="text-[13px] leading-relaxed">{m.texto}</p>
        </div>
        <p className="text-[10px] text-ink-300 text-right mt-0.5 pr-1">{m.hora}</p>
      </div>
    </div>
  )

  return createPortal(
    <>
      {/* Botón flotante */}
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          title="Asistente Comfenalco"
          aria-label="Abrir el asistente"
          className="fixed z-[55] right-4 bottom-4 sm:right-6 sm:bottom-6 group
            w-14 h-14 rounded-full bg-primary-800 text-white shadow-xl
            hover:bg-primary-900 hover:scale-105 active:scale-95
            transition-transform duration-200 flex items-center justify-center
            ring-2 ring-accent-500/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-500"
        >
          {sinVer && (
            <span className="absolute inset-0 rounded-full bg-accent-500/60 chat-latido" aria-hidden="true" />
          )}
          <svg className="w-6 h-6 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4-.8L3 21l1.2-3.6A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {sinVer && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-500 text-ink-900 text-[10px]
              font-bold rounded-full flex items-center justify-center">1</span>
          )}
        </button>
      )}

      {/* Panel */}
      {abierto && (
        <div className="fixed z-[55] inset-x-2 bottom-2 top-16 sm:inset-auto sm:right-6 sm:bottom-6
          sm:w-[380px] sm:h-[580px] flex flex-col overflow-hidden
          bg-ink-50 rounded-lg border border-ink-200 shadow-2xl chat-entra">

          {/* Cabecera */}
          <header className="bg-ink-900 border-b-2 border-accent-500 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-md bg-white flex items-center justify-center shrink-0 p-1 relative">
              <img src={logo} alt="" className="w-full h-full object-contain" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-ink-900 rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm leading-tight">Asistente Comfenalco</p>
              <p className="text-ink-300 text-[11px] truncate">
                En línea · te saluda, {nombre}
              </p>
            </div>
            <button onClick={limpiar} title="Nueva conversación"
              className="text-ink-300 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={() => setAbierto(false)} title="Cerrar"
              className="text-ink-300 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          {/* Conversación */}
          <div ref={finRef} className="flex-1 min-h-0 overflow-y-auto scroll-area p-3 space-y-3">
            {mensajes.map((m, i) => (m.autor === 'usuario' ? burbujaUsuario(m, i) : burbujaAsistente(m, i)))}

            {pensando && (
              <div className="msg-entra flex gap-2 items-center">
                <div className="w-7 h-7 rounded-md bg-white border border-ink-200 flex items-center justify-center shrink-0 p-0.5">
                  <img src={logo} alt="" className="w-full h-full object-contain" />
                </div>
                <div className="bg-white border border-ink-200 rounded-md rounded-tl-sm px-3 py-2.5 shadow-sm flex items-center gap-1">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-400 chat-puntito"
                      style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Entrada */}
          <form
            onSubmit={(e) => { e.preventDefault(); preguntar(texto) }}
            className="shrink-0 bg-white border-t border-ink-200 p-3 flex items-end gap-2"
          >
            <input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`Pregúntame algo, ${nombre}…`}
              maxLength={300}
              className="field-input py-2.5 text-sm flex-1"
            />
            <button type="submit" disabled={!texto.trim() || pensando}
              title="Enviar"
              className="w-10 h-10 rounded-md bg-primary-800 text-white flex items-center justify-center shrink-0
                hover:bg-primary-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>,
    document.body
  )
}
