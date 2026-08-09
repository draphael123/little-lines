/**
 * What each kind of ground wants from the water.
 *
 * This is the second verb the tile has. In the game this is modelled on, a tile
 * scores on how well its edges match its neighbours' — a judgement you can make
 * with your eyes, at the moment you place it. Here a tile scores on how much
 * water ends up running through it, which is a property of the whole board and
 * is not decided until every other tile has had its say.
 *
 * Nothing here punishes. A tile that is too dry or too wet is simply not yet
 * content, and stays that way until the water moves — which it will, because
 * the next thing you place upstream changes where it goes.
 */
import { channelOf, type Water } from './flow'
import type { HexKey } from './hex'

export type TerrainId = 'heath' | 'meadow' | 'wood' | 'orchard' | 'marsh' | 'hamlet'

export interface Terrain {
  id: TerrainId
  label: string
  /** Inclusive band of flow the ground is happy in. */
  wants: [number, number]
  /** Whether standing water suits it, ruins it, or makes no difference. */
  standing: 'needs' | 'drowns' | 'tolerates'
  note: string
}

export const TERRAIN: ReadonlyArray<Terrain> = [
  {
    id: 'heath',
    label: 'Heath',
    wants: [0, 1],
    standing: 'drowns',
    note: 'Thin ground on a windy top. Wants to be left alone and left dry.',
  },
  {
    id: 'meadow',
    label: 'Meadow',
    wants: [1, 6],
    standing: 'drowns',
    note: 'A rill through it is plenty. Put it under a lake and it is a bog.',
  },
  {
    id: 'wood',
    label: 'Wood',
    wants: [1, 24],
    standing: 'tolerates',
    note: 'Easily pleased — anything but a dry slope.',
  },
  {
    id: 'orchard',
    label: 'Orchard',
    wants: [2, 12],
    standing: 'drowns',
    note: 'A steady stream, neither a trickle nor a torrent.',
  },
  {
    id: 'marsh',
    label: 'Marsh',
    wants: [8, Infinity],
    standing: 'needs',
    note: 'Only content where the water stops. A lake is what it is for.',
  },
  {
    id: 'hamlet',
    label: 'Hamlet',
    wants: [1, 16],
    standing: 'drowns',
    note: 'Wants its own stream at the door, and its feet out of the lake.',
  },
]

const BY_ID = new Map(TERRAIN.map((t) => [t.id, t]))

export function terrainById(id: TerrainId): Terrain {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`unknown terrain: ${id}`)
  return found
}

export interface Tile {
  terrain: TerrainId
  elevation: number
}

export type Verdict = 'content' | 'thirsty' | 'flooded' | 'drowned'

export function verdictFor(tile: Tile, key: HexKey, water: Water): Verdict {
  const terrain = terrainById(tile.terrain)
  const flow = water.flow.get(key) ?? 0
  const standing = (water.depth.get(key) ?? 0) > 0

  if (standing) {
    if (terrain.standing === 'drowns') return 'drowned'
    // Ground that wants the water to stop has what it wants, however little
    // rain is passing through — a pond at the bottom of a bowl catches only
    // its own weather, and that is still a pond.
    if (terrain.standing === 'needs') return 'content'
  }
  if (flow < terrain.wants[0]) return 'thirsty'
  if (flow > terrain.wants[1]) return 'flooded'
  return 'content'
}

export interface Survey {
  verdicts: Map<HexKey, Verdict>
  content: number
  placed: number
}

export function survey(tiles: ReadonlyMap<HexKey, Tile>, water: Water): Survey {
  const verdicts = new Map<HexKey, Verdict>()
  let content = 0
  for (const [key, tile] of tiles) {
    const verdict = verdictFor(tile, key, water)
    verdicts.set(key, verdict)
    if (verdict === 'content') content += 1
  }
  return { verdicts, content, placed: tiles.size }
}

/** A one-line reading of a tile, for the field guide and the live region. */
export function describe(tile: Tile, key: HexKey, water: Water): string {
  const terrain = terrainById(tile.terrain)
  const flow = water.flow.get(key) ?? 0
  const depth = water.depth.get(key) ?? 0
  if (depth > 0) return `${terrain.label} under ${depth === 1 ? 'a foot' : `${depth} steps`} of water`
  const channel = channelOf(flow)
  if (channel === 'dry') return `${terrain.label}, dry`
  return `${terrain.label} with a ${channel} through it`
}
