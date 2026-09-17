import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api'
import useAuth from '../hooks/useAuth'
import TommyIcon from './TommyIcon'

/**
 * Tommy · asistente flotante conversacional.
 *
 * - Saluda por el nombre de pila y propone ejemplos según el rol.
 * - Mantiene el hilo: envía el contexto del turno anterior, así funcionan los
 *   seguimientos ("¿y mañana?", "¿y sus horas?").
 * - El historial vive en sessionStorage: cerrar, minimizar o recargar NO lo
 *   pierde; solo desaparece al cerrar sesión o con "Nueva conversación".
 * - Se monta en <body> con un portal (inmune a capas y recortes del contenedor).
 */

const CLAVE_CHAT = 'asistente_chat'
const CLAVE_CTX = 'asistente_ctx'
const CLAVE_VISTO = 'asistente_visto'
const CLAVE_MODO = 'asistente_modo'
const CLAVE_FEEDBACK = 'asistente_feedback'

const hora = (f = new Date()) => f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
const dia = (f = new Date()) => f.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const reducido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Renderiza **negritas** sin traer un parser de markdown. */
function Texto({ children }) {
  const partes = String(children || '').split('**')
  return (
    <>
      {partes.map((p, i) => (i % 2 === 1
        ? <strong key={i} className="font-semibold text-ink-900">{p}</strong>
        : <span key={i}>{p}</span>))}
    </>
  )
}

/** Escribe el texto letra a letra la primera vez que aparece. */
function useMaquinaDeEscribir(texto, animar) {
  const [visible, setVisible] = useState(animar ? '' : texto)
  useEffect(() => {
    if (!animar || reducido()) { setVisible(texto); return }
    let i = 0
    const paso = Math.max(2, Math.round(texto.length / 55))
    const t = setInterval(() => {
      i += paso
      setVisible(texto.slice(0, i))
      if (i >= texto.length) clearInterval(t)
    }, 14)
    return () => clearInterval(t)
  }, [texto, animar])
  return visible
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

function Tarjeta({ item, indice }) {
  return (
    <div className="msg-entra bg-white border border-ink-200 border-l-2 border-l-primary-700 rounded-sm px-3 py-2 shadow-sm
      hover:shadow-md hover:border-l-accent-600 transition-all duration-150"
      style={{ animationDelay: `${Math.min(indice * 40, 200)}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink-800 leading-tight">{item.titulo}</p>
        {item.estado && (
          <span className={`badge-corp shrink-0 ${ESTADOS[item.estado] || 'border-ink-400 text-ink-600'}`}>
            {item.estado}
          </span>
        )}
      </div>
      {item.subtitulo && <p className="text-[11px] text-ink-500 mt-0.5 leading-tight">{item.subtitulo}</p>}
      <div className="flex items-center gap-2 mt-0.5">
        {item.meta && <p className="text-[11px] text-ink-400">{item.meta}</p>}
        {item.horas ? (
          <p className="text-[11px] font-semibold text-primary-700">{item.horas} h</p>
        ) : null}
      </div>
    </div>
  )
}

function Conteos({ conteos }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {conteos.map((c, i) => (
        <div key={c.etiqueta} className="msg-entra bg-white border border-ink-200 rounded-md px-2.5 py-1.5 min-w-[74px]"
          style={{ animationDelay: `${i * 50}ms` }}>
          <p className="text-[15px] font-bold text-ink-900 leading-none">{c.valor}</p>
          <p className="text-[10px] text-ink-400 uppercase tracking-wide mt-0.5">{c.etiqueta}</p>
        </div>
      ))}
    </div>
  )
}

function BurbujaAsistente({ m, onPreguntar, onNavegar, onCopiar, onFeedback, animar, feedback }) {
  const visible = useMaquinaDeEscribir(m.texto, animar)
  const completo = visible === m.texto
  const marca = feedback?.[m.hora + m.texto]
  return (
    <div className="msg-entra flex gap-2 items-start group/msg">
      <TommyIcon size={32} glow={false} animado={false} className="shrink-0 -mt-0.5" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="relative bg-white border border-ink-200 rounded-md rounded-tl-sm px-3 py-2 shadow-sm">
          {m.contexto && (
            <p className="text-[10px] uppercase tracking-wide text-ink-400 mb-1">{m.contexto}</p>
          )}
          <p className="text-[13px] text-ink-700 leading-relaxed">
            <Texto>{visible}</Texto>
            {!completo && <span className="inline-block w-[2px] h-[13px] bg-primary-700 align-middle ml-0.5 animate-pulse" />}
          </p>
          {completo && (
            <div className="absolute -right-2 -top-2 flex gap-0.5 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
              <button onClick={() => onCopiar(m.texto)} title="Copiar respuesta"
                className="w-6 h-6 rounded-md bg-white border border-ink-200 text-ink-400 hover:text-primary-800
                  hover:border-primary-300 flex items-center justify-center shadow-sm transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
              </button>
              <button onClick={() => onFeedback(m, 'bueno')} title="Me sirvió"
                className={`w-6 h-6 rounded-md bg-white border text-[11px] flex items-center justify-center shadow-sm transition-colors
                  ${marca === 'bueno' ? 'border-primary-600 text-primary-800' : 'border-ink-200 text-ink-400 hover:text-primary-800'}`}>
                👍
              </button>
              <button onClick={() => onFeedback(m, 'malo')} title="No me sirvió"
                className={`w-6 h-6 rounded-md bg-white border text-[11px] flex items-center justify-center shadow-sm transition-colors
                  ${marca === 'malo' ? 'border-red-500 text-red-700' : 'border-ink-200 text-ink-400 hover:text-red-700'}`}>
                👎
              </button>
            </div>
          )}
        </div>

        {completo && m.filtros?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-ink-400 flex items-center gap-1">
              <svg className="w-3 h-3 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Entendí
            </span>
            {m.filtros.map((f, k) => (
              <span key={k} className="msg-entra text-[10px] bg-ink-100 border border-ink-200 text-ink-600
                rounded-full px-2 py-0.5" style={{ animationDelay: `${k * 40}ms` }}>
                <span className="text-ink-400">{f.campo}:</span> <b className="font-semibold">{f.valor}</b>
              </span>
            ))}
          </div>
        )}

        {completo && m.conteos?.length > 0 && <Conteos conteos={m.conteos} />}
        {completo && m.items?.length > 0 && (
          <div className="space-y-1.5">
            {m.items.map((it, k) => <Tarjeta key={k} item={it} indice={k} />)}
            {m.extra && <p className="text-[11px] text-ink-400 pl-1">{m.extra}</p>}
          </div>
        )}

        {completo && m.acciones?.length > 0 && onNavegar && (
          <div className="flex flex-wrap gap-1.5">
            {m.acciones.map((a) => (
              <button key={a.tab} onClick={() => onNavegar(a.tab)}
                className="text-[11px] font-semibold uppercase tracking-wide text-primary-800
                  bg-white border border-primary-300 rounded-md px-2.5 py-1.5 hover:bg-primary-50 transition-colors">
                {a.etiqueta} →
              </button>
            ))}
          </div>
        )}

        {completo && m.sugerencias?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {m.sugerencias.slice(0, 4).map((s, k) => (
              <button key={k} onClick={() => onPreguntar(s)}
                className="msg-entra text-[11px] text-primary-800 bg-primary-50 border border-primary-200
                  hover:bg-primary-100 hover:border-primary-400 hover:-translate-y-px rounded-full px-2.5 py-1
                  transition-all duration-150 text-left" style={{ animationDelay: `${k * 60}ms` }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-ink-300 pl-1">{m.hora}</p>
      </div>
    </div>
  )
}

export default function AsistenteChat({ onNavegar }) {
  const { user } = useAuth()
  const [modo, setModo] = useState(() => sessionStorage.getItem(CLAVE_MODO) || 'oculto')
  // Se leen de forma perezosa en el primer render. Con un useEffect de carga, el
  // efecto que guarda se ejecutaba antes con el estado vacío y borraba el
  // historial al recargar la página.
  const [mensajes, setMensajes] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_CHAT) || '[]') } catch { return [] }
  })
  const [contexto, setContexto] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_CTX) || 'null') } catch { return null }
  })
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [feedback, setFeedback] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_FEEDBACK) || '{}') } catch { return {} }
  })
  const [hayNuevos, setHayNuevos] = useState(false)
  const [sinVer, setSinVer] = useState(() => sessionStorage.getItem(CLAVE_VISTO) !== '1')
  const [cercaDelFinal, setCercaDelFinal] = useState(true)
  const finRef = useRef(null)
  const inputRef = useRef(null)

  const abierto = modo === 'abierto' || modo === 'pantalla'
  const nombre = (user?.full_name || user?.username || '').split(' ')[0] || 'compañero'

  // ── persistencia del historial (se conserva al cerrar, minimizar o recargar) ──
  useEffect(() => {
    try { sessionStorage.setItem(CLAVE_CHAT, JSON.stringify(mensajes.slice(-60))) } catch { /* sin espacio */ }
  }, [mensajes])

  useEffect(() => {
    try { if (contexto) sessionStorage.setItem(CLAVE_CTX, JSON.stringify(contexto)) } catch { /* sin espacio */ }
  }, [contexto])

  useEffect(() => { sessionStorage.setItem(CLAVE_MODO, modo) }, [modo])
  useEffect(() => {
    try { sessionStorage.setItem(CLAVE_FEEDBACK, JSON.stringify(feedback)) } catch { /* sin espacio */ }
  }, [feedback])

  // ── saludo personalizado la primera vez ──
  const saludar = useCallback(async () => {
    try {
      const { data } = await api.get('/asistente/saludo')
      setMensajes([{
        autor: 'asistente', texto: data.respuesta, contexto: data.contexto,
        sugerencias: data.sugerencias, hora: hora(), animar: true,
      }])
    } catch {
      setMensajes([{ autor: 'asistente', texto: `¡Hola, ${nombre}! Soy el asistente de Comfenalco Tolima.`, hora: hora() }])
    }
  }, [nombre])

  useEffect(() => { if (abierto && mensajes.length === 0) saludar() }, [abierto, mensajes.length, saludar])

  // ── abrir, cerrar, minimizar ──
  const abrir = useCallback(() => { setModo('abierto'); setSinVer(false); sessionStorage.setItem(CLAVE_VISTO, '1') }, [])
  const cerrar = useCallback(() => { setModo('oculto'); setHayNuevos(false) }, [])
  const minimizar = useCallback(() => setModo('minimizado'), [])

  useEffect(() => { if (abierto) setTimeout(() => inputRef.current?.focus(), 260) }, [abierto, modo])

  useEffect(() => {
    const alPulsar = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (abierto) cerrar(); else abrir()
      }
      if (e.key === 'Escape' && abierto) cerrar()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [abierto, abrir, cerrar])

  useEffect(() => {
    if (finRef.current && cercaDelFinal) finRef.current.scrollTop = finRef.current.scrollHeight
  }, [mensajes, pensando, abierto, cercaDelFinal])

  const alDesplazar = (e) => {
    const el = e.currentTarget
    setCercaDelFinal(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }
  const irAlFinal = () => {
    if (finRef.current) finRef.current.scrollTop = finRef.current.scrollHeight
    setCercaDelFinal(true)
  }

  // ── preguntar (enviando el contexto para poder seguir el hilo) ──
  const preguntar = async (pregunta) => {
    const limpio = (pregunta || '').trim()
    if (!limpio || pensando) return
    setTexto('')
    setMensajes((prev) => [...prev, { autor: 'usuario', texto: limpio, hora: hora() }])
    setPensando(true)
    setCercaDelFinal(true)
    try {
      const { data } = await api.post('/asistente/consultar', { pregunta: limpio, contexto })
      setContexto(data.contexto_conversacion || null)
      setMensajes((prev) => [...prev, {
        autor: 'asistente', texto: data.respuesta, contexto: data.contexto, tipo: data.tipo,
        items: data.items, conteos: data.conteos, extra: data.extra,
        sugerencias: data.sugerencias, acciones: data.acciones, filtros: data.filtros,
        hora: hora(), animar: true,
      }])
      if (!abierto) setHayNuevos(true)
    } catch (err) {
      setMensajes((prev) => [...prev, {
        autor: 'asistente', hora: hora(),
        texto: err.response?.data?.detail || 'No pude consultar en este momento. Intenta de nuevo.',
      }])
    } finally {
      setPensando(false)
    }
  }

  const copiar = async (t) => {
    try { await navigator.clipboard.writeText(t) } catch { /* el navegador puede bloquearlo */ }
  }

  const marcar = (m, valor) => setFeedback((prev) => ({ ...prev, [m.hora + m.texto]: valor }))

  const limpiar = () => {
    if (!window.confirm('¿Empezar una conversación nueva? Se borrará el historial de este chat.')) return
    setMensajes([]); setContexto(null); setFeedback({})
    sessionStorage.removeItem(CLAVE_CHAT); sessionStorage.removeItem(CLAVE_CTX)
    saludar()
  }

  // separador de día al inicio de la conversación
  const conSeparadores = useMemo(() => {
    const items = []
    mensajes.forEach((m, i) => {
      if (i === 0) items.push({ separador: true })
      items.push({ ...m, indice: i })
    })
    return items
  }, [mensajes])

  const ultimoIndice = mensajes.length - 1
  const altura = modo === 'pantalla'
    ? 'sm:inset-3'
    : 'sm:right-6 sm:bottom-6 sm:w-[400px] sm:h-[620px]'

  return createPortal(
    <>
      {/* ── Botón flotante ── */}
      {modo === 'oculto' && (
        <button onClick={abrir} title="Habla con Tommy (Ctrl+K)" aria-label="Abrir el asistente Tommy"
          className="fixed z-[55] right-4 bottom-4 sm:right-6 sm:bottom-6 group
            w-[68px] h-[68px]
            hover:scale-110 hover:-rotate-3 active:scale-95 transition-transform duration-200
            focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-500 rounded-full
            flex items-center justify-center">
          {sinVer && <span className="absolute inset-0 rounded-full bg-accent-500/60 chat-latido" aria-hidden="true" />}
          <TommyIcon size={68} className="drop-shadow-[0_8px_14px_rgba(0,0,0,0.4)]" />
          <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow" />
          {(sinVer || hayNuevos) && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-500 text-ink-900 text-[10px]
              font-bold rounded-full flex items-center justify-center shadow">1</span>
          )}
        </button>
      )}

      {/* ── Barra minimizada (el historial sigue guardado) ── */}
      {modo === 'minimizado' && (
        <button onClick={abrir}
          className="fixed z-[55] right-4 bottom-4 sm:right-6 sm:bottom-6 chat-entra
            flex items-center gap-3 bg-ink-900 text-white rounded-full pl-2 pr-4 py-2 shadow-xl
            border border-white/10 hover:bg-ink-800 transition-colors
            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
          <TommyIcon size={36} glow={false} animado={false} className="shrink-0 -my-1" />
          <span className="text-left">
            <span className="block text-[12px] font-bold leading-tight">Tommy</span>
            <span className="block text-[10px] text-ink-300 leading-tight">
              {mensajes.length > 0 ? `${mensajes.length} mensajes · toca para continuar` : 'Toca para abrir'}
            </span>
          </span>
        </button>
      )}

      {/* ── Panel ── */}
      {abierto && (
        <div className={`fixed z-[55] inset-x-2 bottom-2 top-16 sm:inset-auto ${altura}
          flex flex-col overflow-hidden bg-ink-50 rounded-lg border border-ink-200
          shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] chat-entra`}>

          <header className="relative bg-gradient-to-r from-ink-900 via-primary-900 to-ink-900
            border-b-2 border-accent-500 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="relative shrink-0 -my-2 -ml-1">
              <TommyIcon size={58} className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" />
              <span className="absolute bottom-2 right-1.5 w-3 h-3 bg-emerald-400 border-2 border-ink-900 rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm leading-tight">Tommy</p>
              <p className="text-ink-300 text-[11px] truncate">
                Asistente de Comfenalco Tolima · en línea · {nombre}
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={limpiar} title="Nueva conversación"
                className="text-ink-300 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button onClick={() => setModo(modo === 'pantalla' ? 'abierto' : 'pantalla')}
                title={modo === 'pantalla' ? 'Tamaño normal' : 'Pantalla completa'}
                className="hidden sm:flex text-ink-300 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors">
                {modo === 'pantalla' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5H5m10 4V5h4m-4 10h4v4m-10-4H5v4" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M20 8V4h-4M4 16v4h4m12-4v4h-4" />
                  </svg>
                )}
              </button>
              <button onClick={minimizar} title="Minimizar (conserva el historial)"
                className="text-ink-300 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <button onClick={cerrar} title="Cerrar (Ctrl+K para volver)"
                className="text-ink-300 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          {/* Atajos rápidos */}
          <div className="shrink-0 flex gap-1.5 overflow-x-auto scroll-area px-3 py-2 bg-white/70 border-b border-ink-200">
            {[
              { t: '¿Qué actividades hay hoy?', icono: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { t: '¿Quién va mañana?', icono: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
              { t: '¿Cuántas horas lleva cada recreador esta semana?', icono: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
            ].map((a) => (
              <button key={a.t} type="button" onClick={() => preguntar(a.t)}
                className="shrink-0 flex items-center gap-1.5 text-[11px] text-primary-800 bg-primary-50
                  border border-primary-200 hover:bg-primary-100 hover:border-primary-400
                  rounded-full px-2.5 py-1.5 transition-colors whitespace-nowrap">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={a.icono} />
                </svg>
                {a.t.replace(/^¿|\?$/g, '')}
              </button>
            ))}
          </div>

          <div ref={finRef} onScroll={alDesplazar}
            className="relative flex-1 min-h-0 overflow-y-auto scroll-area p-3 space-y-3">
            {conSeparadores.map((item, i) => {
              if (item.separador) {
                return (
                  <div key={`sep-${i}`} className="flex items-center gap-2 py-1">
                    <span className="flex-1 border-t border-ink-200" />
                    <span className="text-[10px] uppercase tracking-wide text-ink-400">{dia()}</span>
                    <span className="flex-1 border-t border-ink-200" />
                  </div>
                )
              }
              if (item.autor === 'usuario') {
                return (
                  <div key={item.indice} className="msg-entra flex justify-end">
                    <div className="max-w-[85%]">
                      <div className="bg-primary-800 text-white rounded-md rounded-tr-sm px-3 py-2 shadow-sm">
                        <p className="text-[13px] leading-relaxed">{item.texto}</p>
                      </div>
                      <p className="text-[10px] text-ink-300 text-right mt-0.5 pr-1">{item.hora}</p>
                    </div>
                  </div>
                )
              }
              return (
                <BurbujaAsistente key={item.indice} m={item}
                  animar={item.indice === ultimoIndice && item.animar === true}
                  onPreguntar={preguntar} onNavegar={onNavegar}
                  onCopiar={copiar} onFeedback={marcar} feedback={feedback} />
              )
            })}

            {pensando && (
              <div className="msg-entra flex gap-2 items-center">
                <TommyIcon size={32} glow={false} animado={false} className="shrink-0" />
                <div className="bg-white border border-ink-200 rounded-md rounded-tl-sm px-3 py-2.5 shadow-sm flex items-center gap-1">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-400 chat-puntito"
                      style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                  <span className="text-[11px] text-ink-400 ml-1.5">buscando en el sistema…</span>
                </div>
              </div>
            )}

            {!cercaDelFinal && (
              <button onClick={irAlFinal}
                className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5
                  bg-ink-900/90 text-white text-[11px] rounded-full px-3 py-1.5 shadow-lg
                  hover:bg-ink-900 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Ir al final
              </button>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); preguntar(texto) }}
            className="shrink-0 bg-white border-t border-ink-200 p-3 space-y-2">
            {mensajes.length === 0 && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { t: '¿Qué actividades hay hoy?', i: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { t: '¿Quién tiene menos carga hoy?', i: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
                  { t: '¿Cuántas solicitudes hay pendientes?', i: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
                  { t: '¿Cuánto llevamos cotizado?', i: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                ].map((c) => (
                  <button key={c.t} type="button" onClick={() => preguntar(c.t)}
                    className="text-left text-[11px] text-ink-600 bg-ink-50 border border-ink-200
                      hover:border-primary-400 hover:bg-primary-50 rounded-md px-2.5 py-2 transition-colors
                      flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 text-primary-700 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.i} />
                    </svg>
                    {c.t}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={inputRef} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder={`Escríbele a Tommy, ${nombre}…`} maxLength={300}
                className="field-input py-2.5 text-sm flex-1" />
              <button type="submit" disabled={!texto.trim() || pensando} title="Enviar"
                className="w-10 h-10 rounded-md text-white flex items-center justify-center shrink-0
                  bg-primary-800 hover:bg-primary-900 disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-ink-400 text-center">
              {texto.length > 260
                ? `${texto.length}/300 caracteres`
                : 'Enter para enviar · Ctrl+K abre o cierra · el historial se conserva en esta sesión'}
            </p>
          </form>
        </div>
      )}
    </>,
    document.body
  )
}
