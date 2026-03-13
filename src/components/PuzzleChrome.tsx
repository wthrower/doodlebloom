import { ArrowLeft, Download, Maximize2, Minimize2 } from 'lucide-react'
import { DoodlebloomLogo, DoodlebloomMini } from './DoodlebloomLogo'
import { SIZE_PRESETS } from '../game/jigswap'
import type { PuzzleConfig } from '../hooks/usePuzzle'

interface GameHeaderProps {
  onBack: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  moves: number
  config: PuzzleConfig
  onStartNewPuzzle: (preset: PuzzleConfig) => void
  modeLabel?: string
}

export function GameHeader({ onBack, isFullscreen, onToggleFullscreen, moves, config, onStartNewPuzzle, modeLabel }: GameHeaderProps) {
  return (
    <div className="game-header">
      <button className="btn btn-ghost btn-icon btn-small" onClick={onBack} title="Back" aria-label="Back">
        <ArrowLeft size={18} />
      </button>
      <div className="game-header-logo">
        <DoodlebloomLogo />
        {modeLabel && <span className="game-header-mode">{modeLabel}</span>}
      </div>
      <div className="game-header-mini">
        <DoodlebloomMini />
        {modeLabel && <span className="game-header-mode">{modeLabel}</span>}
      </div>
      <div className="puzzle-size-picker">
        {SIZE_PRESETS.map(p => (
          <button
            key={p.cols}
            className={`size-btn${p.cols === config.cols ? ' selected' : ''}`}
            onClick={() => onStartNewPuzzle(p)}
          >
            {p.cols}&times;{p.rows}
          </button>
        ))}
      </div>
      <span className="puzzle-moves">{moves} moves</span>
      <button className="btn btn-ghost btn-icon btn-small" onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
    </div>
  )
}

interface WinFooterProps {
  moves: number
  onBack: () => void
  onDownload: () => void
}

export function WinFooter({ moves, onBack, onDownload }: WinFooterProps) {
  return (
    <div className="win-footer">
      <div className="win-footer-title">Solved in {moves} moves!</div>
      <div className="win-footer-actions">
        <button className="btn btn-secondary" onClick={onBack}>New puzzle</button>
        <button className="btn btn-primary" onClick={onDownload}>
          <Download size={16} /> Download
        </button>
      </div>
    </div>
  )
}
