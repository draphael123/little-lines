import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { heightAt, type Heightfield } from './heightfield'
import type { Road, TownBuilding } from './townLayout'
import type { Tree } from './scatter'

const WALLS = [0xd9cfbc, 0xcfc4ad, 0xc4b79f, 0xdedacd, 0xb9ad97, 0xc9b9a2]
const BLOCK_WALLS = [0xa9a79f, 0x9d9a92, 0xb5b2a8]
const TOWER_WALLS = [0x8d9aa4, 0x7f8d99, 0x99a5ad]

/** Streets, laid as flat ribbons that follow the ground. */
export function Roads({ field, roads }: { field: Heightfield; roads: Road[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const pieces = useMemo(() => {
    // Break each street into short pieces so it drapes over the ground.
    const out: Array<{ x: number; y: number; z: number; yaw: number; len: number; w: number }> = []
    for (const road of roads) {
      const dx = road.bx - road.ax
      const dz = road.bz - road.az
      const total = Math.hypot(dx, dz)
      // short pieces, or a straight quad bridges a dip and floats off the hill
      const steps = Math.max(1, Math.round(total / 7))
      const ux = dx / total
      const uz = dz / total
      const yaw = Math.atan2(ux, uz)
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps
        const x = road.ax + dx * t
        const z = road.az + dz * t
        out.push({
          x,
          y: heightAt(field, x, z) + 0.28,
          z,
          yaw,
          len: total / steps + 1.2,
          w: road.width,
        })
      }
    }
    return out
  }, [field, roads])

  useLayoutEffect(() => {
    const dummy = new Object3D()
    pieces.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(-Math.PI / 2, 0, -p.yaw)
      dummy.scale.set(p.w, p.len, 1)
      dummy.updateMatrix()
      mesh.current?.setMatrixAt(i, dummy.matrix)
    })
    if (mesh.current) {
      mesh.current.count = pieces.length
      mesh.current.instanceMatrix.needsUpdate = true
      mesh.current.computeBoundingSphere()
    }
  }, [pieces])

  if (pieces.length === 0) return null
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, pieces.length]}
      receiveShadow
      raycast={() => null}
    >
      <planeGeometry args={[1, 1]} />
      {/* A country road is pale gravel and dust, not asphalt. At this scale a
          dark surface reads as a black scar cut across the hillside. */}
      <meshStandardMaterial color="#8d8779" roughness={0.95} />
    </instancedMesh>
  )
}

/** Everything the towns have built. */
export function Buildings({ buildings, night }: { buildings: TownBuilding[]; night: boolean }) {
  const walls = useRef<InstancedMesh>(null)
  const roofs = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    const colour = new Color()
    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.y + b.height / 2, b.z)
      dummy.rotation.set(0, b.yaw, 0)
      dummy.scale.set(b.width, b.height, b.depth)
      dummy.updateMatrix()
      walls.current?.setMatrixAt(i, dummy.matrix)
      const palette =
        b.shape === 'tower' ? TOWER_WALLS : b.shape === 'block' ? BLOCK_WALLS : WALLS
      colour.setHex(palette[Math.floor(b.shade * palette.length) % palette.length])
      walls.current?.setColorAt(i, colour)

      // pitched roofs on the small stuff, flat caps on the big stuff
      const pitched = b.shape === 'house' || b.shape === 'terrace'
      const spread = Math.max(b.width, b.depth)
      dummy.position.set(b.x, b.y + b.height + (pitched ? spread * 0.16 : 0.35), b.z)
      dummy.rotation.set(0, b.yaw + (pitched ? Math.PI / 4 : 0), 0)
      if (pitched) dummy.scale.set(spread * 0.99, spread * 0.36, spread * 0.99)
      else dummy.scale.set(b.width + 1.2, 0.7, b.depth + 1.2)
      dummy.updateMatrix()
      roofs.current?.setMatrixAt(i, dummy.matrix)
      colour.setHex(pitched ? (b.shade > 0.5 ? 0x8f4a3a : 0x6f4438) : 0x5d5f63)
      roofs.current?.setColorAt(i, colour)
    })
    for (const ref of [walls, roofs]) {
      if (!ref.current) continue
      ref.current.count = buildings.length
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [buildings])

  if (buildings.length === 0) return null
  return (
    <group name="buildings" raycast={() => null}>
      <instancedMesh
        ref={walls}
        args={[undefined, undefined, buildings.length]}
        castShadow
        receiveShadow
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.86}
          emissive={night ? '#c98b3a' : '#000000'}
          emissiveIntensity={night ? 0.34 : 0}
        />
      </instancedMesh>
      <instancedMesh
        ref={roofs}
        args={[undefined, undefined, buildings.length]}
        castShadow
        raycast={() => null}
      >
        <coneGeometry args={[0.72, 1, 4]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  )
}

/** Woodland. */
export function Woods({ trees }: { trees: Tree[] }) {
  const conifers = useMemo(() => trees.filter((t) => t.broad === 0), [trees])
  const broadleaves = useMemo(() => trees.filter((t) => t.broad === 1), [trees])
  const trunks = useRef<InstancedMesh>(null)
  const pines = useRef<InstancedMesh>(null)
  const crowns = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    const colour = new Color()
    trees.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 2.4 * t.scale, t.z)
      dummy.rotation.set(0, t.spin, 0)
      dummy.scale.set(t.scale, t.scale, t.scale)
      dummy.updateMatrix()
      trunks.current?.setMatrixAt(i, dummy.matrix)
    })
    if (trunks.current) {
      trunks.current.count = trees.length
      trunks.current.instanceMatrix.needsUpdate = true
      trunks.current.computeBoundingSphere()
    }

    conifers.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 9 * t.scale, t.z)
      dummy.rotation.set(0, t.spin, 0)
      dummy.scale.set(t.scale, t.scale, t.scale)
      dummy.updateMatrix()
      pines.current?.setMatrixAt(i, dummy.matrix)
      colour.setHex(t.scale > 1.2 ? 0x35502f : 0x3d5a34)
      pines.current?.setColorAt(i, colour)
    })
    if (pines.current) {
      pines.current.count = conifers.length
      pines.current.instanceMatrix.needsUpdate = true
      if (pines.current.instanceColor) pines.current.instanceColor.needsUpdate = true
      pines.current.computeBoundingSphere()
    }

    broadleaves.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 7.5 * t.scale, t.z)
      dummy.rotation.set(0, t.spin, 0)
      dummy.scale.set(t.scale, t.scale * 0.86, t.scale)
      dummy.updateMatrix()
      crowns.current?.setMatrixAt(i, dummy.matrix)
      colour.setHex(t.scale > 1.2 ? 0x4d6b36 : 0x556f3a)
      crowns.current?.setColorAt(i, colour)
    })
    if (crowns.current) {
      crowns.current.count = broadleaves.length
      crowns.current.instanceMatrix.needsUpdate = true
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true
      crowns.current.computeBoundingSphere()
    }
  }, [trees, conifers, broadleaves])

  if (trees.length === 0) return null
  return (
    <group name="woods" raycast={() => null}>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.5, 0.8, 5, 5]} />
        <meshStandardMaterial color="#4a3b2c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={pines} args={[undefined, undefined, Math.max(1, conifers.length)]} castShadow raycast={() => null}>
        <coneGeometry args={[3.4, 13, 7]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, Math.max(1, broadleaves.length)]} castShadow raycast={() => null}>
        <sphereGeometry args={[4.4, 7, 5]} />
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
    </group>
  )
}
