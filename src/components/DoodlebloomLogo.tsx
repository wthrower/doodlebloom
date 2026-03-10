function Lavender({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const n = 12
  return (
    <g filter="url(#flower-outline)">
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={`o${i}`}
          cx={cx} cy={cy - r * 0.52} rx={r * 0.24} ry={r * 0.5}
          fill="#fce7f3" stroke="#f9a8d4" strokeWidth="0.5"
          transform={`rotate(${i * 360 / n}, ${cx}, ${cy})`}
        />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={`i${i}`}
          cx={cx} cy={cy - r * 0.38} rx={r * 0.18} ry={r * 0.36}
          fill="#d6cafe"
          transform={`rotate(${i * 360 / n + 360 / n / 2}, ${cx}, ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.28} fill="#fcd357" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
    </g>
  )
}

function Daisy({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const n = 12
  return (
    <g filter="url(#flower-outline)">
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i}
          cx={cx} cy={cy - r * 0.55} rx={r * 0.22} ry={r * 0.5}
          fill="white" stroke="#e8b4b8" strokeWidth="0.4"
          transform={`rotate(${i * 360 / n}, ${cx}, ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.28} fill="#fcd357" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
    </g>
  )
}

export function DoodlebloomMini() {
  const n = 12
  const cx = 12, cy = 12, r = 10
  return (
    <svg className="app-title-mini" overflow="visible" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <filter id="flower-outline-mini" x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology operator="dilate" radius="0.4" in="SourceAlpha" result="dilated" />
          <feFlood floodColor="#1a0f00" result="color" />
          <feComposite in="color" in2="dilated" operator="in" result="outline" />
          <feMerge>
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#flower-outline-mini)">
        {Array.from({ length: n }, (_, i) => (
          <ellipse key={i}
            cx={cx} cy={cy - r * 0.55} rx={r * 0.22} ry={r * 0.5}
            fill="white" stroke="#e8b4b8" strokeWidth="0.4"
            transform={`rotate(${i * 360 / n}, ${cx}, ${cy})`}
          />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.28} fill="#fcd357" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
      </g>
    </svg>
  )
}

export function DoodlebloomLogo() {
  const textProps = {
    fontFamily: 'Acme, sans-serif',
    fontSize: 40,
    fill: 'url(#title-gradient)',
    stroke: 'black',
    strokeWidth: 2,
    paintOrder: 'stroke fill' as const,
  }

  return (
    <svg className="app-title" overflow="visible" height="3rem" viewBox="0 0 228 50" aria-hidden="true">
      <defs>
        <linearGradient id="title-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffc49a" />
          <stop offset="50%" stopColor="#f9a8d4" />
          <stop offset="100%" stopColor="#86efac" />
        </linearGradient>
        <filter id="flower-outline" x="-15%" y="-15%" width="130%" height="130%">
          <feMorphology operator="dilate" radius="0.6" in="SourceAlpha" result="dilated" />
          <feFlood floodColor="#1a0f00" result="color" />
          <feComposite in="color" in2="dilated" operator="in" result="outline" />
          <feMerge>
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="drop-shadow(0 2px 6px rgba(40,100,50,0.4))">
        {/* Text segments (behind flowers) */}
        <text x="0" y="38" {...textProps}>D</text>
        <text x="65" y="38" {...textProps}>dlebl</text>
        <text x="183" y="38" {...textProps}>m</text>
        {/* Flowers on top, overlapping adjacent letters */}
        <Lavender cx={34} cy={28} r={12} />
        <Lavender cx={55} cy={28} r={12} />
        <Daisy cx={151} cy={28} r={12} />
        <Daisy cx={172} cy={28} r={12} />
      </g>
    </svg>
  )
}
