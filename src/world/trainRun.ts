/**
 * Running a train along a path in continuous space. Open lines shuttle back
 * and forth; the pose it hands back is what both the locomotive and the
 * follow camera are driven from.
 */
import type { Vec3 } from './rail'

export interface Path {
  points: Vec3[]
  /** Cumulative distance at each point. */
  cum: number[]
  length: number
}

export function makePath(points: Vec3[]): Path {
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
          points[i][2] - points[i - 1][2],
        ),
    )
  }
  return { points, cum, length: cum[cum.length - 1] ?? 0 }
}

export interface Pose {
  position: Vec3
  yaw: number
  pitch: number
}

export function poseAt(path: Path, distance: number): Pose {
  const { points, cum, length } = path
  if (points.length === 0) return { position: [0, 0, 0], yaw: 0, pitch: 0 }
  if (points.length === 1) return { position: points[0], yaw: 0, pitch: 0 }
  const d = Math.max(0, Math.min(length, distance))

  let i = 1
  while (i < cum.length && cum[i] < d) i++
  const a = points[i - 1]
  const b = points[Math.min(i, points.length - 1)]
  const seg = Math.max(1e-6, cum[Math.min(i, cum.length - 1)] - cum[i - 1])
  const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg))
  const position: Vec3 = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dy, dz) || 1
  return {
    position,
    yaw: Math.atan2(dx, dz),
    pitch: -Math.asin(Math.max(-1, Math.min(1, dy / len))),
  }
}

/** Metres per second. A goods train on a branch line, not an express. */
export const SPEEDS = { slow: 9, normal: 18, fast: 34 } as const
export type SpeedName = keyof typeof SPEEDS

export class TrainRunner {
  distance: number
  direction: 1 | -1 = 1
  private wait = 0

  private path: Path
  private speed: number

  constructor(path: Path, speed: number, offset = 0) {
    this.path = path
    this.speed = speed
    this.distance = Math.min(path.length, offset * path.length)
  }

  setPath(path: Path) {
    this.path = path
    this.distance = Math.min(this.distance, path.length)
  }

  update(dt: number) {
    if (this.path.length <= 0) return
    if (this.wait > 0) {
      this.wait = Math.max(0, this.wait - dt)
      return
    }
    this.distance += this.speed * dt * this.direction
    if (this.distance >= this.path.length) {
      this.distance = this.path.length
      this.direction = -1
      this.wait = 3
    } else if (this.distance <= 0) {
      this.distance = 0
      this.direction = 1
      this.wait = 3
    }
  }

  pose(): Pose {
    return poseAt(this.path, this.distance)
  }

  get moving() {
    return this.wait <= 0
  }
}
