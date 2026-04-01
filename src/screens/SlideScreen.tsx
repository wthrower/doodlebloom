import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePuzzleScreen, type PuzzleScreenProps } from '../hooks/usePuzzle'
import { PuzzleScreenShell } from '../components/PuzzleChrome'
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

export function SlideScreen(props: PuzzleScreenProps) {
  const p = usePuzzleScreen('slide', 'doodlebloom_slide', createBoard, 'doodlebloom-slide.png', props)
  const { config, board, won, moves, setBoard, setMoves, setWon, image, containerRef, gridLayout, confetti, startNewPuzzle } = p

  // Drag state
  const [dragPositions, setDragPositions] = useState<number[] | null>(null)
  const [dragAxis, setDragAxis] = useState<'x' | 'y' | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [suppressTransition, setSuppressTransition] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; tilePos: number } | null>(null)
  const dragGroupRef = useRef<{ positions: number[]; dir: number } | null>(null)

  const pieceToCell = useMemo(() => {
    const m = new Map<number, number>()
    board.forEach((pieceId, cellIndex) => m.set(pieceId, cellIndex))
    return m
  }, [board])

  const emptyPos = findEmpty(board, config.cols, config.rows)
  const prevEmptyRef = useRef<number | null>(null)

  const doSlide = useCallback((clickedPos: number) => {
    const targets = getSlideTargets(clickedPos, emptyPos, config.cols)
    if (!targets) return
    const newBoard = executeSlide(board, clickedPos, emptyPos, config.cols)
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
  }, [config, emptyPos, won, doSlide])

  const handleStartNew = useCallback((preset: typeof config) => {
    startNewPuzzle(preset)
    setDragPositions(null)
    setDragAxis(null)
  }, [startNewPuzzle])

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
  }, [won, board, config, containerRef])

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

    setSuppressTransition(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setSuppressTransition(false)))

    dragStartRef.current = null
    dragGroupRef.current = null
    setDragPositions(null)
    setDragAxis(null)
    setDragOffset(0)
  }, [dragAxis, gridLayout, doSlide])

  const { gridW, gridH, cellSize } = gridLayout ?? { gridW: 0, gridH: 0, cellSize: 0 }
  const imgW = image?.naturalWidth ?? 0
  const imgH = image?.naturalHeight ?? 0
  const pieceSrcW = imgW / config.cols
  const pieceSrcH = imgH / config.rows
  const emptyVal = config.cols * config.rows - 1
  const dragSet = dragPositions ? new Set(dragPositions) : null

  return (
    <PuzzleScreenShell
      className="puzzle-screen"
      modeLabel="Slide!"
      onBack={props.onBack}
      isFullscreen={props.isFullscreen}
      onToggleFullscreen={props.onToggleFullscreen}
      moves={moves}
      won={won}
      onDownload={p.handleDownload}
      containerRef={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ready={p.ready}
      showResumePrompt={p.showResumePrompt}
      onResume={p.handleResume}
      onStartFresh={p.handleStartFresh}
      confettiRef={confetti.ref}
    >
      <div
        className="slide-grid"
        style={{ width: gridW, height: gridH }}
      >
        {Array.from({ length: config.cols * config.rows }, (_, pieceId) => {
          const cellIndex = pieceToCell.get(pieceId)!
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
                transition: (dragSet || suppressTransition) ? 'none' : 'left 0.15s ease-out, top 0.15s ease-out',
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
      </div>
    </PuzzleScreenShell>
  )
}
