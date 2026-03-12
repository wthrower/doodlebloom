export type Screen = 'start' | 'generating' | 'preview' | 'playing' | 'complete'

export interface PaletteColor {
  r: number
  g: number
  b: number
}

export interface LabelPoint {
  x: number
  y: number
  /** BFS L1 distance to nearest region boundary -- used to size the number badge */
  radius: number
}

export interface Region {
  id: number
  colorIndex: number
  centroid: { x: number; y: number }
  pixelCount: number
  /** BFS L1 distance from centroid to nearest region boundary -- used to size the number badge */
  labelRadius: number
  /** All label points for this region (primary + one per lobe with enough space). */
  labels: LabelPoint[]
}

export interface GameState {
  screen: Screen
  prompt: string
  colorCount: number
  sessionId: string | null
  palette: PaletteColor[]
  regions: Region[]
  /** regionId -> palette colorIndex chosen by player */
  playerColors: Record<number, number>
  /** whether to draw region outlines */
  showOutline: boolean
  /** canvas dimensions used when building regions */
  canvasWidth: number
  canvasHeight: number
  /** Raw (pre-compaction) palette stored so session restore can call buildRegions
   *  with the same palette, producing an identical deterministic merge. */
  rawPalette?: PaletteColor[]
}

export const DEFAULT_STATE: GameState = {
  screen: 'start',
  prompt: '',
  colorCount: 16,
  sessionId: null,
  palette: [],
  regions: [],
  playerColors: {},
  showOutline: false,
  canvasWidth: 512,
  canvasHeight: 512,
}
