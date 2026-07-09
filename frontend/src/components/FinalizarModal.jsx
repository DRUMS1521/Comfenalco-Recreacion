import { useState } from 'react'
import { formatHora } from '../utils/timeFormat'

export default function FinalizarModal({ solicitud, onClose, onConfirm }) {
  const [observacion, setObservacion] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    await onConfirm(solicitud.id, observacion)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-md border border-ink-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-ink-900 border-b-2 border-accent-500 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-md flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Finalizar actividad</h2>
              <p className="text-ink-300 text-sm leading-tight mt-0.5 truncate">{solicitud.empresa}</p>
            </div>
          </div>
        </div>

        {/* Info del evento */}
        <div className="px-6 pt-5 pb-3">
          <div className="border border-ink-200 rounded-md px-4 py-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-ink-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {solicitud.fecha_evento}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-ink-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatHora(solicitud.hora_inicio)} – {formatHora(solicitud.hora_fin)}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-ink-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {solicitud.tipo_servicio}
            </span>
          </div>
        </div>

        {/* Observaciones */}
        <div className="px-6 py-3">
          <label className="field-label">
            Observaciones del servicio
            <span className="ml-1 text-ink-400 font-normal normal-case tracking-normal">(opcional)</span>
          </label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={4}
            placeholder="¿Cómo fue el evento? ¿Alguna novedad o comentario relevante?"
            className="field-input resize-none"
          />
        </div>

        {/* Acciones */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            Marcar como finalizada
          </button>
        </div>
      </div>
    </div>
  )
}
