import { describe, expect, it } from 'vitest'
import { createWorld, withTile, worldFromRows } from '../game/grid'
import { boreTunnel } from '../game/terrain'
import { CHAMFER, RIVER_DEPTH, SEABED_Y, buildTerrainMesh, tileTopY } from './terrainMesh'
import { surfaceY } from './geometry'

const tops = (mesh: ReturnType<typeof buildTerrainMesh>) => {
  const ys: number[] = []
  for (let i = 1; i < mesh.positions.length; i += 3) ys.push(mesh.positions[i])
  return ys
}

describe('where the ground sits', () => {
  it('puts land on its own level and sinks riverbeds below the water line', () => {
    const world = worldFromRows(['.~'], ['20'])
    expect(tileTopY(world.tiles[0])).toBeCloseTo(surfaceY(2))
    expect(tileTopY(world.tiles[1])).toBeCloseTo(surfaceY(0) - RIVER_DEPTH)
    expect(tileTopY(world.tiles[1])).toBeLessThan(0)
  })

  it('draws a tunnelled tile at the height of the rock above it', () => {
    let world = createWorld(3, 3)
    world = withTile(world, { x: 1, z: 1 }, { kind: 'rock', h: 3 })
    world = boreTunnel(world, { x: 1, z: 1 }).world
    expect(tileTopY(world.tiles[1 * 3 + 1])).toBeCloseTo(surfaceY(3))
  })
})

describe('the terraced mesh', () => {
  it('produces well formed, finite geometry', () => {
    const mesh = buildTerrainMesh(worldFromRows(['..^', '.~.', '...'], ['011', '000', '112']))
    expect(mesh.triangles).toBeGreaterThan(0)
    expect(mesh.positions.length).toBe(mesh.triangles * 9)
    expect(mesh.normals.length).toBe(mesh.positions.length)
    expect(mesh.colors.length).toBe(mesh.positions.length)
    expect(mesh.tileByTriangle.length).toBe(mesh.triangles)
    for (const v of mesh.positions) expect(Number.isFinite(v)).toBe(true)
    for (const n of mesh.normals) expect(Number.isFinite(n)).toBe(true)
    for (const c of mesh.colors) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('names a real tile for every triangle', () => {
    const world = createWorld(4, 3)
    const mesh = buildTerrainMesh(world)
    for (const t of mesh.tileByTriangle) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(world.w * world.h)
    }
    // every tile contributes something, so every tile can be clicked
    expect(new Set(mesh.tileByTriangle).size).toBe(world.w * world.h)
  })

  it('leaves flat ground seamless: two triangles per tile and nothing else', () => {
    // A single interior tile of a flat plain has no stepped edge, so it should
    // contribute only its top face. This is what removes the grid of blocks.
    const flat = createWorld(3, 3)
    const mesh = buildTerrainMesh(flat)
    const middle = mesh.tileByTriangle.filter((t) => t === 4).length
    expect(middle).toBe(2)
  })

  it('adds a chamfer and a wall exactly where the ground steps down', () => {
    const stepped = worldFromRows(['...', '.1.', '...'].map((r) => r.replace(/[01]/g, '.')), [
      '000',
      '010',
      '000',
    ])
    const mesh = buildTerrainMesh(stepped)
    // the raised middle tile now has four stepped edges, so far more than a top
    expect(mesh.tileByTriangle.filter((t) => t === 4).length).toBeGreaterThan(10)
  })

  it('runs every coastal wall down to one seabed, so the shore is continuous', () => {
    const island = worldFromRows(['..', '..'], ['31', '13'])
    const mesh = buildTerrainMesh(island)
    const lowest = Math.min(...tops(mesh))
    expect(lowest).toBeCloseTo(SEABED_Y, 5)
    // and nothing pokes below it
    expect(tops(mesh).every((y) => y >= SEABED_Y - 1e-6)).toBe(true)
  })

  it('keeps the top face inside its own tile', () => {
    const world = worldFromRows(['..', '..'], ['01', '10'])
    const mesh = buildTerrainMesh(world)
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(Math.abs(mesh.positions[i])).toBeLessThanOrEqual(1.001)
      expect(Math.abs(mesh.positions[i + 2])).toBeLessThanOrEqual(1.001)
    }
  })

  it('cuts the terrace back by the chamfer and no further', () => {
    const world = worldFromRows(['..'], ['10'])
    const mesh = buildTerrainMesh(world)
    // the raised tile's top face stops CHAMFER short of the shared edge
    const raisedTopXs: number[] = []
    for (let t = 0; t < mesh.triangles; t++) {
      if (mesh.tileByTriangle[t] !== 0) continue
      for (let v = 0; v < 3; v++) {
        const base = t * 9 + v * 3
        if (Math.abs(mesh.positions[base + 1] - surfaceY(1)) < 1e-6) {
          raisedTopXs.push(mesh.positions[base])
        }
      }
    }
    // tile 0 of a two-wide map is centred on x = -0.5, so its untouched east
    // edge would reach x = 0; the chamfer pulls it back to -CHAMFER
    expect(Math.max(...raisedTopXs)).toBeCloseTo(-CHAMFER, 5)
  })

  it('scales with the map rather than exploding', () => {
    const small = buildTerrainMesh(createWorld(12, 10)).triangles
    const grand = buildTerrainMesh(createWorld(24, 17)).triangles
    expect(grand).toBeGreaterThan(small)
    expect(grand).toBeLessThan(60_000)
  })
})
