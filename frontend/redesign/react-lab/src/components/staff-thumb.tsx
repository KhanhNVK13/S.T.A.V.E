const COLS = ["#121212", "#0f7b6c", "#7b3f7a"]

export function StaffThumb({ branches, merged, className = "h-11 w-20 rounded-md border bg-secondary" }: { branches: number; merged: boolean; className?: string }) {
  const lanes = Math.max(1, Math.min(3, branches))
  return (
    <svg viewBox="0 0 84 46" className={className} aria-hidden>
      {Array.from({ length: lanes }).map((_, l) => {
        const y = lanes === 1 ? 23 : 10 + l * (26 / (lanes - 1))
        const xs = l === 0 ? [8, 24, 40, 56, 72] : [36 + l * 4, 52 + l * 4]
        return (
          <g key={l}>
            <line x1="4" x2="80" y1={y} y2={y} stroke="#000" strokeOpacity=".18" />
            {xs.map((x, i) => (
              <circle key={i} cx={x} cy={y} r="3.2" fill={merged && l === 0 && i === 4 ? "#fff" : COLS[l]} stroke={COLS[l]} strokeWidth="1.5" />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
