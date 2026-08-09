import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { buildingSlots, tierOf, type Settlement } from '../game/economy'
import type { RailLine, World } from '../game/types'
import { tileWorld } from './geometry'
import { PALETTE } from './palette'

interface Placement {
  position: [number, number, number]
  spin: number
  scale: number
  wall: number
  landmark: boolean
}

const WALL_COLOURS = [0xe6dcc6, 0xdbcfb4, 0xe9e2cf, 0xd2c5a9]

/**
 * The towns the railway earned. Every cottage here exists because a station
 * serves this place and the line reaches somewhere worth going.
 */
export function Settlements({
  world,
  lines,
  settlements,
  night,
}: {
  world: World
  lines: RailLine[]
  settlements: Settlement[]
  night: boolean
}) {
  const placements = useMemo(() => {
    const out: Placement[] = []
    for (const settlement of settlements) {
      const tier = tierOf(settlement.population)
      for (const slot of buildingSlots(world, settlement, lines, settlements)) {
        const [x, y, z] = tileWorld(world, { x: slot.x, z: slot.z })
        out.push({
          position: [x + slot.ox, y, z + slot.oz],
          spin: slot.spin,
          scale: slot.landmark ? 1 : tier === 'city' ? 0.92 : 0.82,
          wall: WALL_COLOURS[(slot.x * 3 + slot.z) % WALL_COLOURS.length],
          landmark: slot.landmark,
        })
      }
    }
    return out
  }, [world, lines, settlements])

  const cottages = useMemo(() => placements.filter((p) => !p.landmark), [placements])
  const landmarks = useMemo(() => placements.filter((p) => p.landmark), [placements])

  return (
    <group name="settlements" raycast={() => null}>
      <Cottages items={cottages} night={night} />
      {landmarks.map((l, i) => (
        <Landmark key={`lm-${i}`} item={l} night={night} />
      ))}
    </group>
  )
}

function Cottages({ items, night }: { items: Placement[]; night: boolean }) {
  const walls = useRef<InstancedMesh>(null)
  const roofs = useRef<InstancedMesh>(null)
  const chimneys = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    const colour = new Color()
    items.forEach((item, i) => {
      const [x, y, z] = item.position
      const s = item.scale
      dummy.position.set(x, y + 0.115 * s, z)
      dummy.rotation.set(0, item.spin, 0)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      walls.current?.setMatrixAt(i, dummy.matrix)
      colour.setHex(item.wall)
      walls.current?.setColorAt(i, colour)

      dummy.position.set(x, y + 0.285 * s, z)
      dummy.rotation.set(0, item.spin + Math.PI / 4, 0)
      dummy.updateMatrix()
      roofs.current?.setMatrixAt(i, dummy.matrix)

      dummy.position.set(x + 0.08 * s, y + 0.35 * s, z + 0.06 * s)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      chimneys.current?.setMatrixAt(i, dummy.matrix)
    })
    for (const ref of [walls, roofs, chimneys]) {
      if (!ref.current) continue
      ref.current.count = items.length
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [items])

  if (items.length === 0) return null
  return (
    <group>
      <instancedMesh
        ref={walls}
        args={[undefined, undefined, items.length]}
        castShadow
        receiveShadow
        raycast={() => null}
      >
        <boxGeometry args={[0.32, 0.23, 0.26]} />
        <meshStandardMaterial
          roughness={0.86}
          emissive={night ? '#c98b3a' : '#000000'}
          emissiveIntensity={night ? 0.34 : 0}
        />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, items.length]} castShadow raycast={() => null}>
        <coneGeometry args={[0.27, 0.17, 4]} />
        <meshStandardMaterial color={PALETTE.signal} roughness={0.82} />
      </instancedMesh>
      <instancedMesh ref={chimneys} args={[undefined, undefined, items.length]} castShadow raycast={() => null}>
        <boxGeometry args={[0.055, 0.14, 0.055]} />
        <meshStandardMaterial color="#8f7f6a" roughness={0.92} />
      </instancedMesh>
    </group>
  )
}

/** A church tower: the sign that a place has become a town. */
function Landmark({ item, night }: { item: Placement; night: boolean }) {
  const [x, y, z] = item.position
  return (
    <group position={[x, y, z]} rotation={[0, item.spin, 0]} raycast={() => null}>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.32, 0.44]} />
        <meshStandardMaterial
          color="#ded3ba"
          roughness={0.85}
          emissive={night ? '#c98b3a' : '#000000'}
          emissiveIntensity={night ? 0.24 : 0}
        />
      </mesh>
      <mesh position={[0, 0.36, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.3, 0.16, 4]} />
        <meshStandardMaterial color={PALETTE.slate} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.35, -0.18]} castShadow>
        <boxGeometry args={[0.16, 0.42, 0.16]} />
        <meshStandardMaterial color="#d5c9ae" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.6, -0.18]} castShadow>
        <coneGeometry args={[0.13, 0.22, 4]} />
        <meshStandardMaterial color={PALETTE.slate} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.74, -0.18]}>
        <sphereGeometry args={[0.026, 8, 6]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.28} metalness={0.9} />
      </mesh>
      {night && <pointLight position={[0, 0.3, 0]} color="#ffca7a" intensity={0.55} distance={2.6} />}
    </group>
  )
}
