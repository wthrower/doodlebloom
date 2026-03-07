export type Screen = 'setup' | 'generating' | 'preview' | 'playing' | 'complete'

export interface PaletteColor {
  r: number
  g: number
  b: number
}

export interface Region {
  id: number
  colorIndex: number
  centroid: { x: number; y: number }
  pixelCount: number
  /** BFS L1 distance from centroid to nearest region boundary -- used to size the number badge */
  labelRadius: number
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
  /** reveal mode: flat fills region with palette color, photo shows original pixels */
  revealMode: 'flat' | 'photo'
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
  screen: 'setup',
  prompt: '',
  colorCount: 16,
  sessionId: null,
  palette: [],
  regions: [],
  playerColors: {},
  revealMode: 'photo',
  showOutline: true,
  canvasWidth: 512,
  canvasHeight: 512,
}
