import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfetti } from '../hooks/useConfetti'
import { useImage, useContainerSize, useGridLayout, useDownload, usePuzzleState, clearPuzzleStorage } from '../hooks/usePuzzle'
import { GameHeader, WinFooter } from '../components/PuzzleChrome'
import { clearPuzzleState, savePuzzleImage } from '../game/storage'
import {
  createBoard,
  isSolved,
  findEmpty,
  getSlideTargets,
  executeSlide,
  getDragGroup,
  getKeyboardTilePos,
  getEdgeTilePos,
  piecePos,
} from '../game/slide'

interface Props {
  imageUrl: string
  imageBlob: Blob
  hasSaved: boolean
  previewUrl: string
  previewBlob: Blob
  onBack: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

export function SlideScreen({ imageUrl: initialImageUrl, imageBlob: initialImageBlob, hasSaved, previewUrl, previewBlob, onBack, isFullscreen, onToggleFullscreen }: Props) {
  const [resumeSaved, setResumeSaved] = useState(hasSaved)
  const [showResumePrompt, setShowResumePrompt] = useState(hasSaved)
  const [activeImageUrl, setActiveImageUrl] = useState(initialImageUrl)
  const [activeImageBlob, setActiveImageBlob] = useState(initialImageBlob)
  const { config, board, won, moves, setBoard, setWon, setMoves, startNewPuzzle } = usePuzzleState('doodlebloom_slide', createBoard, resumeSaved)
  const image = useImage(activeImageUrl)

  // Save image blob to IDB on mount (for future resume)
  useEffect(() => {
    savePuzzleImage('slide', activeImageBlob).catch(() => undefined)
  }, [activeImageBlob])

  // Clear saved state on win
  useEffect(() => {
    if (won) clearPuzzleState('slide')
  }, [won])
  const containerRef = useRef<HTMLDivElement>(null)
  const containerSize = useContainerSize(containerRef)
  const gridLayout = useGridLayout(containerSize, config)
  const handleDownload = useDownload(image, 'doodlebloom-slide.png')
  const confetti = useConfetti()

  // Drag state
  const [dragPositions, setDragPositions] = useState<number[] | null>(null)
  const [dragAxis, setDragAxis] = useState<'x' | 'y' | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartRef = useRef<{ x: number; y: number; tilePos: number } | null>(null)
  const dragGroupRef = useRef<{ positions: number[]; dir: number } | null>(null)

  const emptyPos = findEmpty(board, config.cols, config.rows)
  const prevEmptyRef = useRef<number | null>(null)

  // Apply a move
  const doSlide = useCallback((clickedPos: number) => {
    const targets = getSlideTargets(clickedPos, emptyPos, config.cols)
    if (!targets) return
    const newBoard = executeSlide(board, clickedPos, emptyPos, config.cols)
    // If this move puts empty back where it was before the last move, undo the move count
    const isUndo = prevEmptyRef.current === clickedPos
    prevEmptyRef.current = isUndo ? null : emptyPos
    setBoard(newBoard)
    setMoves(m => m + (isUndo ? -1 : 1))
    if (isSolved(newBoard)) {
      setWon(true)
      setTimeout(confetti.fire, 100)
    }
  }, [board, emptyPos, config.cols, confetti.fire, setBoard, setMoves, setWon])

  // Keyboard controls
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key.toLowerCase()

      if (key === 'w') {
        const n = config.cols * config.rows
        setBoard(Array.from({ length: n }, (_, i) => i))
        setWon(true)
        setTimeout(confetti.fire, 100)
        return
      }

      if (won) return

      const dirMap: Record<string, number> = {
        arrowup: -config.cols, k: -config.cols,
        arrowdown: config.cols, j: config.cols,
        arrowleft: -1, h: -1,
        arrowright: 1, l: 1,
      }

      if (key in dirMap) {
        e.preventDefault()
        const direction = dirMap[key]
        if (e.shiftKey) {
          const edgePos = getEdgeTilePos(emptyPos, direction, config.cols, config.rows)
          if (edgePos !== null) doSlide(edgePos)
        } else {
          const tilePos = getKeyboardTilePos(emptyPos, direction, config.cols, config.rows)
          if (tilePos !== null) doSlide(tilePos)
        }
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [config, emptyPos, won, confetti.fire, doSlide, setBoard, setWon])

  const handleResume = useCallback(() => {
    setShowResumePrompt(false)
  }, [])

  const handleStartFresh = useCallback(() => {
    clearPuzzleStorage('doodlebloom_slide')
    setActiveImageUrl(previewUrl)
    setActiveImageBlob(previewBlob)
    startNewPuzzle(config)
    setShowResumePrompt(false)
  }, [startNewPuzzle, config, previewUrl, previewBlob])

  const handleStartNew = useCallback((preset: typeof config) => {
    startNewPuzzle(preset)
    setDragPositions(null)
    setDragAxis(null)
  }, [startNewPuzzle])

  // Pointer handlers for drag
  const handlePointerDown = useCallback((e: React.PointerEvent, cellIndex: number) => {
    if (won) return
    if (board[cellIndex] === config.cols * config.rows - 1) return
    e.preventDefault()
    containerRef.current?.setPointerCapture(e.pointerId)
    dragStartRef.current = { x: e.clientX, y: e.clientY, tilePos: cellIndex }
    dragGroupRef.current = null
    setDragAxis(null)
    setDragPositions(null)
    setDragOffset(0)
  }, [won, board, config])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || !gridLayout) return
    e.preventDefault()

    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    const tilePos = dragStartRef.current.tilePos
    let axis = dragAxis
    let group = dragGroupRef.current

    if (!axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      group = getDragGroup(tilePos, emptyPos, axis, config.cols)
      if (!group) {
        const altAxis = axis === 'x' ? 'y' : 'x'
        group = getDragGroup(tilePos, emptyPos, altAxis, config.cols)
        if (!group) return
        axis = altAxis
      }
      dragGroupRef.current = group
      setDragAxis(axis)
      setDragPositions(group.positions)
    }

    if (!group) return

    const rawOffset = axis === 'x' ? dx : dy
    const validOffset = rawOffset * group.dir
    const clampedValid = Math.max(0, Math.min(validOffset, gridLayout.cellSize))
    setDragOffset(clampedValid * group.dir)
  }, [dragAxis, emptyPos, config.cols, gridLayout])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return

    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    const tilePos = dragStartRef.current.tilePos

    if (!dragGroupRef.current || !dragAxis || !gridLayout) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) {
        doSlide(tilePos)
      }
      dragStartRef.current = null
      setDragPositions(null)
      setDragAxis(null)
      setDragOffset(0)
      return
    }

    const rawOffset = dragAxis === 'x' ? dx : dy
    const validOffset = rawOffset * dragGroupRef.current.dir

    if (validOffset > gridLayout.cellSize / 2) {
      doSlide(tilePos)
    }

    dragStartRef.current = null
    dragGroupRef.current = null
    setDragPositions(null)
    setDragAxis(null)
    setDragOffset(0)
  }, [dragAxis, gridLayout, doSlide])

  const ready = !!image && !!gridLayout
  const { gridW, gridH, cellSize } = gridLayout ?? { gridW: 0, gridH: 0, cellSize: 0 }
  const imgW = image?.naturalWidth ?? 0
  const imgH = image?.naturalHeight ?? 0
  const pieceSrcW = imgW / config.cols
  const pieceSrcH = imgH / config.rows
  const emptyVal = config.cols * config.rows - 1
  const dragSet = dragPositions ? new Set(dragPositions) : null

  return (
    <div className="screen game-screen puzzle-screen">
      <GameHeader
        onBack={onBack}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        moves={moves}
        config={config}
        onStartNewPuzzle={handleStartNew}
      />

      <div
        className="puzzle-container"
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {!ready && (
          <div className="loading">
            <div className="spinner" />
            <span>Loading image...</span>
          </div>
        )}
        {ready && <div
          className="slide-grid"
          style={{ width: gridW, height: gridH }}
        >
          {Array.from({ length: config.cols * config.rows }, (_, pieceId) => {
            const cellIndex = board.indexOf(pieceId)
            const isEmptyCell = pieceId === emptyVal
            const showEmpty = isEmptyCell && !won
            const col = cellIndex % config.cols
            const row = Math.floor(cellIndex / config.cols)
            const origPos = piecePos(pieceId, config.cols)

            let tx = 0, ty = 0
            const isTileDragging = dragSet?.has(cellIndex) ?? false
            if (isTileDragging && dragAxis) {
              if (dragAxis === 'x') tx = dragOffset
              else ty = dragOffset
            }

            return (
              <div
                key={pieceId}
                className={`slide-cell${showEmpty ? ' slide-cell-empty' : ''}${isTileDragging ? ' dragging' : ''}${won ? ' solved' : ''}${pieceId === cellIndex && !won ? ' correct' : ''}`}
                style={{
                  left: col * cellSize,
                  top: row * cellSize,
                  width: cellSize,
                  height: cellSize,
                  transform: isTileDragging ? `translate(${tx}px, ${ty}px)` : undefined,
                  zIndex: isTileDragging ? 100 : undefined,
                  transition: isTileDragging ? 'none' : 'left 0.15s ease-out, top 0.15s ease-out',
                }}
                onPointerDown={e => handlePointerDown(e, cellIndex)}
              >
                {!showEmpty && (
                  <>
                    <canvas
                      width={cellSize}
                      height={cellSize}
                      ref={canvas => {
                        if (!canvas) return
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        ctx.clearRect(0, 0, cellSize, cellSize)
                        ctx.drawImage(
                          image!,
                          origPos.col * pieceSrcW, origPos.row * pieceSrcH,
                          pieceSrcW, pieceSrcH,
                          0, 0,
                          cellSize, cellSize,
                        )
                      }}
                      style={{ display: 'block', width: '100%', height: '100%' }}
                    />
                    {!won && <span className="slide-number">{pieceId + 1}</span>}
                  </>
                )}
              </div>
            )
          })}
        </div>}
      </div>

      {won && <WinFooter moves={moves} onBack={onBack} onDownload={handleDownload} />}

      {showResumePrompt && (
        <div className="resume-overlay">
          <div className="resume-dialog">
            <p>Resume previous game?</p>
            <div className="resume-actions">
              <button className="btn btn-secondary" onClick={handleStartFresh}>Start New</button>
              <button className="btn btn-primary" onClick={handleResume}>Resume</button>
            </div>
          </div>
        </div>
      )}

      <div className="confetti-container" ref={confetti.ref} />
    </div>
  )
}
