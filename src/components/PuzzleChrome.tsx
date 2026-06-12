import { useEffect } from 'react'
import type { ReactNode, RefObject } from 'react'
import { ArrowLeft, Download, Maximize2, Minimize2, X } from 'lucide-react'
import { DoodlebloomLogo, DoodlebloomMini } from './DoodlebloomLogo'

const IS_STANDALONE = typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as any).standalone)

interface GameHeaderProps {
  onBack: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  moves: number
  modeLabel?: string
}

export function GameHeader({ onBack, isFullscreen, onToggleFullscreen, moves, modeLabel }: GameHeaderProps) {
  return (
    <div className="game-header">
      <button className="btn btn-ghost btn-icon btn-small" onClick={onBack} title="Back" aria-label="Back">
        <ArrowLeft size={18} />
      </button>
      <div className="game-header-logo">
        <div className="title-block">
          <DoodlebloomLogo />
          <a className="sneakret-games" href="https://sneakret.com/games/">sneakret games</a>
        </div>
        {modeLabel && <span className="game-header-mode">{modeLabel}</span>}
      </div>
      <div className="game-header-mini">
        <DoodlebloomMini />
        {modeLabel && <span className="game-header-mode">{modeLabel}</span>}
      </div>
      <span className="puzzle-moves">{moves} moves</span>
      {!IS_STANDALONE && (
        <button className="btn btn-ghost btn-icon btn-small" onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      )}
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

interface ResumeDialogProps {
  onStartFresh: () => void
  onResume: () => void
  /** Dismiss without choosing (Esc / the X button). */
  onClose: () => void
}

export function ResumeDialog({ onStartFresh, onResume, onClose }: ResumeDialogProps) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [onClose])

  return (
    <div className="resume-overlay">
      <div className="resume-dialog">
        <button className="btn btn-ghost btn-icon btn-small modal-close" onClick={onClose} title="Close" aria-label="Close">
          <X size={16} />
        </button>
        <p>You have a game in progress.</p>
        <div className="resume-actions">
          <button className="btn btn-secondary" onClick={onStartFresh}>Start New</button>
          <button className="btn btn-primary" onClick={onResume}>Resume</button>
        </div>
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
  moves, won, onDownload,
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
        // Closing without choosing keeps the loaded saved game — same as Resume.
        <ResumeDialog onStartFresh={onStartFresh} onResume={onResume} onClose={onResume} />
      )}

      <div className="confetti-container" ref={confettiRef} />
    </div>
  )
}
