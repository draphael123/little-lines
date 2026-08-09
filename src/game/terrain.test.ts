import { describe, expect, it } from 'vitest'
import { blockLevel, createWorld, tileAt, withTile } from './grid'
import {
  adjustHeight,
  boreTunnel,
  canPlaceFeature,
  canSetHeight,
  fillTunnel,
  growLandscape,
  mulberry32,
  portalLevel,
  seedSandbox,
  setKind,
} from './terrain'
import { connectionCheck, occupiedTiles } from './track'
import { MAX_ELEVATION, type Coord, type RailLine } from './types'

const at = (x: number, z: number): Coord => ({ x, z })
const railThrough = (tiles: Array<[number, number]>): RailLine[] => [
  { id: 'l', tiles: tiles.map(([x, z]) => at(x, z)) },
]

describe('raising and lowering ground', () => {
  it('moves a tile one level at a time and stops at the limits', () => {
    let world = createWorld(5, 5)
    world = adjustHeight(world, [], at(2, 2), 1).world
    expect(tileAt(world, at(2, 2))!.h).toBe(1)
    const down = adjustHeight(createWorld(5, 5), [], at(2, 2), -1)
    expect(down.check.ok).toBe(false)
    expect(down.check.reason).toMatch(/table height/i)

    let high = createWorld(5, 5)
    high = withTile(high, at(2, 2), { h: MAX_ELEVATION })
    const tooHigh = adjustHeight(high, [], at(2, 2), 1)
    expect(tooHigh.check.ok).toBe(false)
  })

  it('will not touch the water table', () => {
    const world = withTile(createWorld(5, 5), at(2, 2), { kind: 'water' })
    expect(canSetHeight(world, [], at(2, 2), 1).ok).toBe(false)
  })

  it('refuses any edit that would strand existing rail on an impossible gradient', () => {
    const lines = railThrough([[1, 2], [2, 2], [3, 2]])
    let world = createWorld(6, 6)
    // one level is fine
    const first = adjustHeight(world, lines, at(2, 2), 1)
    expect(first.check.ok).toBe(true)
    world = first.world
    // two would leave a cliff either side of the middle tile
    const second = adjustHeight(world, lines, at(2, 2), 1)
    expect(second.check.ok).toBe(false)
    expect(second.check.reason).toMatch(/gradient/i)
    expect(tileAt(second.world, at(2, 2))!.h).toBe(1)
  })

  it('keeps every rail segment legal after a permitted edit', () => {
    const lines = railThrough([[1, 1], [2, 1], [3, 1], [3, 2], [3, 3]])
    let world = createWorld(7, 7)
    for (const c of [at(2, 1), at(3, 1), at(3, 2)]) {
      const edit = adjustHeight(world, lines, c, 1)
      if (edit.check.ok) world = edit.world
    }
    const tiles = lines[0].tiles
    for (let i = 1; i < tiles.length; i++) {
      expect(connectionCheck(world, tiles[i - 1], tiles[i]).ok).toBe(true)
    }
  })

  it('flooding a rail tile is allowed only when the gradient survives', () => {
    const lines = railThrough([[1, 1], [2, 1], [3, 1]])
    let world = createWorld(6, 6)
    world = withTile(world, at(1, 1), { h: 1 })
    world = withTile(world, at(2, 1), { h: 1 })
    world = withTile(world, at(3, 1), { h: 1 })
    // dropping the middle to the water table leaves a one-level step: legal
    expect(setKind(world, lines, at(2, 1), 'water').check.ok).toBe(true)

    let steep = createWorld(6, 6)
    steep = withTile(steep, at(1, 1), { h: 2 })
    steep = withTile(steep, at(2, 1), { h: 2 })
    steep = withTile(steep, at(3, 1), { h: 2 })
    expect(setKind(steep, lines, at(2, 1), 'water').check.ok).toBe(false)
  })

  it('never puts rock under a line', () => {
    const lines = railThrough([[1, 1], [2, 1]])
    expect(setKind(createWorld(5, 5), lines, at(2, 1), 'rock').check.ok).toBe(false)
  })
})

describe('tunnels', () => {
  it('cuts the floor to the level of the ground it opens onto and keeps the rock above', () => {
    let world = createWorld(6, 6)
    world = withTile(world, at(3, 3), { kind: 'rock', h: 3 })
    expect(portalLevel(world, at(3, 3))).toBe(0)
    const bored = boreTunnel(world, at(3, 3))
    expect(bored.check.ok).toBe(true)
    const tile = tileAt(bored.world, at(3, 3))!
    expect(tile.tunnel).toBe(true)
    expect(tile.h).toBe(0)
    expect(tile.rockTop).toBe(3)
    expect(blockLevel(tile)).toBe(3)
  })

  it('makes rail able to pass where it could not before', () => {
    let world = createWorld(6, 6)
    world = withTile(world, at(3, 3), { kind: 'rock', h: 3 })
    expect(connectionCheck(world, at(2, 3), at(3, 3)).ok).toBe(false)
    const bored = boreTunnel(world, at(3, 3)).world
    expect(connectionCheck(bored, at(2, 3), at(3, 3)).ok).toBe(true)
  })

  it('only bores through rock', () => {
    expect(boreTunnel(createWorld(4, 4), at(1, 1)).check.ok).toBe(false)
  })

  it('refuses to fill a tunnel with rail still in it, and restores the rock otherwise', () => {
    let world = createWorld(6, 6)
    world = withTile(world, at(3, 3), { kind: 'rock', h: 3 })
    world = boreTunnel(world, at(3, 3)).world
    const lines = railThrough([[2, 3], [3, 3], [4, 3]])
    expect(fillTunnel(world, lines, at(3, 3)).check.ok).toBe(false)
    const filled = fillTunnel(world, [], at(3, 3))
    expect(filled.check.ok).toBe(true)
    expect(tileAt(filled.world, at(3, 3))!.h).toBe(3)
    expect(tileAt(filled.world, at(3, 3))!.tunnel).toBe(false)
  })
})

describe('placing things', () => {
  it('keeps the permanent way clear of pines and needs rail under a station', () => {
    const lines = railThrough([[1, 1], [2, 1]])
    const world = createWorld(5, 5)
    expect(canPlaceFeature(world, lines, at(2, 1), 'tree').ok).toBe(false)
    expect(canPlaceFeature(world, lines, at(3, 3), 'tree').ok).toBe(true)
    expect(canPlaceFeature(world, lines, at(2, 1), 'station').ok).toBe(true)
    expect(canPlaceFeature(world, lines, at(3, 3), 'station').ok).toBe(false)
  })

  it('plants nothing in water or on rock', () => {
    let world = createWorld(5, 5)
    world = withTile(world, at(1, 1), { kind: 'water' })
    world = withTile(world, at(2, 2), { kind: 'rock' })
    expect(canPlaceFeature(world, [], at(1, 1), 'tree').ok).toBe(false)
    expect(canPlaceFeature(world, [], at(2, 2), 'tree').ok).toBe(false)
  })
})

describe('growing a landscape', () => {
  it('is deterministic for a given seed', () => {
    const a = growLandscape(createWorld(14, 10), [], { seed: 5 })
    const b = growLandscape(createWorld(14, 10), [], { seed: 5 })
    expect(a.tiles).toEqual(b.tiles)
  })

  it('carves water and raises ground', () => {
    const world = growLandscape(createWorld(16, 12), [], { seed: 3 })
    expect(world.tiles.some((t) => t.kind === 'water')).toBe(true)
    expect(world.tiles.some((t) => t.h > 0)).toBe(true)
    expect(world.tiles.some((t) => t.feature === 'tree')).toBe(true)
  })

  it('never places a cottage — settlement is simulated, not scattered', () => {
    const world = growLandscape(createWorld(16, 12), [], { seed: 8 })
    expect(world.tiles.every((t) => t.feature === null || t.feature === 'tree')).toBe(true)
  })

  it('leaves every existing line legal, however violently the ground moves', () => {
    const lines = railThrough([
      [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4],
    ])
    for (let seed = 0; seed < 25; seed++) {
      const world = growLandscape(createWorld(14, 10), lines, { seed })
      const tiles = lines[0].tiles
      for (let i = 1; i < tiles.length; i++) {
        expect(
          connectionCheck(world, tiles[i - 1], tiles[i]).ok,
          `seed ${seed} broke the line at ${tiles[i].x},${tiles[i].z}`,
        ).toBe(true)
      }
      // rail tiles never become impassable rock
      for (const t of tiles) expect(tileAt(world, t)!.kind).not.toBe('rock')
    }
  })

  it('leaves rail tiles free of scenery', () => {
    const lines = railThrough([[2, 2], [3, 2], [4, 2]])
    const world = growLandscape(createWorld(12, 9), lines, { seed: 11 })
    const rail = occupiedTiles(lines)
    for (const key of rail) {
      const [x, z] = key.split(',').map(Number)
      expect(tileAt(world, at(x, z))!.feature).toBeNull()
    }
  })

  it('seeds a playable sandbox of the requested size', () => {
    const world = seedSandbox(18, 13, 2)
    expect(world.w).toBe(18)
    expect(world.h).toBe(13)
    expect(world.tiles).toHaveLength(18 * 13)
  })
})

describe('the seeded generator', () => {
  it('returns numbers in range and repeats for the same seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 50; i++) {
      const value = a()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(value).toBe(b())
    }
  })
})
