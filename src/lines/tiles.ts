/**
 * What a tile is.
 *
 * A tile is six edges and nothing else. Each edge is one kind of ground, and
 * `rail` is a kind of ground like any other — which is the whole trick, because
 * it means the rule for joining two railways is the same rule as the one for
 * joining two woods, and the player only ever has to learn it once.
 *
 * Rail inside a tile is not drawn as a set of pieces. Every rail edge runs to
 * the middle of the tile and meets every other one there, so a tile with two
 * rail edges is a through line or a curve, one with three is a junction, and
 * one with a single rail edge is a stub that ends in a buffer. Nothing has to
 * enumerate the shapes.
 */

export type EdgeKind = 'meadow' | 'wood' | 'crop' | 'lake' | 'town' | 'rail'

/** Everything that is scenery rather than a line. */
export type Ground = Exclude<EdgeKind, 'rail'>

export const GROUNDS: ReadonlyArray<Ground> = ['meadow', 'wood', 'crop', 'lake', 'town']

export const EDGE_LABEL: Record<EdgeKind, string> = {
  meadow: 'meadow',
  wood: 'wood',
  crop: 'field',
  lake: 'water',
  town: 'houses',
  rail: 'railway',
}

export type QuestSpec =
  | { kind: 'group'; ground: Ground; target: number }
  | { kind: 'stations'; target: number }

export interface Tile {
  /** Six edges, clockwise from due east, matching `DIRECTIONS`. */
  edges: ReadonlyArray<EdgeKind>
  /** A station stands in the middle. Only ever set on a tile that has rail. */
  station: boolean
  /** What this tile will ask of you once it is down. */
  quest?: QuestSpec
}

export function rotate(tile: Tile, turns: number): Tile {
  const shift = ((turns % 6) + 6) % 6
  if (shift === 0) return tile
  const edges = new Array<EdgeKind>(6)
  for (let i = 0; i < 6; i += 1) edges[(i + shift) % 6] = tile.edges[i]
  return { ...tile, edges }
}

export function railEdges(tile: Tile): number[] {
  const out: number[] = []
  for (let i = 0; i < 6; i += 1) if (tile.edges[i] === 'rail') out.push(i)
  return out
}

export function hasRail(tile: Tile): boolean {
  return tile.edges.includes('rail')
}

export function countEdges(tile: Tile, kind: EdgeKind): number {
  let n = 0
  for (const edge of tile.edges) if (edge === kind) n += 1
  return n
}

/**
 * How a tile reads in a sentence, for the live region and the field guide.
 * Rail leads, because it is what the player is actually deciding about.
 */
export function describeTile(tile: Tile): string {
  const rails = railEdges(tile).length
  const line =
    tile.station
      ? 'A station'
      : rails === 0
        ? 'Open country'
        : rails === 1
          ? 'A line ending in buffers'
          : rails === 2
            ? 'A through line'
            : `A ${rails}-way junction`

  const grounds = new Set(tile.edges.filter((e) => e !== 'rail') as Ground[])
  if (grounds.size === 0) return line
  const named = [...grounds].map((g) => EDGE_LABEL[g])
  const last = named.pop() as string
  return `${line}, in ${named.length > 0 ? `${named.join(', ')} and ${last}` : last}`
}
