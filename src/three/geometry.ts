/**
 * All of the model-railway maths, kept free of Three.js so it can be tested
 * directly: where a tile sits on the table, how a rail polyline is smoothed
 * over a gradient, where a bridge deck floats above the water, and how a
 * locomotive is posed as it runs.
 */
import { tileAt } from '../game/grid'
import { routeIsClosed } from '../game/track'
import type { Coord, World } from '../game/types'

export type Vec3 = [number, number, number]

export const TILE = 1
/** World height of one elevation level. */
export const STEP = 0.34
/** How far a carved terrain block extends below table height. */
export const SKIRT = 0.7
/** Sleeper tops sit this far above the ground surface. */
export const RAIL_LIFT = 0.055
export const GAUGE = 0.26
export const RAIL_W = 0.042
export const RAIL_H = 0.05
export const SLEEPER_LEN = 0.42
export const SLEEPER_W = 0.085
export const SLEEPER_H = 0.042
export const SLEEPER_SPACING = 0.17
/** Water surface, relative to the top of a level-0 block. */
export const WATER_DROP = 0.12
export const SMOOTHING = 2

export const surfaceY = (h: number) => h * STEP

export function tileWorld(world: World, c: Coord): Vec3 {
  const x = (c.x - (world.w - 1) / 2) * TILE
  const z = (c.z - (world.h - 1) / 2) * TILE
  return [x, surfaceY(tileAt(world, c)?.h ?? 0), z]
}

export const tableSize = (world: World): [number, number] => [world.w * TILE, world.h * TILE]

/* ------------------------------------------------------------- small maths */

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
export const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export function norm(a: Vec3): Vec3 {
  const l = len3(a)
  return l < 1e-9 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]
}
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** Chaikin corner cutting — rounds the corners of a rail run without moving it far. */
export function chaikin(points: Vec3[], iterations: number, closed: boolean): Vec3[] {
  let out = points
  for (let it = 0; it < iterations; it++) {
    if (out.length < 3) return out
    const next: Vec3[] = []
    if (!closed) next.push(out[0])
    const last = closed ? out.length : out.length - 1
    for (let i = 0; i < last; i++) {
      const a = out[i]
      const b = out[(i + 1) % out.length]
      next.push(lerp3(a, b, 0.25), lerp3(a, b, 0.75))
    }
    if (!closed) next.push(out[out.length - 1])
    out = next
  }
  return out
}

/* ------------------------------------------------------------- rail height */

/**
 * The height of the rail over each tile of a line. Land tiles sit on the
 * ground; water tiles are spanned, so their deck height is interpolated
 * between the banks on either side — that is what makes a bridge a bridge.
 */
export function deckHeights(world: World, tiles: Coord[]): number[] {
  const n = tiles.length
  const base: Array<number | null> = tiles.map((c) => {
    const t = tileAt(world, c)
    if (!t) return 0
    return t.kind === 'water' ? null : surfaceY(t.h)
  })
  const solved = base.slice()
  for (let i = 0; i < n; i++) {
    if (solved[i] !== null) continue
    let a = i - 1
    while (a >= 0 && base[a] === null) a--
    let b = i + 1
    while (b < n && base[b] === null) b++
    const left = a >= 0 ? (base[a] as number) : null
    const right = b < n ? (base[b] as number) : null
    if (left === null && right === null) solved[i] = 0
    else if (left === null) solved[i] = right
    else if (right === null) solved[i] = left
    else solved[i] = left + ((right - left) * (i - a)) / (b - a)
  }
  return solved.map((v) => v ?? 0)
}

export interface RailPath {
  /** Smoothed centre line, at rail-base height. */
  points: Vec3[]
  /** Cumulative arc length at each point. */
  cum: number[]
  length: number
  closed: boolean
  /** Arc-length positions of station stops along the path. */
  stations: number[]
}

/** Raw (unsmoothed) centre line: tile centres with the edge midpoints between them. */
export function centreLine(world: World, tiles: Coord[], closed: boolean): Vec3[] {
  const decks = deckHeights(world, tiles)
  const nodes: Vec3[] = tiles.map((c, i) => {
    const [x, , z] = tileWorld(world, c)
    return [x, decks[i] + RAIL_LIFT, z]
  })
  if (nodes.length < 2) return nodes
  const out: Vec3[] = []
  const last = closed ? nodes.length : nodes.length - 1
  for (let i = 0; i < last; i++) {
    const a = nodes[i]
    const b = nodes[(i + 1) % nodes.length]
    out.push(a, lerp3(a, b, 0.5))
  }
  if (!closed) out.push(nodes[nodes.length - 1])
  return out
}

export function buildRailPath(world: World, tiles: Coord[]): RailPath {
  const closed = routeIsClosed(tiles)
  const raw = centreLine(world, tiles, closed)
  const points = raw.length >= 3 ? chaikin(raw, SMOOTHING, closed) : raw
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + len3(sub(points[i], points[i - 1])))
  }
  let length = cum[cum.length - 1] ?? 0
  if (closed && points.length > 1) length += len3(sub(points[0], points[points.length - 1]))

  const stations: number[] = []
  if (points.length > 1) {
    tiles.forEach((c, i) => {
      if (tileAt(world, c)?.feature !== 'station') return
      // Tile i sits at raw index 2i, which chaikin maps to roughly the same
      // fraction of the total run.
      const frac = closed ? (2 * i) / raw.length : (2 * i) / Math.max(1, raw.length - 1)
      stations.push(Math.min(length, frac * length))
    })
  }
  return { points, cum, length, closed, stations }
}

export interface Pose {
  position: Vec3
  yaw: number
  pitch: number
}

/** Position and orientation at an arc-length distance along a path. */
export function poseAt(path: RailPath, distance: number): Pose {
  const { points, cum, length, closed } = path
  if (points.length === 0) return { position: [0, 0, 0], yaw: 0, pitch: 0 }
  if (points.length === 1) return { position: points[0], yaw: 0, pitch: 0 }
  let d = distance
  if (closed && length > 0) d = ((d % length) + length) % length
  d = Math.max(0, Math.min(length, d))

  let i = 1
  while (i < cum.length && cum[i] < d) i++
  const aIndex = Math.max(0, i - 1)
  const bIndex = i < points.length ? i : closed ? 0 : points.length - 1
  const a = points[aIndex]
  const b = points[bIndex]
  const segLen = Math.max(1e-6, len3(sub(b, a)))
  const t = Math.max(0, Math.min(1, (d - cum[aIndex]) / segLen))
  const position = lerp3(a, b, t)
  const dir = norm(sub(b, a))
  return {
    position,
    yaw: Math.atan2(dir[0], dir[2]),
    pitch: -Math.asin(Math.max(-1, Math.min(1, dir[1]))),
  }
}

/* --------------------------------------------------------- mesh generation */

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
}

class MeshBuilder {
  positions: number[] = []
  normals: number[] = []

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
    const n = norm(cross(sub(b, a), sub(c, a)))
    this.tri(a, b, c, n)
    this.tri(a, c, d, n)
  }

  tri(a: Vec3, b: Vec3, c: Vec3, n: Vec3) {
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    for (let i = 0; i < 3; i++) this.normals.push(n[0], n[1], n[2])
  }

  /** An axis-aligned box, given its centre and half extents. */
  box(centre: Vec3, half: Vec3, yaw = 0, pitch = 0) {
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    // local axes: forward (+z), right (+x), up (+y) after yaw then pitch
    const forward: Vec3 = [sy * cp, sp, cy * cp]
    const right: Vec3 = [cy, 0, -sy]
    const up = norm(cross(forward, right))
    const corner = (fx: number, rx: number, ux: number): Vec3 => [
      centre[0] + forward[0] * half[2] * fx + right[0] * half[0] * rx + up[0] * half[1] * ux,
      centre[1] + forward[1] * half[2] * fx + right[1] * half[0] * rx + up[1] * half[1] * ux,
      centre[2] + forward[2] * half[2] * fx + right[2] * half[0] * rx + up[2] * half[1] * ux,
    ]
    const p000 = corner(-1, -1, -1)
    const p100 = corner(-1, 1, -1)
    const p110 = corner(-1, 1, 1)
    const p010 = corner(-1, -1, 1)
    const q000 = corner(1, -1, -1)
    const q100 = corner(1, 1, -1)
    const q110 = corner(1, 1, 1)
    const q010 = corner(1, -1, 1)
    this.quad(p010, p110, q110, q010) // top
    this.quad(q000, q100, p100, p000) // bottom
    this.quad(p110, p100, q100, q110) // right
    this.quad(p000, p010, q010, q000) // left
    this.quad(q010, q110, q100, q000) // front
    this.quad(p000, p100, p110, p010) // back
  }

  done(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
    }
  }

  get triangleCount() {
    return this.positions.length / 9
  }
}

/** A rectangular tube swept along the path, offset sideways by `offset`. */
function sweepRect(
  b: MeshBuilder,
  path: RailPath,
  offset: number,
  width: number,
  height: number,
  yBase: number,
) {
  const { points, closed } = path
  if (points.length < 2) return
  const up: Vec3 = [0, 1, 0]
  const frames = points.map((p, i) => {
    const prev = points[i === 0 ? (closed ? points.length - 1 : 0) : i - 1]
    const next = points[i === points.length - 1 ? (closed ? 0 : i) : i + 1]
    const tangent = norm(sub(next, prev))
    let right = cross(up, tangent)
    if (len3(right) < 1e-6) right = [1, 0, 0]
    right = norm(right)
    const localUp = norm(cross(tangent, right))
    return { p, right, localUp }
  })

  const ring = (i: number) => {
    const { p, right, localUp } = frames[i]
    const c: Vec3 = [
      p[0] + right[0] * offset + localUp[0] * yBase,
      p[1] + right[1] * offset + localUp[1] * yBase,
      p[2] + right[2] * offset + localUp[2] * yBase,
    ]
    const hw = width / 2
    return [
      add(add(c, scale(right, -hw)), scale(localUp, 0)),
      add(add(c, scale(right, hw)), scale(localUp, 0)),
      add(add(c, scale(right, hw)), scale(localUp, height)),
      add(add(c, scale(right, -hw)), scale(localUp, height)),
    ] as [Vec3, Vec3, Vec3, Vec3]
  }

  const count = closed ? points.length : points.length - 1
  let prevRing = ring(0)
  for (let i = 0; i < count; i++) {
    const nextRing = ring((i + 1) % points.length)
    b.quad(prevRing[3], prevRing[2], nextRing[2], nextRing[3]) // top
    b.quad(prevRing[1], prevRing[2], nextRing[2], nextRing[1]) // outer
    b.quad(prevRing[3], prevRing[0], nextRing[0], nextRing[3]) // inner
    prevRing = nextRing
  }
  if (!closed) {
    const first = ring(0)
    const last = ring(points.length - 1)
    b.quad(first[0], first[1], first[2], first[3])
    b.quad(last[3], last[2], last[1], last[0])
  }
}

export interface TrackMeshes {
  rails: MeshData
  sleepers: MeshData
  /** Bridge decks and trestles, empty when the line never crosses water. */
  bridge: MeshData
  triangles: number
}

export function buildTrackMeshes(world: World, tiles: Coord[]): TrackMeshes {
  const path = buildRailPath(world, tiles)
  const rails = new MeshBuilder()
  const sleepers = new MeshBuilder()
  const bridge = new MeshBuilder()

  if (path.points.length >= 2) {
    sweepRect(rails, path, -GAUGE / 2, RAIL_W, RAIL_H, SLEEPER_H)
    sweepRect(rails, path, GAUGE / 2, RAIL_W, RAIL_H, SLEEPER_H)

    const step = SLEEPER_SPACING
    for (let d = step * 0.5; d < path.length; d += step) {
      const pose = poseAt(path, d)
      sleepers.box(
        [pose.position[0], pose.position[1] + SLEEPER_H / 2, pose.position[2]],
        [SLEEPER_LEN / 2, SLEEPER_H / 2, SLEEPER_W / 2],
        pose.yaw,
        pose.pitch,
      )
    }
  }

  /* bridges: a deck under the rail plus trestles down to the water */
  const decks = deckHeights(world, tiles)
  tiles.forEach((c, i) => {
    if (tileAt(world, c)?.kind !== 'water') return
    const [x, , z] = tileWorld(world, c)
    const deckY = decks[i] + RAIL_LIFT
    const prev = tiles[i - 1] ?? tiles[i + 1] ?? c
    const along: Vec3 = norm([c.x - prev.x, 0, c.z - prev.z])
    const yaw = Math.atan2(along[0], along[2])
    bridge.box([x, deckY - 0.03, z], [0.27, 0.035, TILE / 2 + 0.02], yaw)
    const waterY = -WATER_DROP
    const legTop = deckY - 0.06
    const legHeight = Math.max(0.12, legTop - waterY)
    for (const sideways of [-0.22, 0.22]) {
      for (const forward of [-0.3, 0.3]) {
        const px = x + Math.cos(yaw) * sideways + Math.sin(yaw) * forward
        const pz = z - Math.sin(yaw) * sideways + Math.cos(yaw) * forward
        bridge.box([px, waterY + legHeight / 2, pz], [0.035, legHeight / 2, 0.035])
      }
    }
    bridge.box([x, legTop - 0.02, z], [0.3, 0.02, 0.035], yaw + Math.PI / 2)
  })

  return {
    rails: rails.done(),
    sleepers: sleepers.done(),
    bridge: bridge.done(),
    triangles: rails.triangleCount + sleepers.triangleCount + bridge.triangleCount,
  }
}

/* --------------------------------------------------------------- train run */

export const SPEED_UNITS = { slow: 0.55, normal: 1.05, fast: 1.9 } as const

export interface RunnerOptions {
  /** World units per second. */
  speed: number
  /** Start position along the path, 0..1. */
  offset?: number
  stationPause?: number
  endPause?: number
}

/**
 * Moves one locomotive along one path. Open lines shuttle back and forth;
 * closed loops circulate. Stations hold the train for a beat.
 */
export class TrainRunner {
  distance: number
  direction: 1 | -1 = 1
  private wait = 0
  private servedStation = -1
  private path: RailPath
  private opts: RunnerOptions

  constructor(path: RailPath, opts: RunnerOptions) {
    this.path = path
    this.opts = opts
    this.distance = (opts.offset ?? 0) * path.length
  }

  setPath(path: RailPath) {
    this.path = path
    if (path.length > 0) this.distance = Math.min(this.distance, path.length)
  }

  update(dt: number): void {
    const { length, closed, stations } = this.path
    if (length <= 0) return
    if (this.wait > 0) {
      this.wait = Math.max(0, this.wait - dt)
      return
    }
    const before = this.distance
    this.distance += this.opts.speed * dt * this.direction

    if (closed) {
      this.distance = ((this.distance % length) + length) % length
    } else if (this.distance >= length) {
      this.distance = length
      this.direction = -1
      this.wait = this.opts.endPause ?? 1.5
      this.servedStation = -1
    } else if (this.distance <= 0) {
      this.distance = 0
      this.direction = 1
      this.wait = this.opts.endPause ?? 1.5
      this.servedStation = -1
    }

    const pause = this.opts.stationPause ?? 1.4
    if (pause > 0 && stations.length > 0 && !this.wait) {
      for (let i = 0; i < stations.length; i++) {
        if (i === this.servedStation) continue
        const s = stations[i]
        const passed =
          this.direction === 1
            ? before <= s && this.distance >= s
            : before >= s && this.distance <= s
        const wrapped = closed && Math.abs(this.distance - before) > length / 2
        if (passed && !wrapped) {
          this.distance = s
          this.wait = pause
          this.servedStation = i
          return
        }
      }
      if (this.servedStation >= 0) {
        const s = stations[this.servedStation]
        if (Math.abs(this.distance - s) > 0.4) this.servedStation = -1
      }
    }
  }

  pose(): Pose {
    return poseAt(this.path, this.distance)
  }
}
