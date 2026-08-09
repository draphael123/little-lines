/**
 * Permanent way for a continuous line: ballast, sleepers, railheads, and a
 * viaduct wherever the line stands clear of the ground. Everything here works
 * from a plain polyline in metres, so it does not care how the route was
 * decided.
 */
import { heightAt, type Heightfield } from './heightfield'
import { DECK_CLEARANCE, type Vec3 } from './rail'

export const GAUGE = 3.0
export const RAIL_W = 0.32
export const RAIL_H = 0.36
export const SLEEPER_LEN = 4.6
export const SLEEPER_W = 0.9
export const SLEEPER_H = 0.32
export const SLEEPER_SPACING = 4.4
export const BALLAST_W = 6.4

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2])
  return l < 1e-9 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]
}

class Builder {
  positions: number[] = []
  normals: number[] = []

  tri(a: Vec3, b: Vec3, c: Vec3) {
    const n = norm(cross(sub(b, a), sub(c, a)))
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2])
      this.normals.push(n[0], n[1], n[2])
    }
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
    this.tri(a, b, c)
    this.tri(a, c, d)
  }

  box(centre: Vec3, half: Vec3, yaw: number, pitch = 0) {
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const forward: Vec3 = [sy * Math.cos(pitch), Math.sin(pitch), cy * Math.cos(pitch)]
    const right: Vec3 = [cy, 0, -sy]
    const up = norm(cross(forward, right))
    const at = (f: number, r: number, u: number): Vec3 => [
      centre[0] + forward[0] * half[2] * f + right[0] * half[0] * r + up[0] * half[1] * u,
      centre[1] + forward[1] * half[2] * f + right[1] * half[0] * r + up[1] * half[1] * u,
      centre[2] + forward[2] * half[2] * f + right[2] * half[0] * r + up[2] * half[1] * u,
    ]
    const p000 = at(-1, -1, -1)
    const p100 = at(-1, 1, -1)
    const p110 = at(-1, 1, 1)
    const p010 = at(-1, -1, 1)
    const q000 = at(1, -1, -1)
    const q100 = at(1, 1, -1)
    const q110 = at(1, 1, 1)
    const q010 = at(1, -1, 1)
    this.quad(p010, p110, q110, q010)
    this.quad(q000, q100, p100, p000)
    this.quad(p110, p100, q100, q110)
    this.quad(p000, p010, q010, q000)
    this.quad(q010, q110, q100, q000)
    this.quad(p000, p100, p110, p010)
  }

  done(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
    }
  }
}

interface Frame {
  p: Vec3
  right: Vec3
  up: Vec3
}

function frames(points: Vec3[]): Frame[] {
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const tangent = norm(sub(next, prev))
    let right = cross([0, 1, 0], tangent)
    if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0]
    right = norm(right)
    return { p, right, up: norm(cross(tangent, right)) }
  })
}

/** A rectangular tube swept along the run, offset sideways. */
function sweep(b: Builder, fs: Frame[], offset: number, width: number, height: number, base: number) {
  if (fs.length < 2) return
  const ring = (f: Frame): [Vec3, Vec3, Vec3, Vec3] => {
    const c: Vec3 = [
      f.p[0] + f.right[0] * offset + f.up[0] * base,
      f.p[1] + f.right[1] * offset + f.up[1] * base,
      f.p[2] + f.right[2] * offset + f.up[2] * base,
    ]
    const h = width / 2
    const out = (r: number, u: number): Vec3 => [
      c[0] + f.right[0] * r + f.up[0] * u,
      c[1] + f.right[1] * r + f.up[1] * u,
      c[2] + f.right[2] * r + f.up[2] * u,
    ]
    return [out(-h, 0), out(h, 0), out(h, height), out(-h, height)]
  }
  let prev = ring(fs[0])
  for (let i = 1; i < fs.length; i++) {
    const next = ring(fs[i])
    b.quad(prev[3], prev[2], next[2], next[3])
    b.quad(prev[1], prev[2], next[2], next[1])
    b.quad(prev[3], prev[0], next[0], next[3])
    prev = next
  }
}

export interface TrackMeshes {
  ballast: MeshData
  sleepers: MeshData
  rails: MeshData
  structure: MeshData
  triangles: number
}

/** Arc length along a polyline, for spacing sleepers evenly. */
function arcLengths(points: Vec3[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + Math.hypot(...(sub(points[i], points[i - 1]) as [number, number, number])))
  }
  return out
}

function sampleAlong(points: Vec3[], cum: number[], d: number): { p: Vec3; yaw: number; pitch: number } {
  let i = 1
  while (i < cum.length && cum[i] < d) i++
  const a = points[Math.max(0, i - 1)]
  const b = points[Math.min(points.length - 1, i)]
  const seg = Math.max(1e-6, cum[Math.min(i, cum.length - 1)] - cum[Math.max(0, i - 1)])
  const t = Math.max(0, Math.min(1, (d - cum[Math.max(0, i - 1)]) / seg))
  const p: Vec3 = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
  const dir = norm(sub(b, a))
  return { p, yaw: Math.atan2(dir[0], dir[2]), pitch: -Math.asin(Math.max(-1, Math.min(1, dir[1]))) }
}

export function buildTrack(field: Heightfield, points: Vec3[]): TrackMeshes {
  const ballast = new Builder()
  const sleepers = new Builder()
  const rails = new Builder()
  const structure = new Builder()

  if (points.length >= 2) {
    const fs = frames(points)
    // ballast shoulder sits just under the sleepers
    sweep(ballast, fs, 0, BALLAST_W, 0.5, -0.5)
    sweep(rails, fs, -GAUGE / 2, RAIL_W, RAIL_H, SLEEPER_H)
    sweep(rails, fs, GAUGE / 2, RAIL_W, RAIL_H, SLEEPER_H)

    const cum = arcLengths(points)
    const total = cum[cum.length - 1]
    for (let d = SLEEPER_SPACING / 2; d < total; d += SLEEPER_SPACING) {
      const s = sampleAlong(points, cum, d)
      sleepers.box(
        [s.p[0], s.p[1] + SLEEPER_H / 2, s.p[2]],
        [SLEEPER_LEN / 2, SLEEPER_H / 2, SLEEPER_W / 2],
        s.yaw,
        s.pitch,
      )
    }

    // piers wherever the line stands clear of the ground
    for (let d = 0; d <= total; d += 22) {
      const s = sampleAlong(points, cum, d)
      const ground = heightAt(field, s.p[0], s.p[2])
      const clearance = s.p[1] - ground
      if (clearance < DECK_CLEARANCE) continue
      const h = clearance + 0.6
      structure.box([s.p[0], s.p[1] - h / 2, s.p[2]], [1.5, h / 2, 1.5], s.yaw)
      structure.box([s.p[0], s.p[1] - 0.7, s.p[2]], [BALLAST_W / 2 + 0.4, 0.5, 3.2], s.yaw)
    }
  }

  const out = {
    ballast: ballast.done(),
    sleepers: sleepers.done(),
    rails: rails.done(),
    structure: structure.done(),
  }
  return {
    ...out,
    triangles:
      (out.ballast.positions.length +
        out.sleepers.positions.length +
        out.rails.positions.length +
        out.structure.positions.length) /
      9,
  }
}
