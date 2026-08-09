import { describe, expect, it } from 'vitest'
import {
  REGION,
  RESOLUTION,
  generateRegion,
  gridToWorld,
  heightAt,
  inRegion,
  isWater,
  siteScore,
  slopeAt,
  worldToGrid,
} from './heightfield'
import { buildSurface, groundColour } from './terrainSurface'

const field = generateRegion({ seed: 3 })

describe('the region', () => {
  it('is four kilometres of continuous ground, not a board', () => {
    expect(field.size).toBe(REGION)
    expect(REGION).toBeGreaterThanOrEqual(4000)
    expect(field.heights).toHaveLength(RESOLUTION * RESOLUTION)
    expect(field.heights.every((h) => Number.isFinite(h))).toBe(true)
  })

  it('is deterministic for a seed, and different between seeds', () => {
    expect(Array.from(generateRegion({ seed: 3 }).heights)).toEqual(Array.from(field.heights))
    const other = generateRegion({ seed: 4 })
    expect(Array.from(other.heights)).not.toEqual(Array.from(field.heights))
  })

  it('has both dry land and open water', () => {
    const above = field.heights.filter((h) => h > field.seaLevel).length
    const below = field.heights.length - above
    expect(above).toBeGreaterThan(field.heights.length * 0.25)
    expect(below).toBeGreaterThan(field.heights.length * 0.05)
  })

  it('reaches real relief without absurd cliffs everywhere', () => {
    const max = Math.max(...field.heights)
    expect(max).toBeGreaterThan(60)
    let steep = 0
    for (let i = 0; i < 400; i++) {
      const x = (i / 400 - 0.5) * REGION * 0.9
      if (slopeAt(field, x, x * 0.3) > 1.2) steep++
    }
    expect(steep).toBeLessThan(80)
  })
})

describe('sampling anywhere, not just on a lattice', () => {
  it('round-trips between world metres and lattice coordinates', () => {
    expect(gridToWorld(worldToGrid(137.5))).toBeCloseTo(137.5, 6)
    expect(worldToGrid(-REGION / 2)).toBeCloseTo(0, 6)
    expect(worldToGrid(REGION / 2)).toBeCloseTo(RESOLUTION - 1, 6)
  })

  it('interpolates between samples rather than snapping', () => {
    const a = heightAt(field, 100, 100)
    const b = heightAt(field, 108, 100)
    const mid = heightAt(field, 104, 100)
    expect(mid).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-6)
    expect(mid).toBeLessThanOrEqual(Math.max(a, b) + 1e-6)
    // and it genuinely varies at sub-sample distances
    expect(Math.abs(heightAt(field, 100, 100) - heightAt(field, 103, 100))).toBeGreaterThan(0)
  })

  it('is continuous: tiny steps never jump', () => {
    for (let i = 0; i < 60; i++) {
      const x = -1400 + i * 41
      const z = 260
      expect(Math.abs(heightAt(field, x, z) - heightAt(field, x + 0.5, z))).toBeLessThan(3)
    }
  })

  it('clamps outside the region instead of reading rubbish', () => {
    expect(Number.isFinite(heightAt(field, -99999, 99999))).toBe(true)
    expect(inRegion(0, 0)).toBe(true)
    expect(inRegion(REGION, 0)).toBe(false)
  })

  it('calls the sea the sea, and dry land dry', () => {
    let wet = 0
    let dry = 0
    for (let j = 0; j < 40; j++) {
      for (let i = 0; i < 40; i++) {
        const x = -1900 + i * 97
        const z = -1900 + j * 97
        if (isWater(field, x, z)) wet++
        else dry++
      }
    }
    expect(wet).toBeGreaterThan(20)
    expect(dry).toBeGreaterThan(200)
  })
})

describe('where a town would stand', () => {
  it('refuses water and steep ground', () => {
    let foundWater = false
    for (let i = 0; i < 200 && !foundWater; i++) {
      const x = -2000 + i * 20
      if (isWater(field, x, 1900)) {
        expect(siteScore(field, x, 1900)).toBe(0)
        foundWater = true
      }
    }
    expect(foundWater).toBe(true)
  })

  it('scores flat low ground above a mountainside', () => {
    let flatBest = 0
    let steepBest = 0
    for (let i = 0; i < 900; i++) {
      const x = ((i * 137) % 3600) - 1800
      const z = ((i * 89) % 3600) - 1800
      const score = siteScore(field, x, z)
      if (score === 0) continue
      if (slopeAt(field, x, z) < 0.06) flatBest = Math.max(flatBest, score)
      if (slopeAt(field, x, z) > 0.25) steepBest = Math.max(steepBest, score)
    }
    expect(flatBest).toBeGreaterThan(steepBest)
  })
})

describe('the drawable surface', () => {
  const surface = buildSurface(field)

  it('is one indexed mesh covering the whole region', () => {
    expect(surface.positions).toHaveLength(RESOLUTION * RESOLUTION * 3)
    expect(surface.colors).toHaveLength(surface.positions.length)
    expect(surface.normals).toHaveLength(surface.positions.length)
    expect(surface.triangles).toBe((RESOLUTION - 1) * (RESOLUTION - 1) * 2)
    expect(surface.indices.every((i) => i < RESOLUTION * RESOLUTION)).toBe(true)
  })

  it('has unit-length, upward-facing normals', () => {
    for (let k = 0; k < 400; k++) {
      const i = k * 37 * 3
      if (i + 2 >= surface.normals.length) break
      const len = Math.hypot(surface.normals[i], surface.normals[i + 1], surface.normals[i + 2])
      expect(len).toBeCloseTo(1, 4)
      expect(surface.normals[i + 1]).toBeGreaterThan(0)
    }
  })

  it('paints steep ground as rock and the waterline as sand', () => {
    const flat = groundColour(30, 0.02, 0)
    const cliff = groundColour(30, 1.1, 0)
    const beach = groundColour(0.5, 0.02, 0)
    // rock is greyer: its channels sit closer together than grass
    const spread = (c: number[]) => Math.max(...c) - Math.min(...c)
    expect(spread(cliff)).toBeLessThan(spread(flat))
    expect(beach[0]).toBeGreaterThan(flat[0])
  })

  it('keeps every colour channel in range', () => {
    for (const c of surface.colors) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})
