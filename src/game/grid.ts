import { KIND_CHAR, type Coord, type Tile, type TileKind, type World } from './types'

export const idx = (w: number, x: number, z: number) => z * w + x

export const keyOf = (c: Coord) => `${c.x},${c.z}`

export const parseKey = (k: string): Coord => {
  const [x, z] = k.split(',').map(Number)
  return { x, z }
}

export const sameCoord = (a: Coord | null, b: Coord | null) =>
  !!a && !!b && a.x === b.x && a.z === b.z

export const inBounds = (world: World, c: Coord) =>
  c.x >= 0 && c.z >= 0 && c.x < world.w && c.z < world.h

export function tileAt(world: World, c: Coord): Tile | null {
  if (!inBounds(world, c)) return null
  return world.tiles[idx(world.w, c.x, c.z)]
}

/** Throws for out-of-bounds; use when the caller has already validated. */
export function mustTile(world: World, c: Coord): Tile {
  const t = tileAt(world, c)
  if (!t) throw new RangeError(`tile ${keyOf(c)} is outside the ${world.w}x${world.h} survey`)
  return t
}

export const heightAt = (world: World, c: Coord) => tileAt(world, c)?.h ?? 0

/** Elevation the carved block is drawn to — taller than `h` on tunnelled rock. */
export const blockLevel = (tile: Tile) =>
  tile.tunnel && typeof tile.rockTop === 'number' ? tile.rockTop : tile.h

export const NEIGHBOUR_OFFSETS: ReadonlyArray<Coord> = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
]

export function neighbours(world: World, c: Coord): Coord[] {
  const out: Coord[] = []
  for (const o of NEIGHBOUR_OFFSETS) {
    const n = { x: c.x + o.x, z: c.z + o.z }
    if (inBounds(world, n)) out.push(n)
  }
  return out
}

export const isAdjacent = (a: Coord, b: Coord) =>
  Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1

export function makeTile(kind: TileKind = 'meadow', h = 0): Tile {
  return { h, kind, tunnel: false, feature: null }
}

export function createWorld(w: number, h: number): World {
  const tiles: Tile[] = []
  for (let i = 0; i < w * h; i++) tiles.push(makeTile())
  return { w, h, tiles }
}

export function cloneWorld(world: World): World {
  return { w: world.w, h: world.h, tiles: world.tiles.map((t) => ({ ...t })) }
}

/** Build a world from the compact row-string form used by the campaign. */
export function worldFromRows(kinds: string[], heights: string[]): World {
  const h = kinds.length
  const w = kinds[0]?.length ?? 0
  if (heights.length !== h) throw new Error('kind and height row counts differ')
  const tiles: Tile[] = []
  for (let z = 0; z < h; z++) {
    if (kinds[z].length !== w || heights[z].length !== w) {
      throw new Error(`row ${z} is ragged`)
    }
    for (let x = 0; x < w; x++) {
      const kind = KIND_CHAR[kinds[z][x]]
      if (!kind) throw new Error(`unknown terrain glyph "${kinds[z][x]}" at ${x},${z}`)
      const elevation = Number(heights[z][x])
      tiles.push({
        h: kind === 'water' ? 0 : elevation,
        kind,
        tunnel: false,
        feature: kind === 'forest' ? 'tree' : null,
      })
    }
  }
  return { w, h, tiles }
}

/** Bounds-checked write that returns a new world (worlds are treated as immutable). */
export function withTile(world: World, c: Coord, patch: Partial<Tile>): World {
  if (!inBounds(world, c)) return world
  const next = cloneWorld(world)
  const i = idx(world.w, c.x, c.z)
  next.tiles[i] = { ...next.tiles[i], ...patch }
  return next
}

export const WORLD_SIZES = {
  small: { w: 18, h: 14, label: 'Small' },
  wide: { w: 26, h: 19, label: 'Wide' },
  grand: { w: 34, h: 25, label: 'Grand' },
} as const
