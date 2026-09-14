/**
 * The lookout, with no renderer in it.
 *
 * The shape of the ground, where the trees stand, how big the treehouse is
 * and what happens when you climb the ladder are all decided here, as plain
 * data. `scene.ts` and `player.ts` only mount and move what this returns,
 * which is why the ladder can be tested without a canvas.
 */
import { fbm, randoms } from './noise'

/* ------------------------------------------------------------- dimensions */

/** The big tree in the clearing. Everything else is placed around it. */
export const TRUNK = {
  x: 0,
  z: 0,
  /** Radius at the ground, and at the top of the bare trunk. */
  base: 1.6,
  top: 0.8,
  height: 38,
}

/** The deck of the treehouse, and the gap in its railing. */
export const DECK = {
  y: 15.6,
  halfX: 4.4,
  minZ: -4.2,
  maxZ: 4.0,
  /** Where the railing is open for the ladder. */
  gapHalfX: 0.62,
}

/** The stone drum the tower is founded on, which you cannot walk through. */
export const BASE = { radius: 3.3, height: 5.4 }

/** The ladder up the outside of the tower, from the leaf litter to the deck. */
export const LADDER = {
  z: 4.3,
  halfWidth: 0.38,
  foot: 0.1,
  /** The rails run a little past the deck so there is something to hold. */
  head: DECK.y + 0.95,
  rungs: 27,
}

/** Eye height of somebody standing up. */
export const EYE = 1.68

/** The clearing the trees keep out of, in metres from the trunk. */
export const CLEARING = 13

/** How far you can wander before the country turns you back. */
export const WANDER = 175

/**
 * The handful of places worth walking to. Nothing grows on top of them, and
 * both the props and the things that live on them read their positions here.
 */
export const LANDMARKS = {
  snag: { x: 27, z: -19, clear: 7 },
  stones: { x: 72, z: -44, clear: 13 },
  ruin: { x: -36, z: -56, clear: 11 },
  camp: { x: 11.5, z: 13.5, clear: 5 },
  cart: { x: -62, z: 78, clear: 6 },
  quintain: { x: 15.5, z: 5, clear: 5 },
  signpost: { x: 2.5, z: 84, clear: 3 },
}

/** The pond in the hollow west of the tower, and the town's name. */
export const POND = { x: -54, z: 24, radius: 13.5, depth: 2.2 }
export const TOWN_NAME = 'Ashvale'

/** The wagon road that passes south of the wood, and the town it runs to. */
export const ROAD = { halfWidth: 3.4, clear: 8.5 }
export const TOWN = { bearing: 249, distance: 395 }

/** How high the ground stands where the town is built. */
export const TOWN_GROUND = 9

/** Where the smoke is, as a compass bearing and a distance in metres. */
export const SMOKE = { bearing: 42, distance: 1240 }

/* ------------------------------------------------------------------- road */

/**
 * The road's centre line: east off the map, past the foot of the wood, then
 * away west to the town gate. `t` runs 0 at the eastern end to 1 at the gate.
 */
const ROAD_LINE: Array<[number, number]> = [
  [400, 176],
  [300, 132],
  [200, 104],
  [95, 91],
  [0, 88],
  [-95, 94],
  [-180, 103],
  [-250, 110],
  [-300, 114],
]

/** Catmull-Rom through the control points, so the road has no kinks in it. */
function splinePoint(u: number): { x: number; z: number } {
  const clamped = Math.min(1, Math.max(0, u))
  const span = ROAD_LINE.length - 1
  const scaled = clamped * span
  const i = Math.min(span - 1, Math.floor(scaled))
  const f = scaled - i
  const at = (index: number) => ROAD_LINE[Math.min(span, Math.max(0, index))]
  const [x0, z0] = at(i - 1)
  const [x1, z1] = at(i)
  const [x2, z2] = at(i + 1)
  const [x3, z3] = at(i + 2)
  const spline = (a: number, b: number, c: number, d: number) =>
    0.5 *
    ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f)
  return { x: spline(x0, x1, x2, x3), z: spline(z0, z1, z2, z3) }
}

/**
 * The control points are not evenly spaced, and a spline read straight off
 * them runs fast down one stretch and slow down the next — which stretches
 * the road's texture and makes "two thirds of the way along" mean nothing.
 * So the curve is measured once and read back by distance instead.
 */
const ARC = (() => {
  const samples = 600
  const points: Array<{ x: number; z: number }> = []
  const lengths: number[] = [0]
  let total = 0
  for (let i = 0; i <= samples; i++) {
    const point = splinePoint(i / samples)
    if (i > 0) {
      const previous = points[i - 1]
      total += Math.hypot(point.x - previous.x, point.z - previous.z)
      lengths.push(total)
    }
    points.push(point)
  }
  return { points, lengths, total }
})()

/** A point on the road's centre line, `t` running 0 at the east end to 1 at the gate. */
export function roadPoint(t: number): { x: number; z: number } {
  const wanted = Math.min(1, Math.max(0, t)) * ARC.total
  let low = 0
  let high = ARC.lengths.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (ARC.lengths[middle] <= wanted) low = middle
    else high = middle
  }
  const span = ARC.lengths[high] - ARC.lengths[low] || 1
  const f = (wanted - ARC.lengths[low]) / span
  const a = ARC.points[low]
  const b = ARC.points[high]
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }
}

/** How long the road is, in metres. */
export const ROAD_LENGTH = ARC.total

/** Where the road meets the town's gate. */
export function roadEnd(): { x: number; z: number } {
  return roadPoint(1)
}

/**
 * How far a place is from the road. Coarse pass then a fine one: the road is
 * gentle enough that ten metres never hides a nearer stretch.
 */
export function distanceToRoad(x: number, z: number): number {
  let best = Infinity
  let bestT = 0
  const coarse = 80
  for (let i = 0; i <= coarse; i++) {
    const t = i / coarse
    const p = roadPoint(t)
    const d = (p.x - x) ** 2 + (p.z - z) ** 2
    if (d < best) {
      best = d
      bestT = t
    }
  }
  const step = 1 / coarse
  for (let i = -10; i <= 10; i++) {
    const t = bestT + (i * step) / 10
    if (t < 0 || t > 1) continue
    const p = roadPoint(t)
    const d = (p.x - x) ** 2 + (p.z - z) ** 2
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/** The corridor of the trail, which nothing grows in. */
export function onTrail(x: number, z: number): boolean {
  return Math.abs(x) < 4.2 && z > CLEARING - 4 && z < 76
}

/* ----------------------------------------------------------------- ground */

/**
 * The height of the forest floor. Gentle, and flattened to nothing under the
 * tree so the ladder always meets the ground it is drawn standing on.
 */
export function groundAt(x: number, z: number): number {
  const broad = fbm(x * 0.006, z * 0.006, 4, 11) * 13
  const fine = fbm(x * 0.045, z * 0.045, 3, 29) * 0.7
  const height = broad + fine
  const r = Math.hypot(x - TRUNK.x, z - TRUNK.z)
  // A level apron under the clearing, easing back into the country outside it.
  const flatten = Math.min(1, Math.max(0, (r - CLEARING * 0.6) / (CLEARING * 1.6)))

  // The hollow the pond sits in, scooped out of whatever the land was doing.
  const toPond = Math.hypot(x - POND.x, z - POND.z) / POND.radius
  const bowl = Math.max(0, 1 - toPond * toPond)

  const shaped = height * flatten * flatten - bowl * bowl * POND.depth

  // The shelf the town stands on. The country has to rise to meet it, or the
  // road would run off the edge of the map and the town would float.
  const town = bearingToPoint(TOWN.bearing, TOWN.distance)
  const toTown = Math.hypot(x - town.x, z - town.z)
  const shelf = 1 - Math.min(1, Math.max(0, (toTown - 130) / 150))
  const eased = shelf * shelf * (3 - 2 * shelf)

  return shaped * (1 - eased) + TOWN_GROUND * eased
}

/** How high the water stands. Everything below this line is in the pond. */
export function waterLevel(): number {
  return groundAt(POND.x, POND.z) + POND.depth * 0.74
}

/** True in the water, or close enough to it that nothing dry grows there. */
export function inPond(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x - POND.x, z - POND.z) < POND.radius * 0.82 + margin
}

/* ------------------------------------------------------------------ trees */

export interface Tree {
  x: number
  z: number
  y: number
  /** Height of the tree in metres. */
  height: number
  /** Radius of the canopy at its widest. */
  spread: number
  spin: number
  /** 0..1, how far through the green-to-olive range the needles sit. */
  tint: number
}

/**
 * Woodland on a jittered grid. Density comes from noise, so the wood has
 * thickets and open aisles rather than an even sprinkle, and nothing grows
 * in the clearing or on the trail up to it.
 */
export function scatterWood(radius = 260, spacing = 6.2, seed = 7): Tree[] {
  const random = randoms(seed)
  const trees: Tree[] = []
  for (let gx = -radius; gx <= radius; gx += spacing) {
    for (let gz = -radius; gz <= radius; gz += spacing) {
      const x = gx + (random() - 0.5) * spacing * 1.5
      const z = gz + (random() - 0.5) * spacing * 1.5
      const r = Math.hypot(x, z)
      if (r > radius) continue

      // The clearing, with a soft edge so the wood thins towards it.
      const open = (r - CLEARING) / 10
      if (open < random()) continue

      // The trail in from the south: a thin corridor kept clear.
      if (onTrail(x, z)) continue

      // Nothing grows in the road, and the verge is kept back off it.
      if (distanceToRoad(x, z) < ROAD.clear) continue

      // Nor in the pond, though the wood comes right down to the water.
      if (inPond(x, z, 1.5)) continue

      // Nor on top of anything anybody built or left behind.
      if (Object.values(LANDMARKS).some((at) => Math.hypot(x - at.x, z - at.z) < at.clear)) continue

      const density = fbm(x * 0.011, z * 0.011, 3, 5) * 0.5 + 0.74
      if (random() > density) continue

      const big = random()
      // Young growth in the open ground around the tree, full height further
      // out: from the deck you look over a bowl rather than into a wall.
      const near = Math.min(1, (r - CLEARING) / 34)
      trees.push({
        x,
        z,
        y: groundAt(x, z),
        height: (9 + big * big * 13) * (0.44 + 0.56 * near),
        spread: 1.5 + big * 1.7 + random() * 0.4,
        spin: random() * Math.PI * 2,
        tint: random(),
      })
    }
  }
  return trees
}

/* --------------------------------------------------------------- climbing */

export type Stance = 'ground' | 'climbing' | 'deck' | 'descending'

export interface Climb {
  stance: Stance
  /** 0 at the foot of the ladder, 1 standing on the deck. */
  t: number
}

/** Where you stand to take hold of the ladder. */
export const LADDER_STAND = { x: 0, z: LADDER.z + 0.72 }

/** The head of the ladder, where you can take it back down. */
export const DECK_STAND = { x: 0, z: DECK.maxZ - 0.9 }

/**
 * Where the climb actually puts you: a step to one side of the ladder, clear
 * of the trunk, facing the quarter the smoke is in. Arriving nose-first into
 * three feet of bark is a poor reward for a long climb.
 */
export const ARRIVAL = { x: 1.45, z: DECK.maxZ - 1.5 }

/** Close enough to the foot of the ladder to reach it. */
export function atLadderFoot(x: number, z: number): boolean {
  return Math.hypot(x - LADDER_STAND.x, z - LADDER_STAND.z) < 3
}

/** Standing over the head of the ladder, on the deck. */
export function atLadderHead(x: number, z: number): boolean {
  return Math.hypot(x - DECK_STAND.x, z - DECK_STAND.z) < 2.2
}

/** Seconds end to end. Slow enough to feel like a climb, short enough to allow. */
export const CLIMB_SECONDS = 8.6

/** One step of the ladder, as a new state. Pure: same in, same out. */
export function advanceClimb(climb: Climb, dt: number): Climb {
  const step = dt / CLIMB_SECONDS
  if (climb.stance === 'climbing') {
    const t = Math.min(1, climb.t + step)
    return { stance: t >= 1 ? 'deck' : 'climbing', t }
  }
  if (climb.stance === 'descending') {
    const t = Math.max(0, climb.t - step)
    return { stance: t <= 0 ? 'ground' : 'descending', t }
  }
  return climb
}

/** Where the camera is, part way up. */
export interface ClimbPose {
  x: number
  y: number
  z: number
  /** Radians, 0 looking north up the trunk. */
  yaw: number
}

const ease = (t: number) => t * t * (3 - 2 * t)
const mix = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))

/**
 * The climb in three movements: take hold of the rails, go up hand over
 * hand with a little sway, then step off over the rail onto the deck.
 */
export function climbPose(t: number, groundY: number, fromYaw: number): ClimbPose {
  const holdOn = Math.min(1, t / 0.1)
  const rise = ease(Math.min(1, Math.max(0, (t - 0.1) / 0.78)))
  const stepOff = ease(Math.min(1, Math.max(0, (t - 0.88) / 0.12)))

  const y = mix(groundY + EYE, DECK.y + EYE, rise)
  const x = mix(LADDER_STAND.x, ARRIVAL.x, stepOff)
  const z = mix(LADDER_STAND.z, ARRIVAL.z, stepOff)
  const sway = Math.sin(rise * 26) * 0.07 * (1 - stepOff)
  // Facing the trunk all the way up, then turning onto the smoke as you step
  // off, which is the first thing a lookout would look for.
  const onto = -(SMOKE.bearing * Math.PI) / 180
  const yaw = mix(mix(fromYaw, 0, holdOn), onto, stepOff)

  return { x: x + sway, y, z, yaw }
}

/**
 * Nobody stands inside the trunk. Dead centre has no direction to be pushed
 * in, so it gets one: out towards the ladder.
 */
function pushOutOfTrunk(x: number, z: number, clear: number): { x: number; z: number } {
  const dx = x - TRUNK.x
  const dz = z - TRUNK.z
  const r = Math.hypot(dx, dz)
  if (r >= clear) return { x, z }
  if (r < 0.001) return { x: TRUNK.x, z: TRUNK.z + clear }
  return { x: TRUNK.x + (dx / r) * clear, z: TRUNK.z + (dz / r) * clear }
}

/** Keep somebody on the deck, off the railing and out of the trunk. */
export function clampToDeck(x: number, z: number): { x: number; z: number } {
  const inset = 0.42
  const cx = Math.min(DECK.halfX - inset, Math.max(-DECK.halfX + inset, x))
  const cz = Math.min(DECK.maxZ - inset, Math.max(DECK.minZ + inset, z))
  return pushOutOfTrunk(cx, cz, 1.25)
}

/** Things on the ground you cannot walk through, beyond the tower itself. */
export const SOLID: Array<{ x: number; z: number; radius: number }> = [
  // Wide enough to stand clear of the quintain's arm: inside its sweep the
  // sandbag catches you the moment the thing turns at all, which is a lesson
  // in the wrong thing.
  { x: LANDMARKS.quintain.x, z: LANDMARKS.quintain.z, radius: 1.75 },
]

/** Keep somebody on the ground out of the trunk and inside the wood. */
export function clampToGround(x: number, z: number): { x: number; z: number } {
  const clear = pushOutOfTrunk(x, z, BASE.radius + 0.45)
  let cx = clear.x
  let cz = clear.z

  for (const solid of SOLID) {
    const dx = cx - solid.x
    const dz = cz - solid.z
    const r = Math.hypot(dx, dz)
    if (r < solid.radius) {
      const scale = r < 0.001 ? 1 : solid.radius / r
      cx = solid.x + (r < 0.001 ? solid.radius : dx * scale)
      cz = solid.z + (r < 0.001 ? 0 : dz * scale)
    }
  }
  const out = Math.hypot(cx, cz)
  if (out > WANDER) {
    cx = (cx / out) * WANDER
    cz = (cz / out) * WANDER
  }
  return { x: cx, z: cz }
}

/* --------------------------------------------------------------- bearings */

/** The compass bearing you are facing, in degrees, with north at -Z. */
export function bearingOf(yaw: number): number {
  const degrees = (-yaw * 180) / Math.PI
  return ((degrees % 360) + 360) % 360
}

/** How far off a bearing is from another, in degrees, always 0..180. */
export function bearingGap(a: number, b: number): number {
  const gap = Math.abs(((a - b + 540) % 360) - 180)
  return gap
}

/** Written the way it would be read out: three figures. */
export function readBearing(bearing: number): string {
  return String(Math.round(bearing) % 360).padStart(3, '0')
}

/** Where a thing on a bearing stands, in world metres. */
export function bearingToPoint(bearing: number, distance: number): { x: number; z: number } {
  const radians = (bearing * Math.PI) / 180
  return { x: Math.sin(radians) * distance, z: -Math.cos(radians) * distance }
}
