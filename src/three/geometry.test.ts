import { describe, expect, it } from 'vitest'
import { createWorld, withTile, worldFromRows } from '../game/grid'
import type { Coord } from '../game/types'
import {
  GAUGE,
  RAIL_LIFT,
  SPEED_UNITS,
  STEP,
  TrainRunner,
  buildRailPath,
  buildTrackMeshes,
  centreLine,
  chaikin,
  deckHeights,
  poseAt,
  surfaceY,
  tableSize,
  tileWorld,
  type Vec3,
} from './geometry'
import { FOV, LOOK_AT, cameraGoal, fitDistance, worldSpan } from './viewpoints'

const path = (tiles: Array<[number, number]>): Coord[] => tiles.map(([x, z]) => ({ x, z }))

describe('placing tiles on the table', () => {
  it('centres the survey on the origin', () => {
    const world = createWorld(5, 3)
    expect(tileWorld(world, { x: 2, z: 1 })).toEqual([0, 0, 0])
    expect(tileWorld(world, { x: 0, z: 0 })).toEqual([-2, 0, -1])
    expect(tableSize(world)).toEqual([5, 3])
  })

  it('lifts a tile by its elevation level', () => {
    const world = withTile(createWorld(3, 3), { x: 1, z: 1 }, { h: 3 })
    expect(tileWorld(world, { x: 1, z: 1 })[1]).toBeCloseTo(surfaceY(3))
    expect(surfaceY(3)).toBeCloseTo(STEP * 3)
  })
})

describe('bridge decks', () => {
  const world = worldFromRows(['..~~..'], ['112001'])

  it('sits land tiles on the ground', () => {
    const decks = deckHeights(world, path([[0, 0], [1, 0]]))
    expect(decks[0]).toBeCloseTo(surfaceY(1))
    expect(decks[1]).toBeCloseTo(surfaceY(1))
  })

  it('spans water by interpolating between the two banks', () => {
    const decks = deckHeights(world, path([[1, 0], [2, 0], [3, 0], [4, 0]]))
    // bank at level 1, then two water tiles, then bank at level 0
    expect(decks[0]).toBeCloseTo(surfaceY(1))
    expect(decks[3]).toBeCloseTo(surfaceY(0))
    expect(decks[1]).toBeGreaterThan(decks[2])
    expect(decks[1]).toBeLessThan(decks[0])
    expect(decks[2]).toBeGreaterThan(decks[3])
  })

  it('carries the bank height out to a line that ends over water', () => {
    const decks = deckHeights(world, path([[1, 0], [2, 0], [3, 0]]))
    expect(decks[1]).toBeCloseTo(surfaceY(1))
    expect(decks[2]).toBeCloseTo(surfaceY(1))
  })

  it('copes with a line entirely over water', () => {
    const all = worldFromRows(['~~~'], ['000'])
    expect(deckHeights(all, path([[0, 0], [1, 0], [2, 0]]))).toEqual([0, 0, 0])
  })
})

describe('smoothing', () => {
  it('leaves a straight run straight', () => {
    const straight: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]
    for (const p of chaikin(straight, 2, false)) expect(p[1]).toBeCloseTo(0)
    expect(chaikin(straight, 2, false)[0]).toEqual([0, 0, 0])
  })

  it('keeps the two ends of an open run pinned', () => {
    const bend: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
    ]
    const smooth = chaikin(bend, 2, false)
    expect(smooth[0]).toEqual([0, 0, 0])
    expect(smooth[smooth.length - 1]).toEqual([1, 0, 1])
  })

  it('rounds a corner inwards rather than leaving it square', () => {
    const bend: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
    ]
    const smooth = chaikin(bend, 2, false)
    expect(smooth.some((p) => p[0] < 1 && p[2] > 0)).toBe(true)
  })

  it('leaves a run of fewer than three points alone', () => {
    const two: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
    ]
    expect(chaikin(two, 2, false)).toEqual(two)
  })
})

describe('the rail path', () => {
  const world = worldFromRows(['....', '....'], ['0123', '0000'])

  it('runs through tile centres by way of the edge midpoints', () => {
    const raw = centreLine(world, path([[0, 0], [1, 0], [2, 0]]), false)
    expect(raw).toHaveLength(5)
    expect(raw[0][1]).toBeCloseTo(surfaceY(0) + RAIL_LIFT)
    expect(raw[2][1]).toBeCloseTo(surfaceY(1) + RAIL_LIFT)
  })

  it('measures its own length', () => {
    const flat = createWorld(6, 3)
    const built = buildRailPath(flat, path([[0, 1], [1, 1], [2, 1], [3, 1]]))
    expect(built.closed).toBe(false)
    expect(built.length).toBeCloseTo(3, 1)
    expect(built.cum[0]).toBe(0)
    expect(built.cum[built.cum.length - 1]).toBeCloseTo(built.length, 5)
  })

  it('recognises a closed loop and measures the return leg', () => {
    const flat = createWorld(6, 6)
    const loop = buildRailPath(flat, path([[1, 1], [2, 1], [2, 2], [1, 2]]))
    expect(loop.closed).toBe(true)
    expect(loop.length).toBeCloseTo(4, 0)
  })

  it('finds the arc-length of each station on the line', () => {
    let flat = createWorld(8, 3)
    flat = withTile(flat, { x: 4, z: 1 }, { feature: 'station' })
    const built = buildRailPath(flat, path([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]))
    expect(built.stations).toHaveLength(1)
    expect(built.stations[0]).toBeGreaterThan(0)
    expect(built.stations[0]).toBeLessThan(built.length)
  })
})

describe('posing an engine on the line', () => {
  const flat = createWorld(8, 3)
  const straight = buildRailPath(flat, path([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]))

  it('sits at the start at distance zero and the end at full length', () => {
    expect(poseAt(straight, 0).position[0]).toBeCloseTo(tileWorld(flat, { x: 1, z: 1 })[0], 1)
    expect(poseAt(straight, straight.length).position[0]).toBeCloseTo(
      tileWorld(flat, { x: 5, z: 1 })[0],
      1,
    )
  })

  it('clamps beyond the ends of an open line', () => {
    expect(poseAt(straight, -50).position).toEqual(poseAt(straight, 0).position)
    expect(poseAt(straight, 500).position).toEqual(poseAt(straight, straight.length).position)
  })

  it('stays level on the flat', () => {
    expect(poseAt(straight, straight.length / 2).pitch).toBeCloseTo(0, 4)
  })

  it('pitches nose-up on a climb and nose-down on a fall', () => {
    const hill = worldFromRows(['.....'], ['00120'])
    const climbing = buildRailPath(hill, path([[0, 0], [1, 0], [2, 0], [3, 0]]))
    const up = poseAt(climbing, climbing.length * 0.55)
    expect(up.pitch).toBeLessThan(0)

    const descending = buildRailPath(hill, path([[3, 0], [2, 0], [1, 0], [0, 0]]))
    const down = poseAt(descending, descending.length * 0.35)
    expect(down.pitch).toBeGreaterThan(0)
  })

  it('turns to face the direction of travel', () => {
    const corner = buildRailPath(createWorld(6, 6), path([[1, 1], [2, 1], [2, 2], [2, 3]]))
    const early = poseAt(corner, corner.length * 0.1)
    const late = poseAt(corner, corner.length * 0.9)
    expect(Math.abs(early.yaw - late.yaw)).toBeGreaterThan(0.9)
  })

  it('wraps round a loop instead of clamping', () => {
    const loop = buildRailPath(createWorld(6, 6), path([[1, 1], [2, 1], [2, 2], [1, 2]]))
    const start = poseAt(loop, 0).position
    const round = poseAt(loop, loop.length).position
    expect(round[0]).toBeCloseTo(start[0], 3)
    expect(round[2]).toBeCloseTo(start[2], 3)
  })
})

describe('running trains', () => {
  const flat = createWorld(10, 3)
  const open = buildRailPath(flat, path([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]))
  const loop = buildRailPath(
    createWorld(8, 8),
    path([[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]]),
  )

  it('moves forward along an open line', () => {
    const runner = new TrainRunner(open, { speed: 1, stationPause: 0, endPause: 0 })
    runner.update(0.5)
    expect(runner.distance).toBeCloseTo(0.5, 5)
    expect(runner.direction).toBe(1)
  })

  it('shuttles: it turns round at the far end and comes back', () => {
    const runner = new TrainRunner(open, { speed: 2, stationPause: 0, endPause: 0 })
    for (let i = 0; i < 60 && runner.direction === 1; i++) runner.update(0.1)
    expect(runner.direction).toBe(-1)
    expect(runner.distance).toBeCloseTo(open.length, 5)
    for (let i = 0; i < 10; i++) runner.update(0.1)
    expect(runner.distance).toBeLessThan(open.length)
    for (let i = 0; i < 60 && runner.direction === -1; i++) runner.update(0.1)
    expect(runner.direction).toBe(1)
    expect(runner.distance).toBe(0)
  })

  it('waits at each end before setting off again', () => {
    const runner = new TrainRunner(open, { speed: 5, stationPause: 0, endPause: 1 })
    for (let i = 0; i < 40 && runner.direction === 1; i++) runner.update(0.1)
    const parked = runner.distance
    runner.update(0.2)
    expect(runner.distance).toBe(parked)
  })

  it('circulates round a closed loop without ever reversing', () => {
    const runner = new TrainRunner(loop, { speed: 2, stationPause: 0, endPause: 0 })
    for (let i = 0; i < 200; i++) {
      runner.update(0.05)
      expect(runner.direction).toBe(1)
      expect(runner.distance).toBeGreaterThanOrEqual(0)
      expect(runner.distance).toBeLessThanOrEqual(loop.length + 1e-6)
    }
  })

  it('holds at a station and then carries on', () => {
    let world = createWorld(10, 3)
    world = withTile(world, { x: 4, z: 1 }, { feature: 'station' })
    const withStation = buildRailPath(
      world,
      path([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]),
    )
    const runner = new TrainRunner(withStation, { speed: 1, stationPause: 2, endPause: 0 })
    let paused = false
    for (let i = 0; i < 120; i++) {
      const before = runner.distance
      runner.update(0.1)
      if (Math.abs(runner.distance - before) < 1e-9 && runner.distance > 0) paused = true
      if (paused && runner.distance > withStation.stations[0] + 0.5) break
    }
    expect(paused).toBe(true)
    expect(runner.distance).toBeGreaterThan(withStation.stations[0])
  })

  it('does nothing at all on a path with no length', () => {
    const empty = buildRailPath(flat, path([[1, 1]]))
    const runner = new TrainRunner(empty, { speed: 2 })
    runner.update(1)
    expect(runner.distance).toBe(0)
    expect(Number.isFinite(runner.pose().position[0])).toBe(true)
  })

  it('offers three sensible speeds', () => {
    expect(SPEED_UNITS.slow).toBeLessThan(SPEED_UNITS.normal)
    expect(SPEED_UNITS.normal).toBeLessThan(SPEED_UNITS.fast)
  })
})

describe('framing the table', () => {
  const small = createWorld(12, 10)
  const grand = createWorld(24, 17)

  it('counts the timber frame as part of what has to fit', () => {
    expect(worldSpan(small)).toBeGreaterThan(Math.hypot(12, 10))
  })

  it('stands far enough back that the full width fits at any aspect', () => {
    for (const aspect of [0.55, 0.93, 1.35, 2.4]) {
      const span = worldSpan(small)
      const distance = fitDistance(span, aspect)
      const vertical = (FOV * Math.PI) / 180
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect)
      expect(2 * distance * Math.tan(horizontal / 2)).toBeGreaterThanOrEqual(span)
      // the vertical allowance accounts for depth foreshortening, so it only
      // has to clear the table's own footprint rather than its diagonal
      expect(2 * distance * Math.tan(vertical / 2)).toBeGreaterThanOrEqual(span * 0.8)
    }
  })

  it('stands further back for a tall narrow stage than a wide one', () => {
    const span = worldSpan(small)
    expect(fitDistance(span, 0.6)).toBeGreaterThan(fitDistance(span, 1.8))
  })

  it('survives a viewport measured as zero on the first paint', () => {
    expect(Number.isFinite(fitDistance(worldSpan(small), 0))).toBe(true)
    expect(Number.isFinite(fitDistance(worldSpan(small), Number.NaN))).toBe(true)
  })

  it('scales with the table so a grand layout is not cropped', () => {
    expect(fitDistance(worldSpan(grand), 1.35)).toBeGreaterThan(
      fitDistance(worldSpan(small), 1.35),
    )
  })

  it('puts the three viewpoints at the same distance on opposite sides', () => {
    const home = cameraGoal(small, 'home', 1.35)
    const west = cameraGoal(small, 'west', 1.35)
    const east = cameraGoal(small, 'east', 1.35)
    const from = (p: readonly number[]) =>
      Math.hypot(p[0] - LOOK_AT[0], p[1] - LOOK_AT[1], p[2] - LOOK_AT[2])
    expect(from(home)).toBeCloseTo(from(west), 5)
    expect(from(west)).toBeCloseTo(from(east), 5)
    expect(west[0]).toBeLessThan(0)
    expect(east[0]).toBeGreaterThan(0)
    expect(home[0]).toBeCloseTo(0, 6)
    // all three look down on the table rather than up at it
    for (const p of [home, west, east]) expect(p[1]).toBeGreaterThan(0)
  })
})

describe('generating the permanent way', () => {
  const flat = createWorld(8, 4)

  it('builds railheads and sleepers with sane, finite geometry', () => {
    const meshes = buildTrackMeshes(flat, path([[1, 1], [2, 1], [3, 1], [4, 1]]))
    expect(meshes.rails.positions.length).toBeGreaterThan(0)
    expect(meshes.sleepers.positions.length).toBeGreaterThan(0)
    expect(meshes.rails.positions.length).toBe(meshes.rails.normals.length)
    expect(meshes.rails.positions.length % 9).toBe(0)
    for (const v of meshes.rails.positions) expect(Number.isFinite(v)).toBe(true)
    for (const n of meshes.sleepers.normals) expect(Number.isFinite(n)).toBe(true)
  })

  it('lays two railheads a gauge apart', () => {
    const meshes = buildTrackMeshes(flat, path([[1, 1], [2, 1], [3, 1]]))
    const zs: number[] = []
    for (let i = 2; i < meshes.rails.positions.length; i += 3) zs.push(meshes.rails.positions[i])
    const spread = Math.max(...zs) - Math.min(...zs)
    expect(spread).toBeGreaterThan(GAUGE * 0.8)
    expect(spread).toBeLessThan(GAUGE * 2)
  })

  it('adds a deck and trestles only where the line crosses water', () => {
    const dry = buildTrackMeshes(flat, path([[1, 1], [2, 1], [3, 1]]))
    expect(dry.bridge.positions.length).toBe(0)

    const river = withTile(createWorld(8, 4), { x: 2, z: 1 }, { kind: 'water' })
    const wet = buildTrackMeshes(river, path([[1, 1], [2, 1], [3, 1]]))
    expect(wet.bridge.positions.length).toBeGreaterThan(0)
    let lowest = Infinity
    for (let i = 1; i < wet.bridge.positions.length; i += 3) {
      lowest = Math.min(lowest, wet.bridge.positions[i])
    }
    expect(lowest).toBeLessThan(0)
  })

  it('produces nothing at all for a single tile of rail', () => {
    const meshes = buildTrackMeshes(flat, path([[2, 2]]))
    expect(meshes.rails.positions.length).toBe(0)
    expect(meshes.triangles).toBe(0)
  })

  it('closes the ring of a looped line', () => {
    const loop = buildTrackMeshes(createWorld(6, 6), path([[1, 1], [2, 1], [2, 2], [1, 2]]))
    expect(loop.triangles).toBeGreaterThan(0)
  })
})
