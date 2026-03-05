interface Props {
  imageUrl: string | null
  onNewPuzzle: () => void
}

export function WinScreen({ imageUrl, onNewPuzzle }: Props) {
  return (
    <div className="screen win-screen">
      <div className="win-confetti" aria-hidden="true">
        {['🌸', '🌼', '🌺', '🌻', '🎉', '✨'].map((emoji, i) => (
          <span key={i} className="confetti-piece" style={{ '--i': i } as React.CSSProperties}>
            {emoji}
          </span>
        ))}
      </div>
      <h2 className="win-title">You did it!</h2>
      {imageUrl && (
        <div className="win-reveal">
          <p className="win-subtitle">Here's the original</p>
          <img src={imageUrl} alt="Original" className="win-image" />
        </div>
      )}
      <button className="btn btn-primary btn-large" onClick={onNewPuzzle}>
        New puzzle
      </button>
    </div>
  )
}
