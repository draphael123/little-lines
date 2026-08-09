import { cloneWorld, idx, inBounds, keyOf, neighbours, tileAt, withTile } from './grid'
import { occupiedTiles, segmentsTouching, type Check } from './track'
import {
  MAX_ELEVATION,
  MAX_GRADE,
  type Coord,
  type Feature,
  type RailLine,
  type TileKind,
  type World,
} from './types'

const ok: Check = { ok: true }

/** Deterministic pseudo-randomness so a grown landscape can be reproduced. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Height a tile would have after an edit, for grade checking. */
function heightWith(world: World, override: Map<string, number>, c: Coord): number {
  const o = override.get(keyOf(c))
  return o ?? tileAt(world, c)?.h ?? 0
}

/**
 * Terrain editing must never strand existing rail on an impossible gradient.
 * Every segment that touches the edited tile is re-checked against MAX_GRADE.
 */
export function gradeSurvives(
  world: World,
  lines: RailLine[],
  edits: Map<string, number>,
): boolean {
  for (const k of edits.keys()) {
    const [x, z] = k.split(',').map(Number)
    for (const [a, b] of segmentsTouching(lines, { x, z })) {
      if (Math.abs(heightWith(world, edits, a) - heightWith(world, edits, b)) > MAX_GRADE) {
        return false
      }
    }
  }
  return true
}

export function canSetHeight(world: World, lines: RailLine[], c: Coord, h: number): Check {
  const tile = tileAt(world, c)
  if (!tile) return { ok: false, reason: 'Off the survey.' }
  if (tile.kind === 'water') return { ok: false, reason: 'The river finds its own level.' }
  if (h < 0) return { ok: false, reason: 'Already at table height.' }
  if (h > MAX_ELEVATION) return { ok: false, reason: `Nothing rises above level ${MAX_ELEVATION}.` }
  const edits = new Map([[keyOf(c), h]])
  if (!gradeSurvives(world, lines, edits)) {
    return { ok: false, reason: 'That would leave the rail on an impossible gradient.' }
  }
  return ok
}

export interface TerrainEdit {
  world: World
  check: Check
}

export function adjustHeight(
  world: World,
  lines: RailLine[],
  c: Coord,
  delta: number,
): TerrainEdit {
  const tile = tileAt(world, c)
  if (!tile) return { world, check: { ok: false, reason: 'Off the survey.' } }
  const target = tile.h + delta
  const check = canSetHeight(world, lines, c, target)
  if (!check.ok) return { world, check }
  return { world: withTile(world, c, { h: target }), check }
}

export function canSetKind(world: World, lines: RailLine[], c: Coord, kind: TileKind): Check {
  const tile = tileAt(world, c)
  if (!tile) return { ok: false, reason: 'Off the survey.' }
  const railHere = occupiedTiles(lines).has(keyOf(c))
  if (railHere && kind === 'rock') {
    return { ok: false, reason: 'Rail runs through here — lift the track first.' }
  }
  if (kind === 'water') {
    const edits = new Map([[keyOf(c), 0]])
    if (!gradeSurvives(world, lines, edits)) {
      return { ok: false, reason: 'Flooding this tile would leave the rail on an impossible gradient.' }
    }
  }
  return ok
}

export function setKind(world: World, lines: RailLine[], c: Coord, kind: TileKind): TerrainEdit {
  const check = canSetKind(world, lines, c, kind)
  if (!check.ok) return { world, check }
  const patch: Partial<{ kind: TileKind; h: number; tunnel: boolean; feature: Feature }> = { kind }
  if (kind === 'water') {
    patch.h = 0
    patch.feature = null
    patch.tunnel = false
  }
  if (kind !== 'rock') patch.tunnel = false
  return { world: withTile(world, c, patch), check }
}

export function canBoreTunnel(world: World, c: Coord): Check {
  const tile = tileAt(world, c)
  if (!tile) return { ok: false, reason: 'Off the survey.' }
  if (tile.kind !== 'rock') return { ok: false, reason: 'Tunnels are bored through rock only.' }
  return ok
}

/** The level a tunnel floor is cut to: the lowest ground it opens onto. */
export function portalLevel(world: World, c: Coord): number {
  const tile = tileAt(world, c)
  const levels = neighbours(world, c)
    .map((n) => tileAt(world, n))
    .filter((t): t is NonNullable<typeof t> => !!t && (t.kind !== 'rock' || t.tunnel))
    .map((t) => t.h)
  if (levels.length === 0) return tile?.h ?? 0
  return Math.min(...levels)
}

export function boreTunnel(world: World, c: Coord): TerrainEdit {
  const check = canBoreTunnel(world, c)
  if (!check.ok) return { world, check }
  const tile = tileAt(world, c)!
  const rockTop = typeof tile.rockTop === 'number' ? tile.rockTop : tile.h
  return {
    world: withTile(world, c, { tunnel: true, rockTop, h: portalLevel(world, c) }),
    check,
  }
}

export function fillTunnel(world: World, lines: RailLine[], c: Coord): TerrainEdit {
  const tile = tileAt(world, c)
  if (!tile) return { world, check: { ok: false, reason: 'Off the survey.' } }
  if (occupiedTiles(lines).has(keyOf(c))) {
    return { world, check: { ok: false, reason: 'Rail still runs through this tunnel.' } }
  }
  return {
    world: withTile(world, c, {
      tunnel: false,
      h: typeof tile.rockTop === 'number' ? tile.rockTop : tile.h,
      rockTop: undefined,
    }),
    check: ok,
  }
}

export function canPlaceFeature(
  world: World,
  lines: RailLine[],
  c: Coord,
  feature: Exclude<Feature, null>,
): Check {
  const tile = tileAt(world, c)
  if (!tile) return { ok: false, reason: 'Off the survey.' }
  const railHere = occupiedTiles(lines).has(keyOf(c))
  if (feature === 'station') {
    return railHere ? ok : { ok: false, reason: 'A station needs a line to stand beside.' }
  }
  if (tile.kind === 'water') return { ok: false, reason: 'Nothing stands in the water.' }
  if (railHere) return { ok: false, reason: 'The permanent way is kept clear.' }
  if (tile.kind === 'rock') return { ok: false, reason: 'Bare rock, nothing takes root.' }
  return ok
}

/* --------------------------------------------------------- landscape growth */

export interface GrowOptions {
  seed: number
  /** 0..1 — how much scenery to scatter. */
  density?: number
}

/**
 * "Grow a landscape": carves one winding river, lifts a couple of gentle
 * ridges and scatters restrained scenery. Nothing here is allowed to break
 * an existing line: every height change is grade-checked first, and a river
 * only floods a rail tile when doing so leaves a legal bridge.
 */
export function growLandscape(world: World, lines: RailLine[], opts: GrowOptions): World {
  const rand = mulberry32(opts.seed)
  const density = opts.density ?? 1
  let next = cloneWorld(world)
  const rail = occupiedTiles(lines)

  /* ---- ridges: raise a few soft blobs, one level at a time */
  const ridgeCount = 2 + Math.floor(rand() * 2)
  for (let r = 0; r < ridgeCount; r++) {
    const cx = 1 + Math.floor(rand() * (world.w - 2))
    const cz = 1 + Math.floor(rand() * (world.h - 2))
    const radius = 1.6 + rand() * 2.2
    const peak = 1 + Math.floor(rand() * 2)
    for (let step = 1; step <= peak; step++) {
      const edits = new Map<string, number>()
      for (let z = 0; z < world.h; z++) {
        for (let x = 0; x < world.w; x++) {
          const d = Math.hypot(x - cx, z - cz)
          if (d > radius * (1 - (step - 1) * 0.34)) continue
          const t = next.tiles[idx(world.w, x, z)]
          if (t.kind === 'water' || t.kind === 'rock') continue
          if (t.h >= MAX_ELEVATION) continue
          edits.set(`${x},${z}`, t.h + 1)
        }
      }
      // Apply tile by tile so a single blocked tile does not cancel the ridge.
      for (const [k, h] of edits) {
        const [x, z] = k.split(',').map(Number)
        if (canSetHeight(next, lines, { x, z }, h).ok) {
          next.tiles[idx(world.w, x, z)] = { ...next.tiles[idx(world.w, x, z)], h }
        }
      }
    }
  }

  /* ---- one winding river from a north tile to the southern edge */
  let rx = 2 + Math.floor(rand() * Math.max(1, world.w - 4))
  for (let z = 0; z < world.h; z++) {
    const drift = rand()
    if (drift < 0.3) rx -= 1
    else if (drift > 0.72) rx += 1
    rx = Math.max(1, Math.min(world.w - 2, rx))
    const c = { x: rx, z }
    if (!inBounds(next, c)) continue
    const tile = next.tiles[idx(world.w, rx, z)]
    if (tile.kind === 'rock') continue
    const edit = setKind(next, lines, c, 'water')
    if (edit.check.ok) next = edit.world
  }

  /* ---- restrained scenery on the leftovers */
  for (let z = 0; z < world.h; z++) {
    for (let x = 0; x < world.w; x++) {
      const i = idx(world.w, x, z)
      const tile = next.tiles[i]
      if (tile.kind !== 'meadow' && tile.kind !== 'forest') continue
      if (rail.has(`${x},${z}`)) continue
      if (tile.feature) continue
      // Only pines are scattered: cottages are never placed by hand or by the
      // generator — settlement is something the railway earns.
      if (rand() < 0.11 * density) next.tiles[i] = { ...tile, kind: 'forest', feature: 'tree' }
    }
  }

  return next
}

/** A pleasant starting landscape for a brand new sandbox. */
export function seedSandbox(w: number, h: number, seed = 7): World {
  const blank: World = {
    w,
    h,
    tiles: Array.from({ length: w * h }, () => ({
      h: 0,
      kind: 'meadow' as TileKind,
      tunnel: false,
      feature: null as Feature,
    })),
  }
  return growLandscape(blank, [], { seed, density: 0.85 })
}
