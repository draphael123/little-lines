import { countBridgeTiles, tilesInclude, totalClimb } from './track'
import { sameCoord } from './grid'
import type { Coord, LevelDef, World } from './types'

export type Stars = 0 | 1 | 2 | 3

/** Three stars at par, two within a couple of lengths, one for arriving at all. */
export function starsFor(trackTiles: number, par: number): Stars {
  if (trackTiles <= par) return 3
  if (trackTiles <= par + 2) return 2
  return 1
}

export interface RouteReport {
  trackTiles: number
  par: number
  climb: number
  bridges: number
  bridgeBudget: number
  stopsServed: number
  stopsRequired: number
  startsAtDepot: boolean
  reachesDestination: boolean
  overBudget: boolean
  complete: boolean
  stars: Stars
}

export function reportRoute(world: World, level: LevelDef, route: Coord[]): RouteReport {
  const bridges = countBridgeTiles(world, route)
  const stopsServed = level.stops.filter((s) => tilesInclude(route, s)).length
  const startsAtDepot = route.length > 0 && sameCoord(route[0], level.depot)
  const reachesDestination = route.length > 1 && tilesInclude(route, level.destination)
  const overBudget = bridges > level.bridgeBudget
  const complete =
    startsAtDepot && reachesDestination && stopsServed === level.stops.length && !overBudget
  return {
    trackTiles: route.length,
    par: level.par,
    climb: totalClimb(world, route),
    bridges,
    bridgeBudget: level.bridgeBudget,
    stopsServed,
    stopsRequired: level.stops.length,
    startsAtDepot,
    reachesDestination,
    overBudget,
    complete,
    stars: complete ? starsFor(route.length, level.par) : 0,
  }
}

/** Build · Connect · Deliver — the three beats of the dispatch strip. */
export type DispatchStage = 'build' | 'connect' | 'deliver'

export function dispatchStage(report: RouteReport, delivered: boolean): DispatchStage {
  if (delivered) return 'deliver'
  if (report.complete) return 'connect'
  return 'build'
}
