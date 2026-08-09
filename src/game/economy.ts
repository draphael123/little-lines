/**
 * The country answers back.
 *
 * Free Build's premise is that you never build a town — you build a railway,
 * and settlement follows it. This module is the whole simulation, kept pure so
 * it runs identically whether or not there is a canvas on screen.
 *
 * The rules, in one place:
 *   · A settlement only grows when a station stands within its catchment.
 *   · That station must share a network with a station serving somewhere else.
 *     A line that loops round one hamlet carries nobody.
 *   · Service quality falls as a network's stations outnumber its trains.
 *   · The ground matters: flat meadow by water thrives, high or rock-hemmed
 *     ground grows slowly and caps out small.
 *   · Fares are earned from population actually being served. Nothing ever
 *     goes bankrupt.
 */
import { idx, inBounds, keyOf, neighbours, tileAt } from './grid'
import { mulberry32 } from './terrain'
import { occupiedTiles } from './track'
import type { Coord, RailLine, World } from './types'

export type Tier = 'hamlet' | 'village' | 'town' | 'city'

export interface Settlement {
  id: string
  x: number
  z: number
  name: string
  population: number
}

export const CATCHMENT = 2
export const TIER_THRESHOLDS: Array<[Tier, number]> = [
  ['city', 140],
  ['town', 60],
  ['village', 20],
  ['hamlet', 0],
]

export function tierOf(population: number): Tier {
  for (const [tier, floor] of TIER_THRESHOLDS) if (population >= floor) return tier
  return 'hamlet'
}

export const TIER_LABEL: Record<Tier, string> = {
  hamlet: 'Hamlet',
  village: 'Village',
  town: 'Town',
  city: 'City',
}

/* ------------------------------------------------------------------ names */

const PREFIX = [
  'Ash', 'Bram', 'Kettle', 'Marrow', 'Thorn', 'Wold', 'Cald', 'Brack', 'Fen',
  'Harrow', 'Willow', 'Slate', 'Nether', 'Upper', 'Bram', 'Ellis', 'Quarry',
  'Hollin', 'Barley', 'Sedge',
]
const SUFFIX = [
  'ford', 'thorpe', 'combe', 'bridge', 'well', 'ton', 'wick', 'mere', 'dale',
  'hollow', 'gate', 'stead', 'bury', 'field', 'moor',
]

/** Deterministic, so a saved world reloads with the same names. */
export function settlementName(seed: number): string {
  const rand = mulberry32(seed * 2654435761)
  const a = PREFIX[Math.floor(rand() * PREFIX.length)]
  const b = SUFFIX[Math.floor(rand() * SUFFIX.length)]
  return `${a}${b}`
}

/* ---------------------------------------------------------- site quality */

/**
 * How well a place can grow, 0.25 (a ledge hemmed in by rock) to about 1.5
 * (flat meadow with water in sight). Forgiving on purpose: nowhere is ruled out.
 */
export function siteQuality(world: World, at: Coord): number {
  const tile = tileAt(world, at)
  if (!tile) return 0
  if (tile.kind === 'water') return 0
  if (tile.kind === 'rock') return 0.25

  let quality = 1
  const ring: Coord[] = []
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue
      const c = { x: at.x + dx, z: at.z + dz }
      if (inBounds(world, c)) ring.push(c)
    }
  }
  const tiles = ring.map((c) => world.tiles[idx(world.w, c.x, c.z)])
  const rock = tiles.filter((t) => t.kind === 'rock').length
  const water = tiles.filter((t) => t.kind === 'water').length
  const flat = tiles.filter((t) => t.h === tile.h).length

  if (water > 0) quality += 0.25
  if (water > 3) quality -= 0.15
  quality -= rock * 0.11
  quality += (flat / Math.max(1, tiles.length)) * 0.28
  quality -= tile.h * 0.12
  return Math.max(0.25, Math.min(1.5, Number(quality.toFixed(3))))
}

export const populationCap = (quality: number) => Math.round(40 + quality * 150)

/* -------------------------------------------------------------- networks */

export interface Network {
  id: number
  lineIds: string[]
  tiles: Set<string>
  stations: Coord[]
  /** Trains allotted to this network by the shared roster. */
  trains: number
}

/** Lines that share any tile form one network, so junctions really connect. */
export function buildNetworks(world: World, lines: RailLine[], trainRoster: number): Network[] {
  const usable = lines.filter((l) => l.tiles.length >= 2)
  const parent = usable.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const owner = new Map<string, number>()
  usable.forEach((line, i) => {
    for (const t of line.tiles) {
      const k = keyOf(t)
      const seen = owner.get(k)
      if (seen === undefined) owner.set(k, i)
      else union(seen, i)
    }
  })

  const groups = new Map<number, Network>()
  usable.forEach((line, i) => {
    const root = find(i)
    let net = groups.get(root)
    if (!net) {
      net = { id: groups.size, lineIds: [], tiles: new Set(), stations: [], trains: 0 }
      groups.set(root, net)
    }
    net.lineIds.push(line.id)
    for (const t of line.tiles) {
      net.tiles.add(keyOf(t))
      if (tileAt(world, t)?.feature === 'station') net.stations.push(t)
    }
  })

  const networks = [...groups.values()].map((n, i) => ({ ...n, id: i }))
  // Trains are handed out to lines round-robin, exactly as the renderer does.
  usable.forEach((line, i) => {
    const trains = Math.floor(trainRoster / usable.length) + (i < trainRoster % usable.length ? 1 : 0)
    const net = networks.find((n) => n.lineIds.includes(line.id))
    if (net) net.trains += trains
  })
  return networks
}

/* ------------------------------------------------------------- the survey */

export type SettlementState = 'unserved' | 'isolated' | 'growing' | 'full'

export interface SettlementReport {
  settlement: Settlement
  tier: Tier
  station: Coord | null
  networkId: number | null
  linked: boolean
  /** 0..1, falls as a network's stations outnumber its trains. */
  service: number
  quality: number
  cap: number
  /** People per second at the current moment. */
  growth: number
  state: SettlementState
  reason: string
}

const manhattan = (a: Coord, b: Coord) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z)

export function surveyCountry(
  world: World,
  lines: RailLine[],
  settlements: Settlement[],
  trainRoster: number,
): SettlementReport[] {
  const networks = buildNetworks(world, lines, trainRoster)

  const stationOwner = new Map<string, number>()
  networks.forEach((net) => {
    for (const s of net.stations) stationOwner.set(keyOf(s), net.id)
  })

  // Which settlement, if any, does each station serve?
  const servedBy = new Map<string, string>()
  for (const settlement of settlements) {
    const here = { x: settlement.x, z: settlement.z }
    let best: Coord | null = null
    let bestDistance = Infinity
    for (const net of networks) {
      for (const station of net.stations) {
        const d = manhattan(station, here)
        if (d <= CATCHMENT && d < bestDistance) {
          best = station
          bestDistance = d
        }
      }
    }
    if (best) servedBy.set(keyOf(best), settlement.id)
  }

  // A network carries traffic only when two of its stations serve
  // different places.
  const networkServes = new Map<number, Set<string>>()
  for (const [stationKey, settlementId] of servedBy) {
    const netId = stationOwner.get(stationKey)
    if (netId === undefined) continue
    if (!networkServes.has(netId)) networkServes.set(netId, new Set())
    networkServes.get(netId)!.add(settlementId)
  }

  return settlements.map((settlement) => {
    const here = { x: settlement.x, z: settlement.z }
    const quality = siteQuality(world, here)
    const cap = populationCap(quality)
    const tier = tierOf(settlement.population)

    let station: Coord | null = null
    for (const [stationKey, id] of servedBy) {
      if (id !== settlement.id) continue
      const [x, z] = stationKey.split(',').map(Number)
      station = { x, z }
    }

    if (!station) {
      return {
        settlement, tier, station: null, networkId: null, linked: false,
        service: 0, quality, cap, growth: 0, state: 'unserved',
        reason: 'No station within two tiles.',
      }
    }

    const networkId = stationOwner.get(keyOf(station)) ?? null
    const network = networks.find((n) => n.id === networkId) ?? null
    const partners = networkId === null ? new Set<string>() : (networkServes.get(networkId) ?? new Set())
    const linked = partners.size >= 2

    if (!linked) {
      return {
        settlement, tier, station, networkId, linked: false,
        service: 0, quality, cap, growth: 0, state: 'isolated',
        reason: 'The line reaches nowhere else. Run it to a second settlement.',
      }
    }

    const stationCount = Math.max(1, network?.stations.length ?? 1)
    const trains = network?.trains ?? 0
    const service = Math.max(0, Math.min(1, trains / Math.max(1, stationCount / 2)))

    if (service <= 0) {
      return {
        settlement, tier, station, networkId, linked: true,
        service: 0, quality, cap, growth: 0, state: 'isolated',
        reason: 'No train works this network.',
      }
    }

    const headroom = Math.max(0, 1 - settlement.population / cap)
    const growth = BASE_GROWTH * service * quality * headroom
    return {
      settlement, tier, station, networkId, linked: true,
      service, quality, cap, growth,
      state: headroom <= 0.02 ? 'full' : 'growing',
      reason:
        headroom <= 0.02
          ? 'As large as this ground will carry.'
          : `Served by ${trains} train${trains === 1 ? '' : 's'} across ${stationCount} station${stationCount === 1 ? '' : 's'}.`,
    }
  })
}

/** People per second at perfect service on ideal ground. */
export const BASE_GROWTH = 0.9
/** Pounds per person per second, at perfect service. */
export const FARE_RATE = 0.055

export interface CountryTick {
  settlements: Settlement[]
  income: number
  passengers: number
  population: number
}

export function tickCountry(
  world: World,
  lines: RailLine[],
  settlements: Settlement[],
  trainRoster: number,
  dt: number,
): CountryTick {
  const step = Math.max(0, Math.min(dt, 1))
  const reports = surveyCountry(world, lines, settlements, trainRoster)
  let income = 0
  let passengers = 0
  let population = 0

  const next = reports.map((report) => {
    const grown = report.settlement.population + report.growth * step
    const capped = Math.min(report.cap, grown)
    population += capped
    if (report.state === 'growing' || report.state === 'full') {
      const carried = report.settlement.population * report.service * step * 0.35
      passengers += carried
      income += report.settlement.population * report.service * FARE_RATE * step
    }
    return { ...report.settlement, population: capped }
  })

  return { settlements: next, income, passengers, population }
}

export const totalPopulation = (settlements: Settlement[]) =>
  settlements.reduce((n, s) => n + s.population, 0)

/* -------------------------------------------------------------- milestones */

export interface Milestone {
  population: number
  title: string
  detail: string
}

export const MILESTONES: Milestone[] = [
  { population: 40, title: 'First timetable', detail: 'Two places joined by rail and a train between them.' },
  { population: 120, title: 'Wide table unlocked', detail: 'The board grants you an eighteen by thirteen survey.' },
  { population: 350, title: 'Grand table unlocked', detail: 'The full twenty-four by seventeen table is yours.' },
  { population: 800, title: 'Trunk route', detail: 'The line is the making of this country.' },
  { population: 1600, title: 'The Grand Northern', detail: 'A network of national consequence.' },
]

export function nextMilestone(population: number): { next: Milestone | null; progress: number } {
  const next = MILESTONES.find((m) => population < m.population) ?? null
  if (!next) return { next: null, progress: 1 }
  const previous = [...MILESTONES].reverse().find((m) => population >= m.population)
  const floor = previous?.population ?? 0
  return {
    next,
    progress: Math.max(0, Math.min(1, (population - floor) / (next.population - floor))),
  }
}

export const SIZE_UNLOCKS = { small: 0, wide: 120, grand: 350 } as const

/* ------------------------------------------------------------------ money */

/**
 * Light finance: enough that a bridge or a tunnel is a real decision, never
 * enough to lose with. Fares arrive continuously from population actually
 * being carried, so a stalled network simply stops earning.
 */
export const STARTING_FUNDS = 1200

export const COSTS = {
  rail: 12,
  bridge: 70,
  station: 180,
  terrain: 15,
  tunnel: 220,
  tree: 2,
  water: 8,
} as const

/* ------------------------------------------------------------- foundation */

/** Somewhere a hamlet would plausibly already exist. */
export function seedSettlements(world: World, count: number, seed: number, existing: Settlement[] = []): Settlement[] {
  const rand = mulberry32(seed)
  const candidates: Array<{ c: Coord; q: number }> = []
  for (let z = 1; z < world.h - 1; z++) {
    for (let x = 1; x < world.w - 1; x++) {
      const q = siteQuality(world, { x, z })
      if (q < 0.95) continue
      candidates.push({ c: { x, z }, q: q + rand() * 0.3 })
    }
  }
  candidates.sort((a, b) => b.q - a.q)

  const chosen = [...existing]
  const minGap = Math.max(4, Math.round(Math.min(world.w, world.h) / 3))
  for (const candidate of candidates) {
    if (chosen.length >= existing.length + count) break
    if (chosen.some((s) => manhattan({ x: s.x, z: s.z }, candidate.c) < minGap)) continue
    chosen.push({
      id: `s-${candidate.c.x}-${candidate.c.z}`,
      x: candidate.c.x,
      z: candidate.c.z,
      name: settlementName(candidate.c.x * 131 + candidate.c.z * 977 + seed),
      population: 6 + Math.floor(rand() * 9),
    })
  }
  return chosen
}

/* ------------------------------------------------------- where houses go */

export interface BuildingSlot {
  x: number
  z: number
  /** Offset within the tile, in world units. */
  ox: number
  oz: number
  spin: number
  landmark: boolean
}

/**
 * Deterministic building placement for a settlement, spilling into nearby
 * tiles as it grows. Never uses rail, water or rock, and never treads on a
 * neighbouring settlement's centre.
 */
export function buildingSlots(
  world: World,
  settlement: Settlement,
  lines: RailLine[],
  others: Settlement[],
): BuildingSlot[] {
  const wanted = Math.max(1, Math.min(16, 1 + Math.floor(settlement.population / 7)))
  const rail = occupiedTiles(lines)
  const taken = new Set(
    others.filter((s) => s.id !== settlement.id).map((s) => `${s.x},${s.z}`),
  )
  const centre = { x: settlement.x, z: settlement.z }

  const ranked: Coord[] = []
  const seen = new Set<string>()
  const frontier: Coord[] = [centre]
  while (frontier.length > 0 && ranked.length < wanted + 8) {
    const c = frontier.shift()!
    const k = keyOf(c)
    if (seen.has(k)) continue
    seen.add(k)
    const tile = tileAt(world, c)
    if (!tile) continue
    const usable = tile.kind !== 'water' && tile.kind !== 'rock' && !rail.has(k) && !taken.has(k)
    if (usable) ranked.push(c)
    for (const n of neighbours(world, c)) if (!seen.has(keyOf(n))) frontier.push(n)
  }

  const slots: BuildingSlot[] = []
  const rand = mulberry32(settlement.x * 7919 + settlement.z * 104729)
  const tier = tierOf(settlement.population)
  for (let i = 0; i < wanted && ranked.length > 0; i++) {
    const c = ranked[i % ranked.length]
    const second = i >= ranked.length
    slots.push({
      x: c.x,
      z: c.z,
      ox: (rand() - 0.5) * (second ? 0.52 : 0.3),
      oz: (rand() - 0.5) * (second ? 0.52 : 0.3),
      spin: Math.floor(rand() * 4) * (Math.PI / 2),
      landmark: i === 0 && (tier === 'town' || tier === 'city'),
    })
  }
  return slots
}
