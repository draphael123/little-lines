/**
 * What to do next.
 *
 * Derived from the state of the country every time it is asked, never stored
 * and never advanced by hand — so it cannot get out of step with the game, and
 * it says something sensible however you got here. A player who deletes their
 * only station goes straight back to being told to build one.
 *
 * Ordered by what would block you soonest.
 */
import { buildingById, type Structure } from './buildings'
import type { RailNetwork } from './rail'
import { nextMilestone } from './milestones'
import type { TownReport } from './towns'

export interface Objective {
  /** Short imperative, shown large. */
  title: string
  /** One sentence of why. */
  detail: string
  /** The tool this asks for, so the card can point at the dock. */
  tool?: 'rail' | 'build'
  /** The building this asks for, if any. */
  building?: string
  /** True once the country runs itself and this is only a progress note. */
  idle?: boolean
}

export interface ObjectiveInput {
  network: RailNetwork
  structures: Structure[]
  reports: TownReport[]
  balance: number
  running: boolean
  served: number
  trains: number
  capacity: number
}

export function objectiveFor(state: ObjectiveInput): Objective {
  const { network, structures, reports, balance, running, served } = state
  const stations = structures.filter((s) => buildingById(s.kind).onRail && s.kind !== 'watertower')

  if (network.edges.length === 0) {
    return {
      title: 'Lay your first line',
      detail:
        'Take the rail tool and drag from one hamlet towards another. Two places joined is the whole game.',
      tool: 'rail',
    }
  }

  if (stations.length === 0) {
    return {
      title: 'Build a station',
      detail: 'Put one beside a hamlet, close enough to the line to stand on it.',
      tool: 'build',
      building: 'station',
    }
  }

  const isolated = reports.filter((r) => r.state === 'isolated')
  const growing = reports.filter((r) => r.state === 'growing' || r.state === 'full')

  if (growing.length === 0 && isolated.length > 0) {
    return {
      title: 'Reach somewhere else',
      detail:
        'A line that reaches nowhere else carries nobody. Run the rails on to a second hamlet and give that one a station too.',
      tool: 'rail',
    }
  }

  if (!running) {
    return {
      title: 'Start the trains',
      detail: 'Nothing moves — and no time passes — until the trains are running. Press play, or hit space.',
    }
  }

  const declining = reports.filter((r) => r.state === 'declining')
  if (declining.length > 0) {
    return {
      title: `${declining[0].settlement.name} is emptying`,
      detail: 'It lost its service. Put the station back, or reconnect the line that served it.',
      tool: 'build',
      building: 'station',
    }
  }

  if (balance < 0) {
    return {
      title: 'You are in the red',
      detail:
        'Upkeep is running ahead of fares. Stop building for a while — a growing network earns its way out.',
      idle: true,
    }
  }

  // Not enough trains to work the stations that exist.
  if (state.trains >= state.capacity && stations.length > state.capacity * 2) {
    return {
      title: 'The network is under-served',
      detail:
        'More stations than your trains can work, so every one of them grows slowly. Build an engine shed and add a train.',
      tool: 'build',
      building: 'shed',
    }
  }

  const full = reports.filter((r) => r.state === 'full')
  if (full.length > 0) {
    return {
      title: `${full[0].settlement.name} has stopped growing`,
      detail:
        'It is as large as this ground will carry. A market hall, a school or a clinic within reach raises the ceiling.',
      tool: 'build',
      building: 'market',
    }
  }

  const unserved = reports.filter((r) => r.state === 'unserved')
  const next = nextMilestone(served)
  if (next) {
    return {
      title: next.name,
      detail: unserved.length
        ? `${Math.max(0, Math.ceil(next.served - served))} more people on the railway. ${unserved.length} ${unserved.length === 1 ? 'place is' : 'places are'} still without a station.`
        : `${Math.max(0, Math.ceil(next.served - served))} more people on the railway.`,
      idle: true,
    }
  }

  return {
    title: 'The country is yours',
    detail: 'Every rung climbed. Keep going, or start a new region from the menu.',
    idle: true,
  }
}
