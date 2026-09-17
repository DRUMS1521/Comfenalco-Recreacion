/**
 * Esqueletos de carga.
 *
 * Antes cada vista mostraba un spinner centrado que SUSTITUÍA al contenido: al
 * llegar los datos la página daba un salto de layout. Estos esqueletos copian la
 * silueta real de cada vista (filas, tabla, rejilla del calendario, tarjetas),
 * de modo que la transición a los datos es un cambio de contenido y no un salto.
 */

function Bloque({ className = '', ...props }) {
  return <div className={`skeleton ${className}`} {...props} />
}

/** Filas del listado de solicitudes (dot + dos líneas + acción a la derecha). */
export function SkeletonList({ rows = 6 }) {
  return (
    <div className="divide-y divide-ink-100" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 sm:px-5 py-3">
          <Bloque className="mt-1 h-2 w-2 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Bloque className="h-3.5 w-40" />
              <Bloque className="h-4 w-20" />
            </div>
            <Bloque className="h-3 w-64" />
            <Bloque className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Tabla genérica (horas extra, viáticos, usuarios). */
export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="overflow-hidden" aria-hidden="true">
      <div className="flex gap-4 border-b border-ink-200 bg-ink-50 px-5 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Bloque key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-ink-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-5 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Bloque key={c} className={`h-3.5 flex-1 ${c === 0 ? 'max-w-[220px]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Rejilla del cronograma semanal (7 columnas × filas de recreadores). */
export function SkeletonWeekGrid({ rows = 6 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="grid grid-cols-8 gap-2">
        <Bloque className="h-4" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Bloque key={i} className="h-4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid grid-cols-8 gap-2">
          <Bloque className="h-12" />
          {Array.from({ length: 7 }).map((_, c) => (
            <Bloque key={c} className="h-12" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Tarjetas de indicadores o de gráficos. */
export function SkeletonCards({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-ink-200 bg-white p-4 flex items-center gap-3">
          <Bloque className="h-8 w-8" />
          <div className="flex-1 space-y-2">
            <Bloque className="h-5 w-12" />
            <Bloque className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Bloque alto para gráficos (estadísticas). */
export function SkeletonChart({ className = 'h-64' }) {
  return (
    <div className={`rounded-md border border-ink-200 bg-white p-4 ${className}`} aria-hidden="true">
      <Bloque className="h-3.5 w-40 mb-4" />
      <div className="flex items-end gap-2 h-[calc(100%-2rem)]">
        {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
          <Bloque key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}
