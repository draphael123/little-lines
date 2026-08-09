/**
 * The board is a growing patch of hexes, in axial coordinates.
 *
 * Keys are packed into a single integer so the rules can use plain Maps and
 * Sets without paying for string hashing on every neighbour lookup — groups and
 * the rail network are re-walked from scratch after every placement, so that
 * walk is the hot one.
 */

export interface Hex {
  q: number
  r: number
}

/** A packed `(q, r)`. Both components must lie within ±`KEY_BIAS`. */
export type HexKey = number

const KEY_BIAS = 512
const KEY_SPAN = KEY_BIAS * 2

export function keyOf(q: number, r: number): HexKey {
  return (q + KEY_BIAS) * KEY_SPAN + (r + KEY_BIAS)
}

export function unkey(key: HexKey): Hex {
  return {
    q: Math.floor(key / KEY_SPAN) - KEY_BIAS,
    r: (key % KEY_SPAN) - KEY_BIAS,
  }
}

/** Clockwise from due east. */
export const DIRECTIONS: ReadonlyArray<Hex> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

const KEY_STEPS = DIRECTIONS.map((d) => d.q * KEY_SPAN + d.r)

/** The six neighbours of a packed key, in `DIRECTIONS` order. */
export function neighbourKeys(key: HexKey): HexKey[] {
  return KEY_STEPS.map((step) => key + step)
}

/** The neighbour in one direction, without building the whole ring. */
export function neighbourKey(key: HexKey, direction: number): HexKey {
  return key + KEY_STEPS[direction]
}

/**
 * The edge of a neighbour that faces you. Two tiles meet along one border, and
 * each names it by a different index; almost every rule in the game is about
 * that pair, so it gets a name.
 */
export function opposite(direction: number): number {
  return (direction + 3) % 6
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2
}

export function ringIndex(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2
}

/** Every hex within `radius` of the origin, centre first, then ring by ring. */
export function hexesWithin(radius: number): Hex[] {
  const out: Hex[] = []
  for (let q = -radius; q <= radius; q += 1) {
    const lo = Math.max(-radius, -q - radius)
    const hi = Math.min(radius, -q + radius)
    for (let r = lo; r <= hi; r += 1) out.push({ q, r })
  }
  out.sort((a, b) => ringIndex(a.q, a.r) - ringIndex(b.q, b.r))
  return out
}

/**
 * Axial to world, flat-topped, `size` being the distance from centre to corner.
 * Nothing in the rules needs this; it is here so the renderer and the rules
 * agree on one definition of where a hex actually is.
 */
export function toWorld(q: number, r: number, size: number): { x: number; z: number } {
  return {
    x: size * 1.5 * q,
    z: size * Math.sqrt(3) * (r + q / 2),
  }
}
