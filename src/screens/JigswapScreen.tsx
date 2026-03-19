import { useCallback, useMemo, useState } from 'react'
import { usePuzzleScreen, type PuzzleScreenProps } from '../hooks/usePuzzle'
import { PuzzleScreenShell } from '../components/PuzzleChrome'
import {
  createBoard,
  isSolved,
  buildGroups,
  getGroup,
  canDrop,
  executeSwap,
  getHiddenBorders,
  cellPos,
  piecePos,
} from '../game/jigswap'

export function JigswapScreen(props: PuzzleScreenProps) {
  const p = usePuzzleScreen('jigswap', 'doodlebloom_jigswap', createBoard, 'doodlebloom-jigswap.png', props)
  const { config, board, won, moves, setBoard, setMoves, setWon, image, containerRef, gridLayout, confetti, startNewPuzzle } = p

  // Drag state
  const [dragGroup, setDragGroup] = useState<Set<number> | null>(null)
  const [dragCell, setDragCell] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const [dropTargetCells, setDropTargetCells] = useState<number[] | null>(null)

  const groups = useMemo(() => buildGroups(board, config.cols, config.rows), [board, config])
  const hiddenBorders = useMemo(() => getHiddenBorders(board, config.cols, config.rows), [board, config])

  const handleStartNew = useCallback((preset: typeof config) => {
    startNewPuzzle(preset)
    setDragGroup(null)
    setDragCell(null)
    setDropTargetCells(null)
  }, [startNewPuzzle])

  const handlePointerDown = useCallback((e: React.PointerEvent, cellIndex: number) => {
    if (won) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const group = getGroup(cellIndex, groups)
    setDragGroup(group)
    setDragCell(cellIndex)

    if (!gridLayout) return
    const cellCol = cellIndex % config.cols
    const cellRow = Math.floor(cellIndex / config.cols)
    const cellX = cellCol * gridLayout.cellSize
    const cellY = cellRow * gridLayout.cellSize

    const gridEl = containerRef.current?.querySelector('.jigswap-grid') as HTMLElement
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()

    setDragOffset({
      x: e.clientX - rect.left - cellX,
      y: e.clientY - rect.top - cellY,
    })
    setDragPos({ x: e.clientX, y: e.clientY })
  }, [won, groups, gridLayout, config.cols, containerRef])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragGroup || dragCell === null || !gridLayout) return
    e.preventDefault()
    setDragPos({ x: e.clientX, y: e.clientY })

    const gridEl = containerRef.current?.querySelector('.jigswap-grid') as HTMLElement
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()

    const snapCol = Math.round((e.clientX - rect.left - dragOffset.x) / gridLayout.cellSize)
    const snapRow = Math.round((e.clientY - rect.top - dragOffset.y) / gridLayout.cellSize)
    const dragCellOrig = cellPos(dragCell, config.cols)

    if (snapCol === dragCellOrig.col && snapRow === dragCellOrig.row) {
      setDropTargetCells(null)
      return
    }

    if (snapCol >= 0 && snapCol < config.cols && snapRow >= 0 && snapRow < config.rows) {
      const dropCellIndex = snapRow * config.cols + snapCol
      const targets = canDrop(dragCell, dropCellIndex, dragGroup, config.cols, config.rows)
      setDropTargetCells(targets)
    } else {
      setDropTargetCells(null)
    }
  }, [dragGroup, dragCell, gridLayout, config, dragOffset, containerRef])

  const handlePointerUp = useCallback(() => {
    if (dragGroup && dragCell !== null && dropTargetCells) {
      const sourceCells = [...dragGroup]
      const newBoard = executeSwap(board, sourceCells, dropTargetCells)
      setBoard(newBoard)
      setMoves(m => m + 1)
      if (isSolved(newBoard)) {
        setWon(true)
        setTimeout(confetti.fire, 100)
      }
    }
    setDragGroup(null)
    setDragCell(null)
    setDropTargetCells(null)
  }, [dragGroup, dragCell, dropTargetCells, board, confetti.fire, setBoard, setMoves, setWon])

  const { gridW, gridH, cellSize } = gridLayout ?? { gridW: 0, gridH: 0, cellSize: 0 }
  const imgW = image?.naturalWidth ?? 0
  const imgH = image?.naturalHeight ?? 0
  const pieceSrcW = imgW / config.cols
  const pieceSrcH = imgH / config.rows

  return (
    <PuzzleScreenShell
      className="jigswap-screen"
      modeLabel="JigSwap!"
      onBack={props.onBack}
      isFullscreen={props.isFullscreen}
      onToggleFullscreen={props.onToggleFullscreen}
      moves={moves}
      won={won}
      config={config}
      onStartNewPuzzle={handleStartNew}
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
        className="jigswap-grid"
        style={{ width: gridW, height: gridH }}
      >
        {board.map((pieceId, cellIndex) => {
          const cellCol = cellIndex % config.cols
          const cellRow = Math.floor(cellIndex / config.cols)
          const origPos = piecePos(pieceId, config.cols)
          const isDragging = dragGroup?.has(cellIndex) ?? false
          const isDropTarget = dropTargetCells?.includes(cellIndex) ?? false

          let tx = 0, ty = 0
          if (isDragging && dragCell !== null && gridLayout) {
            const dragCellCol = dragCell % config.cols
            const dragCellRow = Math.floor(dragCell / config.cols)
            const gridEl = containerRef.current?.querySelector('.jigswap-grid') as HTMLElement
            if (gridEl) {
              const rect = gridEl.getBoundingClientRect()
              tx = dragPos.x - rect.left - dragOffset.x - dragCellCol * cellSize
              ty = dragPos.y - rect.top - dragOffset.y - dragCellRow * cellSize
            }
          }

          const rightKey = `${cellIndex}-${cellIndex + 1}`
          const bottomKey = `${cellIndex}-${cellIndex + config.cols}`
          const leftKey = `${cellIndex - 1}-${cellIndex}`
          const topKey = `${cellIndex - config.cols}-${cellIndex}`

          const hideRight = cellCol < config.cols - 1 && hiddenBorders.has(rightKey)
          const hideBottom = cellRow < config.rows - 1 && hiddenBorders.has(bottomKey)
          const hideLeft = cellCol > 0 && hiddenBorders.has(leftKey)
          const hideTop = cellRow > 0 && hiddenBorders.has(topKey)

          return (
            <div
              key={cellIndex}
              className={`jigswap-piece${isDragging ? ' dragging' : ''}${isDropTarget ? ' drop-target' : ''}${won ? ' solved' : ''}`}
              style={{
                left: cellCol * cellSize,
                top: cellRow * cellSize,
                width: cellSize,
                height: cellSize,
                transform: isDragging ? `translate(${tx}px, ${ty}px)` : undefined,
                zIndex: isDragging ? 100 : undefined,
              }}
              onPointerDown={e => handlePointerDown(e, cellIndex)}
            >
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
              {!won && (
                <>
                  {!hideTop && <div className="piece-border piece-border-top" />}
                  {!hideRight && <div className="piece-border piece-border-right" />}
                  {!hideBottom && <div className="piece-border piece-border-bottom" />}
                  {!hideLeft && <div className="piece-border piece-border-left" />}
                </>
              )}
            </div>
          )
        })}
      </div>
    </PuzzleScreenShell>
  )
}
