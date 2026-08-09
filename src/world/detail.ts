/**
 * The ground's close-range texture.
 *
 * Vertex colours can only carry detail down to the lattice spacing — eight
 * metres — so from a train window the whole country is a smooth billiard
 * cloth. This generates a small seamless tile instead, repeated every
 * `DETAIL_TILE` metres, which multiplies against the vertex colour: the broad
 * palette still comes from height and slope, and this only breaks up the
 * surface underneath it.
 *
 * A matching normal map is the half that actually matters. Colour speckle
 * alone still reads as flat paint; perturbing the normal makes the ground
 * catch the light differently across a metre, which is what "textured" looks
 * like at a distance.
 *
 * Generated rather than shipped: a few kilobytes of code instead of a texture
 * download, and it tiles by construction.
 */
import { DataTexture, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType } from 'three'

const SIZE = 256

/** Seamless value noise: the lattice wraps, so the tile does too. */
function wrappedNoise(size: number, cells: number, seed: number): Float32Array {
  const grid = new Float32Array(cells * cells)
  let state = seed >>> 0
  for (let i = 0; i < grid.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    grid[i] = state / 4294967296
  }

  const out = new Float32Array(size * size)
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const at = (i: number, j: number) => grid[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells
      const fy = (y / size) * cells
      const i = Math.floor(fx)
      const j = Math.floor(fy)
      const u = smooth(fx - i)
      const v = smooth(fy - j)
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i, j + 1)
      const d = at(i + 1, j + 1)
      out[y * size + x] = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
    }
  }
  return out
}

/** Layered wrapped noise — still seamless, because every layer is. */
function fbmTile(size: number, cells: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size)
  let amplitude = 1
  let total = 0
  for (let o = 0; o < octaves; o++) {
    const layer = wrappedNoise(size, cells * 2 ** o, seed + o * 7919)
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude
    total += amplitude
    amplitude *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

let cached: { map: DataTexture; normal: DataTexture } | null = null

export function groundDetail() {
  if (cached) return cached

  // Weighted towards the fine grain on purpose. Big soft clumps are the part
  // the eye recognises when the tile repeats, so they stay faint; the tussocky
  // high-frequency layer carries the texture and reads as noise, not pattern.
  const clump = fbmTile(SIZE, 3, 3, 12345)
  const grain = fbmTile(SIZE, 26, 3, 60313)

  const height = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < height.length; i++) height[i] = clump[i] * 0.3 + grain[i] * 0.7

  const colour = new Uint8Array(SIZE * SIZE * 4)
  for (let i = 0; i < height.length; i++) {
    // Centred on 1.0 so the tile darkens and lightens the vertex colour
    // rather than tinting the whole region towards grey.
    const shade = 0.86 + height[i] * 0.28
    const value = Math.max(0, Math.min(255, Math.round(shade * 255)))
    colour[i * 4] = value
    // a touch more green in the light patches, so it reads as growth
    colour[i * 4 + 1] = Math.min(255, Math.round(value * 1.03))
    colour[i * 4 + 2] = Math.round(value * 0.94)
    colour[i * 4 + 3] = 255
  }

  const normal = new Uint8Array(SIZE * SIZE * 4)
  const at = (x: number, y: number) =>
    height[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)]
  const strength = 2.4
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const k = (y * SIZE + x) * 4
      normal[k] = Math.round(((-dx / len) * 0.5 + 0.5) * 255)
      normal[k + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255)
      normal[k + 2] = Math.round((1 / len) * 0.5 * 255 + 127)
      normal[k + 3] = 255
    }
  }

  const make = (data: Uint8Array, srgb: boolean) => {
    const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.anisotropy = 8
    if (srgb) texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }

  cached = { map: make(colour, true), normal: make(normal, false) }
  return cached
}
