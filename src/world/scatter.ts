/**
 * Everything growing on the region that the player did not put there.
 *
 * Woodland is placed by noise rather than sprinkled evenly: broad stands
 * thicken in the sheltered middle heights and thin out on the tops, along the
 * shore and wherever a town or a railway has taken the ground. It is the
 * single biggest thing making the country read as country rather than as a
 * coloured surface.
 */
import { fbm, heightAt, isWater, slopeAt, type Heightfield } from './heightfield'

export interface Tree {
  x: number
  z: number
  y: number
  /** 1 is an ordinary tree; the spread is deliberately wide. */
  scale: number
  spin: number
  /** 0 conifer, 1 broadleaf. */
  broad: number
}

export interface ScatterOptions {
  /** Metres between candidate positions. Smaller is denser and slower. */
  spacing?: number
  /** 0..1, thins the whole wood out. */
  density?: number
  /** Ground already taken: towns, stations, the permanent way. */
  taken?: (x: number, z: number) => boolean
}

const REACH = 1900

/** Where the woods are, given the shape of the land. */
export function scatterTrees(field: Heightfield, options: ScatterOptions = {}): Tree[] {
  const spacing = options.spacing ?? 26
  const density = options.density ?? 1
  const taken = options.taken ?? (() => false)
  const out: Tree[] = []

  // The tree line has to follow the region's own range. Fixed at 110 m it
  // stripped the woods off a map whose valley floors are already at 200 m.
  let ceiling = field.seaLevel
  for (const h of field.heights) if (h > ceiling) ceiling = h
  const span = Math.max(1, ceiling - field.seaLevel)
  const treeline = field.seaLevel + span * 0.62

  for (let z = -REACH; z <= REACH; z += spacing) {
    for (let x = -REACH; x <= REACH; x += spacing) {
      // jitter off the lattice so the wood is not a plantation
      const jx = x + (fbm(x * 0.21, z * 0.21, 5, 1) - 0.5) * spacing * 1.5
      const jz = z + (fbm(x * 0.19, z * 0.23, 9, 1) - 0.5) * spacing * 1.5
      if (isWater(field, jx, jz)) continue

      const height = heightAt(field, jx, jz)
      if (height < field.seaLevel + 4) continue
      const slope = slopeAt(field, jx, jz)
      if (slope > 0.55) continue
      if (taken(jx, jz)) continue

      // broad stands of woodland, with clearings between them
      const wood = fbm(jx * 0.0016, jz * 0.0016, 41, 4)
      let chance = (wood - 0.42) * 2.6
      // thin out on the tops and along the shore
      chance -= Math.max(0, (height - treeline) / (span * 0.3))
      chance -= Math.max(0, (12 - (height - field.seaLevel)) / 26)
      chance -= Math.max(0, (slope - 0.34) * 1.4)
      chance *= density
      if (fbm(jx * 0.37, jz * 0.37, 77, 1) > chance) continue

      const roll = fbm(jx * 0.53, jz * 0.51, 13, 1)
      out.push({
        x: jx,
        z: jz,
        y: height,
        scale: 0.72 + roll * 0.85,
        spin: roll * Math.PI * 2,
        // conifers take the higher ground, broadleaves the valleys
        broad: height < field.seaLevel + span * 0.35 && roll > 0.35 ? 1 : 0,
      })
    }
  }
  return out
}

/** A cheap proximity test built from a list of points, for keeping ground clear. */
export function keepClear(points: Array<{ x: number; z: number }>, radius: number) {
  const cell = Math.max(40, radius)
  const grid = new Map<string, Array<{ x: number; z: number }>>()
  const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`
  for (const p of points) {
    const k = key(p.x, p.z)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k)!.push(p)
  }
  const r2 = radius * radius
  return (x: number, z: number) => {
    const gx = Math.floor(x / cell)
    const gz = Math.floor(z / cell)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = grid.get(`${gx + dx},${gz + dz}`)
        if (!bucket) continue
        for (const p of bucket) {
          const ddx = p.x - x
          const ddz = p.z - z
          if (ddx * ddx + ddz * ddz < r2) return true
        }
      }
    }
    return false
  }
}
