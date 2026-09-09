import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import ViaticoDetailModal from './ViaticoDetailModal'

const PER_PAGE = 10

const ESTADO_CLS = {
  aprobado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  pendiente: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  rechazado: 'bg-red-50 text-red-700 border-red-200',
}

function estadoClase(estado) {
  const key = (estado || '').trim().toLowerCase()
  return ESTADO_CLS[key] || 'bg-ink-50 text-ink-600 border-ink-200'
}

export default function ViaticosView() {
  const [viaticos, setViaticos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [detalle, setDetalle] = useState(null)

  const fetchViaticos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/viaticos/')
      setViaticos(data)
      setPage(1)
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo cargar el registro de viáticos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchViaticos() }, [fetchViaticos])

  const totalPages = Math.max(1, Math.ceil(viaticos.length / PER_PAGE))
  const paginated = viaticos.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <div>
          <h2 className="text-ink-800 font-bold text-base">Mis Viáticos</h2>
          <p className="text-xs text-ink-400 mt-0.5">
            {loading ? 'Cargando…' : `${viaticos.length} registro${viaticos.length !== 1 ? 's' : ''} en Argus`}
          </p>
        </div>
        <button onClick={fetchViaticos} className="btn-secondary btn-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : error ? (
        <div className="text-center py-16 px-4">
          <div className="w-14 h-14 border border-red-200 bg-red-50 rounded-md flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-ink-700 font-semibold mb-1">No se pudo cargar el registro</h3>
          <p className="text-ink-400 text-sm mb-4 max-w-md mx-auto">{error}</p>
          <button onClick={fetchViaticos} className="btn-primary">Reintentar</button>
        </div>
      ) : viaticos.length === 0 ? (
        <div className="text-center py-16 px-4">
          <h3 className="text-ink-700 font-semibold mb-1">Sin viáticos registrados</h3>
          <p className="text-ink-400 text-sm">Argus no reporta solicitudes de viáticos todavía.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Código</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Motivo</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Fecha inicio</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Fecha fin</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {paginated.map((v, idx) => (
                  <tr
                    key={`${v.codigo}-${idx}`}
                    onClick={() => setDetalle(v)}
                    className="hover:bg-ink-50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 text-ink-500 text-xs font-mono">{v.codigo}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-ink-800">{v.motivo}</span>
                      {(v.ciudad_origen || v.ciudad_destino) && (
                        <p className="text-xs text-ink-400 mt-0.5">
                          {v.ciudad_origen || '—'} → {v.ciudad_destino || '—'}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-ink-600 text-xs">{v.fecha_inicio || '—'}</td>
                    <td className="px-5 py-3.5 text-ink-600 text-xs">{v.fecha_fin || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${estadoClase(v.estado)}`}>
                        {v.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-ink-100">
              <p className="text-xs text-ink-400">Página {page} de {totalPages}</p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs rounded-md border border-ink-200 text-ink-500
                    hover:bg-ink-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 text-xs rounded-md transition-colors font-semibold ${
                      p === page
                        ? 'bg-primary-800 text-white'
                        : 'border border-ink-200 text-ink-500 hover:bg-ink-100'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs rounded-md border border-ink-200 text-ink-500
                    hover:bg-ink-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {detalle && (
        <ViaticoDetailModal viatico={detalle} onClose={() => setDetalle(null)} />
      )}
    </>
  )
}
