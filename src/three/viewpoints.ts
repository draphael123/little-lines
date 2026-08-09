import type { World } from '../game/types'
import { tableSize } from './geometry'

export type CameraPreset = 'west' | 'home' | 'east'

export const FOV = 34

/** The camera looks at ground level in the middle of the survey. */
export const LOOK_AT: [number, number, number] = [0, 0, 0]

/**
 * Directions the camera stands in for each viewpoint. Deliberately low and
 * oblique — a city builder looks along the ground, not down at a board.
 */
const DIRECTIONS: Record<CameraPreset, [number, number, number]> = {
  home: [0, 0.46, 0.89],
  west: [-0.82, 0.38, 0.42],
  east: [0.82, 0.38, 0.42],
}

/** The widest thing the camera has to fit: the table plus its timber frame. */
export function worldSpan(world: World): number {
  const [w, d] = tableSize(world)
  return Math.hypot(w + 1.6, d + 1.6)
}

/**
 * How far back a camera of this field of view must stand for `span` to fit
 * both across and down the viewport. Checking both axes is what keeps a tall
 * narrow stage — a phone, or a desktop column between two rails — from
 * cropping the layout.
 */
export function fitDistance(span: number, aspect: number, fov = FOV): number {
  const vertical = (fov * Math.PI) / 180
  const safeAspect = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 1
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * safeAspect)
  // Depth foreshortens under the raked viewpoints, so the vertical extent the
  // table actually occupies is well short of its diagonal.
  const forHeight = (span * 0.82) / 2 / Math.tan(vertical / 2)
  const forWidth = span / 2 / Math.tan(horizontal / 2)
  return Math.max(forHeight, forWidth) * 1.02
}

/**
 * Where the camera stands. The distance is fitted to the viewport rather than
 * assumed, so the whole table is in shot at any window shape.
 */
export function cameraGoal(
  world: World,
  preset: CameraPreset,
  aspect = 1.35,
): [number, number, number] {
  const [dx, dy, dz] = DIRECTIONS[preset]
  const length = Math.hypot(dx, dy, dz)
  const distance = fitDistance(worldSpan(world), aspect)
  return [
    (dx / length) * distance,
    (dy / length) * distance + LOOK_AT[1],
    (dz / length) * distance,
  ]
}
