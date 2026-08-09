import { arr, int, isRecord, str } from './save'
import {
  MAX_ELEVATION,
  type Coord,
  type Feature,
  type RailLine,
  type Tile,
  type TileKind,
  type World,
} from './types'

const KIND_TO_CHAR: Record<TileKind, string> = {
  meadow: '.',
  forest: 'f',
  rock: '^',
  water: '~',
}
const CHAR_TO_KIND: Record<string, TileKind> = { '.': 'meadow', f: 'forest', '^': 'rock', '~': 'water' }

const FEATURE_TO_CHAR: Record<string, string> = { tree: 't', station: 's' }
// 'h' was a hand-placed cottage in an earlier build; those are dropped on load.
const CHAR_TO_FEATURE: Record<string, Feature> = { t: 'tree', s: 'station', h: null, '-': null }

export interface WorldBlob {
  w: number
  h: number
  k: string
  e: string
  t: string
  f: string
  /** Rock top level for tunnelled tiles, '-' elsewhere. */
  r: string
}

const clampLevel = (n: number) => Math.max(0, Math.min(MAX_ELEVATION, Math.round(n)))

/** Parallel strings — compact enough to keep several worlds in storage. */
export function serializeWorld(world: World): WorldBlob {
  let k = ''
  let e = ''
  let t = ''
  let f = ''
  let r = ''
  for (const tile of world.tiles) {
    k += KIND_TO_CHAR[tile.kind] ?? '.'
    e += String(clampLevel(tile.h))
    t += tile.tunnel ? '1' : '0'
    f += tile.feature ? (FEATURE_TO_CHAR[tile.feature] ?? '-') : '-'
    r += typeof tile.rockTop === 'number' ? String(clampLevel(tile.rockTop)) : '-'
  }
  return { w: world.w, h: world.h, k, e, t, f, r }
}

export function deserializeWorld(raw: unknown): World | null {
  if (!isRecord(raw)) return null
  const w = int(raw.w, 0, 1, 64)
  const h = int(raw.h, 0, 1, 64)
  const k = str(raw.k, '')
  const e = str(raw.e, '')
  const t = str(raw.t, '')
  const f = str(raw.f, '')
  const r = str(raw.r, '')
  const n = w * h
  if (n === 0 || k.length !== n || e.length !== n) return null
  const tiles: Tile[] = []
  for (let i = 0; i < n; i++) {
    const kind = CHAR_TO_KIND[k[i]] ?? 'meadow'
    const height = kind === 'water' ? 0 : Math.max(0, Math.min(MAX_ELEVATION, Number(e[i]) || 0))
    const tunnel = t[i] === '1' && kind === 'rock'
    const rockDigit = r[i]
    const tile: Tile = {
      h: height,
      kind,
      tunnel,
      feature: CHAR_TO_FEATURE[f[i]] ?? null,
    }
    if (tunnel && rockDigit && rockDigit !== '-' && !Number.isNaN(Number(rockDigit))) {
      tile.rockTop = Math.max(height, Math.min(MAX_ELEVATION, Number(rockDigit)))
    }
    tiles.push(tile)
  }
  return { w, h, tiles }
}

export interface LineBlob {
  id: string
  t: string
}

export const serializeLines = (lines: RailLine[]): LineBlob[] =>
  lines.map((l) => ({ id: l.id, t: l.tiles.map((c) => `${c.x}.${c.z}`).join(' ') }))

export function deserializeLines(raw: unknown, world: World): RailLine[] {
  const out: RailLine[] = []
  for (const item of arr(raw)) {
    if (!isRecord(item)) continue
    const id = str(item.id, '')
    if (!id) continue
    const tiles: Coord[] = []
    for (const token of str(item.t, '').split(' ')) {
      if (!token) continue
      const [xs, zs] = token.split('.')
      const x = Number(xs)
      const z = Number(zs)
      if (!Number.isInteger(x) || !Number.isInteger(z)) continue
      if (x < 0 || z < 0 || x >= world.w || z >= world.h) continue
      tiles.push({ x, z })
    }
    if (tiles.length >= 2) out.push({ id, tiles })
  }
  return out
}

export const serializeRoute = (route: Coord[]) => route.map((c) => `${c.x}.${c.z}`).join(' ')

export function deserializeRoute(raw: unknown, world: World): Coord[] {
  const [line] = deserializeLines([{ id: 'r', t: str(raw, '') }], world)
  return line?.tiles ?? []
}
