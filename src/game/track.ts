import { heightAt, isAdjacent, keyOf, sameCoord, tileAt } from './grid'
import { MAX_GRADE, type Coord, type RailLine, type World } from './types'

export interface Check {
  ok: boolean
  reason?: string
}

const OK: Check = { ok: true }

/** Rock blocks construction unless a tunnel has been bored through it. */
export function isPassable(world: World, c: Coord): boolean {
  const t = tileAt(world, c)
  if (!t) return false
  return t.kind !== 'rock' || t.tunnel
}

export function isWater(world: World, c: Coord): boolean {
  return tileAt(world, c)?.kind === 'water'
}

export function gradeBetween(world: World, a: Coord, b: Coord): number {
  return Math.abs(heightAt(world, a) - heightAt(world, b))
}

/** Can rail run directly between two neighbouring tiles? */
export function connectionCheck(world: World, a: Coord, b: Coord): Check {
  if (!tileAt(world, a) || !tileAt(world, b)) return { ok: false, reason: 'Off the survey.' }
  if (!isAdjacent(a, b)) return { ok: false, reason: 'Track only runs to a neighbouring tile.' }
  if (!isPassable(world, b)) {
    return { ok: false, reason: 'Solid rock. Bore a tunnel or go around.' }
  }
  if (gradeBetween(world, a, b) > MAX_GRADE) {
    return { ok: false, reason: 'Too steep — rail may climb or fall only one level per tile.' }
  }
  return OK
}

export const tilesInclude = (tiles: Coord[], c: Coord) => tiles.some((t) => sameCoord(t, c))

export function countBridgeTiles(world: World, tiles: Coord[]): number {
  return tiles.reduce((n, c) => n + (isWater(world, c) ? 1 : 0), 0)
}

/** Total metres climbed, counting only ascents, in elevation levels. */
export function totalClimb(world: World, tiles: Coord[]): number {
  let climb = 0
  for (let i = 1; i < tiles.length; i++) {
    const d = heightAt(world, tiles[i]) - heightAt(world, tiles[i - 1])
    if (d > 0) climb += d
  }
  return climb
}

/** A line loops when it has real length and its ends touch. */
export function routeIsClosed(tiles: Coord[]): boolean {
  return tiles.length > 3 && isAdjacent(tiles[0], tiles[tiles.length - 1])
}

export interface ExtendOptions {
  bridgeBudget?: number
  /** Tiles already occupied by *other* lines, which rail may not cross. */
  occupied?: ReadonlySet<string>
}

/** Validate appending `next` to the end of `route`. */
export function extendCheck(
  world: World,
  route: Coord[],
  next: Coord,
  opts: ExtendOptions = {},
): Check {
  const budget = opts.bridgeBudget ?? Number.POSITIVE_INFINITY
  if (route.length === 0) {
    if (!isPassable(world, next)) return { ok: false, reason: 'Solid rock. Bore a tunnel or go around.' }
    if (isWater(world, next) && budget < 1) return { ok: false, reason: 'No bridges left in the budget.' }
    return OK
  }
  const head = route[route.length - 1]
  if (sameCoord(head, next)) return { ok: false, reason: 'Track is already here.' }
  // A line never crosses itself. A loop closes by bringing the far end back
  // *beside* the start, not by landing on a tile that already carries rail.
  if (tilesInclude(route, next)) {
    return { ok: false, reason: 'This line already runs through that tile.' }
  }
  if (opts.occupied?.has(keyOf(next))) {
    return { ok: false, reason: 'Another line already occupies that tile.' }
  }
  const link = connectionCheck(world, head, next)
  if (!link.ok) return link
  if (isWater(world, next) && countBridgeTiles(world, route) + 1 > budget) {
    return { ok: false, reason: 'No bridges left in the budget.' }
  }
  return OK
}

/** Where the tile sits within a line — used for erase and for rail geometry. */
export function indexOfTile(tiles: Coord[], c: Coord): number {
  return tiles.findIndex((t) => sameCoord(t, c))
}

/**
 * Remove one tile from a line. A tile taken from the middle leaves two
 * stubs; stubs shorter than two tiles are discarded.
 */
export function removeTileFromLine(line: RailLine, c: Coord): RailLine[] {
  const i = indexOfTile(line.tiles, c)
  if (i < 0) return [line]
  const before = line.tiles.slice(0, i)
  const after = line.tiles.slice(i + 1)
  const parts: RailLine[] = []
  if (before.length >= 2) parts.push({ ...line, tiles: before })
  if (after.length >= 2) parts.push({ ...line, id: `${line.id}-b`, tiles: after })
  return parts
}

/** Every tile carrying rail, across all lines. */
export function occupiedTiles(lines: RailLine[], exceptId?: string): Set<string> {
  const set = new Set<string>()
  for (const line of lines) {
    if (line.id === exceptId) continue
    for (const t of line.tiles) set.add(keyOf(t))
  }
  return set
}

export function lineContaining(lines: RailLine[], c: Coord): RailLine | undefined {
  return lines.find((l) => tilesInclude(l.tiles, c))
}

/** Segments of rail that touch a tile, as ordered pairs. */
export function segmentsTouching(lines: RailLine[], c: Coord): Array<[Coord, Coord]> {
  const out: Array<[Coord, Coord]> = []
  for (const line of lines) {
    const tiles = line.tiles
    for (let i = 0; i < tiles.length - 1; i++) {
      if (sameCoord(tiles[i], c) || sameCoord(tiles[i + 1], c)) out.push([tiles[i], tiles[i + 1]])
    }
    if (routeIsClosed(tiles)) {
      const a = tiles[tiles.length - 1]
      const b = tiles[0]
      if (sameCoord(a, c) || sameCoord(b, c)) out.push([a, b])
    }
  }
  return out
}
