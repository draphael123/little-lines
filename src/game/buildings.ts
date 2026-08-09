/**
 * What the player is allowed to place.
 *
 * The rule the whole game rests on: you never place a house, a shop or a
 * street. You place the railway and the things that serve it, and the country
 * arranges itself around what you have built. So everything in this catalogue
 * is either infrastructure or a public building — and every public building
 * has to be reachable by rail itself before it does anything at all.
 */
import { LEVELS } from './levels'
import type { BuildingId } from './types'

export type { BuildingId }

export type BuildingGroup = 'rail' | 'civic'

export interface BuildingDef {
  id: BuildingId
  name: string
  group: BuildingGroup
  cost: number
  /** Pounds per month once it is standing. */
  upkeep: number
  /** Must be placed on a tile carrying rail. */
  onRail: boolean
  /** How many tiles out its effect reaches. */
  range: number
  /** Campaign level whose completion unlocks it; null means from the start. */
  unlockedBy: string | null
  blurb: string
  effect: {
    /** Multiplier added to the growth of settlements in range. */
    growth?: number
    /** Extra people the ground in range can carry. */
    cap?: number
    /** Added to the service quality of the network it stands on. */
    service?: number
    /** Extra locomotives this network may run. */
    trains?: number
    /** Multiplier added to fares earned by settlements in range. */
    fares?: number
  }
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'station',
    name: 'Station',
    group: 'rail',
    cost: 180,
    upkeep: 12,
    onRail: true,
    range: 2,
    unlockedBy: null,
    blurb:
      'The one building everything else depends on. A settlement grows only once a station stands within two tiles of it and that station shares a network with a station serving somewhere else.',
    effect: {},
  },
  {
    id: 'watertower',
    name: 'Water tower',
    group: 'rail',
    cost: 90,
    upkeep: 3,
    onRail: true,
    range: 4,
    unlockedBy: 'harrow-bend',
    blurb:
      'Engines take water. A tower raises the service quality of its whole network, which matters most on a long line with more stations than trains.',
    effect: { service: 0.2 },
  },
  {
    id: 'shed',
    name: 'Engine shed',
    group: 'rail',
    cost: 320,
    upkeep: 8,
    onRail: true,
    range: 0,
    unlockedBy: 'kettleford',
    blurb:
      'Stabling for one more locomotive. You run as many trains as you have sheds to keep them in, plus the one you started with.',
    effect: { trains: 1 },
  },
  {
    id: 'depot',
    name: 'Goods depot',
    group: 'rail',
    cost: 260,
    upkeep: 10,
    onRail: true,
    range: 3,
    unlockedBy: 'two-rivers',
    blurb:
      'A yard for freight. Towns in range can support more people and pay better fares, because the line brings them more than passengers.',
    effect: { cap: 45, fares: 0.35 },
  },
  {
    id: 'terminus',
    name: 'Grand terminus',
    group: 'rail',
    cost: 640,
    upkeep: 26,
    onRail: true,
    range: 4,
    unlockedBy: 'grand-northern',
    blurb:
      'A great station with twice the reach of an ordinary one, and the pull to match. Expensive to keep, and worth it at the heart of a network.',
    effect: { growth: 0.35, cap: 70, fares: 0.25 },
  },
  {
    id: 'market',
    name: 'Market hall',
    group: 'civic',
    cost: 200,
    upkeep: 6,
    onRail: true,
    range: 3,
    unlockedBy: 'cairn-top',
    blurb:
      'Somewhere to trade. Quickens the growth of everywhere within three tiles — provided the market can be reached by rail itself.',
    effect: { growth: 0.3, cap: 20 },
  },
  {
    id: 'school',
    name: 'School',
    group: 'civic',
    cost: 240,
    upkeep: 9,
    onRail: true,
    range: 3,
    unlockedBy: 'slate-quarry',
    blurb:
      'Families stay where there is a school. A modest lift to growth and a large one to how many people the parish will hold.',
    effect: { growth: 0.2, cap: 40 },
  },
  {
    id: 'clinic',
    name: 'Clinic',
    group: 'civic',
    cost: 300,
    upkeep: 11,
    onRail: true,
    range: 3,
    unlockedBy: 'marrowdale',
    blurb:
      'The difference between a village that holds and a village that empties. The largest lift to the population a place can carry.',
    effect: { growth: 0.15, cap: 60 },
  },
]

export const buildingById = (id: BuildingId): BuildingDef =>
  BUILDINGS.find((b) => b.id === id) ?? BUILDINGS[0]

export const isBuilding = (value: unknown): value is BuildingId =>
  typeof value === 'string' && BUILDINGS.some((b) => b.id === value)

/** Buildings the player has earned, given the campaign levels they have starred. */
export function unlockedBuildings(completed: ReadonlySet<string>): BuildingDef[] {
  return BUILDINGS.filter((b) => b.unlockedBy === null || completed.has(b.unlockedBy))
}

/** Which survey earns which building, for the campaign briefing. */
export function rewardFor(levelId: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.unlockedBy === levelId)
}

/** Every level that hands out a building, in campaign order. */
export const REWARD_ORDER: Array<{ levelId: string; building: BuildingDef }> = LEVELS.flatMap(
  (level) => {
    const building = rewardFor(level.id)
    return building ? [{ levelId: level.id, building }] : []
  },
)

/** A month of running time, in seconds of a live clock. */
export const MONTH_SECONDS = 24

/** Total monthly upkeep of everything standing. */
export function upkeepTotal(counts: Partial<Record<BuildingId, number>>): number {
  return BUILDINGS.reduce((sum, b) => sum + (counts[b.id] ?? 0) * b.upkeep, 0)
}
