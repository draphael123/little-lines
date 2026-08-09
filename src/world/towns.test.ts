import { describe, expect, it } from 'vitest'
import { BUILDINGS, buildingById, lineCost, unlockedAt, type Structure } from './buildings'
import { generateRegion } from './heightfield'
import {
  LIFT_LIMIT,
  addEdge,
  adjustEdge,
  emptyNetwork,
  layEdge,
  nearestEdge,
  type RailNetwork,
} from './rail'
import {
  MIN_SPACING,
  seedSettlements,
  survey,
  tick,
  tierOf,
  totalPopulation,
  trainCapacity,
  upkeepTotal,
  type Settlement,
} from './towns'

/**
 * Gentle country. These tests are about who gets served and how a place grows,
 * not about hills — on real relief a line between two fixed points is often
 * legitimately refused, which would couple settlement rules to terrain tuning.
 */
const field = generateRegion({ seed: 3, relief: 20 })

const place = (kind: Structure['kind'], x: number, z: number, id = `${kind}-${x}-${z}`): Structure => ({
  id,
  kind,
  x,
  z,
  y: 0,
})

const town = (id: string, x: number, z: number, population: number): Settlement => ({
  id,
  x,
  z,
  name: id,
  population,
  peak: population,
  wasServed: false,
})

/** Two places joined by a line with a station at each end. */
function joined() {
  const a = town('a', -600, 0, 60)
  const b = town('b', 600, 0, 60)
  const result = layEdge(field, emptyNetwork(), { x: a.x, z: a.z }, { x: b.x, z: b.z })
  expect(result.ok, result.reason).toBe(true)
  const network = addEdge(emptyNetwork(), result)
  const structures = [place('station', a.x, a.z), place('station', b.x, b.z)]
  return { network, structures, settlements: [a, b] }
}

describe('seeding a country', () => {
  it('puts hamlets on decent ground, well spread out', () => {
    const seeded = seedSettlements(field, 9)
    expect(seeded.length).toBeGreaterThan(4)
    for (let i = 0; i < seeded.length; i++) {
      for (let j = i + 1; j < seeded.length; j++) {
        expect(Math.hypot(seeded[i].x - seeded[j].x, seeded[i].z - seeded[j].z)).toBeGreaterThanOrEqual(
          MIN_SPACING,
        )
      }
      expect(seeded[i].population).toBeGreaterThan(0)
      expect(seeded[i].name).toMatch(/^[A-Z][a-z]+$/)
    }
  })

  it('is the same country every time for the same region', () => {
    expect(seedSettlements(field, 8)).toEqual(seedSettlements(field, 8))
  })
})

describe('growth needs a served station on a network that reaches elsewhere', () => {
  it('does nothing with no station', () => {
    const { network, settlements } = joined()
    const report = survey(field, network, [], settlements, 2)[0]
    expect(report.state).toBe('unserved')
    expect(report.growth).toBe(0)
  })

  it('does nothing when the line reaches only one place', () => {
    const { network, settlements } = joined()
    const lonely = survey(field, network, [place('station', -600, 0)], settlements, 2)[0]
    expect(lonely.state).toBe('isolated')
    expect(lonely.growth).toBe(0)
  })

  it('grows once two stations on one network each serve a place', () => {
    const { network, structures, settlements } = joined()
    const reports = survey(field, network, structures, settlements, 2)
    expect(reports.map((r) => r.state)).toEqual(['growing', 'growing'])
    expect(reports[0].growth).toBeGreaterThan(0)
  })

  it('stops when no train works the network', () => {
    const { network, structures, settlements } = joined()
    expect(survey(field, network, structures, settlements, 0)[0].growth).toBe(0)
  })

  it('carries fares and people over time, and never runs backwards', () => {
    const { network, structures } = joined()
    let settlements = joined().settlements
    let earned = 0
    for (let i = 0; i < 30; i++) {
      const step = tick(field, network, structures, settlements, 2, 0.5)
      expect(totalPopulation(step.settlements)).toBeGreaterThanOrEqual(totalPopulation(settlements))
      settlements = step.settlements
      earned += step.income
    }
    expect(earned).toBeGreaterThan(0)
    expect(settlements[0].peak).toBeGreaterThanOrEqual(settlements[0].population)
  })
})

describe('buildings', () => {
  it('needs the rail to reach a civic building before it counts', () => {
    const { network, structures, settlements } = joined()
    const stranded = survey(field, network, [...structures, place('market', -600, 1600)], settlements, 2)[0]
    expect(stranded.amenities).not.toContain('market')

    const served = survey(field, network, [...structures, place('market', -560, 40)], settlements, 2)[0]
    expect(served.amenities).toContain('market')
    expect(served.cap).toBeGreaterThan(stranded.cap)
  })

  it('lets you run one more train per engine shed', () => {
    expect(trainCapacity([])).toBe(1)
    expect(trainCapacity([place('shed', 0, 0, 's1'), place('shed', 20, 0, 's2')])).toBe(3)
  })

  it('adds up what everything costs to keep', () => {
    const kept = [place('station', 0, 0, 'a'), place('clinic', 40, 0, 'b')]
    expect(upkeepTotal(kept)).toBe(buildingById('station').upkeep + buildingById('clinic').upkeep)
  })

  it('opens the catalogue up as the country grows', () => {
    expect(unlockedAt(0).map((b) => b.id)).toEqual(['station', 'watertower'])
    expect(unlockedAt(99999).length).toBe(BUILDINGS.length)
    for (const b of BUILDINGS) {
      expect(b.cost).toBeGreaterThan(0)
      expect(b.upkeep).toBeGreaterThan(0)
    }
  })

  it('charges more for line that has to be carried', () => {
    expect(lineCost(1000, 0)).toBeLessThan(lineCost(1000, 400))
  })

  it('names the four tiers', () => {
    expect(tierOf(10)).toBe('hamlet')
    expect(tierOf(200)).toBe('village')
    expect(tierOf(700)).toBe('town')
    expect(tierOf(2000)).toBe('city')
  })
})

describe('a town only empties if you take its railway away', () => {
  it('sits still when it was never served', () => {
    const settlements = [town('a', -600, 0, 90)]
    const after = tick(field, emptyNetwork(), [], settlements, 2, 1)
    expect(after.settlements[0].population).toBe(90)
  })

  it('declines to a floor once the stations go', () => {
    const { network, structures } = joined()
    let settlements = tick(field, network, structures, joined().settlements, 2, 1).settlements
    expect(settlements[0].wasServed).toBe(true)

    for (let i = 0; i < 500; i++) {
      settlements = tick(field, network, [], settlements, 2, 1).settlements
    }
    expect(settlements[0].population).toBe(8)
    expect(survey(field, network, [], settlements, 2)[0].state).toBe('unserved')
  })
})

describe('raising and lowering a line', () => {
  it('lays a line higher when asked, and the viaduct grows with it', () => {
    const flat = layEdge(field, emptyNetwork(), { x: -500, z: 400 }, { x: 300, z: 400 })
    const lifted = layEdge(field, emptyNetwork(), { x: -500, z: 400 }, { x: 300, z: 400 }, { lift: 24 })
    expect(flat.ok && lifted.ok, lifted.reason).toBe(true)
    const middle = (r: typeof flat) => r.edge!.points[Math.floor(r.edge!.points.length / 2)][1]
    expect(middle(lifted)).toBeGreaterThan(middle(flat) + 8)
    expect(lifted.edge!.bridged).toBeGreaterThan(flat.edge!.bridged)
    expect(lifted.edge!.lift).toBe(24)
  })

  it('keeps the gradient legal however high it is carried', () => {
    const lifted = layEdge(field, emptyNetwork(), { x: -500, z: 400 }, { x: 300, z: 400 }, { lift: 40 })
    const points = lifted.edge!.points
    for (let i = 1; i < points.length; i++) {
      const run = Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2])
      expect(Math.abs(points[i][1] - points[i - 1][1])).toBeLessThanOrEqual(run * 0.04 + 0.05)
    }
  })

  it('adjusts a line that is already built', () => {
    let network: RailNetwork = addEdge(
      emptyNetwork(),
      layEdge(field, emptyNetwork(), { x: -500, z: 400 }, { x: 300, z: 400 }),
    )
    const before = network.edges[0].points[10][1]
    const result = adjustEdge(field, network, network.edges[0].id, 20)
    expect(result.ok, result.reason).toBe(true)
    network = result.network
    expect(network.edges[0].points[10][1]).toBeGreaterThan(before)
    expect(network.edges[0].lift).toBe(20)
  })

  it('never carries a line past the limit', () => {
    let network = addEdge(
      emptyNetwork(),
      layEdge(field, emptyNetwork(), { x: -500, z: 400 }, { x: 300, z: 400 }),
    )
    for (let i = 0; i < 40; i++) {
      network = adjustEdge(field, network, network.edges[0].id, 10).network
    }
    expect(network.edges[0].lift).toBe(LIFT_LIMIT)
  })

  it('finds the line nearest a point so one can be picked to adjust', () => {
    const network = addEdge(
      emptyNetwork(),
      layEdge(field, emptyNetwork(), { x: -500, z: 400 }, { x: 300, z: 400 }),
    )
    expect(nearestEdge(network, -100, 420)).not.toBeNull()
    expect(nearestEdge(network, -100, 1600)).toBeNull()
  })
})
