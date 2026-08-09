/**
 * The board, and what a placement is worth.
 *
 * One rule covers every border: two tiles meet along an edge each of them
 * names differently, and if both call it the same thing, that border is
 * matched. Rail is an edge kind, so a railway joining a railway is the same
 * event as a wood joining a wood, and is scored by the same line of code.
 *
 * Nothing is illegal except placing where there is nothing to place against.
 * A mismatched border is allowed and simply earns nothing, which is what keeps
 * the game from ever being a game you can lose by playing.
 */
import { neighbourKey, neighbourKeys, opposite, ringIndex, unkey, type HexKey } from './hex'
import { railEdges, type EdgeKind, type Ground, type Tile } from './tiles'

/** How far out the country is allowed to run. */
export const BOARD_LIMIT = 20

export type Placed = ReadonlyMap<HexKey, Tile>

export const SCORE = {
  match: 10,
  /** Rail is what the game is about, so joining it is worth more than agreeing about grass. */
  railJoin: 15,
  /** A line that stops dead. Gentle, on purpose: it is a disappointment, not a punishment. */
  broken: -5,
  snug: 30,
  perfect: 80,
} as const

export interface Border {
  direction: number
  neighbour: HexKey
  mine: EdgeKind
  theirs: EdgeKind
  matched: boolean
  /** One side brings a railway and the other does not. */
  broken: boolean
}

export interface Assessment {
  borders: Border[]
  matched: number
  broken: number
  railJoins: number
  /**
   * Every neighbour agreed, and there were at least three of them. This is the
   * ordinary way to earn a tile back. The floor of three is what keeps the
   * stack from being bottomless: nibbling along the frontier, where a tile
   * touches only one or two others, is easy enough that paying for it means the
   * run never ends.
   */
  snug: boolean
  /** A hole filled, all six sides agreeing. Rare, and paid for accordingly. */
  perfect: boolean
  score: number
}

export function withinBoard(key: HexKey): boolean {
  const { q, r } = unkey(key)
  return ringIndex(q, r) <= BOARD_LIMIT
}

/** Where a tile may go: empty, in bounds, and touching something already down. */
export function canPlace(tiles: Placed, key: HexKey): boolean {
  if (tiles.has(key) || !withinBoard(key)) return false
  return neighbourKeys(key).some((n) => tiles.has(n))
}

export function openHexes(tiles: Placed): HexKey[] {
  const open = new Set<HexKey>()
  for (const key of tiles.keys()) {
    for (const n of neighbourKeys(key)) {
      if (!tiles.has(n) && withinBoard(n)) open.add(n)
    }
  }
  return [...open]
}

export function assess(tiles: Placed, key: HexKey, tile: Tile): Assessment {
  const borders: Border[] = []
  let matched = 0
  let broken = 0
  let railJoins = 0

  for (let direction = 0; direction < 6; direction += 1) {
    const neighbour = neighbourKey(key, direction)
    const other = tiles.get(neighbour)
    if (!other) continue

    const mine = tile.edges[direction]
    const theirs = other.edges[opposite(direction)]
    const agrees = mine === theirs
    const railBroken = !agrees && (mine === 'rail' || theirs === 'rail')

    if (agrees) matched += 1
    if (agrees && mine === 'rail') railJoins += 1
    if (railBroken) broken += 1

    borders.push({ direction, neighbour, mine, theirs, matched: agrees, broken: railBroken })
  }

  const clean = borders.length > 0 && matched === borders.length
  const snug = clean && borders.length >= SNUG_BORDERS
  const perfect = clean && borders.length === 6
  const score =
    matched * SCORE.match +
    railJoins * SCORE.railJoin +
    broken * SCORE.broken +
    (snug ? SCORE.snug : 0) +
    (perfect ? SCORE.perfect : 0)

  return { borders, matched, broken, railJoins, snug, perfect, score }
}

/** How many neighbours a placement must please before it earns a tile back. */
export const SNUG_BORDERS = 3

/**
 * What a placement hands back to the stack. The single knob the whole economy
 * turns on, so it lives on its own where it can be found and argued with.
 */
export function tilesEarned(assessment: Assessment): number {
  if (assessment.perfect) return 2
  if (assessment.snug) return 1
  return 0
}

/* ------------------------------------------------------------------ groups */

/**
 * A group is everything reachable from a tile by crossing borders where both
 * sides are the same ground. It is the same walk for a wood, a lake or a run of
 * houses — and, with `'rail'`, for the railway network too.
 */
export function groupAt(tiles: Placed, key: HexKey, kind: EdgeKind): Set<HexKey> {
  const found = new Set<HexKey>()
  const start = tiles.get(key)
  if (!start || !start.edges.includes(kind)) return found

  const queue: HexKey[] = [key]
  found.add(key)
  while (queue.length > 0) {
    const current = queue.pop() as HexKey
    const tile = tiles.get(current) as Tile
    for (let direction = 0; direction < 6; direction += 1) {
      if (tile.edges[direction] !== kind) continue
      const next = neighbourKey(current, direction)
      if (found.has(next)) continue
      const other = tiles.get(next)
      if (!other || other.edges[opposite(direction)] !== kind) continue
      found.add(next)
      queue.push(next)
    }
  }
  return found
}

/**
 * Whether a group can still grow — that is, whether any member offers an edge
 * of its own kind to a hex nobody has filled yet. A group that cannot grow has
 * finished being whatever it is going to be.
 */
export function groupCanGrow(tiles: Placed, group: ReadonlySet<HexKey>, kind: EdgeKind): boolean {
  for (const key of group) {
    const tile = tiles.get(key)
    if (!tile) continue
    for (let direction = 0; direction < 6; direction += 1) {
      if (tile.edges[direction] !== kind) continue
      const next = neighbourKey(key, direction)
      if (!tiles.has(next) && withinBoard(next)) return true
    }
  }
  return false
}

/* ------------------------------------------------------------- the network */

export function railNetworkAt(tiles: Placed, key: HexKey): Set<HexKey> {
  return groupAt(tiles, key, 'rail')
}

/** Every station sharing a run of rail with this one, not counting itself. */
export function stationsJoinedTo(tiles: Placed, key: HexKey): HexKey[] {
  const network = railNetworkAt(tiles, key)
  const out: HexKey[] = []
  for (const member of network) {
    if (member === key) continue
    if (tiles.get(member)?.station) out.push(member)
  }
  return out
}

/** Rail that leaves a tile and meets nothing: where the buffers get drawn. */
export function loosEndsAt(tiles: Placed, key: HexKey): number[] {
  const tile = tiles.get(key)
  if (!tile) return []
  const ends: number[] = []
  for (const direction of railEdges(tile)) {
    const other = tiles.get(neighbourKey(key, direction))
    if (!other || other.edges[opposite(direction)] !== 'rail') ends.push(direction)
  }
  return ends
}

/* ------------------------------------------------------------------ tallies */

export interface Tally {
  tiles: number
  stations: number
  /** Stations standing on the largest single run of rail. */
  joined: number
  groups: Partial<Record<Ground, number>>
}

export function tally(tiles: Placed): Tally {
  let stations = 0
  const stationKeys: HexKey[] = []
  for (const [key, tile] of tiles) {
    if (!tile.station) continue
    stations += 1
    stationKeys.push(key)
  }

  let joined = 0
  const seen = new Set<HexKey>()
  for (const key of stationKeys) {
    if (seen.has(key)) continue
    const network = railNetworkAt(tiles, key)
    let here = 0
    for (const member of network) {
      if (!tiles.get(member)?.station) continue
      here += 1
      seen.add(member)
    }
    if (network.size === 0) {
      here = 1
      seen.add(key)
    }
    joined = Math.max(joined, here)
  }

  const groups: Partial<Record<Ground, number>> = {}
  const counted = new Map<Ground, Set<HexKey>>()
  for (const [key, tile] of tiles) {
    for (const edge of tile.edges) {
      if (edge === 'rail') continue
      const already = counted.get(edge) ?? new Set<HexKey>()
      counted.set(edge, already)
      if (already.has(key)) continue
      const group = groupAt(tiles, key, edge)
      for (const member of group) already.add(member)
      groups[edge] = (groups[edge] ?? 0) + 1
    }
  }

  return { tiles: tiles.size, stations, joined, groups }
}
