import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SIZE_PRESETS, type JigswapConfig } from '../game/jigswap'

export type PuzzleConfig = JigswapConfig

interface PuzzleState {
  board: number[]
  config: PuzzleConfig
  moves: number
  won: boolean
}

function loadState(storageKey: string): PuzzleState | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    return JSON.parse(raw) as PuzzleState
  } catch { return null }
}

function saveState(storageKey: string, state: PuzzleState): void {
  localStorage.setItem(storageKey, JSON.stringify(state))
}

export function clearPuzzleStorage(storageKey: string): void {
  localStorage.removeItem(storageKey)
}

/** Shared image loader. */
export function useImage(imageUrl: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.src = imageUrl
  }, [imageUrl])

  return image
}

/** Shared ResizeObserver hook. */
export function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return size
}

/** Compute grid dimensions to fit container while preserving aspect ratio. */
export function useGridLayout(
  containerSize: { width: number; height: number },
  config: PuzzleConfig,
) {
  return useMemo(() => {
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
    return { gridW, gridH, cellSize }
  }, [containerSize, config])
}

/** Download image as PNG. */
export function useDownload(image: HTMLImageElement | null, filename: string) {
  return useCallback(() => {
    if (!image) return
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, 0, 0)
    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [image, filename])
}

/**
 * Core puzzle state: board, config, moves, won.
 * Handles localStorage persistence and new-puzzle reset.
 * When resumeSaved is false, saved state is ignored and a fresh board is created.
 */
export function usePuzzleState(
  storageKey: string,
  createBoard: (cols: number, rows: number) => number[],
  resumeSaved: boolean,
) {
  const saved = useRef(resumeSaved ? loadState(storageKey) : null).current
  const [config, setConfig] = useState<PuzzleConfig>(saved?.config ?? SIZE_PRESETS[1])
  const [board, setBoard] = useState<number[]>(() => saved?.board ?? createBoard(SIZE_PRESETS[1].cols, SIZE_PRESETS[1].rows))
  const [won, setWon] = useState(saved?.won ?? false)
  const [moves, setMoves] = useState(saved?.moves ?? 0)

  useEffect(() => {
    saveState(storageKey, { board, config, moves, won })
  }, [storageKey, board, config, moves, won])

  const startNewPuzzle = useCallback((preset: PuzzleConfig) => {
    setConfig(preset)
    setBoard(createBoard(preset.cols, preset.rows))
    setWon(false)
    setMoves(0)
  }, [createBoard])

  return {
    config, board, won, moves,
    setBoard, setWon, setMoves,
    startNewPuzzle,
  }
}
