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

/** Dado un "YYYY-MM-DD", retorna el lunes de esa semana como "YYYY-MM-DD". */
export function getMondayOfStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date.toISOString().split('T')[0]
}

/** Dado el lunes ("YYYY-MM-DD"), retorna los 7 días de esa semana como strings. */
export function getWeekDaysFromMonday(monday) {
  const [y, m, d] = monday.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + i)
    return date.toISOString().split('T')[0]
  })
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
