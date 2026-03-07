interface Option<T extends string | boolean> {
  value: T
  label: string
}

interface Props<T extends string | boolean> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}

export function PillToggle<T extends string | boolean>({ options, value, onChange, disabled }: Props<T>) {
  const currentIndex = options.findIndex(o => o.value === value)
  const pct = 100 / options.length

  const cycle = () => {
    if (!disabled) onChange(options[(currentIndex + 1) % options.length].value)
  }

  return (
    <div className="pill-toggle" onClick={cycle} role="button" aria-disabled={disabled}>
      <div
        className="pill-toggle-thumb"
        style={{ width: `${pct}%`, left: `${currentIndex * pct}%` }}
      />
      {options.map((opt, i) => (
        <span key={String(opt.value)} className={i === currentIndex ? 'active' : ''}>
          {opt.label}
        </span>
      ))}
    </div>
  )
}
