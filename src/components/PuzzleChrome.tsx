import type { ReactNode, RefObject } from 'react'
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

interface PuzzleScreenShellProps {
  className: string
  modeLabel: string
  onBack: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  moves: number
  won: boolean
  config: PuzzleConfig
  onStartNewPuzzle: (preset: PuzzleConfig) => void
  onDownload: () => void
  containerRef: RefObject<HTMLDivElement | null>
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  ready: boolean
  showResumePrompt: boolean
  onResume: () => void
  onStartFresh: () => void
  confettiRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}

export function PuzzleScreenShell({
  className, modeLabel, onBack, isFullscreen, onToggleFullscreen,
  moves, won, config, onStartNewPuzzle, onDownload,
  containerRef, onPointerMove, onPointerUp, ready,
  showResumePrompt, onResume, onStartFresh, confettiRef,
  children,
}: PuzzleScreenShellProps) {
  return (
    <div className={`screen game-screen ${className}`}>
      <GameHeader
        onBack={onBack}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        moves={moves}
        config={config}
        onStartNewPuzzle={onStartNewPuzzle}
        modeLabel={modeLabel}
      />

      <div
        className="puzzle-container"
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!ready && (
          <div className="loading">
            <div className="spinner" />
            <span>Loading image...</span>
          </div>
        )}
        {ready && children}
      </div>

      {won && <WinFooter moves={moves} onBack={onBack} onDownload={onDownload} />}

      {showResumePrompt && (
        <div className="resume-overlay">
          <div className="resume-dialog">
            <p>Resume previous game?</p>
            <div className="resume-actions">
              <button className="btn btn-secondary" onClick={onStartFresh}>Start New</button>
              <button className="btn btn-primary" onClick={onResume}>Resume</button>
            </div>
          </div>
        </div>
      )}

      <div className="confetti-container" ref={confettiRef} />
    </div>
  )
}
