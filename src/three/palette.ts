import type { Tile } from '../game/types'

/**
 * Naturalistic landscape colour under a charcoal interface: believable grass,
 * stone and water rather than a painted model, with one warm accent doing all
 * the work in the HUD.
 */
export const PALETTE = {
  ink: '#0e1216',
  panel: '#161c23',
  panelSoft: '#1e262f',
  line: 'rgba(233,239,245,0.13)',
  text: '#e8eef4',
  textSoft: '#9aa7b4',
  accent: '#f0b357',
  accentDeep: '#c98a2f',
  danger: '#e2604c',
  good: '#63b17a',
  rail: '#b7bcc0',
  sleeper: '#6d5a43',
  timber: '#7a6046',
  timberDark: '#4f3d2b',
  brass: '#c39a4d',
  roof: '#a4503c',
  render: '#e3dcce',
  road: '#4a4d51',
  roadLine: '#c8ccd0',
} as const

/* ------------------------------------------------------------------ ground */

type RGB = [number, number, number]

const hexToRgb = (hex: number): RGB => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
]

export const GROUND = {
  /** Grass gets drier and paler as it climbs. */
  grass: [0x6f9e52, 0x679551, 0x5f8b4e, 0x77894c, 0x8b8f57].map(hexToRgb),
  forest: [0x557f43, 0x517a42, 0x4c7340, 0x556f3e, 0x63713f].map(hexToRgb),
  rock: [0x8a8378, 0x847d72, 0x7d766b, 0x767065, 0x6f695f].map(hexToRgb),
  riverbed: hexToRgb(0x7d7256),
  sand: hexToRgb(0xc2ad85),
  cliff: hexToRgb(0x6d6357),
  cliffFoot: hexToRgb(0x413a32),
} as const

const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Vertex colour for a patch of ground, with a whisper of natural variation. */
export function groundColour(tile: Tile, x: number, z: number, face: 'top' | 'cliff' = 'top'): RGB {
  if (face === 'cliff') return GROUND.cliff
  const level = Math.max(0, Math.min(4, Math.round(tile.h)))
  let base: RGB
  if (tile.kind === 'water') base = GROUND.riverbed
  else if (tile.kind === 'rock') base = GROUND.rock[level]
  else if (tile.kind === 'forest') base = GROUND.forest[level]
  else base = GROUND.grass[level]
  const jitter = 0.94 + hash(x, z) * 0.11
  return [
    Math.min(1, base[0] * jitter),
    Math.min(1, base[1] * jitter),
    Math.min(1, base[2] * jitter),
  ]
}

/* ------------------------------------------------------------------- mood */

export interface SceneMood {
  sky: string
  horizon: string
  fog: string
  fogDensity: number
  sun: { colour: string; intensity: number; position: [number, number, number] }
  fill: { colour: string; intensity: number }
  hemi: { sky: string; ground: string; intensity: number }
  sea: string
  seaRoughness: number
  windows: string
  windowGlow: number
}

export const DAY: SceneMood = {
  sky: '#9fc4dd',
  horizon: '#cfe0e8',
  fog: '#c3d6e0',
  fogDensity: 0.012,
  sun: { colour: '#fff4e2', intensity: 2.9, position: [8, 12, 5] },
  fill: { colour: '#a9c6de', intensity: 0.55 },
  hemi: { sky: '#bcd7e8', ground: '#5d5342', intensity: 0.9 },
  sea: '#2f7093',
  seaRoughness: 0.16,
  windows: '#000000',
  windowGlow: 0,
}

export const NIGHT: SceneMood = {
  sky: '#101720',
  horizon: '#1b2733',
  fog: '#15202b',
  fogDensity: 0.022,
  sun: { colour: '#9fb8dc', intensity: 0.9, position: [-7, 10, -6] },
  fill: { colour: '#3d5876', intensity: 0.5 },
  hemi: { sky: '#3f5d7d', ground: '#1d1a15', intensity: 0.75 },
  sea: '#152f45',
  seaRoughness: 0.1,
  windows: '#ffbf63',
  windowGlow: 1,
}

export const moodFor = (night: boolean): SceneMood => (night ? NIGHT : DAY)
