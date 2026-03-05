interface Props {
  imageUrl: string
  onPaint: () => void
  onTryAgain: () => void
}

export function PreviewScreen({ imageUrl, onPaint, onTryAgain }: Props) {
  return (
    <div className="screen preview-screen">
      <div className="preview-image-wrap">
        <img src={imageUrl} alt="Generated" className="preview-image" />
      </div>
      <div className="preview-actions">
        <button className="btn btn-primary btn-large" onClick={onPaint}>
          Paint this!
        </button>
        <button className="btn btn-ghost" onClick={onTryAgain}>
          Try again
        </button>
      </div>
    </div>
  )
}
