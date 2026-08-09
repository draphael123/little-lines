import type { Tile } from '../game/types'

/** Painted-model palette. Muted moss, cream, slate, timber and signal red. */
export const PALETTE = {
  paper: '#efe5d2',
  paperDeep: '#e3d6bd',
  ink: '#2b2823',
  timber: '#6b4a2f',
  timberDark: '#4a3220',
  timberLight: '#8a6a44',
  brass: '#b08d4f',
  brassDark: '#8a6c37',
  moss: '#6f8259',
  slate: '#4a6a84',
  signal: '#a33224',
  cream: '#f6efe1',
  steel: '#b9b3a6',
} as const

const MEADOW_BY_LEVEL = [0x7f9263, 0x738656, 0x66794e, 0x5b6d47, 0x536440]
const FOREST_BY_LEVEL = [0x5f7550, 0x596d4b, 0x536546, 0x4d5e42, 0x48583e]
const ROCK_BY_LEVEL = [0x99927f, 0x928b79, 0x8a8372, 0x827b6b, 0x7a7364]
const WATER_BED = 0x3c5163

const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}

const tint = (hex: number, f: number) => {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)))
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)))
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)))
  return (r << 16) | (g << 8) | b
}

/** Colour of a tile's painted top face, with a whisper of hand-mixed variation. */
export function tileColour(tile: Tile, x: number, z: number): number {
  const level = Math.max(0, Math.min(4, Math.round(tile.h)))
  let base: number
  if (tile.kind === 'water') base = WATER_BED
  else if (tile.kind === 'rock') base = ROCK_BY_LEVEL[level]
  else if (tile.kind === 'forest') base = FOREST_BY_LEVEL[level]
  else base = MEADOW_BY_LEVEL[level]
  return tint(base, 0.94 + hash(x, z) * 0.12)
}

export interface SceneMood {
  background: string
  fog: string
  fogDensity: number
  sun: { colour: string; intensity: number; position: [number, number, number] }
  fill: { colour: string; intensity: number }
  hemi: { sky: string; ground: string; intensity: number }
  lampIntensity: number
  waterColour: string
  waterRoughness: number
}

export const DAY: SceneMood = {
  background: '#e6dcc8',
  fog: '#e0d5be',
  fogDensity: 0.021,
  sun: { colour: '#fff3dd', intensity: 2.5, position: [7, 11, 6] },
  fill: { colour: '#bcd0dd', intensity: 0.5 },
  hemi: { sky: '#dfe8ee', ground: '#7a6244', intensity: 0.85 },
  lampIntensity: 0,
  waterColour: '#5b7d97',
  waterRoughness: 0.14,
}

/**
 * Night has to stay readable: a low blue moon plus a generous hemisphere, so
 * the carved ground still reads as ground while the lit windows do the work.
 */
export const NIGHT: SceneMood = {
  background: '#1d2330',
  fog: '#181d28',
  fogDensity: 0.03,
  sun: { colour: '#b3c8e6', intensity: 1.15, position: [-6, 9, -5] },
  fill: { colour: '#48608a', intensity: 0.7 },
  hemi: { sky: '#5b7a9e', ground: '#2b241b', intensity: 1 },
  lampIntensity: 1,
  waterColour: '#2c4459',
  waterRoughness: 0.08,
}

export const moodFor = (night: boolean): SceneMood => (night ? NIGHT : DAY)
