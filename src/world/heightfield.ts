/**
 * The land, as a continuous surface.
 *
 * There is no grid any more. The region is four kilometres square at metre
 * scale, sampled on a lattice and read back with bilinear interpolation, so
 * every query — the height under a length of track, the slope under a house —
 * is answered at whatever position you ask about rather than snapped to a
 * square. Everything downstream of this file works in metres.
 */

/** Metres across the whole region. */
export const REGION = 4096
/** Samples per side. 16 m between samples is finer than anything you can see. */
export const RESOLUTION = 257
export const SPACING = REGION / (RESOLUTION - 1)

export interface Heightfield {
  /** Metres across. */
  size: number
  resolution: number
  /** Row-major, resolution² metres above datum. */
  heights: Float32Array
  seaLevel: number
  seed: number
}

/* ------------------------------------------------------------------ noise */

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Classic value noise. Cheap, smooth enough, and completely deterministic. */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  const u = smooth(xf)
  const v = smooth(yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Layered noise: broad landforms with finer detail laid over them. */
export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let total = 0
  let amplitude = 1
  let frequency = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(x * frequency, y * frequency, seed + i * 1013) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return total / norm
}

/* ------------------------------------------------------------- generation */

export interface RegionOptions {
  seed?: number
  /** Metres from the datum to the highest ground. */
  relief?: number
  seaLevel?: number
}

/**
 * A region with a coast on one side, rolling inland country, a few hills, and
 * rivers cut by following the ground downhill to the sea.
 */
export function generateRegion(options: RegionOptions = {}): Heightfield {
  const seed = options.seed ?? 1
  const relief = options.relief ?? 190
  const seaLevel = options.seaLevel ?? 0
  const heights = new Float32Array(RESOLUTION * RESOLUTION)

  for (let j = 0; j < RESOLUTION; j++) {
    for (let i = 0; i < RESOLUTION; i++) {
      const u = i / (RESOLUTION - 1)
      const v = j / (RESOLUTION - 1)

      // Broad shape: land rises away from the southern and eastern coast.
      const toLand = Math.min(1, Math.hypot(u * 1.15, (1 - v) * 1.15) * 0.92)
      const coast = smooth(Math.max(0, Math.min(1, (toLand - 0.16) / 0.5)))

      const broad = fbm(u * 2.4, v * 2.4, seed, 4)
      const detail = fbm(u * 9, v * 9, seed + 77, 4)
      const ridge = 1 - Math.abs(fbm(u * 3.1, v * 3.1, seed + 311, 3) * 2 - 1)

      const shape = broad * 0.55 + detail * 0.18 + ridge * ridge * 0.42
      heights[j * RESOLUTION + i] = (shape * coast - 0.1) * relief
    }
  }

  const field: Heightfield = { size: REGION, resolution: RESOLUTION, heights, seaLevel, seed }
  for (let r = 0; r < 3; r++) carveRiver(field, seed + r * 5087)
  smoothField(field, 1)
  return field
}

/** Follow the ground downhill from a high point, cutting a channel as you go. */
function carveRiver(field: Heightfield, seed: number) {
  const { resolution, heights } = field
  // Start somewhere high in the northern half.
  let best = { i: 0, j: 0, h: -Infinity }
  for (let attempt = 0; attempt < 220; attempt++) {
    const i = 8 + Math.floor(hash2(attempt, 1, seed) * (resolution - 16))
    const j = 8 + Math.floor(hash2(attempt, 2, seed) * (resolution * 0.55))
    const h = heights[j * resolution + i]
    if (h > best.h) best = { i, j, h }
  }

  let { i, j } = best
  const width = 2.2 + hash2(i, j, seed) * 1.6
  for (let step = 0; step < resolution * 2; step++) {
    // cut a soft channel around the current point
    const radius = Math.ceil(width) + 1
    for (let dj = -radius; dj <= radius; dj++) {
      for (let di = -radius; di <= radius; di++) {
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= resolution || nj >= resolution) continue
        const d = Math.hypot(di, dj)
        if (d > width) continue
        const cut = (1 - d / width) * 26
        const index = nj * resolution + ni
        heights[index] = Math.min(heights[index], Math.max(-14, heights[index] - cut))
      }
    }

    // step to the lowest neighbour, with a nudge so it meanders
    let next = { i, j, h: Infinity }
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue
        const ni = i + di
        const nj = j + dj
        if (ni < 1 || nj < 1 || ni >= resolution - 1 || nj >= resolution - 1) continue
        const wobble = (hash2(ni, nj, seed) - 0.5) * 6
        const h = heights[nj * resolution + ni] + wobble
        if (h < next.h) next = { i: ni, j: nj, h }
      }
    }
    if (next.i === i && next.j === j) break
    i = next.i
    j = next.j
    if (heights[j * resolution + i] < field.seaLevel - 6) break
  }
}

function smoothField(field: Heightfield, passes: number) {
  const { resolution, heights } = field
  for (let p = 0; p < passes; p++) {
    const copy = Float32Array.from(heights)
    for (let j = 1; j < resolution - 1; j++) {
      for (let i = 1; i < resolution - 1; i++) {
        const k = j * resolution + i
        heights[k] =
          copy[k] * 0.4 +
          (copy[k - 1] + copy[k + 1] + copy[k - resolution] + copy[k + resolution]) * 0.15
      }
    }
  }
}

/* ---------------------------------------------------------------- sampling */

/** World x/z run from -REGION/2 to +REGION/2, with the origin in the middle. */
export const worldToGrid = (v: number) => (v + REGION / 2) / SPACING
export const gridToWorld = (g: number) => g * SPACING - REGION / 2

export function sampleAt(field: Heightfield, i: number, j: number): number {
  const ci = Math.max(0, Math.min(field.resolution - 1, i))
  const cj = Math.max(0, Math.min(field.resolution - 1, j))
  return field.heights[cj * field.resolution + ci]
}

/** Ground height at any point in the region, interpolated. */
export function heightAt(field: Heightfield, x: number, z: number): number {
  const gx = worldToGrid(x)
  const gz = worldToGrid(z)
  const i = Math.floor(gx)
  const j = Math.floor(gz)
  const fx = gx - i
  const fz = gz - j
  const a = sampleAt(field, i, j)
  const b = sampleAt(field, i + 1, j)
  const c = sampleAt(field, i, j + 1)
  const d = sampleAt(field, i + 1, j + 1)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

/** Steepness at a point, as a gradient (rise over run), not an angle. */
export function slopeAt(field: Heightfield, x: number, z: number): number {
  const d = SPACING
  const dx = (heightAt(field, x + d, z) - heightAt(field, x - d, z)) / (2 * d)
  const dz = (heightAt(field, x, z + d) - heightAt(field, x, z - d)) / (2 * d)
  return Math.hypot(dx, dz)
}

export const isWater = (field: Heightfield, x: number, z: number) =>
  heightAt(field, x, z) <= field.seaLevel

export const inRegion = (x: number, z: number) =>
  Math.abs(x) <= REGION / 2 && Math.abs(z) <= REGION / 2

/** Somewhere a settlement would plausibly stand: low, flat, dry, near water. */
export function siteScore(field: Heightfield, x: number, z: number): number {
  if (!inRegion(x, z)) return 0
  const h = heightAt(field, x, z)
  if (h <= field.seaLevel + 2) return 0
  const slope = slopeAt(field, x, z)
  if (slope > 0.34) return 0

  let score = 1
  score -= Math.min(0.6, slope * 1.6)
  score -= Math.min(0.45, Math.max(0, h - 40) / 260)
  // a river or the sea within a few hundred metres is worth a lot
  let nearWater = false
  for (let a = 0; a < 8 && !nearWater; a++) {
    const angle = (a / 8) * Math.PI * 2
    for (const r of [120, 260, 400]) {
      if (isWater(field, x + Math.cos(angle) * r, z + Math.sin(angle) * r)) {
        nearWater = true
        break
      }
    }
  }
  if (nearWater) score += 0.3
  return Math.max(0, Math.min(1.5, score))
}
