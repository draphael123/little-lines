import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { World } from '../game/types'
import {
  LOOK_AT,
  cameraGoal,
  fitDistance,
  worldSpan,
  type CameraPreset,
} from './viewpoints'

interface CameraRigProps {
  world: World
  preset: CameraPreset
  nonce: number
}

/** Orbit, dolly and three surveyor's viewpoints, eased rather than snapped. */
export function CameraRig({ world, preset, nonce }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const aspect = size.width / Math.max(1, size.height)
  const goal = useRef<Vector3 | null>(null)
  /** Set once the player arranges their own view, so a resize leaves it alone. */
  const arranged = useRef(false)

  const span = worldSpan(world)
  const reach = fitDistance(span, aspect)

  // A viewpoint button, a new nonce or a new table re-frames the layout.
  useEffect(() => {
    goal.current = new Vector3(...cameraGoal(world, preset, aspect))
    arranged.current = false
    // aspect is deliberately excluded: resizing should not fight a chosen view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, preset, nonce])

  // The stage can be measured wrongly on the very first paint, and it changes
  // shape whenever the window does. Re-fit the distance while the view is
  // still the one we chose for the player.
  useEffect(() => {
    if (arranged.current) return
    goal.current = new Vector3(...cameraGoal(world, preset, aspect))
  }, [aspect, world, preset])

  useFrame(() => {
    const target = goal.current
    if (!target) return
    camera.position.lerp(target, 0.1)
    controls.current?.target.lerp(new Vector3(...LOOK_AT), 0.1)
    controls.current?.update()
    if (camera.position.distanceTo(target) < 0.05) goal.current = null
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableDamping
      dampingFactor={0.08}
      minDistance={reach * 0.24}
      maxDistance={reach * 2.2}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.12}
      onStart={() => {
        goal.current = null
        arranged.current = true
      }}
    />
  )
}
