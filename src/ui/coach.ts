import { surveyCountry } from '../game/economy'
import { sameCoord } from '../game/grid'
import type { RouteReport } from '../game/scoring'
import { routeIsClosed } from '../game/track'
import type { LevelDef } from '../game/types'
import { toolInfo, type GameState } from '../store/useGame'

/**
 * Coaching that follows what the player is actually doing rather than
 * repeating the same tip. Returned as plain text so it can be announced.
 */
export function coachingFor(state: GameState, level: LevelDef, report: RouteReport): string {
  if (state.mode === 'free') return freeCoaching(state)

  if (state.delivered) {
    return report.stars === 3
      ? 'Three stars — that is the shortest line the surveyors could find. Take the next survey when you are ready.'
      : `Delivered in ${report.trackTiles} lengths against a par of ${level.par}. A shorter line would earn another star.`
  }
  if (state.puzzleRunning) return 'The engine is away. Watch it take the gradients.'
  if (state.route.length === 0) {
    return `Click the pale disc at the ${level.depotName} depot to lay your first length of track. Drag the table to orbit, scroll to zoom.`
  }
  if (report.overBudget) {
    return `That is ${report.bridges} bridges against a budget of ${report.bridgeBudget}. Undo back to the bank and look for a narrower crossing.`
  }
  if (report.complete) {
    return report.trackTiles <= level.par
      ? 'The line is complete and at par. Run the delivery.'
      : `The line is complete at ${report.trackTiles} lengths. Par is ${level.par} — you may run it now, or trim it for a third star.`
  }
  if (report.stopsRequired > report.stopsServed) {
    const missing = level.stops.filter((s) => !state.route.some((r) => sameCoord(r, s)))
    return `${missing[0]?.name ?? 'A halt'} still needs serving. Take the line through its brass disc before the terminus.`
  }
  if (level.bridgeBudget > 0 && report.bridges === 0) {
    return `Timber for ${level.bridgeBudget} bridge${level.bridgeBudget === 1 ? '' : 's'} is in the budget — a water tile costs one when the track crosses it.`
  }
  const climbLeft = Math.abs(
    (level.destination.z - (state.route[state.route.length - 1]?.z ?? 0)) +
      (level.destination.x - (state.route[state.route.length - 1]?.x ?? 0)),
  )
  if (climbLeft <= 3) return `Nearly there — ${level.destinationName} is a few lengths away.`
  return 'Rail may climb or fall only one level per length. Follow the contours and use the hint if a run dead-ends.'
}

/**
 * Free Build coaching follows the growth loop rather than the tool: get a line
 * between two hamlets, put stations on it, then keep the service honest.
 */
function freeCoaching(state: GameState): string {
  const free = state.free
  const country = surveyCountry(free.world, free.lines, free.settlements, free.trains)

  if (free.settlements.length === 0) {
    return 'This table has no settlements yet. Press "Grow a landscape" and a few hamlets will appear on the likeliest ground.'
  }

  const unserved = country.filter((r) => r.state === 'unserved')
  const isolated = country.filter((r) => r.state === 'isolated')
  const growing = country.filter((r) => r.state === 'growing')

  if (free.lines.length === 0) {
    const [a, b] = country
    return a && b
      ? `Nothing is connected yet. Run a line between ${a.settlement.name} and ${b.settlement.name}, then put a station within two tiles of each.`
      : 'Nothing is connected yet. Lay a line between two hamlets and give each one a station.'
  }
  if (unserved.length === country.length) {
    return `No settlement has a station. Select Build station (key 8) and place one on the rail within two tiles of ${unserved[0].settlement.name}.`
  }
  if (isolated.length > 0 && growing.length === 0) {
    return `${isolated[0].settlement.name} has a station but the line reaches nowhere else. A railway between two places carries passengers; a loop around one carries nobody.`
  }
  if (unserved.length > 0) {
    return `${unserved[0].settlement.name} is still unserved — no station within two tiles. Extend the line and build one, and it will start to grow.`
  }
  if (!free.running) {
    return 'Time is stopped while the trains are held. Set the lines running and the country grows again.'
  }
  const stretched = country.find((r) => r.service > 0 && r.service < 0.6)
  if (stretched) {
    return 'The service is stretched thin — more stations than trains can work. Put another engine on, or thin the stations out.'
  }
  const active = free.lines.find((l) => l.id === free.activeLineId)
  if (free.tool === 'rail' && active && routeIsClosed(active.tiles)) {
    return 'This line is a closed loop, so its trains circulate. Open lines shuttle back and forth instead — both carry passengers.'
  }
  if (free.tool !== 'rail') return toolInfo(free.tool).hint
  return `${growing.length} place${growing.length === 1 ? '' : 's'} growing. Reach further out for new ground — flat meadow near water thrives, high or rock-hemmed sites stay small.`
}
