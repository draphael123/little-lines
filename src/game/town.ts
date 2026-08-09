/**
 * How a settlement lays itself out.
 *
 * A town is not a scatter of cottages: it is a street plan. Roads run out from
 * the centre on the level ground the settlement has claimed, buildings line
 * those roads facing them, and both get taller and denser as the population
 * grows. All of it is deterministic — the same settlement always builds the
 * same town, so nothing shuffles between frames.
 */
import { keyOf, neighbours, tileAt } from './grid'
import { tierOf, type Settlement, type Tier } from './economy'
import { mulberry32 } from './terrain'
import { occupiedTiles } from './track'
import type { Coord, RailLine, World } from './types'

export interface RoadTile extends Coord {
  /** Bitmask of connections: 1 north, 2 east, 4 south, 8 west. */
  links: number
}

export type BuildingKind = 'house' | 'terrace' | 'block' | 'civic'

export interface TownBuilding extends Coord {
  /** Offset within the tile, world units. */
  ox: number
  oz: number
  yaw: number
  width: number
  depth: number
  height: number
  kind: BuildingKind
  /** 0..1, varies the render colour. */
  shade: number
}

export type PropKind = 'lamp' | 'hedge' | 'tree'

export interface TownProp extends Coord {
  ox: number
  oz: number
  yaw: number
  kind: PropKind
}

export interface TownPlan {
  roads: RoadTile[]
  buildings: TownBuilding[]
  props: TownProp[]
  tier: Tier
}

const HALF = 0.5
/** Roads sit this far in from a tile edge, leaving a verge for buildings. */
const ROAD_HALF_WIDTH = 0.17

/** How many tiles the town has claimed, by population. */
export function townRadius(population: number): number {
  if (population < 20) return 1
  if (population < 60) return 2
  if (population < 140) return 3
  return 4
}

/**
 * Tiles a settlement may build on: near its centre, flat enough to lay a
 * street, and not already spoken for by rail, water, rock or another town.
 */
export function claimTiles(
  world: World,
  settlement: Settlement,
  lines: RailLine[],
  others: Settlement[],
): Coord[] {
  const centre = { x: settlement.x, z: settlement.z }
  const home = tileAt(world, centre)
  if (!home) return []
  const radius = townRadius(settlement.population)
  const rail = occupiedTiles(lines)
  const taken = new Set(others.filter((s) => s.id !== settlement.id).map((s) => `${s.x},${s.z}`))

  const out: Coord[] = []
  const seen = new Set<string>()
  const queue: Array<{ c: Coord; d: number }> = [{ c: centre, d: 0 }]
  while (queue.length > 0) {
    const { c, d } = queue.shift()!
    const key = keyOf(c)
    if (seen.has(key)) continue
    seen.add(key)
    const tile = tileAt(world, c)
    if (!tile) continue
    const usable =
      tile.kind !== 'water' &&
      tile.kind !== 'rock' &&
      !rail.has(key) &&
      !taken.has(key) &&
      // a town does not climb a cliff: it spreads on ground near its own level
      Math.abs(tile.h - home.h) <= 1
    if (usable) out.push(c)
    if (d < radius) for (const n of neighbours(world, c)) queue.push({ c: n, d: d + 1 })
  }
  return out
}

const inSet = (set: Set<string>, x: number, z: number) => set.has(`${x},${z}`)

/**
 * The street plan. A spine runs east–west through the centre with cross
 * streets every other tile, which is enough structure to read as a planned
 * place while staying legible at this scale.
 */
export function planTown(
  world: World,
  settlement: Settlement,
  lines: RailLine[],
  others: Settlement[],
): TownPlan {
  const tier = tierOf(settlement.population)
  const claimed = claimTiles(world, settlement, lines, others)
  if (claimed.length === 0) return { roads: [], buildings: [], props: [], tier }

  const cx = settlement.x
  const cz = settlement.z
  const rand = mulberry32(settlement.x * 7919 + settlement.z * 104729 + 17)

  /* ---- roads: the spine, plus cross streets on alternate columns */
  const roadSet = new Set<string>()
  for (const c of claimed) {
    const onSpine = c.z === cz
    const onCross = (c.x - cx) % 2 === 0 && Math.abs(c.z - cz) <= townRadius(settlement.population)
    if (onSpine || onCross) roadSet.add(keyOf(c))
  }
  // A single-tile hamlet has no street at all — just a lane through it.
  if (roadSet.size <= 1 && claimed.length > 1) roadSet.add(keyOf(claimed[0]))

  const roads: RoadTile[] = [...roadSet].map((key) => {
    const [x, z] = key.split(',').map(Number)
    let links = 0
    if (inSet(roadSet, x, z - 1)) links |= 1
    if (inSet(roadSet, x + 1, z)) links |= 2
    if (inSet(roadSet, x, z + 1)) links |= 4
    if (inSet(roadSet, x - 1, z)) links |= 8
    return { x, z, links }
  })

  /* ---- buildings line whichever roads they can see */
  const buildings: TownBuilding[] = []
  const props: TownProp[] = []
  const plots = claimed.filter((c) => !roadSet.has(keyOf(c)))
  // Nothing but road: put the buildings on the road tiles' verges instead.
  const frontages = plots.length > 0 ? plots : claimed

  const maxBuildings = Math.max(1, Math.min(34, Math.round(settlement.population / 4.5)))
  let placed = 0

  for (const plot of frontages) {
    if (placed >= maxBuildings) break
    // Which side of this plot faces a street?
    const facings: Array<{ yaw: number; ox: number; oz: number }> = []
    if (inSet(roadSet, plot.x, plot.z - 1)) facings.push({ yaw: Math.PI, ox: 0, oz: -0.16 })
    if (inSet(roadSet, plot.x, plot.z + 1)) facings.push({ yaw: 0, ox: 0, oz: 0.16 })
    if (inSet(roadSet, plot.x - 1, plot.z)) facings.push({ yaw: Math.PI / 2, ox: -0.16, oz: 0 })
    if (inSet(roadSet, plot.x + 1, plot.z)) facings.push({ yaw: -Math.PI / 2, ox: 0.16, oz: 0 })
    if (facings.length === 0) facings.push({ yaw: rand() * Math.PI * 2, ox: 0, oz: 0 })

    const facing = facings[Math.floor(rand() * facings.length) % facings.length]
    const alongX = Math.abs(Math.cos(facing.yaw)) > 0.5
    const perRow = tier === 'hamlet' ? 1 : tier === 'village' ? 2 : 3

    for (let i = 0; i < perRow && placed < maxBuildings; i++) {
      const slide = perRow === 1 ? 0 : (i / (perRow - 1) - 0.5) * 0.56
      const kind = pickKind(tier, rand())
      const height = heightFor(kind, tier, rand())
      buildings.push({
        x: plot.x,
        z: plot.z,
        ox: facing.ox + (alongX ? 0 : slide),
        oz: facing.oz + (alongX ? slide : 0),
        yaw: facing.yaw,
        width: kind === 'terrace' ? 0.24 : kind === 'civic' ? 0.44 : 0.28,
        depth: kind === 'civic' ? 0.4 : 0.26,
        height,
        kind,
        shade: rand(),
      })
      placed++
    }

    // A hedge on the back of the plot, away from the street.
    if (rand() < 0.45) {
      props.push({
        x: plot.x,
        z: plot.z,
        ox: -facing.ox * 1.9,
        oz: -facing.oz * 1.9,
        yaw: facing.yaw,
        kind: 'hedge',
      })
    }
  }

  /* ---- street lamps down the spine, one every other tile */
  for (const road of roads) {
    if ((road.x + road.z) % 2 !== 0) continue
    if (props.length > 26) break
    props.push({
      x: road.x,
      z: road.z,
      ox: ROAD_HALF_WIDTH + 0.09,
      oz: ROAD_HALF_WIDTH + 0.09,
      yaw: 0,
      kind: 'lamp',
    })
  }

  /* ---- a civic building in the middle once the place is a town */
  if (tier === 'town' || tier === 'city') {
    const seat = buildings[0]
    if (seat) {
      seat.kind = 'civic'
      seat.width = 0.46
      seat.depth = 0.42
      seat.height = tier === 'city' ? 0.95 : 0.72
    }
  }

  return { roads, buildings, props, tier }
}

function pickKind(tier: Tier, roll: number): BuildingKind {
  if (tier === 'hamlet') return 'house'
  if (tier === 'village') return roll < 0.65 ? 'house' : 'terrace'
  if (tier === 'town') return roll < 0.3 ? 'house' : roll < 0.8 ? 'terrace' : 'block'
  return roll < 0.15 ? 'house' : roll < 0.55 ? 'terrace' : 'block'
}

function heightFor(kind: BuildingKind, tier: Tier, roll: number): number {
  const storey = 0.17
  const base =
    kind === 'house' ? 1.4 : kind === 'terrace' ? 2 : kind === 'civic' ? 2.6 : tier === 'city' ? 4.4 : 3
  return (base + roll * (kind === 'block' ? 2.4 : 0.6)) * storey
}

export interface TrafficRoute {
  /** The main street, ordered west to east. */
  tiles: Coord[]
  cars: number
}

/**
 * The high street a town's traffic runs along: the longest unbroken run of
 * road through the settlement's own row. Returns null for a place too small
 * to have a street worth driving.
 */
export function trafficRoute(plan: TownPlan, settlement: Settlement): TrafficRoute | null {
  const spine = plan.roads
    .filter((r) => r.z === settlement.z)
    .sort((a, b) => a.x - b.x)
  if (spine.length < 2) return null

  // Keep only the unbroken run that contains the town centre.
  let start = 0
  let best: Coord[] = []
  for (let i = 1; i <= spine.length; i++) {
    const broken = i === spine.length || spine[i].x !== spine[i - 1].x + 1
    if (!broken) continue
    const run = spine.slice(start, i)
    if (run.some((r) => r.x === settlement.x) || run.length > best.length) {
      if (run.length > best.length || run.some((r) => r.x === settlement.x)) best = run
    }
    start = i
  }
  if (best.length < 2) return null

  return {
    tiles: best.map((r) => ({ x: r.x, z: r.z })),
    cars: Math.max(1, Math.min(4, Math.round(settlement.population / 28))),
  }
}

/** Road surface geometry: a cross of strips through each road tile. */
export function roadStrips(road: RoadTile): Array<{
  ox: number
  oz: number
  width: number
  depth: number
}> {
  const strips: Array<{ ox: number; oz: number; width: number; depth: number }> = []
  const w = ROAD_HALF_WIDTH * 2
  // the junction square is always there so corners join cleanly
  strips.push({ ox: 0, oz: 0, width: w, depth: w })
  if (road.links & 1) strips.push({ ox: 0, oz: -(HALF + ROAD_HALF_WIDTH) / 2, width: w, depth: HALF - ROAD_HALF_WIDTH })
  if (road.links & 4) strips.push({ ox: 0, oz: (HALF + ROAD_HALF_WIDTH) / 2, width: w, depth: HALF - ROAD_HALF_WIDTH })
  if (road.links & 8) strips.push({ ox: -(HALF + ROAD_HALF_WIDTH) / 2, oz: 0, width: HALF - ROAD_HALF_WIDTH, depth: w })
  if (road.links & 2) strips.push({ ox: (HALF + ROAD_HALF_WIDTH) / 2, oz: 0, width: HALF - ROAD_HALF_WIDTH, depth: w })
  return strips
}
