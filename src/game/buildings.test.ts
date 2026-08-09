import { describe, expect, it } from 'vitest'
import { BUILDINGS, buildingById, isBuilding, rewardFor, unlockedBuildings } from './buildings'
import { makeSettlement, surveyCountry, tickCountry, trainCapacity } from './economy'
import { createWorld, withTile } from './grid'
import { LEVELS } from './levels'
import type { BuildingId, Coord, RailLine } from './types'

const at = (x: number, z: number): Coord => ({ x, z })
const put = (world: ReturnType<typeof createWorld>, c: Coord, id: BuildingId) =>
  withTile(world, c, { feature: id })

/** Two hamlets on a straight line, each with a station: the working baseline. */
function joined() {
  let world = createWorld(16, 8)
  const settlements = [
    makeSettlement('a', 2, 2, 'Ashford', 20),
    makeSettlement('b', 12, 2, 'Brackwell', 20),
  ]
  const lines: RailLine[] = [
    { id: 'main', tiles: Array.from({ length: 13 }, (_, i) => at(i + 1, 3)) },
  ]
  world = put(world, at(2, 3), 'station')
  world = put(world, at(12, 3), 'station')
  return { world, settlements, lines }
}

describe('the catalogue', () => {
  it('gives every building a cost, an upkeep and a home group', () => {
    for (const b of BUILDINGS) {
      expect(b.cost).toBeGreaterThan(0)
      expect(b.upkeep).toBeGreaterThan(0)
      expect(['rail', 'civic']).toContain(b.group)
      expect(b.blurb.length).toBeGreaterThan(30)
    }
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length)
  })

  it('starts you with the station and nothing else', () => {
    const start = unlockedBuildings(new Set())
    expect(start.map((b) => b.id)).toEqual(['station'])
  })

  it('hands out the rest through the campaign, one survey at a time', () => {
    const rewarded = BUILDINGS.filter((b) => b.unlockedBy !== null)
    expect(rewarded.length).toBe(BUILDINGS.length - 1)
    for (const b of rewarded) {
      expect(LEVELS.some((l) => l.id === b.unlockedBy)).toBe(true)
    }
    // no two buildings hang off the same survey
    const levels = rewarded.map((b) => b.unlockedBy)
    expect(new Set(levels).size).toBe(levels.length)
    expect(rewardFor('kettleford')?.id).toBe('shed')
  })

  it('unlocks cumulatively as surveys are delivered', () => {
    const after = unlockedBuildings(new Set(['harrow-bend', 'kettleford']))
    expect(after.map((b) => b.id).sort()).toEqual(['shed', 'station', 'watertower'])
  })

  it('recognises its own ids and rejects anything else', () => {
    expect(isBuilding('station')).toBe(true)
    expect(isBuilding('tree')).toBe(false)
    expect(isBuilding(null)).toBe(false)
    expect(buildingById('clinic').name).toBe('Clinic')
  })
})

describe('what the buildings actually do', () => {
  it('lets you run one more train for every engine shed', () => {
    let { world } = joined()
    expect(trainCapacity(world)).toBe(1)
    world = put(world, at(4, 3), 'shed')
    expect(trainCapacity(world)).toBe(2)
    world = put(world, at(6, 3), 'shed')
    expect(trainCapacity(world)).toBe(3)
  })

  it('raises growth and the population ceiling with a civic building in range', () => {
    const base = joined()
    const plain = surveyCountry(base.world, base.lines, base.settlements, 2)[0]
    const withMarket = surveyCountry(
      put(base.world, at(3, 3), 'market'),
      base.lines,
      base.settlements,
      2,
    )[0]
    expect(withMarket.growth).toBeGreaterThan(plain.growth)
    expect(withMarket.cap).toBeGreaterThan(plain.cap)
    expect(withMarket.amenities).toContain('market')
  })

  it('does nothing at all if the building itself cannot be reached by rail', () => {
    const base = joined()
    // a market miles from any station, on no line
    const stranded = surveyCountry(
      put(base.world, at(2, 7), 'market'),
      base.lines,
      base.settlements,
      2,
    )[0]
    expect(stranded.amenities).not.toContain('market')
  })

  it('lifts service on the network a water tower stands on', () => {
    let world = createWorld(20, 8)
    const settlements = [
      makeSettlement('a', 2, 2, 'A', 20),
      makeSettlement('b', 8, 2, 'B', 20),
      makeSettlement('c', 14, 2, 'C', 20),
    ]
    const lines: RailLine[] = [
      { id: 'm', tiles: Array.from({ length: 17 }, (_, i) => at(i + 1, 3)) },
    ]
    for (const s of settlements) world = put(world, at(s.x, 3), 'station')
    const thin = surveyCountry(world, lines, settlements, 1)[0]
    const watered = surveyCountry(put(world, at(5, 3), 'watertower'), lines, settlements, 1)[0]
    expect(watered.service).toBeGreaterThan(thin.service)
  })

  it('pays better fares near a goods depot', () => {
    const base = joined()
    const plain = tickCountry(base.world, base.lines, base.settlements, 2, 1)
    const withDepot = tickCountry(
      put(base.world, at(3, 3), 'depot'),
      base.lines,
      base.settlements,
      2,
      1,
    )
    expect(withDepot.income).toBeGreaterThan(plain.income)
  })
})

describe('a town only empties if you take its railway away', () => {
  it('sits still when it was never served', () => {
    const world = createWorld(10, 6)
    const settlements = [makeSettlement('a', 2, 2, 'A', 30)]
    const report = surveyCountry(world, [], settlements, 1)[0]
    expect(report.state).toBe('unserved')
    expect(report.growth).toBe(0)
    expect(tickCountry(world, [], settlements, 1, 1).settlements[0].population).toBe(30)
  })

  it('declines once its station is closed, and no further than the floor', () => {
    const base = joined()
    // grow it first so the railway is recorded as having served the place
    let settlements = tickCountry(base.world, base.lines, base.settlements, 2, 1).settlements
    expect(settlements[0].wasServed).toBe(true)

    const abandoned = createWorld(16, 8) // every station gone
    const report = surveyCountry(abandoned, base.lines, settlements, 2)[0]
    expect(report.state).toBe('declining')
    expect(report.growth).toBeLessThan(0)

    for (let i = 0; i < 400; i++) {
      settlements = tickCountry(abandoned, base.lines, settlements, 2, 1).settlements
    }
    expect(settlements[0].population).toBe(5)
    expect(settlements[0].peak).toBeGreaterThan(20)
  })

  it('remembers the largest a place ever was', () => {
    const base = joined()
    let settlements = base.settlements
    for (let i = 0; i < 20; i++) {
      settlements = tickCountry(base.world, base.lines, settlements, 2, 1).settlements
    }
    expect(settlements[0].peak).toBeGreaterThanOrEqual(settlements[0].population)
    expect(settlements[0].peak).toBeGreaterThan(20)
  })
})
