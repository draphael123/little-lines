import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { World } from '../game/types'
import { tableSize } from './geometry'
import { cameraGoal, type CameraPreset } from './viewpoints'

interface CameraRigProps {
  world: World
  preset: CameraPreset
  nonce: number
}

/** Orbit, dolly and three surveyor's viewpoints, eased rather than snapped. */
export function CameraRig({ world, preset, nonce }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const goal = useRef<Vector3 | null>(null)
  const [w, d] = tableSize(world)
  const reach = Math.max(w, d)

  useEffect(() => {
    goal.current = new Vector3(...cameraGoal(world, preset))
  }, [world, preset, nonce])

  // A fresh world should start from the home view rather than wherever the
  // last table left the camera.
  useEffect(() => {
    camera.position.set(...cameraGoal(world, 'home'))
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.w, world.h])

  useFrame(() => {
    const target = goal.current
    if (!target) return
    camera.position.lerp(target, 0.09)
    controls.current?.target.lerp(new Vector3(0, 0, 0), 0.09)
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
      minDistance={reach * 0.32}
      maxDistance={reach * 2.1}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.12}
      onStart={() => {
        goal.current = null
      }}
    />
  )
}
