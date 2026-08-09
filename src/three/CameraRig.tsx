import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { World } from '../game/types'
import { tableSize } from './geometry'
import { LOOK_AT, cameraGoal, fitDistance, worldSpan, type CameraPreset } from './viewpoints'

interface CameraRigProps {
  world: World
  preset: CameraPreset
  nonce: number
}

const PAN_KEYS: Record<string, [number, number]> = {
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
}

/**
 * A city-builder camera: orbit and pan freely, drop close to ground level, and
 * three fixed viewpoints to get your bearings again. Panning moves the point
 * being looked at rather than sliding the whole rig, so the ground stays put
 * under the cursor.
 */
export function CameraRig({ world, preset, nonce }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const aspect = size.width / Math.max(1, size.height)
  const goal = useRef<Vector3 | null>(null)
  /** Set once the player arranges their own view, so a resize leaves it alone. */
  const arranged = useRef(false)
  const held = useRef(new Set<string>())

  const span = worldSpan(world)
  const reach = fitDistance(span, aspect)
  const [tableW, tableD] = tableSize(world)

  useEffect(() => {
    goal.current = new Vector3(...cameraGoal(world, preset, aspect))
    arranged.current = false
    // aspect is deliberately excluded: resizing should not fight a chosen view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, preset, nonce])

  useEffect(() => {
    if (arranged.current) return
    goal.current = new Vector3(...cameraGoal(world, preset, aspect))
  }, [aspect, world, preset])

  // Keyboard panning, the way every city builder does it.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const key = e.key.toLowerCase()
      if (!(key in PAN_KEYS)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      held.current.add(key)
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase())
    const blur = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useFrame((_, dt) => {
    const orbit = controls.current

    if (held.current.size > 0 && orbit) {
      arranged.current = true
      goal.current = null
      // Pan across the ground, along the direction the camera is facing.
      const forward = new Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
      forward.normalize()
      const right = new Vector3(forward.z, 0, -forward.x)
      const speed = camera.position.distanceTo(orbit.target) * 0.85 * Math.min(dt, 0.05)
      const move = new Vector3()
      for (const key of held.current) {
        const [dx, dz] = PAN_KEYS[key]
        move.addScaledVector(right, dx * speed)
        move.addScaledVector(forward, -dz * speed)
      }
      orbit.target.add(move)
      camera.position.add(move)
    }

    const target = goal.current
    if (target) {
      camera.position.lerp(target, 0.1)
      orbit?.target.lerp(new Vector3(...LOOK_AT), 0.1)
      if (camera.position.distanceTo(target) < 0.05) goal.current = null
    }

    // Never let the player pan so far that the map is lost off screen.
    if (orbit) {
      const limitX = tableW * 0.85
      const limitZ = tableD * 0.85
      const clampedX = Math.max(-limitX, Math.min(limitX, orbit.target.x))
      const clampedZ = Math.max(-limitZ, Math.min(limitZ, orbit.target.z))
      if (clampedX !== orbit.target.x || clampedZ !== orbit.target.z) {
        camera.position.x += clampedX - orbit.target.x
        camera.position.z += clampedZ - orbit.target.z
        orbit.target.x = clampedX
        orbit.target.z = clampedZ
      }
      orbit.update()
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableDamping
      dampingFactor={0.09}
      zoomSpeed={1.15}
      minDistance={reach * 0.1}
      maxDistance={reach * 1.9}
      maxPolarAngle={Math.PI * 0.495}
      minPolarAngle={0.08}
      onStart={() => {
        goal.current = null
        arranged.current = true
      }}
    />
  )
}
