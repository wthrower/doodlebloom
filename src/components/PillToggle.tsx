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
  return (
    <div className="pill-toggle">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
