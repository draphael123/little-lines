import type { World } from '../game/types'
import { tableSize } from './geometry'

export type CameraPreset = 'west' | 'home' | 'east'

/** Where the camera stands for each of the three surveyor's viewpoints. */
export function cameraGoal(world: World, preset: CameraPreset): [number, number, number] {
  const [w, d] = tableSize(world)
  const reach = Math.max(w, d)
  switch (preset) {
    case 'west':
      return [-reach * 0.82, reach * 0.52, reach * 0.42]
    case 'east':
      return [reach * 0.82, reach * 0.52, reach * 0.42]
    default:
      return [0, reach * 0.78, reach * 0.86]
  }
}
