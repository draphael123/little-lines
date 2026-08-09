/**
 * What the player may place, at metre scale.
 *
 * You never place a house, a shop or a street. You place the railway and the
 * things that serve it; the country arranges itself around what you built.
 * Every public building has to be reachable by rail itself before it does
 * anything at all.
 */

export type BuildingId =
  | 'station'
  | 'terminus'
  | 'watertower'
  | 'shed'
  | 'depot'
  | 'market'
  | 'school'
  | 'clinic'

export interface BuildingDef {
  id: BuildingId
  name: string
  group: 'rail' | 'civic'
  cost: number
  /** Pounds a month once it is standing. */
  upkeep: number
  /** Must stand on the line. */
  onRail: boolean
  /** Metres of influence. */
  range: number
  /** Population of the whole region before it becomes available. */
  unlockAt: number
  blurb: string
  effect: {
    growth?: number
    cap?: number
    service?: number
    trains?: number
    fares?: number
  }
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'station',
    name: 'Station',
    group: 'rail',
    cost: 900,
    upkeep: 12,
    onRail: true,
    range: 380,
    unlockAt: 0,
    blurb:
      'The building everything depends on. A settlement grows only once a station stands within a few hundred metres of it and that station shares a network with a station serving somewhere else.',
    effect: {},
  },
  {
    id: 'watertower',
    name: 'Water tower',
    group: 'rail',
    cost: 400,
    upkeep: 4,
    onRail: true,
    range: 700,
    unlockAt: 0,
    blurb:
      'Engines take water. A tower lifts the service quality of its whole network, which tells most on a long line with more stations than trains.',
    effect: { service: 0.22 },
  },
  {
    id: 'shed',
    name: 'Engine shed',
    group: 'rail',
    cost: 1600,
    upkeep: 10,
    onRail: true,
    range: 0,
    unlockAt: 60,
    blurb:
      'Stabling for one more locomotive. You run as many trains as you have sheds to keep them in, plus the one you started with.',
    effect: { trains: 1 },
  },
  {
    id: 'depot',
    name: 'Goods depot',
    group: 'rail',
    cost: 1300,
    upkeep: 12,
    onRail: true,
    range: 500,
    unlockAt: 150,
    blurb:
      'A yard for freight. Towns in reach can carry more people and pay better fares, because the line brings them more than passengers.',
    effect: { cap: 60, fares: 0.35 },
  },
  {
    id: 'market',
    name: 'Market hall',
    group: 'civic',
    cost: 1000,
    upkeep: 8,
    onRail: true,
    range: 450,
    unlockAt: 250,
    blurb:
      'Somewhere to trade. Quickens the growth of everywhere in reach — provided the market can be reached by rail itself.',
    effect: { growth: 0.3, cap: 30 },
  },
  {
    id: 'school',
    name: 'School',
    group: 'civic',
    cost: 1200,
    upkeep: 11,
    onRail: true,
    range: 450,
    unlockAt: 500,
    blurb:
      'Families stay where there is a school. A modest lift to growth and a large one to how many people the parish will hold.',
    effect: { growth: 0.2, cap: 60 },
  },
  {
    id: 'clinic',
    name: 'Clinic',
    group: 'civic',
    cost: 1500,
    upkeep: 14,
    onRail: true,
    range: 450,
    unlockAt: 900,
    blurb:
      'The difference between a town that holds and a town that empties. The largest lift there is to the population a place can carry.',
    effect: { growth: 0.15, cap: 90 },
  },
  {
    id: 'terminus',
    name: 'Grand terminus',
    group: 'rail',
    cost: 3200,
    upkeep: 30,
    onRail: true,
    range: 620,
    unlockAt: 1500,
    blurb:
      'A great station with far more reach than an ordinary one, and the pull to match. Expensive to keep, and worth it at the heart of a network.',
    effect: { growth: 0.35, cap: 100, fares: 0.25 },
  },
]

export const buildingById = (id: BuildingId): BuildingDef =>
  BUILDINGS.find((b) => b.id === id) ?? BUILDINGS[0]

export const isStation = (id: BuildingId) => id === 'station' || id === 'terminus'

export const unlockedAt = (population: number) =>
  BUILDINGS.filter((b) => population >= b.unlockAt)

/** Something the player has put on the map. */
export interface Structure {
  id: string
  kind: BuildingId
  x: number
  z: number
  y: number
}

/* ------------------------------------------------------------------ money */

export const STARTING_FUNDS = 16000
/** Pounds per metre of plain line. */
export const RAIL_COST = 4
/** Extra pounds per metre where the line has to be carried on a viaduct. */
export const VIADUCT_COST = 16
/** A month of running time, in seconds of a live clock. */
export const MONTH_SECONDS = 26

export const lineCost = (length: number, bridged: number) =>
  Math.round(length * RAIL_COST + bridged * VIADUCT_COST)
