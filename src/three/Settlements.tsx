import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import type { Settlement } from '../game/economy'
import { planTown, roadStrips, type TownBuilding, type TownProp } from '../game/town'
import type { RailLine, World } from '../game/types'
import { tileWorld } from './geometry'
import { PALETTE } from './palette'

interface Placed<T> {
  item: T
  position: [number, number, number]
}

const WALLS = [0xe6ded0, 0xdcd2c0, 0xd3c7b2, 0xc8bda9, 0xe9e3d6]
const BLOCK_WALLS = [0xb9b3a8, 0xada79c, 0xc4beb2]

/**
 * The towns the railway earned, laid out as streets. Everything here is
 * instanced: a grand table with five cities is still a handful of draw calls.
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
  const plan = useMemo(() => {
    const roads: Array<Placed<{ width: number; depth: number }>> = []
    const buildings: Array<Placed<TownBuilding>> = []
    const props: Array<Placed<TownProp>> = []

    for (const settlement of settlements) {
      const town = planTown(world, settlement, lines, settlements)
      for (const road of town.roads) {
        const [x, y, z] = tileWorld(world, road)
        for (const strip of roadStrips(road)) {
          roads.push({
            item: { width: strip.width, depth: strip.depth },
            position: [x + strip.ox, y + 0.012, z + strip.oz],
          })
        }
      }
      for (const building of town.buildings) {
        const [x, y, z] = tileWorld(world, building)
        buildings.push({ item: building, position: [x + building.ox, y, z + building.oz] })
      }
      for (const prop of town.props) {
        const [x, y, z] = tileWorld(world, prop)
        props.push({ item: prop, position: [x + prop.ox, y, z + prop.oz] })
      }
    }
    return { roads, buildings, props }
  }, [world, lines, settlements])

  return (
    <group name="settlements" raycast={() => null}>
      <Roads items={plan.roads} />
      <Buildings items={plan.buildings} night={night} />
      <Props items={plan.props} night={night} />
    </group>
  )
}

function Roads({ items }: { items: Array<Placed<{ width: number; depth: number }>> }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new Object3D()
    items.forEach((entry, i) => {
      dummy.position.set(...entry.position)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(entry.item.width, entry.item.depth, 1)
      dummy.updateMatrix()
      mesh.current?.setMatrixAt(i, dummy.matrix)
    })
    if (mesh.current) {
      mesh.current.count = items.length
      mesh.current.instanceMatrix.needsUpdate = true
      mesh.current.computeBoundingSphere()
    }
  }, [items])

  if (items.length === 0) return null
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, items.length]}
      receiveShadow
      raycast={() => null}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color={PALETTE.road} roughness={0.95} />
    </instancedMesh>
  )
}

function Buildings({ items, night }: { items: Array<Placed<TownBuilding>>; night: boolean }) {
  const walls = useRef<InstancedMesh>(null)
  const roofs = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    const colour = new Color()
    items.forEach((entry, i) => {
      const b = entry.item
      const [x, y, z] = entry.position
      dummy.position.set(x, y + b.height / 2, z)
      dummy.rotation.set(0, b.yaw, 0)
      dummy.scale.set(b.width, b.height, b.depth)
      dummy.updateMatrix()
      walls.current?.setMatrixAt(i, dummy.matrix)
      const palette = b.kind === 'block' ? BLOCK_WALLS : WALLS
      colour.setHex(palette[Math.floor(b.shade * palette.length) % palette.length])
      walls.current?.setColorAt(i, colour)

      // Pitched roofs on the small stuff, flat parapets on the big stuff.
      const pitched = b.kind === 'house' || b.kind === 'terrace'
      dummy.position.set(x, y + b.height + (pitched ? b.width * 0.28 : 0.014), z)
      dummy.rotation.set(0, b.yaw + (pitched ? Math.PI / 4 : 0), 0)
      const spread = Math.max(b.width, b.depth)
      if (pitched) dummy.scale.set(spread * 0.82, b.width * 0.62, spread * 0.82)
      else dummy.scale.set(b.width + 0.04, 0.03, b.depth + 0.04)
      dummy.updateMatrix()
      roofs.current?.setMatrixAt(i, dummy.matrix)
      colour.setHex(pitched ? 0xa4503c : 0x6f6a63)
      roofs.current?.setColorAt(i, colour)
    })
    for (const ref of [walls, roofs]) {
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
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.82}
          emissive={night ? '#c98b3a' : '#000000'}
          emissiveIntensity={night ? 0.3 : 0}
        />
      </instancedMesh>
      {/* one geometry for both roof shapes: a 4-sided cone reads as a hip roof
          when tall and as a flat parapet when squashed */}
      <instancedMesh
        ref={roofs}
        args={[undefined, undefined, items.length]}
        castShadow
        raycast={() => null}
      >
        <coneGeometry args={[0.72, 1, 4]} />
        <meshStandardMaterial roughness={0.86} />
      </instancedMesh>
    </group>
  )
}

function Props({ items, night }: { items: Array<Placed<TownProp>>; night: boolean }) {
  const lamps = useMemo(() => items.filter((p) => p.item.kind === 'lamp'), [items])
  const hedges = useMemo(() => items.filter((p) => p.item.kind === 'hedge'), [items])

  const posts = useRef<InstancedMesh>(null)
  const heads = useRef<InstancedMesh>(null)
  const bushes = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    lamps.forEach((entry, i) => {
      const [x, y, z] = entry.position
      dummy.position.set(x, y + 0.14, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      posts.current?.setMatrixAt(i, dummy.matrix)
      dummy.position.set(x, y + 0.29, z)
      dummy.updateMatrix()
      heads.current?.setMatrixAt(i, dummy.matrix)
    })
    hedges.forEach((entry, i) => {
      const [x, y, z] = entry.position
      dummy.position.set(x, y + 0.05, z)
      dummy.rotation.set(0, entry.item.yaw, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      bushes.current?.setMatrixAt(i, dummy.matrix)
    })
    for (const [ref, count] of [
      [posts, lamps.length],
      [heads, lamps.length],
      [bushes, hedges.length],
    ] as const) {
      if (!ref.current) continue
      ref.current.count = count
      ref.current.instanceMatrix.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [lamps, hedges])

  return (
    <group>
      {lamps.length > 0 && (
        <>
          <instancedMesh ref={posts} args={[undefined, undefined, lamps.length]} castShadow raycast={() => null}>
            <cylinderGeometry args={[0.012, 0.016, 0.28, 6]} />
            <meshStandardMaterial color="#2f3439" roughness={0.6} metalness={0.4} />
          </instancedMesh>
          <instancedMesh ref={heads} args={[undefined, undefined, lamps.length]} raycast={() => null}>
            <sphereGeometry args={[0.032, 8, 6]} />
            <meshStandardMaterial
              color="#fdf0cf"
              emissive={night ? '#ffcc78' : '#3a3a36'}
              emissiveIntensity={night ? 2.6 : 0}
              roughness={0.4}
            />
          </instancedMesh>
        </>
      )}
      {hedges.length > 0 && (
        <instancedMesh ref={bushes} args={[undefined, undefined, hedges.length]} castShadow raycast={() => null}>
          <boxGeometry args={[0.44, 0.1, 0.07]} />
          <meshStandardMaterial color="#4a6b3d" roughness={1} />
        </instancedMesh>
      )}
    </group>
  )
}
