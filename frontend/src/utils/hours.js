/**
 * Utilidades de cálculo de horas/semana, centralizadas para evitar
 * duplicación entre EstadoModal, CalendarAdminView y CalendarRecreadorView.
 */

export const LIMITE_HORAS = 42

export function calcHours(inicio, fin) {
  if (!inicio || !fin) return 0
  const [h1, m1] = inicio.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
  return mins > 0 ? Math.max(mins / 60, 1) : 0
}

/** Dado un objeto Date, retorna el lunes de esa semana como objeto Date. */
export function getMondayOfDate(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function toYMD(d) {
  return d.toISOString().split('T')[0]
}
