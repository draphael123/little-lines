/**
 * The colours, and the light they sit in.
 *
 * Ground colour is the whole readability of the game: a border where two tiles
 * agree should look continuous, and one where they disagree should show a seam
 * you can see from across the board without reading anything. So the hues are
 * kept well apart, and the tile face blends between them rather than filling
 * each sixth flat — a flat fill puts a hard spoke down the middle of every tile
 * and drowns out the only line that matters, which is the one at the border.
 *
 * Day and night are lit differently but coloured the same. Tinting the ground
 * for night as well means the greens go grey and the board stops reading.
 */
import { Color } from 'three'
import type { EdgeKind } from './tiles'

export const GROUND_COLOUR: Record<EdgeKind, string> = {
  meadow: '#93b962',
  wood: '#46744a',
  crop: '#d7ae54',
  lake: '#4f97c2',
  town: '#c07f5c',
  rail: '#9a9184',
}

export const SOIL = '#6d5c48'
export const RAIL_BALLAST = '#8b8175'
export const RAIL_IRON = '#3b3630'
export const BUFFER = '#7b4a3a'
export const STATION_WALL = '#e0d3bc'
export const STATION_ROOF = '#8c4f3f'
export const TREE = '#37613c'
export const TREE_TRUNK = '#5d4632'
export const HOUSE_WALL = '#e6d9c4'
export const HOUSE_ROOF = '#b4614a'

/** Cached so the geometry builder is not allocating a Color per vertex. */
const CACHE = new Map<string, Color>()

export function colourOf(hex: string): Color {
  const found = CACHE.get(hex)
  if (found) return found
  const made = new Color(hex)
  CACHE.set(hex, made)
  return made
}

export function groundColour(kind: EdgeKind): Color {
  return colourOf(GROUND_COLOUR[kind])
}

export interface Mood {
  sky: string
  fog: string
  fogDensity: number
  sun: { colour: string; intensity: number; position: [number, number, number] }
  hemi: { sky: string; ground: string; intensity: number }
  ambient: number
  /** Lit windows only appear after dark. */
  windows: string
  windowGlow: number
}

export const DAY: Mood = {
  sky: '#a8c9de',
  fog: '#c6d8e2',
  fogDensity: 0.008,
  // Deliberately modest: ACES tone mapping washes anything much above 1.0 out
  // to cream, and the greens are the first thing to go.
  sun: { colour: '#fff2da', intensity: 1.25, position: [14, 20, 10] },
  hemi: { sky: '#c2dcec', ground: '#7f7663', intensity: 0.8 },
  ambient: 0.22,
  windows: '#000000',
  windowGlow: 0,
}

export const NIGHT: Mood = {
  sky: '#111a24',
  fog: '#16212c',
  fogDensity: 0.016,
  sun: { colour: '#a3bade', intensity: 0.38, position: [-12, 16, -9] },
  hemi: { sky: '#3f5c7a', ground: '#1e1b17', intensity: 0.46 },
  ambient: 0.14,
  windows: '#ffc069',
  windowGlow: 1,
}

export const moodFor = (night: boolean): Mood => (night ? NIGHT : DAY)

/* ------------------------------------------------------------- dimensions */

/** Centre to corner. Every other measurement is a fraction of this. */
export const HEX = 1
export const TILE_DEPTH = 0.22
/** Water sits a little below the land, which is most of what makes it water. */
export const LAKE_DROP = 0.05
export const RAIL_WIDTH = 0.2
export const BALLAST_WIDTH = 0.34
export const RAIL_LIFT = 0.012
