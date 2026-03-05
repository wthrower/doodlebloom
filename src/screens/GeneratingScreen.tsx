interface Props {
  onCancel: () => void
}

export function GeneratingScreen({ onCancel }: Props) {
  return (
    <div className="screen generating-screen">
      <div className="spinner" aria-label="Generating..." />
      <p className="generating-text">Painting your world...</p>
      <button className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
