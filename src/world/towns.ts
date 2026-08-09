/**
 * The country answers back, in metres.
 *
 * A settlement grows only when a station stands within its catchment and that
 * station shares a network with a station serving somewhere else. A railway
 * between two places carries passengers; a line that loops round one carries
 * nobody. Public buildings lift growth and the ceiling, but only once the rail
 * can reach them too. Nothing shrinks unless you take its railway away.
 */
import { buildingById, isStation, type BuildingId, type Structure } from './buildings'
import { fbm, siteScore, type Heightfield } from './heightfield'
import { componentOfEdge, components, nearestOnNetwork, type RailNetwork } from './rail'

export type Tier = 'hamlet' | 'village' | 'town' | 'city'

export interface Settlement {
  id: string
  x: number
  z: number
  name: string
  population: number
  peak: number
  wasServed: boolean
}

export const TIERS: Array<[Tier, number]> = [
  ['city', 1200],
  ['town', 400],
  ['village', 120],
  ['hamlet', 0],
]

export function tierOf(population: number): Tier {
  for (const [tier, floor] of TIERS) if (population >= floor) return tier
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
  'Harrow', 'Willow', 'Slate', 'Nether', 'Upper', 'Ellis', 'Quarry', 'Hollin',
  'Barley', 'Sedge', 'Ridge', 'Milden', 'Oaken', 'Stane', 'Whitt',
]
const SUFFIX = [
  'ford', 'thorpe', 'combe', 'bridge', 'well', 'ton', 'wick', 'mere', 'dale',
  'hollow', 'gate', 'stead', 'bury', 'field', 'moor', 'haven', 'cross',
]

export function settlementName(seed: number): string {
  const a = PREFIX[Math.abs(Math.round(seed * 7919)) % PREFIX.length]
  const b = SUFFIX[Math.abs(Math.round(seed * 104729)) % SUFFIX.length]
  return a + b
}

/* ------------------------------------------------------------- foundation */

export const MIN_SPACING = 520

/** Hamlets on the likeliest ground, well spread across the region. */
export function seedSettlements(field: Heightfield, count: number): Settlement[] {
  const candidates: Array<{ x: number; z: number; score: number }> = []
  const step = 110
  for (let z = -1700; z <= 1700; z += step) {
    for (let x = -1700; x <= 1700; x += step) {
      const score = siteScore(field, x, z)
      if (score < 0.72) continue
      // a little noise so the picks are not a lattice
      candidates.push({ x, z, score: score + fbm(x * 0.004, z * 0.004, 91, 2) * 0.25 })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const chosen: Settlement[] = []
  for (const c of candidates) {
    if (chosen.length >= count) break
    if (chosen.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < MIN_SPACING)) continue
    const population = 14 + Math.round(fbm(c.x * 0.01, c.z * 0.01, 7, 2) * 22)
    chosen.push({
      id: `s${Math.round(c.x)}_${Math.round(c.z)}`,
      x: c.x,
      z: c.z,
      name: settlementName(c.x * 0.013 + c.z * 0.029),
      population,
      peak: population,
      wasServed: false,
    })
  }
  return chosen
}

/* ------------------------------------------------------------- the survey */

export type TownState = 'unserved' | 'isolated' | 'growing' | 'full' | 'declining'

export interface TownReport {
  settlement: Settlement
  tier: Tier
  station: Structure | null
  networkId: number | null
  linked: boolean
  service: number
  quality: number
  cap: number
  growth: number
  fares: number
  amenities: BuildingId[]
  state: TownState
  reason: string
}

/**
 * Rates are per second of running time, and a month is MONTH_SECONDS long — so
 * BASE_GROWTH of 0.34 is roughly nine people a month arriving at a well served
 * place with room to grow. That is deliberately slow: a hamlet should take a
 * year of play to become a village, not eight seconds.
 */
export const BASE_GROWTH = 0.34
export const FARE_RATE = 0.009
export const DECLINE_RATE = 0.14
export const FLOOR_POPULATION = 8
export const MAX_TRAINS = 12

export const populationCap = (quality: number) => Math.round(140 + quality * 900)

export function trainCapacity(structures: Structure[]): number {
  const sheds = structures.filter((s) => s.kind === 'shed').length
  return Math.max(1, Math.min(MAX_TRAINS, 1 + sheds))
}

const gap = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** Which network component each structure sits on, if any. */
export function networkOfStructures(
  network: RailNetwork,
  structures: Structure[],
): Map<string, number> {
  const byEdge = componentOfEdge(network)
  const out = new Map<string, number>()
  for (const s of structures) {
    const hit = nearestOnNetwork(network, s.x, s.z, 80)
    if (!hit) continue
    const component = byEdge.get(hit.edgeId)
    if (component !== undefined) out.set(s.id, component)
  }
  return out
}

export function survey(
  field: Heightfield,
  network: RailNetwork,
  structures: Structure[],
  settlements: Settlement[],
  trainRoster: number,
): TownReport[] {
  const onNetwork = networkOfStructures(network, structures)
  const groups = components(network)
  const trainsPer = groups.map((_, i) =>
    Math.floor(trainRoster / groups.length) + (i < trainRoster % groups.length ? 1 : 0),
  )

  const stations = structures.filter((s) => isStation(s.kind))
  const stationFor = new Map<string, Structure>()
  const servedBy = new Map<string, string>()
  for (const settlement of settlements) {
    let best: Structure | null = null
    let bestD = Infinity
    for (const station of stations) {
      const d = gap(station, settlement)
      if (d <= buildingById(station.kind).range && d < bestD) {
        best = station
        bestD = d
      }
    }
    if (best) {
      stationFor.set(settlement.id, best)
      servedBy.set(best.id, settlement.id)
    }
  }

  const serves = new Map<number, Set<string>>()
  for (const [stationId, settlementId] of servedBy) {
    const component = onNetwork.get(stationId)
    if (component === undefined) continue
    if (!serves.has(component)) serves.set(component, new Set())
    serves.get(component)!.add(settlementId)
  }
  const live = (component: number | null | undefined) =>
    component !== null && component !== undefined && (serves.get(component)?.size ?? 0) >= 2

  /** A public building works only if the rail can reach it too. */
  const working = structures.filter((s) => {
    if (isStation(s.kind)) return true
    const component = onNetwork.get(s.id)
    if (buildingById(s.kind).group === 'rail') return live(component)
    return stations.some(
      (station) =>
        gap(station, s) <= Math.max(buildingById(station.kind).range, buildingById(s.kind).range) &&
        live(onNetwork.get(station.id)),
    )
  })

  const serviceBonus = new Map<number, number>()
  for (const s of working) {
    const bonus = buildingById(s.kind).effect.service
    const component = onNetwork.get(s.id)
    if (!bonus || component === undefined) continue
    serviceBonus.set(component, (serviceBonus.get(component) ?? 0) + bonus)
  }

  const stationsOn = new Map<number, number>()
  for (const s of stations) {
    const component = onNetwork.get(s.id)
    if (component === undefined) continue
    stationsOn.set(component, (stationsOn.get(component) ?? 0) + 1)
  }

  return settlements.map((settlement) => {
    const quality = siteScore(field, settlement.x, settlement.z)
    const tier = tierOf(settlement.population)
    const inRange = working.filter(
      (s) => !isStation(s.kind) && gap(s, settlement) <= buildingById(s.kind).range,
    )
    const amenities = inRange.map((s) => s.kind)
    const growthBonus = inRange.reduce((n, s) => n + (buildingById(s.kind).effect.growth ?? 0), 0)
    const capBonus = inRange.reduce((n, s) => n + (buildingById(s.kind).effect.cap ?? 0), 0)
    const fares = 1 + inRange.reduce((n, s) => n + (buildingById(s.kind).effect.fares ?? 0), 0)
    const cap = populationCap(quality) + capBonus

    const station = stationFor.get(settlement.id) ?? null
    const emptying = settlement.wasServed && settlement.population > FLOOR_POPULATION
    const base = {
      settlement, tier, quality, cap, fares, amenities,
    }

    if (!station) {
      return {
        ...base, station: null, networkId: null, linked: false, service: 0,
        growth: emptying ? -DECLINE_RATE : 0,
        state: emptying ? ('declining' as const) : ('unserved' as const),
        reason: emptying ? 'The station has gone, and people are leaving.' : 'No station within reach.',
      }
    }

    const component = onNetwork.get(station.id) ?? null
    const linked = live(component)
    if (!linked) {
      return {
        ...base, station, networkId: component, linked: false, service: 0,
        growth: emptying ? -DECLINE_RATE : 0,
        state: emptying ? ('declining' as const) : ('isolated' as const),
        reason: emptying
          ? 'Cut off from everywhere else, and emptying.'
          : 'This line reaches nowhere else. Run it to a second settlement.',
      }
    }

    const stationCount = Math.max(1, stationsOn.get(component!) ?? 1)
    const trains = trainsPer[component!] ?? 0
    const bonus = serviceBonus.get(component!) ?? 0
    const service = Math.max(0, Math.min(1, trains / Math.max(1, stationCount / 2) + bonus))
    if (service <= 0) {
      return {
        ...base, station, networkId: component, linked: true, service: 0, growth: 0,
        state: 'isolated' as const,
        reason: 'No train works this network.',
      }
    }

    const headroom = Math.max(0, 1 - settlement.population / cap)
    const growth = BASE_GROWTH * service * quality * (1 + growthBonus) * headroom
    return {
      ...base, station, networkId: component, linked: true, service, growth,
      state: headroom <= 0.02 ? ('full' as const) : ('growing' as const),
      reason:
        headroom <= 0.02
          ? 'As large as this ground will carry. Build something that raises the ceiling.'
          : `${trains} train${trains === 1 ? '' : 's'} over ${stationCount} station${stationCount === 1 ? '' : 's'}${amenities.length ? `, and ${amenities.length} public building${amenities.length === 1 ? '' : 's'}` : ''}.`,
    }
  })
}

export interface CountryTick {
  settlements: Settlement[]
  income: number
  passengers: number
  population: number
}

export function tick(
  field: Heightfield,
  network: RailNetwork,
  structures: Structure[],
  settlements: Settlement[],
  trainRoster: number,
  dt: number,
): CountryTick {
  const step = Math.max(0, Math.min(dt, 1))
  const reports = survey(field, network, structures, settlements, trainRoster)
  let income = 0
  let passengers = 0
  let population = 0

  const next = reports.map((report) => {
    const moved = report.settlement.population + report.growth * step
    const settled = Math.max(FLOOR_POPULATION, Math.min(report.cap, moved))
    population += settled
    if (report.state === 'growing' || report.state === 'full') {
      passengers += report.settlement.population * report.service * step * 0.3
      income += report.settlement.population * report.service * report.fares * FARE_RATE * step
    }
    return {
      ...report.settlement,
      population: settled,
      peak: Math.max(report.settlement.peak, settled),
      wasServed: report.settlement.wasServed || report.linked,
    }
  })

  return { settlements: next, income, passengers, population }
}

/**
 * People the railway actually carries: the population of places that have a
 * station on a network reaching somewhere else. This — not the region total —
 * is what progression is measured in, so the ladder starts at zero however
 * many hamlets the country happens to have been seeded with.
 */
export const servedPopulation = (reports: TownReport[]) =>
  reports
    .filter((r) => r.state === 'growing' || r.state === 'full')
    .reduce((sum, r) => sum + r.settlement.population, 0)

export const totalPopulation = (settlements: Settlement[]) =>
  settlements.reduce((n, s) => n + s.population, 0)

export const upkeepTotal = (structures: Structure[]) =>
  structures.reduce((n, s) => n + buildingById(s.kind).upkeep, 0)
