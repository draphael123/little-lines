/**
 * The heightfield as a drawable surface.
 *
 * One indexed mesh over the whole region with smoothed normals and vertex
 * colours chosen by altitude and steepness — grass on the flat, rock where it
 * gets steep, sand along the waterline. No tiles, no terraces, no seams.
 */
import { RESOLUTION, SPACING, gridToWorld, type Heightfield } from './heightfield'

export interface Surface {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
  triangles: number
}

type RGB = [number, number, number]

const GRASS_LOW: RGB = [0.42, 0.55, 0.3]
const GRASS_HIGH: RGB = [0.47, 0.5, 0.32]
const MOOR: RGB = [0.45, 0.43, 0.31]
const ROCK: RGB = [0.42, 0.4, 0.37]
const SAND: RGB = [0.74, 0.68, 0.5]
const BED: RGB = [0.3, 0.33, 0.29]

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Ground colour from how high it is and how steep it is. */
export function groundColour(height: number, slope: number, seaLevel: number): RGB {
  if (height < seaLevel - 1) return BED

  const altitude = clamp01((height - seaLevel) / 150)
  let colour = mix(GRASS_LOW, GRASS_HIGH, clamp01(altitude * 1.6))
  colour = mix(colour, MOOR, clamp01((altitude - 0.45) * 1.9))

  // exposed rock wherever the ground gets steep
  colour = mix(colour, ROCK, clamp01((slope - 0.32) * 2.4))

  // a beach along the waterline, but only where it is not a cliff
  const shore = clamp01(1 - Math.abs(height - seaLevel) / 6) * clamp01(1 - slope * 3)
  colour = mix(colour, SAND, shore * 0.85)

  return colour
}

export function buildSurface(field: Heightfield): Surface {
  const n = field.resolution
  const count = n * n
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const indices = new Uint32Array((n - 1) * (n - 1) * 6)

  const h = (i: number, j: number) =>
    field.heights[
      Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))
    ]

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const height = field.heights[k]
      positions[k * 3] = gridToWorld(i)
      positions[k * 3 + 1] = height
      positions[k * 3 + 2] = gridToWorld(j)

      // central-difference normal, which is exact enough for a smooth field
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * SPACING)
      const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * SPACING)
      const len = Math.hypot(dx, 1, dz)
      normals[k * 3] = -dx / len
      normals[k * 3 + 1] = 1 / len
      normals[k * 3 + 2] = -dz / len

      const [r, g, b] = groundColour(height, Math.hypot(dx, dz), field.seaLevel)
      colors[k * 3] = r
      colors[k * 3 + 1] = g
      colors[k * 3 + 2] = b
    }
  }

  let t = 0
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices[t++] = a
      indices[t++] = c
      indices[t++] = b
      indices[t++] = b
      indices[t++] = c
      indices[t++] = d
    }
  }

  return { positions, normals, colors, indices, triangles: indices.length / 3 }
}

export const surfaceExtent = () => (RESOLUTION - 1) * SPACING
