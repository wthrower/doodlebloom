export type Screen = 'start' | 'generating' | 'preview' | 'playing' | 'complete' | 'jigswap' | 'slide'

export type GameMode = 'paint' | 'jigswap' | 'slide'
export type DetailLevel = 'very high' | 'high' | 'medium' | 'low' | 'very low'
export const DETAIL_SETTINGS: Record<DetailLevel, { minRegionPixels: number; maxRegions: number; smoothRadius: number }> = {
  // smoothRadius (px window half-size): a pre-quantization edge-preserving median
  // filter that strips sub-feature texture so coarser tiers don't fragment into
  // noise regions. Median (not gaussian) keeps boundaries sharp -- it never
  // invents intermediate colors, so it can't create sliver regions tracing former
  // edges. Coarser detail -> larger window. 0 = no smoothing (most detailed tier).
  'very high': { minRegionPixels: 100, maxRegions: 800, smoothRadius: 0 },
  high: { minRegionPixels: 200, maxRegions: 500, smoothRadius: 1 },
  medium: { minRegionPixels: 1200, maxRegions: 250, smoothRadius: 2 },
  low: { minRegionPixels: 2800, maxRegions: 100, smoothRadius: 2 },
  'very low': { minRegionPixels: 5000, maxRegions: 50, smoothRadius: 3 },
}

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
  detailLevel: DetailLevel
  gameMode: GameMode
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
  rawPalette?: PaletteColor[]
}

export interface GamePreferences {
  prompt: string
  colorCount: number
  detailLevel: DetailLevel
  gameMode: GameMode
  showOutline: boolean
}

export const DEFAULT_PREFERENCES: GamePreferences = {
  prompt: '',
  colorCount: 16,
  detailLevel: 'high',
  gameMode: 'paint',
  showOutline: false,
}

export const DEFAULT_STATE: GameState = {
  screen: 'start',
  ...DEFAULT_PREFERENCES,
  sessionId: null,
  palette: [],
  regions: [],
  playerColors: {},
  canvasWidth: 512,
  canvasHeight: 512,
}
