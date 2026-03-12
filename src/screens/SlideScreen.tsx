import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Maximize2, Minimize2 } from 'lucide-react'
import { DoodlebloomLogo, DoodlebloomMini } from '../components/DoodlebloomLogo'
import { useConfetti } from '../hooks/useConfetti'
import {
  SIZE_PRESETS,
  createBoard,
  isSolved,
  findEmpty,
  getSlideTargets,
  executeSlide,
  getDragGroup,
  getKeyboardTilePos,
  getEdgeTilePos,
  cellPos,
  piecePos,
  type SlideConfig,
} from '../game/slide'

const LS_KEY = 'doodlebloom_slide'
const GAP = 0

interface SlideState {
  board: number[]
  config: SlideConfig
  moves: number
  won: boolean
  imageUrl: string
}

function loadSlideState(imageUrl: string): SlideState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as SlideState
    if (saved.imageUrl !== imageUrl) return null
    return saved
  } catch { return null }
}

function saveSlideState(state: SlideState): void {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

interface Props {
  imageUrl: string
  onBack: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

export function SlideScreen({ imageUrl, onBack, isFullscreen, onToggleFullscreen }: Props) {
  const saved = useRef(loadSlideState(imageUrl)).current
  const [config, setConfig] = useState<SlideConfig>(saved?.config ?? SIZE_PRESETS[1])
  const [board, setBoard] = useState<number[]>(() => saved?.board ?? createBoard(SIZE_PRESETS[1].cols, SIZE_PRESETS[1].rows))
  const [won, setWon] = useState(saved?.won ?? false)
  const [moves, setMoves] = useState(saved?.moves ?? 0)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const confetti = useConfetti()

  // Drag state
  const [dragPositions, setDragPositions] = useState<number[] | null>(null)
  const [dragAxis, setDragAxis] = useState<'x' | 'y' | null>(null)
  const [dragOffset, setDragOffset] = useState(0) // pixels along drag axis
  const dragStartRef = useRef<{ x: number; y: number; tilePos: number } | null>(null)
  const dragGroupRef = useRef<{ positions: number[]; dir: number } | null>(null)

  const emptyPos = findEmpty(board, config.cols, config.rows)

  // Persist state
  useEffect(() => {
    saveSlideState({ board, config, moves, won, imageUrl })
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
    link.download = 'doodlebloom-slide.png'
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

  // Compute grid dimensions
  const gridLayout = useMemo(() => {
    if (!containerSize.width || !containerSize.height) return null
    const { cols, rows } = config
    const aspect = cols / rows
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
    const tileSize = cellSize - GAP
    return { gridW, gridH, cellSize, tileSize }
  }, [containerSize, config])

  // Apply a move
  const doSlide = useCallback((clickedPos: number) => {
    const targets = getSlideTargets(clickedPos, emptyPos, config.cols)
    if (!targets) return
    const newBoard = executeSlide(board, clickedPos, emptyPos, config.cols)
    setBoard(newBoard)
    setMoves(m => m + 1)
    if (isSolved(newBoard)) {
      setWon(true)
      setTimeout(confetti.fire, 100)
    }
  }, [board, emptyPos, config.cols, confetti.fire])

  // Keyboard controls
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key.toLowerCase()

      // Cheat: 'w' solves instantly
      if (key === 'w') {
        const n = config.cols * config.rows
        const solved = Array.from({ length: n }, (_, i) => i)
        setBoard(solved)
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
  }, [config, emptyPos, won, confetti.fire, doSlide])

  const startNewPuzzle = useCallback((preset: SlideConfig) => {
    setConfig(preset)
    setBoard(createBoard(preset.cols, preset.rows))
    setWon(false)
    setMoves(0)
    setDragPositions(null)
    setDragAxis(null)
  }, [])

  // Pointer handlers for drag
  const handlePointerDown = useCallback((e: React.PointerEvent, cellIndex: number) => {
    if (won) return
    if (board[cellIndex] === config.cols * config.rows - 1) return // empty cell
    e.preventDefault()
    // Capture on the container so pointerMove/pointerUp still fire there
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

    // Lock axis on first significant movement
    if (!axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      group = getDragGroup(tilePos, emptyPos, axis, config.cols)
      if (!group) {
        // Try the other axis
        const altAxis = axis === 'x' ? 'y' : 'x'
        group = getDragGroup(tilePos, emptyPos, altAxis, config.cols)
        if (!group) return // neither axis works, keep waiting for pointerUp tap
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
      // No drag established -- treat as tap if small movement
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
  const { gridW, gridH, cellSize, tileSize } = gridLayout ?? { gridW: 0, gridH: 0, cellSize: 0, tileSize: 0 }
  const imgW = image?.naturalWidth ?? 0
  const imgH = image?.naturalHeight ?? 0
  const pieceSrcW = imgW / config.cols
  const pieceSrcH = imgH / config.rows
  const emptyVal = config.cols * config.rows - 1
  const isDragging = dragPositions !== null
  const dragSet = dragPositions ? new Set(dragPositions) : null

  return (
    <div className="screen game-screen puzzle-screen">
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
              {p.cols}&times;{p.rows}
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
          className="slide-grid"
          style={{ width: gridW, height: gridH }}
        >
          {board.map((pieceId, cellIndex) => {
            const isEmptyCell = pieceId === emptyVal
            const showEmpty = isEmptyCell && !won
            const col = cellIndex % config.cols
            const row = Math.floor(cellIndex / config.cols)
            const origPos = piecePos(pieceId, config.cols)

            // Drag offset for tiles in the drag group
            let tx = 0, ty = 0
            const isTileDragging = dragSet?.has(cellIndex) ?? false
            if (isTileDragging && dragAxis) {
              if (dragAxis === 'x') tx = dragOffset
              else ty = dragOffset
            }

            return (
              <div
                key={cellIndex}
                className={`slide-cell${showEmpty ? ' slide-cell-empty' : ''}${isTileDragging ? ' dragging' : ''}${won ? ' solved' : ''}${pieceId === cellIndex && !won ? ' correct' : ''}`}
                style={{
                  left: col * cellSize + GAP / 2,
                  top: row * cellSize + GAP / 2,
                  width: tileSize,
                  height: tileSize,
                  transform: isTileDragging ? `translate(${tx}px, ${ty}px)` : undefined,
                  zIndex: isTileDragging ? 100 : undefined,
                  transition: isTileDragging ? 'none' : 'left 0.15s ease, top 0.15s ease',
                }}
                onPointerDown={e => handlePointerDown(e, cellIndex)}
              >
                {!showEmpty && (
                  <>
                    <canvas
                      width={tileSize}
                      height={tileSize}
                      ref={canvas => {
                        if (!canvas) return
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        ctx.clearRect(0, 0, tileSize, tileSize)
                        ctx.drawImage(
                          image!,
                          origPos.col * pieceSrcW, origPos.row * pieceSrcH,
                          pieceSrcW, pieceSrcH,
                          0, 0,
                          tileSize, tileSize,
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
