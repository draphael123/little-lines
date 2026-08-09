import { idx, inBounds, keyOf, sameCoord } from './grid'
import { connectionCheck, countBridgeTiles, isPassable, isWater } from './track'
import type { Coord, LevelDef, World } from './types'

export interface SolveOptions {
  start: Coord
  goal: Coord
  /** Every one of these must be visited before the goal counts. */
  stops?: Coord[]
  bridgeBudget?: number
  /** Bridges already spent by track laid so far. */
  bridgesUsed?: number
  /** Stops already served. */
  stopsDone?: Coord[]
  /** Tiles rail may not use (the existing route behind the head, other lines). */
  blocked?: ReadonlySet<string>
}

const MAX_TRACKED_BRIDGES = 24

/**
 * Breadth-first search over (tile, stops-served, bridges-spent). The state
 * space is tiny for campaign-sized surveys, so this finds a genuinely
 * shortest legal route rather than a heuristic one.
 */
export function solvePath(world: World, opts: SolveOptions): Coord[] | null {
  const { start, goal } = opts
  const stops = opts.stops ?? []
  const budget = Math.min(opts.bridgeBudget ?? MAX_TRACKED_BRIDGES, MAX_TRACKED_BRIDGES)
  const blocked = opts.blocked ?? new Set<string>()

  if (!inBounds(world, start) || !inBounds(world, goal)) return null
  if (!isPassable(world, start) || !isPassable(world, goal)) return null

  const stopBit = new Map<string, number>()
  stops.forEach((s, i) => stopBit.set(keyOf(s), 1 << i))
  const full = (1 << stops.length) - 1

  let startMask = 0
  for (const s of opts.stopsDone ?? []) startMask |= stopBit.get(keyOf(s)) ?? 0
  startMask |= stopBit.get(keyOf(start)) ?? 0

  const startBridges = (opts.bridgesUsed ?? 0) + (isWater(world, start) ? 1 : 0)
  if (startBridges > budget) return null

  const masks = full + 1
  const lanes = budget + 1
  const stateId = (c: Coord, mask: number, bridges: number) =>
    (idx(world.w, c.x, c.z) * masks + mask) * lanes + bridges

  const cameFrom = new Map<number, number>()
  const coordOf = new Map<number, Coord>()
  const seen = new Set<number>()

  const s0 = stateId(start, startMask, startBridges)
  seen.add(s0)
  coordOf.set(s0, start)

  const queue: number[] = [s0]
  const queueMask: number[] = [startMask]
  const queueBridges: number[] = [startBridges]
  let head = 0

  const reconstruct = (state: number): Coord[] => {
    const path: Coord[] = []
    let cur: number | undefined = state
    while (cur !== undefined) {
      const c = coordOf.get(cur)
      if (!c) break
      path.push(c)
      cur = cameFrom.get(cur)
    }
    return path.reverse()
  }

  while (head < queue.length) {
    const state = queue[head]
    const mask = queueMask[head]
    const bridges = queueBridges[head]
    head++
    const here = coordOf.get(state)!

    if (mask === full && sameCoord(here, goal)) return reconstruct(state)

    for (const step of [
      { x: here.x + 1, z: here.z },
      { x: here.x - 1, z: here.z },
      { x: here.x, z: here.z + 1 },
      { x: here.x, z: here.z - 1 },
    ]) {
      if (!inBounds(world, step)) continue
      if (blocked.has(keyOf(step))) continue
      if (!connectionCheck(world, here, step).ok) continue
      const nextBridges = bridges + (isWater(world, step) ? 1 : 0)
      if (nextBridges > budget) continue
      const nextMask = mask | (stopBit.get(keyOf(step)) ?? 0)
      const next = stateId(step, nextMask, nextBridges)
      if (seen.has(next)) continue
      seen.add(next)
      coordOf.set(next, step)
      cameFrom.set(next, state)
      queue.push(next)
      queueMask.push(nextMask)
      queueBridges.push(nextBridges)
    }
  }
  return null
}

/** Shortest legal route for a level from scratch. */
export function solveLevel(world: World, level: LevelDef): Coord[] | null {
  return solvePath(world, {
    start: level.depot,
    goal: level.destination,
    stops: level.stops,
    bridgeBudget: level.bridgeBudget,
  })
}

export interface Hint {
  next: Coord | null
  message: string
}

/** The next legal tile on a shortest completion of the player's current route. */
export function hintFor(world: World, level: LevelDef, route: Coord[]): Hint {
  if (route.length === 0) {
    return { next: level.depot, message: `Start at ${level.depotName} depot.` }
  }
  const head = route[route.length - 1]
  if (sameCoord(head, level.destination)) {
    return { next: null, message: `The line already reaches ${level.destinationName}.` }
  }
  const blocked = new Set(route.slice(0, -1).map(keyOf))
  const stopsDone = level.stops.filter((s) => route.some((r) => sameCoord(r, s)))
  const path = solvePath(world, {
    start: head,
    goal: level.destination,
    stops: level.stops,
    bridgeBudget: level.bridgeBudget,
    bridgesUsed: countBridgeTiles(world, route.slice(0, -1)),
    stopsDone,
    blocked,
  })
  if (!path || path.length < 2) {
    return {
      next: null,
      message: 'No legal continuation from here. Undo a length of track and try another line.',
    }
  }
  return { next: path[1], message: 'The surveyor marks the next length of track.' }
}
