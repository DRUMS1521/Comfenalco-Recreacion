import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import EmpresaModal from './EmpresaModal'

const PER_PAGE = 10

export default function EmpresasView() {
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [page, setPage] = useState(1)

  const fetchEmpresas = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/empresas/')
      setEmpresas(data)
      setPage(1)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEmpresas() }, [fetchEmpresas])

  const totalPages = Math.max(1, Math.ceil(empresas.length / PER_PAGE))
  const paginated = empresas.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <div>
          <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">
            {empresas.length} empresa{empresas.length !== 1 ? 's' : ''} registrada{empresas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary btn-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrar empresa
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : empresas.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-14 h-14 border border-ink-200 rounded-md flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-ink-700 font-semibold mb-1">Sin empresas registradas</h3>
          <p className="text-ink-400 text-sm mb-4">Registra la primera empresa para empezar</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Registrar empresa
          </button>
        </div>
      ) : (
        <>
          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">#</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Empresa</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">NIT</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">Registrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {paginated.map((emp, idx) => (
                  <tr key={emp.id} className="hover:bg-ink-50 transition-colors">
                    <td className="px-5 py-3.5 text-ink-400 text-xs font-mono">
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 border border-ink-200 rounded-md flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-primary-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <span className="font-semibold text-ink-800">{emp.nombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-ink-600 border border-ink-200 px-2.5 py-1 rounded-md text-xs">
                        {emp.nit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-ink-400 text-xs">
                      {new Date(emp.created_at).toLocaleDateString('es-CO', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-ink-100">
              <p className="text-xs text-ink-400">
                Página {page} de {totalPages}
              </p>
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

      {showModal && (
        <EmpresaModal
          onClose={() => setShowModal(false)}
          onSuccess={fetchEmpresas}
        />
      )}
    </>
  )
}
