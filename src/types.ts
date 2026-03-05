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
  /** canvas dimensions used when building regions */
  canvasWidth: number
  canvasHeight: number
}

export const DEFAULT_STATE: GameState = {
  screen: 'setup',
  prompt: '',
  colorCount: 8,
  sessionId: null,
  palette: [],
  regions: [],
  playerColors: {},
  revealMode: 'flat',
  canvasWidth: 512,
  canvasHeight: 512,
}
