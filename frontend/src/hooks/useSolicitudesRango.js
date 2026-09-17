import { useState, useEffect } from 'react'
import api from '../services/api'

/**
 * Carga las solicitudes de un rango de fechas cerrado desde el servidor.
 *
 * Los calendarios recibían antes la lista COMPLETA de solicitudes (6 MB con los
 * datos migrados del cronograma) y filtraban en el navegador. Ahora cada vista
 * pide únicamente su semana o su mes, y el servidor aplica el alcance por rol
 * (el recreador solo recibe lo suyo) y el filtro de administrativas.
 */
export default function useSolicitudesRango(desde, hasta) {
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!desde || !hasta) return
    let cancelado = false
    setCargando(true)
    setError(null)
    api.get('/solicitudes/', { params: { fecha_desde: desde, fecha_hasta: hasta } })
      .then(({ data }) => { if (!cancelado) setSolicitudes(data) })
      .catch((e) => {
        if (!cancelado) setError(e.response?.data?.detail || 'No se pudieron cargar las actividades')
      })
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [desde, hasta])

  return { solicitudes, cargando, error }
}
