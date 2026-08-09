import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import type { Settlement } from '../game/economy'
import { idx } from '../game/grid'
import { planTown, trafficRoute } from '../game/town'
import type { RailLine, World } from '../game/types'
import { tileWorld } from './geometry'

const CAR_COLOURS = [0xb4bcc4, 0x3f4b57, 0xa8503f, 0x4c6b53, 0xd8d2c4, 0x2f3a45]

interface Lane {
  /** World-space points along one side of the high street. */
  points: Array<[number, number, number]>
  length: number
  cars: number
}

interface Waiter {
  position: [number, number, number]
  phase: number
}

/**
 * The signs of life: cars along each town's high street and passengers
 * waiting on the platforms. Both are instanced and both stop dead when the
 * player holds the trains, because in this game the clock is the trains.
 */
export function TownLife({
  world,
  lines,
  settlements,
  running,
  night,
}: {
  world: World
  lines: RailLine[]
  settlements: Settlement[]
  running: boolean
  night: boolean
}) {
  const { lanes, waiters } = useMemo(() => {
    const lanes: Lane[] = []
    for (const settlement of settlements) {
      const plan = planTown(world, settlement, lines, settlements)
      const route = trafficRoute(plan, settlement)
      if (!route) continue
      const points = route.tiles.map((t) => {
        const [x, y, z] = tileWorld(world, t)
        // sit in the near lane rather than down the centre line
        return [x, y + 0.03, z + 0.075] as [number, number, number]
      })
      let length = 0
      for (let i = 1; i < points.length; i++) {
        length += Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2])
      }
      if (length > 0.4) lanes.push({ points, length, cars: route.cars })
    }

    // A couple of figures on every platform.
    const waiters: Waiter[] = []
    for (let z = 0; z < world.h; z++) {
      for (let x = 0; x < world.w; x++) {
        if (world.tiles[idx(world.w, x, z)].feature !== 'station') continue
        const [wx, wy, wz] = tileWorld(world, { x, z })
        for (let i = 0; i < 3; i++) {
          waiters.push({
            position: [wx + 0.36 + i * 0.07, wy + 0.1, wz - 0.18 + i * 0.17],
            phase: (x * 3 + z * 7 + i * 11) % 10,
          })
        }
      }
    }
    return { lanes, waiters }
  }, [world, lines, settlements])

  const total = lanes.reduce((n, l) => n + l.cars, 0)
  const bodies = useRef<InstancedMesh>(null)
  const roofs = useRef<InstancedMesh>(null)
  const people = useRef<InstancedMesh>(null)
  const clock = useRef(0)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    waiters.forEach((w, i) => {
      dummy.position.set(...w.position)
      dummy.rotation.set(0, w.phase, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      people.current?.setMatrixAt(i, dummy.matrix)
    })
    if (people.current) {
      people.current.count = waiters.length
      people.current.instanceMatrix.needsUpdate = true
      people.current.computeBoundingSphere()
    }
  }, [waiters])

  useFrame((_, dt) => {
    if (running) clock.current += Math.min(dt, 0.05)
    const dummy = new Object3D()
    const colour = new Color()
    let i = 0
    for (const lane of lanes) {
      for (let c = 0; c < lane.cars; c++) {
        const speed = 0.5 + (c % 3) * 0.12
        const travelled = (clock.current * speed + (c / lane.cars) * lane.length) % lane.length
        const pose = along(lane, travelled)
        dummy.position.set(pose[0], pose[1], pose[2])
        dummy.rotation.set(0, pose[3], 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        bodies.current?.setMatrixAt(i, dummy.matrix)
        colour.setHex(CAR_COLOURS[(c + lanes.indexOf(lane)) % CAR_COLOURS.length])
        bodies.current?.setColorAt(i, colour)

        dummy.position.set(pose[0], pose[1] + 0.045, pose[2])
        dummy.updateMatrix()
        roofs.current?.setMatrixAt(i, dummy.matrix)
        i++
      }
    }
    for (const ref of [bodies, roofs]) {
      if (!ref.current) continue
      ref.current.count = i
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    }

    // passengers shift their weight while they wait
    if (people.current && waiters.length > 0) {
      waiters.forEach((w, k) => {
        const bob = Math.sin(clock.current * 1.6 + w.phase) * 0.012
        dummy.position.set(w.position[0], w.position[1] + bob, w.position[2])
        dummy.rotation.set(0, w.phase + Math.sin(clock.current * 0.4 + w.phase) * 0.3, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        people.current!.setMatrixAt(k, dummy.matrix)
      })
      people.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group name="town-life" raycast={() => null}>
      {total > 0 && (
        <>
          <instancedMesh ref={bodies} args={[undefined, undefined, total]} castShadow raycast={() => null}>
            <boxGeometry args={[0.075, 0.045, 0.15]} />
            <meshStandardMaterial roughness={0.42} metalness={0.25} />
          </instancedMesh>
          <instancedMesh ref={roofs} args={[undefined, undefined, total]} raycast={() => null}>
            <boxGeometry args={[0.062, 0.038, 0.08]} />
            <meshStandardMaterial
              color="#20272e"
              roughness={0.25}
              metalness={0.1}
              emissive={night ? '#ffd9a0' : '#000000'}
              emissiveIntensity={night ? 0.5 : 0}
            />
          </instancedMesh>
        </>
      )}
      {waiters.length > 0 && (
        <instancedMesh ref={people} args={[undefined, undefined, waiters.length]} castShadow raycast={() => null}>
          <capsuleGeometry args={[0.022, 0.055, 3, 6]} />
          <meshStandardMaterial color="#4a5560" roughness={0.9} />
        </instancedMesh>
      )}
    </group>
  )
}

/** Position and heading a given distance along a lane. */
function along(lane: Lane, distance: number): [number, number, number, number] {
  let travelled = 0
  for (let i = 1; i < lane.points.length; i++) {
    const a = lane.points[i - 1]
    const b = lane.points[i]
    const seg = Math.hypot(b[0] - a[0], b[2] - a[2])
    if (travelled + seg >= distance || i === lane.points.length - 1) {
      const t = seg < 1e-6 ? 0 : Math.min(1, (distance - travelled) / seg)
      return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        Math.atan2(b[0] - a[0], b[2] - a[2]),
      ]
    }
    travelled += seg
  }
  const p = lane.points[0]
  return [p[0], p[1], p[2], 0]
}
