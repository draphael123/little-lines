import { describe, expect, it } from 'vitest'
import type { Settlement } from './economy'
import { createWorld, keyOf, withTile } from './grid'
import { claimTiles, planTown, roadStrips, townRadius, trafficRoute } from './town'
import type { RailLine } from './types'

const town = (population: number, x = 6, z = 6): Settlement => ({
  id: 'a',
  x,
  z,
  name: 'Ashford',
  population,
})

const rail = (tiles: Array<[number, number]>): RailLine[] => [
  { id: 'r', tiles: tiles.map(([x, z]) => ({ x, z })) },
]

describe('how far a town spreads', () => {
  it('grows its footprint with each tier', () => {
    expect(townRadius(5)).toBeLessThan(townRadius(40))
    expect(townRadius(40)).toBeLessThan(townRadius(100))
    expect(townRadius(100)).toBeLessThan(townRadius(400))
  })

  it('claims more ground as it grows', () => {
    const world = createWorld(14, 14)
    expect(claimTiles(world, town(200), [], []).length).toBeGreaterThan(
      claimTiles(world, town(8), [], []).length,
    )
  })

  it('never claims water, rock, rail or another town centre', () => {
    let world = createWorld(14, 14)
    world = withTile(world, { x: 6, z: 5 }, { kind: 'water' })
    world = withTile(world, { x: 5, z: 6 }, { kind: 'rock' })
    const lines = rail([
      [7, 6],
      [7, 7],
    ])
    const neighbourTown: Settlement = { id: 'b', x: 6, z: 8, name: 'B', population: 10 }
    const claimed = claimTiles(world, town(200), lines, [town(200), neighbourTown])
    const keys = new Set(claimed.map(keyOf))
    expect(keys.has('6,5')).toBe(false)
    expect(keys.has('5,6')).toBe(false)
    expect(keys.has('7,6')).toBe(false)
    expect(keys.has('6,8')).toBe(false)
    expect(keys.has('6,6')).toBe(true)
  })

  it('will not climb a cliff', () => {
    let world = createWorld(14, 14)
    world = withTile(world, { x: 8, z: 6 }, { h: 3 })
    const keys = new Set(claimTiles(world, town(400), [], []).map(keyOf))
    expect(keys.has('8,6')).toBe(false)
  })
})

describe('the street plan', () => {
  const world = createWorld(16, 16)

  it('lays roads and lines buildings along them', () => {
    const plan = planTown(world, town(90), [], [])
    expect(plan.roads.length).toBeGreaterThan(2)
    expect(plan.buildings.length).toBeGreaterThan(4)
    const roadKeys = new Set(plan.roads.map(keyOf))
    // every building either sits on a plot beside a road, or is the lone
    // building of a place too small to have a street
    for (const b of plan.buildings) {
      const beside =
        roadKeys.has(`${b.x},${b.z - 1}`) ||
        roadKeys.has(`${b.x},${b.z + 1}`) ||
        roadKeys.has(`${b.x - 1},${b.z}`) ||
        roadKeys.has(`${b.x + 1},${b.z}`) ||
        roadKeys.has(keyOf(b))
      expect(beside).toBe(true)
    }
  })

  it('builds more, and taller, as the population climbs', () => {
    const hamlet = planTown(world, town(8), [], [])
    const city = planTown(world, town(300), [], [])
    expect(city.buildings.length).toBeGreaterThan(hamlet.buildings.length)
    const tallest = (p: typeof city) => Math.max(...p.buildings.map((b) => b.height))
    expect(tallest(city)).toBeGreaterThan(tallest(hamlet))
    expect(city.tier).toBe('city')
    expect(hamlet.tier).toBe('hamlet')
  })

  it('gives a town a civic building and a hamlet none', () => {
    expect(planTown(world, town(200), [], []).buildings.some((b) => b.kind === 'civic')).toBe(true)
    expect(planTown(world, town(8), [], []).buildings.some((b) => b.kind === 'civic')).toBe(false)
  })

  it('puts nothing on the rails', () => {
    const lines = rail([
      [4, 6],
      [5, 6],
      [6, 6],
      [7, 6],
    ])
    const plan = planTown(world, town(200), lines, [])
    const railKeys = new Set(lines[0].tiles.map(keyOf))
    for (const b of plan.buildings) expect(railKeys.has(keyOf(b))).toBe(false)
    for (const r of plan.roads) expect(railKeys.has(keyOf(r))).toBe(false)
  })

  it('is identical every time it is planned', () => {
    const a = planTown(world, town(120), [], [])
    const b = planTown(world, town(120), [], [])
    expect(a).toEqual(b)
  })

  it('copes with a settlement boxed in on every side', () => {
    let boxed = createWorld(7, 7)
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        if (x !== 3 || z !== 3) boxed = withTile(boxed, { x, z }, { kind: 'rock' })
      }
    }
    const plan = planTown(boxed, town(200, 3, 3), [], [])
    expect(plan.buildings.length).toBeGreaterThanOrEqual(1)
    for (const b of plan.buildings) expect(`${b.x},${b.z}`).toBe('3,3')
  })

  it('lays lamps along the streets', () => {
    const plan = planTown(world, town(200), [], [])
    expect(plan.props.some((p) => p.kind === 'lamp')).toBe(true)
  })
})

describe('traffic', () => {
  const world = createWorld(16, 16)

  it('runs cars along an unbroken high street through the centre', () => {
    const settlement = town(200)
    const route = trafficRoute(planTown(world, settlement, [], []), settlement)!
    expect(route).not.toBeNull()
    expect(route.tiles.length).toBeGreaterThan(1)
    expect(route.tiles.every((t) => t.z === settlement.z)).toBe(true)
    for (let i = 1; i < route.tiles.length; i++) {
      expect(route.tiles[i].x).toBe(route.tiles[i - 1].x + 1)
    }
    expect(route.cars).toBeGreaterThanOrEqual(1)
  })

  it('puts more cars on a bigger town, within reason', () => {
    const small = town(30)
    const big = town(400)
    const a = trafficRoute(planTown(world, small, [], []), small)
    const b = trafficRoute(planTown(world, big, [], []), big)!
    expect(b.cars).toBeGreaterThanOrEqual(a?.cars ?? 0)
    expect(b.cars).toBeLessThanOrEqual(4)
  })

  it('gives no traffic to a place with no street', () => {
    let boxed = createWorld(7, 7)
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        if (x !== 3 || z !== 3) boxed = withTile(boxed, { x, z }, { kind: 'rock' })
      }
    }
    const lone = town(200, 3, 3)
    expect(trafficRoute(planTown(boxed, lone, [], []), lone)).toBeNull()
  })
})

describe('road geometry', () => {
  it('always includes the junction square', () => {
    expect(roadStrips({ x: 0, z: 0, links: 0 })).toHaveLength(1)
  })

  it('adds an arm for each connection', () => {
    expect(roadStrips({ x: 0, z: 0, links: 1 | 2 | 4 | 8 })).toHaveLength(5)
    expect(roadStrips({ x: 0, z: 0, links: 1 | 4 })).toHaveLength(3)
  })

  it('keeps every strip inside its own tile', () => {
    for (const strip of roadStrips({ x: 0, z: 0, links: 15 })) {
      expect(Math.abs(strip.ox) + strip.width / 2).toBeLessThanOrEqual(0.5001)
      expect(Math.abs(strip.oz) + strip.depth / 2).toBeLessThanOrEqual(0.5001)
    }
  })
})
