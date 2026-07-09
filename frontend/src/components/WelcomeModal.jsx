import { useMemo } from 'react'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function toYMD(d) { return d.toISOString().split('T')[0] }

/* ── Tarjeta de ítem pendiente ── */
function Item({ icon, label, value, accent }) {
  return (
    <div className={`flex items-center gap-3 border-l-2 bg-ink-50 p-3 ${accent}`}>
      <div className="w-8 h-8 rounded-md border border-ink-200 bg-white flex items-center justify-center shrink-0 text-ink-700">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-ink-500 leading-none">{label}</p>
        <p className="text-xl font-bold text-ink-800 leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  )
}

const IconClipboard = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
)
const IconRefresh = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)
const IconCheck = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)
const IconClock = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconWarning = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

export default function WelcomeModal({ user, solicitudes, onClose }) {
  const isAdmin    = user?.is_admin
  const isRecreador = user?.is_recreador
  const isPromotor  = user?.is_promotor

  const data = useMemo(() => {
    const ahora    = new Date()
    const hoy      = toYMD(ahora)
    const ahoraHHMM = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`

    if (isAdmin) {
      const pendientes  = solicitudes.filter(s => s.estado === 'pendiente').length
      const porCorregir = solicitudes.filter(s => s.estado === 'por corregir').length
      return { pendientes, porCorregir }
    }

    if (isRecreador) {
      const porFinalizar = solicitudes.filter(s => {
        if (s.estado !== 'programado') return false
        const fin = new Date(`${s.fecha_evento}T${s.hora_fin}:00`)
        return ahora > fin
      })
      const hoyPendientes = solicitudes.filter(s =>
        s.estado === 'programado' &&
        s.fecha_evento === hoy &&
        s.hora_inicio >= ahoraHHMM
      )
      return { porFinalizar, hoyPendientes }
    }

    if (isPromotor) {
      const porCorregir = solicitudes.filter(s => s.estado === 'por corregir')
      return { porCorregir }
    }

    return {}
  }, [solicitudes, isAdmin, isRecreador, isPromotor])

  /* ── Contenido según rol ── */
  const renderContent = () => {
    if (isAdmin) {
      const hayAlgo = data.pendientes > 0 || data.porCorregir > 0
      return (
        <>
          {hayAlgo ? (
            <div className="space-y-2">
              {data.pendientes > 0 && (
                <Item icon={IconClipboard} label="Solicitudes pendientes de revisar" value={data.pendientes} accent="border-yellow-500" />
              )}
              {data.porCorregir > 0 && (
                <Item icon={IconRefresh} label="Solicitudes devueltas para corregir" value={data.porCorregir} accent="border-orange-500" />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-primary-700">
              <div className="w-12 h-12 rounded-md border border-ink-200 flex items-center justify-center mb-2 text-primary-700">
                {IconCheck}
              </div>
              <p className="font-bold text-base text-ink-800">Todo al día</p>
              <p className="text-sm text-ink-400 mt-1">No hay solicitudes pendientes en este momento.</p>
            </div>
          )}
        </>
      )
    }

    if (isRecreador) {
      const hayAlgo = data.porFinalizar?.length > 0 || data.hoyPendientes?.length > 0
      return (
        <>
          {hayAlgo ? (
            <div className="space-y-2">
              {data.porFinalizar?.length > 0 && (
                <Item icon={IconCheck} label="Actividades listas para finalizar" value={data.porFinalizar.length} accent="border-primary-700" />
              )}
              {data.hoyPendientes?.length > 0 && (
                <div className="border-l-2 border-blue-600 bg-ink-50 p-3">
                  <div className="flex items-center gap-2 mb-2 text-blue-700">
                    {IconClock}
                    <p className="text-xs font-semibold uppercase tracking-wide">Actividades de hoy por venir</p>
                  </div>
                  <div className="space-y-1 pl-1">
                    {data.hoyPendientes.slice(0, 3).map(s => (
                      <p key={s.id} className="text-xs text-ink-700 font-medium">
                        · {s.empresa} — {s.hora_inicio}
                      </p>
                    ))}
                    {data.hoyPendientes.length > 3 && (
                      <p className="text-xs text-ink-400">+{data.hoyPendientes.length - 3} más...</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-primary-700">
              <div className="w-12 h-12 rounded-md border border-ink-200 flex items-center justify-center mb-2 text-primary-700">
                {IconCheck}
              </div>
              <p className="font-bold text-base text-ink-800">Sin pendientes hoy</p>
              <p className="text-sm text-ink-400 mt-1">No tienes actividades urgentes por ahora.</p>
            </div>
          )}
        </>
      )
    }

    if (isPromotor) {
      return (
        <>
          {data.porCorregir?.length > 0 ? (
            <div className="space-y-2">
              <Item icon={IconWarning} label="Solicitudes devueltas para corregir" value={data.porCorregir.length} accent="border-orange-500" />
              <div className="border-l-2 border-orange-500 bg-ink-50 px-3 py-2 space-y-1">
                {data.porCorregir.slice(0, 3).map(s => (
                  <p key={s.id} className="text-xs text-ink-700 font-medium">
                    · {s.empresa} — {s.fecha_evento}
                  </p>
                ))}
                {data.porCorregir.length > 3 && (
                  <p className="text-xs text-ink-400">+{data.porCorregir.length - 3} más...</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-primary-700">
              <div className="w-12 h-12 rounded-md border border-ink-200 flex items-center justify-center mb-2 text-primary-700">
                {IconCheck}
              </div>
              <p className="font-bold text-base text-ink-800">Todo en orden</p>
              <p className="text-sm text-ink-400 mt-1">No tienes solicitudes devueltas por corregir.</p>
            </div>
          )}
        </>
      )
    }

    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        style={{ animation: 'welcomeIn .4s cubic-bezier(.22,1,.36,1)' }}
        className="bg-white rounded-md border border-ink-200 w-full max-w-sm overflow-hidden"
      >
        {/* Header */}
        <div className="bg-ink-900 border-b-2 border-accent-500 px-6 pt-6 pb-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-800 rounded-md flex items-center justify-center shrink-0 text-xl font-bold ring-1 ring-accent-500/40">
              {getInitials(user?.full_name || user?.username)}
            </div>
            <div>
              <p className="text-ink-300 text-sm font-medium">{greeting()},</p>
              <p className="text-white font-bold text-lg leading-tight">
                {user?.full_name?.split(' ')[0] || user?.username}
              </p>
              <p className="text-ink-400 text-xs mt-0.5 uppercase tracking-wide">
                {isAdmin ? 'Administrador' : isRecreador ? 'Recreador' : isPromotor ? 'Promotor' : 'Usuario'}
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-ink-300 font-medium">
            Aquí tienes un resumen de lo que te espera hoy.
          </p>
        </div>

        {/* Contenido */}
        <div className="px-5 py-4">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button onClick={onClose} className="btn-primary w-full">
            Continuar
          </button>
        </div>
      </div>
    </div>
  )
}
