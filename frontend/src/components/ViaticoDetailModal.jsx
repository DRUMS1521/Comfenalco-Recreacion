const ESTADO_CLS = {
  aprobado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  pendiente: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  rechazado: 'bg-red-50 text-red-700 border-red-200',
}

function estadoClase(estado) {
  const key = (estado || '').trim().toLowerCase()
  return ESTADO_CLS[key] || 'bg-ink-50 text-ink-600 border-ink-200'
}

function Campo({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
      <p className="text-sm text-ink-800">
        {value ?? <span className="text-ink-300 italic">No disponible en Argus</span>}
      </p>
    </div>
  )
}

export default function ViaticoDetailModal({ viatico, onClose }) {
  if (!viatico) return null
  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-md border border-ink-200 w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-ink-900 border-b-2 border-accent-500 px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-bold text-base">Detalle del viático</h3>
            <p className="text-ink-300 text-xs mt-0.5 font-mono">Código {viatico.codigo}</p>
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${estadoClase(viatico.estado)}`}>
              {viatico.estado}
            </span>
            <span className={`text-xs font-semibold ${viatico.legalizado ? 'text-emerald-600' : 'text-ink-400'}`}>
              {viatico.legalizado ? 'Legalizado' : 'Sin legalizar'}
            </span>
          </div>

          <Campo label="Motivo" value={viatico.motivo} />

          <div className="grid grid-cols-2 gap-4">
            <Campo label="Fecha inicio" value={viatico.fecha_inicio} />
            <Campo label="Fecha fin" value={viatico.fecha_fin} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Campo label="Ciudad origen" value={viatico.ciudad_origen} />
            <Campo label="Ciudad destino" value={viatico.ciudad_destino} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Campo label="Días" value={viatico.numero_dias} />
            <Campo label="N.° resolución" value={viatico.numero_resolucion} />
          </div>

          <Campo label="Comisión / detalle" value={viatico.descripcion_comision} />
          <Campo label="Hotel" value={viatico.hotel} />
          <Campo
            label="Valor total"
            value={viatico.valor_total != null ? `$ ${Number(viatico.valor_total).toLocaleString('es-CO')}` : null}
          />

          {viatico.url_detalle && (
            <a
              href={viatico.url_detalle}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full justify-center"
            >
              Ver detalle completo en Argus
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}

          <p className="text-xs text-ink-400 pt-2 border-t border-ink-100">
            Los campos marcados como "No disponible" no vienen en el resumen de esta página.
            {viatico.url_detalle && ' Para verlos, abre el detalle completo en Argus (necesitas tener sesión activa ahí en este navegador).'}
          </p>
        </div>
      </div>
    </div>
  )
}
