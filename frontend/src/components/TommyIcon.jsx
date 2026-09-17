/**
 * Icono moderno de Tommy (SVG en línea).
 *
 * Diseño plano con brillo, en la paleta institucional: verde de Comfenalco,
 * dorado de acento y la cara color arena. Al ser vectorial se ve nítido en
 * cualquier tamaño y se puede animar (parpadeo y puntos de "escribiendo").
 */
export default function TommyIcon({ size = 64, glow = true, animado = true, className = '' }) {
  return (
    <svg viewBox="0 0 128 128" width={size} height={size} className={className}
      role="img" aria-label="Tommy">
      <defs>
        <radialGradient id="tmBadge" cx="50%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#2f9a5d" />
          <stop offset="55%" stopColor="#1a6b3a" />
          <stop offset="100%" stopColor="#0d3520" />
        </radialGradient>
        <linearGradient id="tmCara" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdf6ea" />
          <stop offset="100%" stopColor="#e6d4b8" />
        </linearGradient>
        <linearGradient id="tmCresta" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0a24a" />
          <stop offset="100%" stopColor="#cdac70" />
        </linearGradient>
        <radialGradient id="tmGlow" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#cdac70" stopOpacity="0" />
          <stop offset="82%" stopColor="#cdac70" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#cdac70" stopOpacity="0" />
        </radialGradient>
      </defs>

      {glow && <circle cx="64" cy="64" r="63" fill="url(#tmGlow)" />}

      {/* Insignia */}
      <circle cx="64" cy="64" r="54" fill="url(#tmBadge)" />
      <circle cx="64" cy="64" r="54" fill="none" stroke="#cdac70" strokeOpacity="0.38" strokeWidth="1.4" />
      <circle cx="64" cy="64" r="48" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="6" />


      {/* Cara */}
      <circle cx="64" cy="72" r="34" fill="url(#tmCara)" />
      <circle cx="64" cy="72" r="34" fill="none" stroke="#0d3520" strokeOpacity="0.12" strokeWidth="1.5" />

      {/* Auriculares */}
      <path d="M26 66 q0 -36 38 -36 q38 0 38 36" fill="none" stroke="#0d3520" strokeWidth="7.5"
        strokeLinecap="round" />
      <g>
        <path d="M64 14 q5 7 0 15 q-5 -8 0 -15 z" fill="#f0a24a" />
        <path d="M51 19 q6 6 3 13 q-7 -5 -3 -13 z" fill="url(#tmCresta)" />
        <path d="M77 19 q-6 6 -3 13 q7 -5 3 -13 z" fill="url(#tmCresta)" />
      </g>
      <rect x="18" y="58" width="17" height="27" rx="8" fill="#0d3520" />
      <rect x="93" y="58" width="17" height="27" rx="8" fill="#0d3520" />
      <circle cx="26.5" cy="71.5" r="4.2" fill="#cdac70" />
      <circle cx="101.5" cy="71.5" r="4.2" fill="#cdac70" />
      <path d="M31 82 q3 17 17 18" fill="none" stroke="#0d3520" strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx="52" cy="100" rx="4.4" ry="3" fill="#0d3520" transform="rotate(-12 52 100)" />

      {/* Ojos */}
      <g className={animado ? 'tm-ojo' : ''}>
        <ellipse cx="51" cy="67" rx="6.6" ry="8.2" fill="#15201a" />
        <ellipse cx="77" cy="67" rx="6.6" ry="8.2" fill="#15201a" />
        <circle cx="48.8" cy="63.4" r="2.4" fill="#ffffff" />
        <circle cx="74.8" cy="63.4" r="2.4" fill="#ffffff" />
      </g>

      {/* Pico y sonrisa */}
      <path d="M64 76 q7 0 7 5 q0 8 -7 8 q-7 0 -7 -8 q0 -5 7 -5 z" fill="#4a3f38" />
      <path d="M60 86 q4 4 8 0" fill="none" stroke="#f0a24a" strokeWidth="1.6" strokeLinecap="round" />

      {/* Bocadillo con los puntos de "escribiendo" */}
      <g>
        <rect x="82" y="10" width="38" height="25" rx="10" fill="#ffffff" />
        <path d="M92 35 l6 8 l6 -8 z" fill="#ffffff" />
        <circle cx="92" cy="22.5" r="2.7" fill="#1a6b3a" className={animado ? 'tm-punto tm-p1' : ''} />
        <circle cx="101" cy="22.5" r="2.7" fill="#1a6b3a" className={animado ? 'tm-punto tm-p2' : ''} />
        <circle cx="110" cy="22.5" r="2.7" fill="#1a6b3a" className={animado ? 'tm-punto tm-p3' : ''} />
      </g>
    </svg>
  )
}
