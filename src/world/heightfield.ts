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
/**
 * Samples per side, so 8 m between them. Coarser than this and ridge lines
 * show their triangles as a sawtooth against the sky, which is the one place
 * the lattice becomes visible. The whole field costs about 200 ms to build,
 * once, at startup.
 */
export const RESOLUTION = 513
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
  const relief = options.relief ?? 210
  const seaLevel = options.seaLevel ?? 0
  const heights = new Float32Array(RESOLUTION * RESOLUTION)

  for (let j = 0; j < RESOLUTION; j++) {
    for (let i = 0; i < RESOLUTION; i++) {
      const u = i / (RESOLUTION - 1)
      const v = j / (RESOLUTION - 1)

      // Broad shape: land rises away from the southern and eastern coast.
      const toLand = Math.min(1, Math.hypot(u * 1.15, (1 - v) * 1.15) * 0.92)
      let coast = smooth(Math.max(0, Math.min(1, (toLand - 0.16) / 0.5)))

      // And it goes back down at every border. Without this the mesh simply
      // stops at the map edge and the region reads as a slab on a table —
      // a wall of soil standing in the sea. The land should run out before
      // you reach the edge, so the region ends in water on all sides.
      const margin = Math.min(u, 1 - u, v, 1 - v)
      const shelf = smooth(Math.max(0, Math.min(1, (margin - 0.02) / 0.14)))
      coast *= shelf

      const broad = fbm(u * 2.4, v * 2.4, seed, 4)
      const detail = fbm(u * 9, v * 9, seed + 77, 4)
      const fine = fbm(u * 16, v * 16, seed + 613, 3)
      // Ridged noise twice over, at different scales: one range of hills you
      // read from the air, and spurs off it you only notice from the ground.
      const ridge = 1 - Math.abs(fbm(u * 3.1, v * 3.1, seed + 311, 3) * 2 - 1)
      const spur = 1 - Math.abs(fbm(u * 6.7, v * 6.7, seed + 907, 3) * 2 - 1)

      const shape =
        broad * 0.48 + detail * 0.13 + fine * 0.03 + ridge * ridge * 0.5 + spur * spur * 0.14

      // fBm clusters hard around its mean, which reads as a pancake from the
      // air. Stretching what is actually used and bending it upwards turns the
      // same field into valley floors with hills standing out of them.
      // Clamping the low end instead would stamp out dead-flat plains at
      // exactly one height, so below the knee it is compressed, not cut off.
      const t = (shape - 0.26) / 0.46
      const land = t > 0 ? t * t * (0.55 + 0.45 * Math.min(1, t)) : t * 0.16

      heights[j * RESOLUTION + i] = (land * coast - 0.05) * relief
    }
  }

  const field: Heightfield = { size: REGION, resolution: RESOLUTION, heights, seaLevel, seed }
  for (let r = 0; r < 3; r++) carveRiver(field, seed + r * 5087)
  smoothField(field, 2)
  return field
}

/**
 * Cut a river valley from high ground down to the coast.
 *
 * Two things make this harder than "walk downhill":
 *
 * Rolling noise is full of local minima, so a strict descent stalls within a
 * few steps and leaves a pit on a hillside with the sea showing through it.
 * The route is therefore found on a heavily blurred copy of the land, which
 * has almost none of them, with a standing pull towards the coast as a
 * backstop.
 *
 * And a bed that is forced to keep falling will happily bore a three-hundred
 * metre slot through any ridge in its way. So the cut is capped: the river
 * lowers the land by at most `MAX_CUT`, and where it cannot get through at
 * that depth it goes around instead.
 */
const MAX_CUT = 34
/** Metres either side that ease back up to the surrounding hillside. */
const VALLEY = 9

function carveRiver(field: Heightfield, seed: number) {
  const { resolution, heights } = field
  const guide = blurred(field, 6)
  const at = (i: number, j: number) => guide[j * resolution + i]

  // Start somewhere high, inland.
  let best = { i: 0, j: 0, h: -Infinity }
  for (let attempt = 0; attempt < 220; attempt++) {
    const i = 12 + Math.floor(hash2(attempt, 1, seed) * (resolution - 24))
    const j = 12 + Math.floor(hash2(attempt, 2, seed) * (resolution * 0.5))
    const h = at(i, j)
    if (h > best.h) best = { i, j, h }
  }

  // --- route first, carve afterwards, so the channel it has already dug
  // cannot trap it.
  const route: Array<{ i: number; j: number }> = []
  const seen = new Set<number>()
  let { i, j } = best
  const mouth = { i: resolution - 1, j: resolution - 1 }

  for (let step = 0; step < resolution * 3; step++) {
    route.push({ i, j })
    seen.add(j * resolution + i)
    if (at(i, j) <= field.seaLevel) break

    let next = { i, j, cost: Infinity }
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue
        const ni = i + di
        const nj = j + dj
        if (ni < 1 || nj < 1 || ni >= resolution - 1 || nj >= resolution - 1) continue
        if (seen.has(nj * resolution + ni)) continue
        const toMouth = Math.hypot(mouth.i - ni, mouth.j - nj)
        const wobble = (hash2(ni, nj, seed) - 0.5) * 7
        const cost = at(ni, nj) * 1.4 + toMouth * 0.9 + wobble
        if (cost < next.cost) next = { i: ni, j: nj, cost }
      }
    }
    if (next.cost === Infinity) break
    i = next.i
    j = next.j
  }

  if (route.length < 8) return

  // --- a bed that only ever falls, but never more than MAX_CUT below the land
  const bed = new Float32Array(route.length)
  let level = Infinity
  for (let k = 0; k < route.length; k++) {
    const ground = heights[route[k].j * resolution + route[k].i]
    level = Math.min(level, ground - 3)
    level = Math.max(level, ground - MAX_CUT)
    level = Math.max(level, field.seaLevel - 2)
    bed[k] = level
  }

  // --- carve, easing the banks back up over VALLEY cells
  const width = 1.4 + hash2(best.i, best.j, seed) * 1.0
  for (let k = 0; k < route.length; k++) {
    const { i: ci, j: cj } = route[k]
    const radius = Math.ceil(width + VALLEY)
    for (let dj = -radius; dj <= radius; dj++) {
      for (let di = -radius; di <= radius; di++) {
        const ni = ci + di
        const nj = cj + dj
        if (ni < 0 || nj < 0 || ni >= resolution || nj >= resolution) continue
        const d = Math.hypot(di, dj)
        if (d > width + VALLEY) continue
        const index = nj * resolution + ni
        const ground = heights[index]
        // flat bed out to `width`, then a smooth ramp back to the hillside
        const t = smooth(Math.max(0, Math.min(1, (d - width) / VALLEY)))
        heights[index] = Math.min(ground, bed[k] + (ground - bed[k]) * t)
      }
    }
  }
}

/** A blurred copy of the land, used for routing decisions only. */
function blurred(field: Heightfield, passes: number): Float32Array {
  const { resolution } = field
  let a = Float32Array.from(field.heights)
  let b = new Float32Array(a.length)
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const k = j * resolution + i
        const l = i > 0 ? a[k - 1] : a[k]
        const r = i < resolution - 1 ? a[k + 1] : a[k]
        const u = j > 0 ? a[k - resolution] : a[k]
        const d = j < resolution - 1 ? a[k + resolution] : a[k]
        b[k] = a[k] * 0.2 + (l + r + u + d) * 0.2
      }
    }
    const swap = a
    a = b
    b = swap
  }
  return a
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

  // What matters is how the ground sits relative to what is around it, not how
  // far it is above the sea. Judging by absolute height puts every settlement
  // on the coastal shelf and leaves the inland valleys — where people would
  // actually live — completely empty.
  let around = 0
  let samples = 0
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2
    for (const r of [220, 440]) {
      around += heightAt(field, x + Math.cos(angle) * r, z + Math.sin(angle) * r)
      samples++
    }
  }
  const relative = h - around / samples
  // in a hollow is good, on a shoulder is fair, on a summit is poor
  score -= Math.max(0, Math.min(0.5, relative / 60))
  score -= Math.min(0.15, Math.max(0, h - 260) / 900)
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
