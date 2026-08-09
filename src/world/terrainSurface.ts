/**
 * The heightfield as a drawable surface.
 *
 * One indexed mesh over the whole region with smoothed normals and vertex
 * colours chosen by altitude and steepness — grass on the flat, rock where it
 * gets steep, sand along the waterline. No tiles, no terraces, no seams.
 */
import { RESOLUTION, SPACING, fbm, gridToWorld, type Heightfield } from './heightfield'

export interface Surface {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  /** World x/z in metres, for a detail texture that tiles across the region. */
  uvs: Float32Array
  indices: Uint32Array
  triangles: number
}

/**
 * Metres covered by one repeat of the ground detail texture. Large enough that
 * the repeat is not a visible grid from the air, small enough that the grain
 * still resolves at street level.
 */
export const DETAIL_TILE = 44

type RGB = [number, number, number]

const MEADOW: RGB = [0.43, 0.58, 0.29]
const PASTURE: RGB = [0.54, 0.62, 0.33]
const UPLAND: RGB = [0.45, 0.5, 0.3]
const MOOR: RGB = [0.5, 0.46, 0.32]
const ROCK: RGB = [0.48, 0.46, 0.43]
const SAND: RGB = [0.72, 0.66, 0.48]
const BED: RGB = [0.24, 0.28, 0.24]

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Ground colour from how high it is and how steep it is.
 *
 * `altitude` is 0 at the waterline and 1 at the top of this particular region —
 * keyed to the range the land actually occupies, so raising the relief moves
 * the tree line with it rather than turning the whole map into moorland.
 * `variation` is a slow noise field that keeps neighbouring fields from being
 * exactly the same green.
 */
export function groundColour(
  height: number,
  slope: number,
  seaLevel: number,
  altitude: number,
  variation = 0,
): RGB {
  if (height < seaLevel - 0.5) return BED

  let colour = mix(MEADOW, PASTURE, clamp01(variation * 0.5 + 0.5))
  colour = mix(colour, UPLAND, clamp01((altitude - 0.34) * 1.5))
  colour = mix(colour, MOOR, clamp01((altitude - 0.72) * 2.4))

  // Exposed rock only on genuinely steep faces. A gradient of 0.3 is a 17°
  // hillside — grass, sheep and hedges, not scree — and treating that as rock
  // turns every hill in the region grey.
  colour = mix(colour, ROCK, clamp01((slope - 0.62) * 1.5))

  // a beach along the waterline, but only where it is not a cliff
  const shore = clamp01(1 - Math.abs(height - seaLevel) / 5) * clamp01(1 - slope * 4)
  colour = mix(colour, SAND, shore * 0.8)

  return colour
}

export function buildSurface(field: Heightfield): Surface {
  const n = field.resolution
  const count = n * n
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const indices = new Uint32Array((n - 1) * (n - 1) * 6)

  const h = (i: number, j: number) =>
    field.heights[
      Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))
    ]

  // The colour bands are keyed to this region's own range, so the same palette
  // reads correctly whether the land tops out at eighty metres or four hundred.
  let ceiling = field.seaLevel
  for (let k = 0; k < count; k++) if (field.heights[k] > ceiling) ceiling = field.heights[k]
  const span = Math.max(1, ceiling - field.seaLevel)

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const height = field.heights[k]
      positions[k * 3] = gridToWorld(i)
      positions[k * 3 + 1] = height
      positions[k * 3 + 2] = gridToWorld(j)
      uvs[k * 2] = gridToWorld(i) / DETAIL_TILE
      uvs[k * 2 + 1] = gridToWorld(j) / DETAIL_TILE

      // central-difference normal, which is exact enough for a smooth field
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * SPACING)
      const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * SPACING)
      const len = Math.hypot(dx, 1, dz)
      normals[k * 3] = -dx / len
      normals[k * 3 + 1] = 1 / len
      normals[k * 3 + 2] = -dz / len

      const altitude = (height - field.seaLevel) / span
      // Two scales of variation: broad country that changes as you cross the
      // region, and field-sized patches so a hillside is not one flat green.
      const broad = fbm((i / n) * 6, (j / n) * 6, field.seed + 4201, 3) * 2 - 1
      const patch = fbm((i / n) * 17, (j / n) * 17, field.seed + 8803, 2) * 2 - 1
      // Close-range texture is the detail map's job — at 8 m between samples a
      // vertex term fine enough to see is also fine enough to alias.
      const variation = broad * 0.7 + patch * 0.5
      const [r, g, b] = groundColour(
        height,
        Math.hypot(dx, dz),
        field.seaLevel,
        altitude,
        variation,
      )
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

  return { positions, normals, colors, uvs, indices, triangles: indices.length / 3 }
}

export const surfaceExtent = () => (RESOLUTION - 1) * SPACING
