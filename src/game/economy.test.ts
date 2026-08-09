import { describe, expect, it } from 'vitest'
import {
  BASE_GROWTH,
  CATCHMENT,
  COSTS,
  MILESTONES,
  SIZE_UNLOCKS,
  buildNetworks,
  makeSettlement,
  nextMilestone,
  populationCap,
  seedSettlements,
  settlementName,
  siteQuality,
  surveyCountry,
  tickCountry,
  tierOf,
  totalPopulation,
  type Settlement,
} from './economy'
import { createWorld, withTile } from './grid'
import { seedSandbox } from './terrain'
import type { Coord, RailLine, World } from './types'

const line = (id: string, tiles: Array<[number, number]>): RailLine => ({
  id,
  tiles: tiles.map(([x, z]) => ({ x, z })),
})

const station = (world: World, c: Coord) => withTile(world, c, { feature: 'station' })

function twoTownWorld() {
  let world = createWorld(12, 6)
  const settlements: Settlement[] = [
    makeSettlement('a', 1, 2, 'Ashford', 10),
    makeSettlement('b', 9, 2, 'Brackwell', 10),
  ]
  const rail = line('main', Array.from({ length: 10 }, (_, i) => [i + 1, 3] as [number, number]))
  world = station(world, { x: 1, z: 3 })
  world = station(world, { x: 9, z: 3 })
  return { world, settlements, lines: [rail] }
}

describe('tiers and caps', () => {
  it('names the four tiers by population', () => {
    expect(tierOf(0)).toBe('hamlet')
    expect(tierOf(19)).toBe('hamlet')
    expect(tierOf(20)).toBe('village')
    expect(tierOf(59)).toBe('village')
    expect(tierOf(60)).toBe('town')
    expect(tierOf(139)).toBe('town')
    expect(tierOf(140)).toBe('city')
  })

  it('scales the population ceiling with the quality of the site', () => {
    expect(populationCap(1.5)).toBeGreaterThan(populationCap(0.5))
  })
})

describe('site quality reads the ground', () => {
  it('refuses water and barely tolerates rock', () => {
    let world = createWorld(5, 5)
    world = withTile(world, { x: 2, z: 2 }, { kind: 'water' })
    expect(siteQuality(world, { x: 2, z: 2 })).toBe(0)
    world = withTile(world, { x: 2, z: 2 }, { kind: 'rock' })
    expect(siteQuality(world, { x: 2, z: 2 })).toBe(0.25)
  })

  it('prefers flat meadow within sight of water to a rock-hemmed ledge', () => {
    let good = createWorld(5, 5)
    good = withTile(good, { x: 1, z: 2 }, { kind: 'water' })

    let poor = createWorld(5, 5)
    for (const c of [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 3, z: 1 },
      { x: 1, z: 2 },
    ]) {
      poor = withTile(poor, c, { kind: 'rock' })
    }
    poor = withTile(poor, { x: 2, z: 2 }, { h: 3 })

    expect(siteQuality(good, { x: 2, z: 2 })).toBeGreaterThan(siteQuality(poor, { x: 2, z: 2 }))
  })

  it('never rules a site out entirely', () => {
    let world = createWorld(4, 4)
    for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
      if (x !== 1 || z !== 1) world = withTile(world, { x, z }, { kind: 'rock' })
    }
    expect(siteQuality(world, { x: 1, z: 1 })).toBeGreaterThanOrEqual(0.25)
  })
})

describe('networks', () => {
  it('joins lines that share a tile so junctions really connect', () => {
    const world = createWorld(8, 8)
    const nets = buildNetworks(
      world,
      [
        line('a', [[1, 1], [2, 1], [3, 1]]),
        line('b', [[3, 1], [3, 2], [3, 3]]),
        line('c', [[6, 6], [6, 7]]),
      ],
      2,
    )
    expect(nets).toHaveLength(2)
    const joined = nets.find((n) => n.lineIds.includes('a'))!
    expect(joined.lineIds).toEqual(expect.arrayContaining(['a', 'b']))
    expect(nets.find((n) => n.lineIds.includes('c'))!.lineIds).toEqual(['c'])
  })

  it('hands every train out to some network', () => {
    const world = createWorld(8, 8)
    const nets = buildNetworks(world, [line('a', [[1, 1], [2, 1]]), line('b', [[5, 5], [6, 5]])], 5)
    expect(nets.reduce((n, x) => n + x.trains, 0)).toBe(5)
  })

  it('counts the stations standing on it', () => {
    let world = createWorld(8, 8)
    world = station(world, { x: 2, z: 1 })
    const nets = buildNetworks(world, [line('a', [[1, 1], [2, 1], [3, 1]])], 1)
    expect(nets[0].stations).toEqual([{ x: 2, z: 1 }])
  })
})

describe('a settlement only grows when the railway earns it', () => {
  it('does not grow without a station in the catchment', () => {
    const world = createWorld(12, 6)
    const settlements: Settlement[] = [makeSettlement('a', 1, 2, 'Ashford', 10)]
    const reports = surveyCountry(world, [line('m', [[1, 3], [2, 3]])], settlements, 1)
    expect(reports[0].state).toBe('unserved')
    expect(reports[0].growth).toBe(0)
  })

  it('does not grow when its line reaches nowhere else', () => {
    let world = createWorld(12, 6)
    world = station(world, { x: 1, z: 3 })
    const settlements: Settlement[] = [makeSettlement('a', 1, 2, 'Ashford', 10)]
    const reports = surveyCountry(world, [line('m', [[1, 3], [2, 3], [3, 3]])], settlements, 1)
    expect(reports[0].station).toEqual({ x: 1, z: 3 })
    expect(reports[0].state).toBe('isolated')
    expect(reports[0].growth).toBe(0)
  })

  it('grows once two served stations share a network', () => {
    const { world, settlements, lines } = twoTownWorld()
    const reports = surveyCountry(world, lines, settlements, 1)
    expect(reports.map((r) => r.state)).toEqual(['growing', 'growing'])
    for (const report of reports) {
      expect(report.linked).toBe(true)
      expect(report.growth).toBeGreaterThan(0)
      expect(report.growth).toBeLessThanOrEqual(BASE_GROWTH * 1.5)
    }
  })

  it('stops growing when no train works the network', () => {
    const { world, settlements, lines } = twoTownWorld()
    const reports = surveyCountry(world, lines, settlements, 0)
    expect(reports.every((r) => r.growth === 0)).toBe(true)
  })

  it('only reaches settlements inside the catchment radius', () => {
    let world = createWorld(14, 8)
    world = station(world, { x: 1, z: 7 })
    world = station(world, { x: 9, z: 7 })
    const far: Settlement[] = [
      makeSettlement('a', 1, 0, 'Farhaven', 10),
      makeSettlement('b', 9, 7, 'Nearby', 10),
    ]
    const rail = line('m', Array.from({ length: 10 }, (_, i) => [i + 1, 7] as [number, number]))
    const reports = surveyCountry(world, [rail], far, 2)
    expect(Math.abs(far[0].z - 7)).toBeGreaterThan(CATCHMENT)
    expect(reports[0].state).toBe('unserved')
  })

  it('thins the service when stations outnumber the trains', () => {
    let world = createWorld(14, 6)
    const settlements: Settlement[] = [
      makeSettlement('a', 1, 2, 'A', 10),
      makeSettlement('b', 5, 2, 'B', 10),
      makeSettlement('c', 9, 2, 'C', 10),
      makeSettlement('d', 12, 2, 'D', 10),
    ]
    for (const s of settlements) world = station(world, { x: s.x, z: 3 })
    const rail = line('m', Array.from({ length: 13 }, (_, i) => [i, 3] as [number, number]))
    const thin = surveyCountry(world, [rail], settlements, 1)
    const plenty = surveyCountry(world, [rail], settlements, 5)
    expect(thin[0].service).toBeLessThan(plenty[0].service)
    expect(plenty[0].service).toBe(1)
  })

  it('caps a settlement at what its ground will carry', () => {
    const { world, settlements, lines } = twoTownWorld()
    const big = settlements.map((s) => ({ ...s, population: 10_000 }))
    const reports = surveyCountry(world, lines, big, 2)
    expect(reports.every((r) => r.state === 'full')).toBe(true)
    const ticked = tickCountry(world, lines, big, 2, 1)
    expect(ticked.settlements.every((s) => s.population <= populationCap(1.5))).toBe(true)
  })
})

describe('the clock', () => {
  it('adds population and fares over time and never goes backwards', () => {
    const { world, settlements, lines } = twoTownWorld()
    let current = settlements
    let money = 0
    for (let i = 0; i < 20; i++) {
      const tick = tickCountry(world, lines, current, 2, 0.5)
      expect(totalPopulation(tick.settlements)).toBeGreaterThanOrEqual(totalPopulation(current))
      current = tick.settlements
      money += tick.income
    }
    expect(totalPopulation(current)).toBeGreaterThan(totalPopulation(settlements))
    expect(money).toBeGreaterThan(0)
  })

  it('earns nothing while nothing is connected', () => {
    const world = createWorld(10, 6)
    const settlements: Settlement[] = [makeSettlement('a', 1, 2, 'A', 30)]
    const tick = tickCountry(world, [], settlements, 3, 1)
    expect(tick.income).toBe(0)
    expect(tick.passengers).toBe(0)
    expect(tick.settlements[0].population).toBe(30)
  })

  it('clamps a huge delta so a throttled tab cannot fast-forward the world', () => {
    const { world, settlements, lines } = twoTownWorld()
    const oneSecond = tickCountry(world, lines, settlements, 2, 1)
    const anHour = tickCountry(world, lines, settlements, 2, 3600)
    expect(totalPopulation(anHour.settlements)).toBeCloseTo(totalPopulation(oneSecond.settlements), 5)
  })
})

describe('foundation and names', () => {
  it('seeds hamlets on decent, well spaced ground', () => {
    const world = seedSandbox(18, 13, 4)
    const settlements = seedSettlements(world, 4, 4)
    expect(settlements.length).toBeGreaterThan(1)
    for (const s of settlements) {
      expect(siteQuality(world, { x: s.x, z: s.z })).toBeGreaterThan(0.9)
      expect(s.population).toBeGreaterThan(0)
    }
    for (let i = 0; i < settlements.length; i++) {
      for (let j = i + 1; j < settlements.length; j++) {
        const d =
          Math.abs(settlements[i].x - settlements[j].x) + Math.abs(settlements[i].z - settlements[j].z)
        expect(d).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('keeps the settlements it is given and adds to them', () => {
    const world = seedSandbox(18, 13, 9)
    const first = seedSettlements(world, 3, 9)
    const second = seedSettlements(world, 1, 21, first)
    expect(second.slice(0, first.length)).toEqual(first)
  })

  it('names places deterministically', () => {
    expect(settlementName(42)).toBe(settlementName(42))
    expect(settlementName(42)).toMatch(/^[A-Z][a-z]+$/)
  })
})

describe('milestones and money', () => {
  it('runs in ascending order and reports the next one', () => {
    const pops = MILESTONES.map((m) => m.population)
    expect([...pops].sort((a, b) => a - b)).toEqual(pops)
    expect(nextMilestone(0).next?.population).toBe(MILESTONES[0].population)
    expect(nextMilestone(1e9).next).toBeNull()
    const mid = nextMilestone(MILESTONES[0].population)
    expect(mid.next?.population).toBe(MILESTONES[1].population)
    expect(mid.progress).toBeGreaterThanOrEqual(0)
    expect(mid.progress).toBeLessThanOrEqual(1)
  })

  it('gates the bigger tables behind real countries', () => {
    expect(SIZE_UNLOCKS.small).toBe(0)
    expect(SIZE_UNLOCKS.wide).toBeGreaterThan(SIZE_UNLOCKS.small)
    expect(SIZE_UNLOCKS.grand).toBeGreaterThan(SIZE_UNLOCKS.wide)
  })

  it('prices a bridge and a tunnel above plain track', () => {
    expect(COSTS.bridge).toBeGreaterThan(COSTS.rail)
    expect(COSTS.tunnel).toBeGreaterThan(COSTS.bridge)
    expect(COSTS.tunnel).toBeGreaterThan(COSTS.terrain)
  })
})
