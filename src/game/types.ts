/** Core value types for the survey grid. Everything here is plain data so it
 *  can be reasoned about, serialised and tested without a renderer. */

export type TileKind = 'meadow' | 'forest' | 'rock' | 'water'

/**
 * Something standing on a tile. Rail is stored separately, and cottages are
 * not here at all — settlement is simulated, never placed.
 */
export type Feature = 'tree' | 'station' | null

export interface Coord {
  x: number
  z: number
}

export interface Tile {
  /**
   * Elevation the rail runs at, 0 = table height. Integers only. Boring a
   * tunnel drops this to the level of the surrounding ground while the rock
   * itself keeps standing at `rockTop`.
   */
  h: number
  kind: TileKind
  /** A bored tunnel makes a rock tile passable for rail. */
  tunnel: boolean
  /** Height the rock block is still drawn at, set only on tunnelled tiles. */
  rockTop?: number
  feature: Feature
}

export interface World {
  w: number
  h: number
  /** Row-major, length w * h. */
  tiles: Tile[]
}

/** One continuous railway. `closed` is derived, not stored. */
export interface RailLine {
  id: string
  tiles: Coord[]
}

export type WorldSize = 'small' | 'wide' | 'grand'

export type Speed = 'slow' | 'normal' | 'fast'

export type FreeTool =
  | 'rail'
  | 'erase'
  | 'raise'
  | 'lower'
  | 'tunnel'
  | 'tree'
  | 'water'
  | 'station'

export interface LevelStop extends Coord {
  name: string
}

export interface LevelDef {
  id: string
  index: number
  name: string
  /** Where the line begins. */
  depotName: string
  /** Where the line must reach. */
  destinationName: string
  brief: string
  /** Row strings: '.' meadow, 'f' forest, '^' rock, '~' water. */
  kinds: string[]
  /** Row strings of single digits, same shape as `kinds`. */
  heights: string[]
  depot: Coord
  destination: Coord
  stops: LevelStop[]
  /** Maximum number of water tiles the route may bridge. */
  bridgeBudget: number
  /** Track-tile count that earns three stars. */
  par: number
}

export const MAX_ELEVATION = 4
export const MAX_GRADE = 1

export const KIND_CHAR: Record<string, TileKind> = {
  '.': 'meadow',
  f: 'forest',
  '^': 'rock',
  '~': 'water',
}
