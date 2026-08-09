/**
 * How a settlement lays itself out on open ground.
 *
 * A town is a street plan, not a scatter of houses. A main axis runs through
 * the centre, side streets come off it, and buildings line those streets
 * facing them. The whole thing grows outward and upward with the population,
 * and it is entirely deterministic — the same town always builds itself the
 * same way, so nothing shuffles between frames.
 */
import { heightAt, isWater, slopeAt, type Heightfield } from './heightfield'
import { tierOf, type Settlement, type Tier } from './towns'

export interface Road {
  ax: number
  az: number
  bx: number
  bz: number
  /** Metres wide. */
  width: number
}

export type BuildingShape = 'house' | 'terrace' | 'block' | 'tower' | 'civic'

export interface TownBuilding {
  x: number
  z: number
  y: number
  yaw: number
  width: number
  depth: number
  height: number
  shape: BuildingShape
  shade: number
}

export interface TownPlan {
  roads: Road[]
  buildings: TownBuilding[]
  tier: Tier
  radius: number
}

/* --------------------------------------------------------------- helpers */

function hash(x: number, y: number): number {
  let h = Math.imul(Math.round(x * 91), 374761393) + Math.imul(Math.round(y * 71), 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** How far a settlement spreads, in metres. */
export function townRadius(population: number): number {
  return Math.min(760, 80 + Math.sqrt(Math.max(0, population)) * 17)
}

/**
 * Can a street or a building stand here? People build on slopes — a limit of
 * 0.3 (17°) chopped every street in hill country into fragments and left towns
 * as a scatter of a dozen houses, so this is deliberately generous.
 */
function buildable(field: Heightfield, x: number, z: number): boolean {
  if (isWater(field, x, z)) return false
  return slopeAt(field, x, z) < 0.45
}

const MAIN_WIDTH = 9
const SIDE_WIDTH = 6
const BLOCK = 92
const PLOT = 26

/**
 * The street plan and everything standing on it. `avoid` keeps the town off
 * the permanent way — buildings are not put on the railway.
 */
export function planTown(
  field: Heightfield,
  settlement: Settlement,
  avoid: (x: number, z: number) => boolean = () => false,
): TownPlan {
  const tier = tierOf(settlement.population)
  const radius = townRadius(settlement.population)
  const angle = hash(settlement.x, settlement.z) * Math.PI
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // along the main axis, and across it
  const along = (t: number, s: number): [number, number] => [
    settlement.x + cos * t - sin * s,
    settlement.z + sin * t + cos * s,
  ]

  const roads: Road[] = []
  const buildings: TownBuilding[] = []
  const wanted = Math.min(420, Math.max(2, Math.round(settlement.population / 6)))

  /**
   * Walk a straight run, breaking it wherever the ground will not take a
   * street, so a town wraps round a lake instead of driving through it.
   * `point(u)` turns a distance along the run into a position.
   */
  const street = (
    from: number,
    to: number,
    width: number,
    point: (u: number) => [number, number],
  ) => {
    const step = 12
    let runStart: number | null = null
    for (let u = from; u <= to + 1e-6; u += step) {
      const [x, z] = point(u)
      const usable = buildable(field, x, z) && !avoid(x, z)
      if (usable && runStart === null) runStart = u
      const last = u + step > to
      if ((!usable || last) && runStart !== null) {
        const end = usable ? u : u - step
        if (end - runStart >= step) {
          const [ax, az] = point(runStart)
          const [bx, bz] = point(end)
          roads.push({ ax, az, bx, bz, width })
        }
        runStart = null
      }
    }
  }

  // the main street, then side streets across it every block
  street(-radius, radius, MAIN_WIDTH, (t) => along(t, 0))
  const arms = Math.floor(radius / BLOCK)
  for (let k = -arms; k <= arms; k++) {
    if (k === 0) continue
    const t = k * BLOCK
    const reach = Math.sqrt(Math.max(0, radius * radius - t * t))
    if (reach < 40) continue
    street(-reach, reach, SIDE_WIDTH, (s) => along(t, s))
  }

  /* ---- buildings line every street, both sides */
  for (const road of roads) {
    const dx = road.bx - road.ax
    const dz = road.bz - road.az
    const len = Math.hypot(dx, dz)
    if (len < PLOT) continue
    const ux = dx / len
    const uz = dz / len
    const yaw = Math.atan2(ux, uz)
    const offset = road.width / 2 + 9

    for (let d = PLOT * 0.6; d < len - PLOT * 0.4; d += PLOT) {
      for (const side of [-1, 1]) {
        if (buildings.length >= wanted) break
        const x = road.ax + ux * d - uz * offset * side
        const z = road.az + uz * d + ux * offset * side
        if (!buildable(field, x, z) || avoid(x, z)) continue

        const fromCentre = Math.hypot(x - settlement.x, z - settlement.z) / Math.max(1, radius)
        const roll = hash(x, z)
        const shape = pickShape(tier, fromCentre, roll)
        const storeys = storeysFor(shape, tier, fromCentre, roll)
        const width = shape === 'terrace' ? 11 : shape === 'civic' ? 22 : shape === 'tower' ? 16 : 13
        buildings.push({
          x,
          z,
          y: heightAt(field, x, z),
          yaw,
          width,
          depth: shape === 'civic' ? 18 : 11,
          height: storeys * 3.4,
          shape,
          shade: roll,
        })
      }
      if (buildings.length >= wanted) break
    }
    if (buildings.length >= wanted) break
  }

  // a civic building at the heart of anywhere that has grown up
  if ((tier === 'town' || tier === 'city') && buildings.length > 0) {
    let best = 0
    let bestD = Infinity
    buildings.forEach((b, i) => {
      const d = Math.hypot(b.x - settlement.x, b.z - settlement.z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    buildings[best] = {
      ...buildings[best],
      shape: 'civic',
      width: 24,
      depth: 20,
      height: tier === 'city' ? 26 : 18,
    }
  }

  return { roads, buildings, tier, radius }
}

function pickShape(tier: Tier, fromCentre: number, roll: number): BuildingShape {
  if (tier === 'hamlet') return 'house'
  if (tier === 'village') return roll < 0.7 ? 'house' : 'terrace'
  const central = fromCentre < 0.42
  if (tier === 'town') {
    if (central && roll > 0.55) return 'block'
    return roll < 0.45 ? 'house' : 'terrace'
  }
  // city
  if (central) return roll > 0.55 ? 'tower' : 'block'
  return roll < 0.3 ? 'house' : roll < 0.75 ? 'terrace' : 'block'
}

function storeysFor(shape: BuildingShape, tier: Tier, fromCentre: number, roll: number): number {
  const density = 1 - Math.min(1, fromCentre)
  switch (shape) {
    case 'house':
      return 2 + Math.round(roll)
    case 'terrace':
      return 3 + Math.round(roll * 1.4)
    case 'block':
      // a market town's tallest building is a mill or a warehouse, not a
      // ten-storey slab; only a city gets real height out of a block
      return tier === 'city'
        ? 4 + Math.round(density * 4 + roll * 2)
        : 3 + Math.round(density + roll)
    case 'tower':
      return 9 + Math.round(density * (tier === 'city' ? 14 : 6) + roll * 5)
    case 'civic':
      return 5
  }
}

/** Everything a whole country builds, for one pass of the renderer. */
export function planCountry(
  field: Heightfield,
  settlements: Settlement[],
  avoid: (x: number, z: number) => boolean,
): { roads: Road[]; buildings: TownBuilding[] } {
  const roads: Road[] = []
  const buildings: TownBuilding[] = []
  for (const settlement of settlements) {
    const plan = planTown(field, settlement, avoid)
    roads.push(...plan.roads)
    buildings.push(...plan.buildings)
  }
  return { roads, buildings }
}
