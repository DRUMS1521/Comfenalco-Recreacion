import { useState } from 'react'
import api from '../services/api'
import { notify } from '../utils/notify'

export default function EmpresaModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ nombre: '', nit: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.nombre.trim()) e.nombre = 'Requerido'
    if (!form.nit.trim()) e.nit = 'Requerido'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      await api.post('/empresas/', form)
      notify.success('Empresa registrada correctamente')
      onSuccess()
      onClose()
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Error al registrar empresa')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = (field) =>
    `field-input ${errors[field] ? 'border-red-500 focus:border-red-600 focus:ring-red-600' : ''}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-ink-200 w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-800 rounded-md flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-ink-900 font-bold text-base leading-tight">Registrar Empresa</h2>
              <p className="text-ink-400 text-xs">Completa los datos de la empresa</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 transition-colors p-1 rounded-md hover:bg-ink-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="field-label">
              Nombre de la empresa <span className="text-red-700">*</span>
            </label>
            <input
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              placeholder="Ej: Seguros del Estado S.A."
              className={inputCls('nombre')}
            />
            {errors.nombre && <p className="text-red-700 text-xs mt-1">{errors.nombre}</p>}
          </div>

          <div>
            <label className="field-label">
              NIT <span className="text-red-700">*</span>
            </label>
            <input
              type="text"
              name="nit"
              value={form.nit}
              onChange={handleChange}
              placeholder="Ej: 900123456-7"
              className={inputCls('nit')}
            />
            {errors.nit && <p className="text-red-700 text-xs mt-1">{errors.nit}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Registrar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
