import { useState, useEffect } from 'react'
import api from '../services/api'
import { notify } from '../utils/notify'
import TimePicker from './TimePicker'

export default function HoraExtraManualModal({ registro, recreadores, onClose, onSaved }) {
  const isEdit = !!registro
  const [form, setForm] = useState({
    recreador_id: registro?.recreador_id || '',
    fecha: registro?.fecha || '',
    empresa: registro?.empresa || '',
    hora_inicio: registro?.hora_inicio || '',
    hora_fin: registro?.hora_fin || '',
    tipo: registro?.tipo || 'ordinaria',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (registro) {
      setForm({
        recreador_id: registro.recreador_id,
        fecha: registro.fecha,
        empresa: registro.empresa,
        hora_inicio: registro.hora_inicio,
        hora_fin: registro.hora_fin,
        tipo: registro.tipo,
      })
    }
  }, [registro])

  const validate = () => {
    const e = {}
    if (!isEdit && !form.recreador_id) e.recreador_id = 'Selecciona un recreador'
    if (!form.fecha) e.fecha = 'Requerido'
    if (!form.empresa.trim()) e.empresa = 'Requerido'
    if (!form.hora_inicio) e.hora_inicio = 'Requerido'
    if (!form.hora_fin) e.hora_fin = 'Requerido'
    if (form.hora_inicio && form.hora_fin && form.hora_fin <= form.hora_inicio) {
      e.hora_fin = 'La hora de fin debe ser mayor a la de inicio'
    }
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      notify.error('Completa los campos obligatorios')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await api.put(`/horas-extra/manuales/${registro.id}`, {
          fecha: form.fecha,
          empresa: form.empresa,
          hora_inicio: form.hora_inicio,
          hora_fin: form.hora_fin,
          tipo: form.tipo,
        })
        notify.success('Registro actualizado')
      } else {
        await api.post('/horas-extra/manuales', {
          recreador_id: Number(form.recreador_id),
          fecha: form.fecha,
          empresa: form.empresa,
          hora_inicio: form.hora_inicio,
          hora_fin: form.hora_fin,
          tipo: form.tipo,
        })
        notify.success('Registro creado')
      }
      onSaved?.()
      onClose()
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Error al guardar el registro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="relative bg-white rounded-md border border-ink-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-ink-900 border-b-2 border-accent-500 px-5 py-4">
          <h2 className="text-white font-bold text-base">
            {isEdit ? 'Editar horas extra' : 'Nuevo registro de horas extra'}
          </h2>
          <p className="text-ink-300 text-xs mt-0.5">
            {isEdit ? 'Modifica los datos del registro manual' : 'Registro manual independiente de solicitudes'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isEdit && (
            <div>
              <label className="field-label">Recreador *</label>
              <select
                value={form.recreador_id}
                onChange={(e) => setForm({ ...form, recreador_id: e.target.value })}
                className={`field-select ${errors.recreador_id ? 'border-red-500 focus:border-red-600 focus:ring-red-600' : ''}`}
              >
                <option value="">Selecciona un recreador...</option>
                {recreadores.map((r) => (
                  <option key={r.id} value={r.id}>{r.full_name || r.username}</option>
                ))}
              </select>
              {errors.recreador_id && <p className="text-red-700 text-xs mt-1">{errors.recreador_id}</p>}
            </div>
          )}

          <div>
            <label className="field-label">Fecha *</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className={`field-input ${errors.fecha ? 'border-red-500 focus:border-red-600 focus:ring-red-600' : ''}`}
            />
            {errors.fecha && <p className="text-red-700 text-xs mt-1">{errors.fecha}</p>}
          </div>

          <div>
            <label className="field-label">Empresa *</label>
            <input
              type="text"
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              placeholder="Nombre de la empresa"
              className={`field-input ${errors.empresa ? 'border-red-500 focus:border-red-600 focus:ring-red-600' : ''}`}
            />
            {errors.empresa && <p className="text-red-700 text-xs mt-1">{errors.empresa}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Hora de inicio *</label>
              <TimePicker
                value={form.hora_inicio}
                hasError={!!errors.hora_inicio}
                onChange={(v) => { setForm((prev) => ({ ...prev, hora_inicio: v })); setErrors((prev) => ({ ...prev, hora_inicio: undefined })) }}
              />
              {errors.hora_inicio && <p className="text-red-700 text-xs mt-1">{errors.hora_inicio}</p>}
            </div>
            <div>
              <label className="field-label">Hora de fin *</label>
              <TimePicker
                value={form.hora_fin}
                hasError={!!errors.hora_fin}
                onChange={(v) => { setForm((prev) => ({ ...prev, hora_fin: v })); setErrors((prev) => ({ ...prev, hora_fin: undefined })) }}
              />
              {errors.hora_fin && <p className="text-red-700 text-xs mt-1">{errors.hora_fin}</p>}
            </div>
          </div>

          <div>
            <label className="field-label">Tipo *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'ordinaria', label: 'Horas Extras Ordinarias' },
                { value: 'festiva', label: 'Horas Extras Dominicales/Festivas' },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, tipo: t.value })}
                  className={`text-left px-3 py-2.5 rounded-md border text-xs font-medium transition-colors ${
                    form.tipo === t.value
                      ? 'border-primary-800 bg-primary-50 text-primary-800'
                      : 'border-ink-200 text-ink-600 hover:border-ink-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Guardando...</>
              ) : isEdit ? 'Guardar cambios' : 'Crear registro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
