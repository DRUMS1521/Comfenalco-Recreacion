import { useState, useEffect } from 'react'
import api from '../services/api'
import { notify } from '../utils/notify'
import TimePicker from './TimePicker'

const TIPOS_PUBLICO = ['Infantil', 'Adultos', 'Adulto Mayor', 'Mixto', 'Juvenil', 'Empresarial']
const TIPOS_SERVICIO = [
  'Pausa Activa',
  'Cardio Rumba',
  'Recreación Corporativa',
  'Carrera de Observación',
  'Dance Ball Fit',
  'Rumba Kids',
  'Rumba Dorada',
  'Otro',
]

const initialForm = {
  empresa: '',
  fecha_evento: '',
  hora_inicio: '',
  hora_fin: '',
  ciudad: '',
  direccion: '',
  cantidad_recreadores: '',
  cantidad_personas: '',
  tipo_publico: '',
  tipo_servicio: '',
  contacto: '',
  telefono_email: '',
  telefono_email_2: '',
  observaciones: '',
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="field-label">
        {label} {required && <span className="text-red-700">*</span>}
      </label>
      {children}
      {error && <p className="text-red-700 text-xs mt-1">{error}</p>}
    </div>
  )
}

export default function SolicitudModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [empresas, setEmpresas] = useState([])

  useEffect(() => {
    api.get('/empresas/').then(({ data }) => setEmpresas(data)).catch(() => {})
  }, [])

  const inputCls = (field) =>
    `field-input ${errors[field] ? 'border-red-500 focus:border-red-600 focus:ring-red-600' : ''}`

  const validate = () => {
    const e = {}
    if (!form.empresa.trim()) e.empresa = 'Requerido'
    if (!form.fecha_evento) e.fecha_evento = 'Requerido'
    if (!form.hora_inicio) e.hora_inicio = 'Requerido'
    if (!form.hora_fin) e.hora_fin = 'Requerido'
    if (form.hora_inicio && form.hora_fin && form.hora_fin <= form.hora_inicio)
      e.hora_fin = 'La hora de fin debe ser mayor a la de inicio'
    if (!form.ciudad.trim()) e.ciudad = 'Requerido'
    if (!form.direccion.trim()) e.direccion = 'Requerido'
    if (!form.cantidad_recreadores || Number(form.cantidad_recreadores) <= 0)
      e.cantidad_recreadores = 'Debe ser mayor a 0'
    if (!form.cantidad_personas || Number(form.cantidad_personas) <= 0)
      e.cantidad_personas = 'Debe ser mayor a 0'
    if (!form.tipo_publico) e.tipo_publico = 'Requerido'
    if (!form.tipo_servicio) e.tipo_servicio = 'Requerido'
    if (!form.contacto.trim()) e.contacto = 'Requerido'
    if (!form.telefono_email.trim()) e.telefono_email = 'Requerido'
    return e
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      notify.error('Completa los campos obligatorios')
      return
    }
    setLoading(true)
    try {
      await api.post('/solicitudes/', {
        ...form,
        cantidad_recreadores: Number(form.cantidad_recreadores),
        cantidad_personas: Number(form.cantidad_personas),
      })
      notify.success('¡Solicitud enviada exitosamente!')
      onSuccess?.()
      onClose()
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Error al enviar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="modal-overlay items-end sm:items-center p-0 sm:p-4">
      <div className="bg-white rounded-t-md sm:rounded-md border border-ink-200 w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-ink-900 border-b-2 border-accent-500 rounded-t-md px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-bold text-base sm:text-lg">Solicitar Servicio de Recreación</h2>
            <p className="text-ink-300 text-xs sm:text-sm">Complete todos los campos requeridos</p>
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-white p-2 sm:p-1 -m-1 rounded-md hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Empresa */}
            <div className="sm:col-span-2">
              <Field label="Empresa solicitante" required error={errors.empresa}>
                <select name="empresa" value={form.empresa} onChange={handleChange} className={inputCls('empresa')}>
                  <option value="">Selecciona una empresa...</option>
                  {empresas.map(e => (
                    <option key={e.id} value={e.nombre}>{e.nombre}</option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Fecha */}
            <Field label="Fecha del evento" required error={errors.fecha_evento}>
              <input type="date" name="fecha_evento" value={form.fecha_evento} onChange={handleChange}
                min={today} className={inputCls('fecha_evento')} />
            </Field>

            {/* Hora inicio */}
            <Field label="Hora de inicio" required error={errors.hora_inicio}>
              <TimePicker
                value={form.hora_inicio}
                hasError={!!errors.hora_inicio}
                onChange={v => {
                  setForm(prev => ({ ...prev, hora_inicio: v }))
                  if (errors.hora_inicio) setErrors(prev => ({ ...prev, hora_inicio: undefined }))
                }}
              />
            </Field>

            {/* Hora fin */}
            <Field label="Hora de finalización" required error={errors.hora_fin}>
              <TimePicker
                value={form.hora_fin}
                hasError={!!errors.hora_fin}
                onChange={v => {
                  setForm(prev => ({ ...prev, hora_fin: v }))
                  if (errors.hora_fin) setErrors(prev => ({ ...prev, hora_fin: undefined }))
                }}
              />
            </Field>

            {/* Ciudad */}
            <Field label="Ciudad" required error={errors.ciudad}>
              <input type="text" name="ciudad" value={form.ciudad} onChange={handleChange}
                placeholder="Ej: Ibagué" className={inputCls('ciudad')} />
            </Field>

            {/* Dirección */}
            <Field label="Dirección del evento" required error={errors.direccion}>
              <input type="text" name="direccion" value={form.direccion} onChange={handleChange}
                placeholder="Calle, barrio, instalación..." className={inputCls('direccion')} />
            </Field>

            {/* Cantidad recreadores */}
            <Field label="Cantidad de recreadores" required error={errors.cantidad_recreadores}>
              <input type="number" name="cantidad_recreadores" value={form.cantidad_recreadores}
                onChange={handleChange} min="1" placeholder="Ej: 2" className={inputCls('cantidad_recreadores')} />
            </Field>

            {/* Cantidad personas */}
            <Field label="Cantidad de personas" required error={errors.cantidad_personas}>
              <input type="number" name="cantidad_personas" value={form.cantidad_personas}
                onChange={handleChange} min="1" placeholder="Ej: 50" className={inputCls('cantidad_personas')} />
            </Field>

            {/* Tipo público */}
            <Field label="Tipo de público" required error={errors.tipo_publico}>
              <select name="tipo_publico" value={form.tipo_publico} onChange={handleChange} className={inputCls('tipo_publico')}>
                <option value="">Seleccionar...</option>
                {TIPOS_PUBLICO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            {/* Tipo servicio */}
            <Field label="Tipo de servicio" required error={errors.tipo_servicio}>
              <select name="tipo_servicio" value={form.tipo_servicio} onChange={handleChange} className={inputCls('tipo_servicio')}>
                <option value="">Seleccionar...</option>
                {TIPOS_SERVICIO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            {/* Contacto */}
            <Field label="Persona de contacto" required error={errors.contacto}>
              <input type="text" name="contacto" value={form.contacto} onChange={handleChange}
                placeholder="Nombre completo" className={inputCls('contacto')} />
            </Field>

            {/* Teléfono/email */}
            <Field label="Teléfono o email" required error={errors.telefono_email}>
              <input type="text" name="telefono_email" value={form.telefono_email} onChange={handleChange}
                placeholder="3XX XXX XXXX o correo" className={inputCls('telefono_email')} />
            </Field>

            {/* Teléfono/email 2 (opcional) */}
            <Field label="Teléfono o email adicional" error={errors.telefono_email_2}>
              <input type="text" name="telefono_email_2" value={form.telefono_email_2} onChange={handleChange}
                placeholder="Opcional" className={inputCls('telefono_email_2')} />
            </Field>

            {/* Observaciones */}
            <div className="sm:col-span-2">
              <Field label="Observaciones" error={errors.observaciones}>
                <textarea name="observaciones" value={form.observaciones} onChange={handleChange}
                  rows={3} placeholder="Información adicional relevante para el evento..."
                  className="field-input resize-none" />
              </Field>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} disabled={loading} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Enviando...</>
              ) : 'Enviar Solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
