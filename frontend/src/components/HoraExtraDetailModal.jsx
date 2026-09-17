import { formatHora } from '../utils/timeFormat'

const CATEGORIA_CONFIG = {
  ordinarias:        { label: 'Horas Ordinarias',                    cls: 'border-primary-700 text-primary-800' },
  recargo_nocturno:  { label: 'Recargo Nocturno',                    cls: 'border-purple-600 text-purple-800' },
  extra_ordinaria:   { label: 'Horas Extras Ordinarias',             cls: 'border-amber-600 text-amber-800' },
  extra_festiva:     { label: 'Horas Extras Dominicales/Festivas',   cls: 'border-red-600 text-red-800' },
}

function fmt(h) {
  return h % 1 === 0 ? String(h) : Number(h).toFixed(2)
}

export default function HoraExtraDetailModal({ fecha, registros = [], onClose }) {
  const totalDia = registros.reduce((sum, r) => sum + r.horas, 0)

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-md border border-ink-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-ink-900 border-b-2 border-accent-500 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">Detalle de horas</h2>
            <p className="text-ink-300 text-xs mt-0.5">{fecha} · {fmt(totalDia)}h en total</p>
          </div>
          <button onClick={onClose}
            className="text-ink-300 hover:text-white shrink-0 p-2 sm:p-1 -m-1 hover:bg-white/10 rounded-md transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {registros.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">Sin registros para este día</p>
          ) : (
            registros.map((r, i) => {
              const cfg = CATEGORIA_CONFIG[r.categoria] || { label: r.categoria, cls: 'border-ink-400 text-ink-600' }
              return (
                <div key={`${r.origen}-${r.id}-${r.categoria}-${i}`} className="border border-ink-200 rounded-md p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <span className="font-semibold text-ink-800 text-sm">{r.empresa}</span>
                    <span className={`badge-corp ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5">Horario</p>
                      <p className="text-sm text-ink-800 font-medium">
                        {formatHora(r.hora_inicio)} – {formatHora(r.hora_fin)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5">Horas</p>
                      <p className="text-sm text-ink-800 font-medium">{fmt(r.horas)}h</p>
                    </div>
                    {r.lugar && (
                      <div className="col-span-2">
                        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5">Lugar</p>
                        <p className="text-sm text-ink-800 font-medium break-words">{r.lugar}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-ink-100">
          <button onClick={onClose} className="btn-secondary w-full">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
