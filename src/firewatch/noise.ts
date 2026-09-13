/**
 * A small deterministic noise field.
 *
 * The lookout demo has no assets at all: every hill, every tree and every
 * plank is generated at load from these two functions, so the same seed
 * always gives the same forest and nothing has to be fetched.
 */

/** A tiny xorshift-ish hash. Integer in, 0..1 out, no state. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise on the unit grid, in -1..1. */
export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  const top = a + (b - a) * xf
  const bottom = c + (d - c) * xf
  return (top + (bottom - top) * yf) * 2 - 1
}

/** Layered noise. Octaves halve in amplitude and double in frequency. */
export function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0
  let amplitude = 1
  let total = 0
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * frequency, y * frequency, seed + i * 101) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / total
}

/** A seeded stream of numbers in 0..1, for scatter and jitter. */
export function randoms(seed: number): () => number {
  let s = (seed | 0) || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}
