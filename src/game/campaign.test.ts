import { describe, expect, it } from 'vitest'
import { LEVELS } from './levels'
import { worldFromRows, tileAt, inBounds } from './grid'
import { solveLevel, solvePath } from './solver'
import { countBridgeTiles, connectionCheck, isPassable, tilesInclude } from './track'
import { starsFor } from './scoring'

const worlds = LEVELS.map((l) => worldFromRows(l.kinds, l.heights))

describe('campaign terrain is well formed', () => {
  it.each(LEVELS.map((l, i) => [l.name, i] as const))('%s has rectangular rows', (_name, i) => {
    const level = LEVELS[i]
    const w = level.kinds[0].length
    expect(level.heights).toHaveLength(level.kinds.length)
    for (let z = 0; z < level.kinds.length; z++) {
      expect(level.kinds[z]).toHaveLength(w)
      expect(level.heights[z]).toHaveLength(w)
    }
  })

  it.each(LEVELS.map((l, i) => [l.name, i] as const))(
    '%s places depot, destination and halts on buildable ground',
    (_name, i) => {
      const level = LEVELS[i]
      const world = worlds[i]
      for (const c of [level.depot, level.destination, ...level.stops]) {
        expect(inBounds(world, c)).toBe(true)
        expect(isPassable(world, c)).toBe(true)
        expect(tileAt(world, c)!.kind).not.toBe('water')
      }
    },
  )

  it('numbers levels in order and gives every level a unique id', () => {
    expect(LEVELS.map((l) => l.index)).toEqual(LEVELS.map((_, i) => i))
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length)
  })

  it('ships at least eight surveys', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(8)
  })
})

describe('every campaign level is solvable', () => {
  it.each(LEVELS.map((l, i) => [l.name, i] as const))('%s has a legal route', (_name, i) => {
    const level = LEVELS[i]
    const world = worlds[i]
    const path = solveLevel(world, level)
    expect(path, `${level.name} has no legal route`).not.toBeNull()

    // the returned route must itself obey every construction rule
    const route = path!
    expect(route[0]).toEqual(level.depot)
    expect(route[route.length - 1]).toEqual(level.destination)
    for (let s = 1; s < route.length; s++) {
      expect(connectionCheck(world, route[s - 1], route[s]).ok).toBe(true)
    }
    expect(new Set(route.map((c) => `${c.x},${c.z}`)).size).toBe(route.length)
    for (const stop of level.stops) expect(tilesInclude(route, stop)).toBe(true)
    expect(countBridgeTiles(world, route)).toBeLessThanOrEqual(level.bridgeBudget)
  })
})

describe('par targets are honest', () => {
  it.each(LEVELS.map((l, i) => [l.name, i] as const))(
    '%s par is reachable but not a giveaway',
    (_name, i) => {
      const level = LEVELS[i]
      const best = solveLevel(worlds[i], level)!.length
      expect(best, `${level.name}: optimal ${best} exceeds par ${level.par}`).toBeLessThanOrEqual(
        level.par,
      )
      expect(level.par - best, `${level.name}: par ${level.par} is ${level.par - best} over optimal ${best}`).toBeLessThanOrEqual(2)
    },
  )

  it('awards three stars for an optimal route and fewer as it lengthens', () => {
    const level = LEVELS[0]
    const best = solveLevel(worlds[0], level)!.length
    expect(starsFor(best, level.par)).toBe(3)
    expect(starsFor(level.par + 2, level.par)).toBe(2)
    expect(starsFor(level.par + 9, level.par)).toBe(1)
  })

  it('grows in size and difficulty across the campaign', () => {
    const areas = LEVELS.map((l) => l.kinds[0].length * l.kinds.length)
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeGreaterThanOrEqual(areas[i - 1])
    const pars = LEVELS.map((l) => l.par)
    expect(pars[pars.length - 1]).toBeGreaterThan(pars[0])
  })
})

describe('bridge budgets bind', () => {
  it('refuses a route that would need more bridges than the budget allows', () => {
    const i = LEVELS.findIndex((l) => l.id === 'two-rivers')
    const level = LEVELS[i]
    const world = worlds[i]
    expect(solvePath(world, { ...level, start: level.depot, goal: level.destination, bridgeBudget: 1 })).toBeNull()
    expect(
      solvePath(world, {
        start: level.depot,
        goal: level.destination,
        stops: level.stops,
        bridgeBudget: 2,
      }),
    ).not.toBeNull()
  })

  it('spends exactly the budget on the two-river crossing', () => {
    const i = LEVELS.findIndex((l) => l.id === 'two-rivers')
    const route = solveLevel(worlds[i], LEVELS[i])!
    expect(countBridgeTiles(worlds[i], route)).toBe(2)
  })

  it('gives bridge-free levels routes that never touch water', () => {
    LEVELS.filter((l) => l.bridgeBudget === 0).forEach((level) => {
      const world = worlds[level.index]
      expect(countBridgeTiles(world, solveLevel(world, level)!)).toBe(0)
    })
  })
})
