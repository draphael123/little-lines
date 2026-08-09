/**
 * The ladder the game is played up.
 *
 * Progress is measured in **people your railway actually serves** — the
 * population of places that have a station and a network that reaches
 * somewhere else — not the population of the region. Keying it to the region
 * total was wrong: the country starts with three hundred people scattered
 * across a dozen hamlets, so five of the eight buildings were already unlocked
 * before the first rail was laid and nothing was ever earned.
 *
 * Every rung names itself after the railway it takes to get there, hands over
 * a grant, and opens one new thing to build.
 */
import { BUILDINGS, type BuildingId } from './buildings'

export interface Milestone {
  /** People carried by the network before this rung is reached. */
  served: number
  name: string
  /** Paid once, on arrival. */
  grant: number
  /** What it opens. Matches the building's own `unlockAt`. */
  unlocks: BuildingId | null
  blurb: string
}

export const MILESTONES: Milestone[] = [
  {
    served: 0,
    name: 'A line on the map',
    grant: 0,
    unlocks: null,
    blurb: 'Nothing is running yet. Two stations on one line, and the country starts to move.',
  },
  {
    served: 60,
    name: 'Light railway',
    grant: 1200,
    unlocks: 'shed',
    blurb: 'People are travelling. An engine shed lets you put a second train on the network.',
  },
  {
    served: 180,
    name: 'The branch line',
    grant: 2200,
    unlocks: 'depot',
    blurb: 'Goods follow passengers. A depot raises the fares every station on its network earns.',
  },
  {
    served: 420,
    name: 'The junction',
    grant: 3600,
    unlocks: 'market',
    blurb: 'Somewhere worth changing trains at. A market hall raises how large a place can grow.',
  },
  {
    served: 900,
    name: 'The regional',
    grant: 5500,
    unlocks: 'school',
    blurb: 'A network rather than a line. A school makes the places it reaches grow faster.',
  },
  {
    served: 1700,
    name: 'The trunk line',
    grant: 8000,
    unlocks: 'clinic',
    blurb: 'The country runs on your timetable now. A clinic lifts the ceiling again.',
  },
  {
    served: 3000,
    name: 'The main line',
    grant: 14000,
    unlocks: 'terminus',
    blurb: 'A grand terminus: the most a station can be, and the making of a city.',
  },
]

/** How far up the ladder this many served people reaches. Index into MILESTONES. */
export function rungFor(served: number): number {
  let rung = 0
  for (let i = 0; i < MILESTONES.length; i++) if (served >= MILESTONES[i].served) rung = i
  return rung
}

export const milestoneAt = (served: number) => MILESTONES[rungFor(served)]

/** The next rung, or null at the top. */
export function nextMilestone(served: number): Milestone | null {
  const rung = rungFor(served)
  return rung + 1 < MILESTONES.length ? MILESTONES[rung + 1] : null
}

/** 0–1 of the way from the current rung to the next. 1 at the top. */
export function progressTo(served: number): number {
  const from = milestoneAt(served)
  const to = nextMilestone(served)
  if (!to) return 1
  return Math.max(0, Math.min(1, (served - from.served) / (to.served - from.served)))
}

/**
 * What may be built at this point on the ladder. A building's `unlockAt` is
 * still the single source of truth for the threshold; the milestone list only
 * names the moment and pays for it.
 */
export const unlockedFor = (served: number) => BUILDINGS.filter((b) => served >= b.unlockAt)

/** Milestones crossed by going from `before` to `after` served people. */
export function crossed(before: number, after: number): Milestone[] {
  if (after <= before) return []
  return MILESTONES.filter((m) => m.served > 0 && m.served > before && m.served <= after)
}
