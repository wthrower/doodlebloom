import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Maximize2, Minimize2 } from 'lucide-react'
import { DoodlebloomLogo, DoodlebloomMini } from '../components/DoodlebloomLogo'
import { useConfetti } from '../hooks/useConfetti'
import {
  SIZE_PRESETS,
  createBoard,
  isSolved,
  buildGroups,
  getGroup,
  canDrop,
  executeSwap,
  getHiddenBorders,
  cellPos,
  piecePos,
  type JigswapConfig,
} from '../game/jigswap'

const LS_KEY = 'doodlebloom_jigswap'

interface JigswapState {
  board: number[]
  config: JigswapConfig
  moves: number
  won: boolean
  imageUrl: string
}

function loadJigswapState(imageUrl: string): JigswapState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as JigswapState
    if (saved.imageUrl !== imageUrl) return null
    return saved
  } catch { return null }
}

function saveJigswapState(state: JigswapState): void {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

interface Props {
  imageUrl: string
  onBack: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

export function JigswapScreen({ imageUrl, onBack, isFullscreen, onToggleFullscreen }: Props) {
  const saved = useRef(loadJigswapState(imageUrl)).current
  const [config, setConfig] = useState<JigswapConfig>(saved?.config ?? SIZE_PRESETS[1])
  const [board, setBoard] = useState<number[]>(() => saved?.board ?? createBoard(SIZE_PRESETS[1].cols, SIZE_PRESETS[1].rows))
  const [won, setWon] = useState(saved?.won ?? false)
  const [moves, setMoves] = useState(saved?.moves ?? 0)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const confetti = useConfetti()

  // Drag state
  const [dragGroup, setDragGroup] = useState<Set<number> | null>(null)
  const [dragCell, setDragCell] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const [dropTargetCells, setDropTargetCells] = useState<number[] | null>(null)

  // Persist state
  useEffect(() => {
    saveJigswapState({ board, config, moves, won, imageUrl })
  }, [board, config, moves, won, imageUrl])

  // Download handler
  const handleDownload = useCallback(() => {
    if (!image) return
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, 0, 0)
    const link = document.createElement('a')
    link.download = 'doodlebloom-jigswap.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [image])

  // Load image
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.src = imageUrl
  }, [imageUrl])

  // Track container size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Compute grid dimensions to fill container with margin
  const gridLayout = useMemo(() => {
    if (!containerSize.width || !containerSize.height) return null
    const { cols, rows } = config
    const aspect = cols / rows // width / height of grid
    const availW = containerSize.width
    const availH = containerSize.height

    let gridW: number, gridH: number
    if (availW / availH > aspect) {
      gridH = availH
      gridW = gridH * aspect
    } else {
      gridW = availW
      gridH = gridW / aspect
    }

    const cellSize = gridW / cols
    return { gridW, gridH, cellSize }
  }, [containerSize, config])

  // Derived: groups and hidden borders
  const groups = useMemo(() => buildGroups(board, config.cols, config.rows), [board, config])
  const hiddenBorders = useMemo(() => getHiddenBorders(board, config.cols, config.rows), [board, config])

  // Cheat key (w): solve instantly
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') {
        const n = config.cols * config.rows
        const solved = Array.from({ length: n }, (_, i) => i)
        setBoard(solved)
        setWon(true)
        setTimeout(confetti.fire, 100)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [config, confetti.fire])

  const startNewPuzzle = useCallback((preset: JigswapConfig) => {
    setConfig(preset)
    setBoard(createBoard(preset.cols, preset.rows))
    setWon(false)
    setMoves(0)
    setDragGroup(null)
    setDragCell(null)
    setDropTargetCells(null)
  }, [])


  // Pointer handlers for drag
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

    // Get grid element position
    const gridEl = containerRef.current?.querySelector('.jigswap-grid') as HTMLElement
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()

    setDragOffset({
      x: e.clientX - rect.left - cellX,
      y: e.clientY - rect.top - cellY,
    })
    setDragPos({ x: e.clientX, y: e.clientY })
  }, [won, groups, gridLayout, config.cols])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragGroup || dragCell === null || !gridLayout) return
    e.preventDefault()
    setDragPos({ x: e.clientX, y: e.clientY })

    // Determine where the drag cell would snap to
    const gridEl = containerRef.current?.querySelector('.jigswap-grid') as HTMLElement
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()

    // Where the drag cell's top-left would be, snapped to grid
    const snapCol = Math.round((e.clientX - rect.left - dragOffset.x) / gridLayout.cellSize)
    const snapRow = Math.round((e.clientY - rect.top - dragOffset.y) / gridLayout.cellSize)
    const dragCellOrig = cellPos(dragCell, config.cols)

    // If we haven't moved to a different snap position, no target
    if (snapCol === dragCellOrig.col && snapRow === dragCellOrig.row) {
      setDropTargetCells(null)
      return
    }

    // Compute the virtual drop cell index for the drag cell
    if (snapCol >= 0 && snapCol < config.cols && snapRow >= 0 && snapRow < config.rows) {
      const dropCellIndex = snapRow * config.cols + snapCol
      const targets = canDrop(dragCell, dropCellIndex, dragGroup, config.cols, config.rows)
      setDropTargetCells(targets)
    } else {
      setDropTargetCells(null)
    }
  }, [dragGroup, dragCell, gridLayout, config, dragOffset])

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
  }, [dragGroup, dragCell, dropTargetCells, board, confetti.fire])

  const ready = !!image && !!gridLayout
  const { gridW, gridH, cellSize } = gridLayout ?? { gridW: 0, gridH: 0, cellSize: 0 }
  const imgW = image?.naturalWidth ?? 0
  const imgH = image?.naturalHeight ?? 0
  const pieceSrcW = imgW / config.cols
  const pieceSrcH = imgH / config.rows

  return (
    <div className="screen game-screen jigswap-screen">
      <div className="game-header">
        <button className="btn btn-ghost btn-icon btn-small" onClick={onBack} title="Back" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="game-header-logo"><DoodlebloomLogo /></div>
        <div className="game-header-mini">
          <DoodlebloomMini />
        </div>
        <div className="jigswap-size-picker">
          {SIZE_PRESETS.map(p => (
            <button
              key={p.cols}
              className={`size-btn${p.cols === config.cols ? ' selected' : ''}`}
              onClick={() => startNewPuzzle(p)}
            >
              {p.cols}×{p.rows}
            </button>
          ))}
        </div>
        <span className="jigswap-moves">{moves} moves</span>
        <button className="btn btn-ghost btn-icon btn-small" onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

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
          className="jigswap-grid"
          style={{ width: gridW, height: gridH }}
        >
          {board.map((pieceId, cellIndex) => {
            const cellCol = cellIndex % config.cols
            const cellRow = Math.floor(cellIndex / config.cols)
            const origPos = piecePos(pieceId, config.cols)
            const isDragging = dragGroup?.has(cellIndex) ?? false
            const isDropTarget = dropTargetCells?.includes(cellIndex) ?? false

            // Compute drag transform: all group members move by the same delta
            let tx = 0, ty = 0
            if (isDragging && dragCell !== null && gridLayout) {
              const dragCellCol = dragCell % config.cols
              const dragCellRow = Math.floor(dragCell / config.cols)
              const gridEl = containerRef.current?.querySelector('.jigswap-grid') as HTMLElement
              if (gridEl) {
                const rect = gridEl.getBoundingClientRect()
                // Delta from the drag cell's original position
                tx = dragPos.x - rect.left - dragOffset.x - dragCellCol * cellSize
                ty = dragPos.y - rect.top - dragOffset.y - dragCellRow * cellSize
              }
            }

            // Border visibility
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
        </div>}

      </div>

      {won && (
        <div className="win-footer">
          <div className="win-footer-title">Solved in {moves} moves!</div>
          <div className="win-footer-actions">
            <button className="btn btn-secondary" onClick={onBack}>New puzzle</button>
            <button className="btn btn-primary" onClick={handleDownload}>
              <Download size={16} /> Download
            </button>
          </div>
        </div>
      )}

      <div className="confetti-container" ref={confetti.ref} />
    </div>
  )
}
