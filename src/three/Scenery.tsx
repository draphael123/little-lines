import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { idx } from '../game/grid'
import type { Coord, World } from '../game/types'
import { tileWorld } from './geometry'
import { PALETTE } from './palette'

interface Placed extends Coord {
  y: number
  spin: number
  size: number
}

function gather(world: World) {
  const trees: Placed[] = []
  const stations: Placed[] = []
  const tunnels: Placed[] = []
  for (let z = 0; z < world.h; z++) {
    for (let x = 0; x < world.w; x++) {
      const tile = world.tiles[idx(world.w, x, z)]
      const [, y] = tileWorld(world, { x, z })
      const wobble = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1
      const placed: Placed = { x, z, y, spin: wobble * Math.PI * 2, size: 0.82 + wobble * 0.4 }
      if (tile.kind === 'rock' && tile.tunnel) tunnels.push({ ...placed })
      if (tile.feature === 'tree') trees.push(placed)
      else if (tile.feature === 'station') stations.push(placed)
    }
  }
  return { trees, stations, tunnels }
}

/** Pines, halts and tunnel portals — the furniture of the layout. */
export function Scenery({ world, night }: { world: World; night: boolean }) {
  const { trees, stations, tunnels } = useMemo(() => gather(world), [world])
  return (
    <group name="scenery" raycast={() => null}>
      <Pines world={world} items={trees} />
      {stations.map((s) => (
        <Halt key={`halt-${s.x}-${s.z}`} world={world} item={s} night={night} />
      ))}
      {tunnels.map((t) => (
        <TunnelPortal key={`tun-${t.x}-${t.z}`} world={world} item={t} />
      ))}
    </group>
  )
}

function Pines({ world, items }: { world: World; items: Placed[] }) {
  const trunks = useRef<InstancedMesh>(null)
  const canopies = useRef<InstancedMesh>(null)
  const caps = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    const colour = new Color()
    items.forEach((item, i) => {
      const [x, y, z] = tileWorld(world, item)
      const s = item.size
      dummy.position.set(x, y + 0.09 * s, z)
      dummy.rotation.set(0, item.spin, 0)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      trunks.current?.setMatrixAt(i, dummy.matrix)

      dummy.position.set(x, y + 0.34 * s, z)
      dummy.updateMatrix()
      canopies.current?.setMatrixAt(i, dummy.matrix)
      colour.setHex(item.size > 1.05 ? 0x4c6042 : 0x566b49)
      canopies.current?.setColorAt(i, colour)

      dummy.position.set(x, y + 0.58 * s, z)
      dummy.updateMatrix()
      caps.current?.setMatrixAt(i, dummy.matrix)
      caps.current?.setColorAt(i, colour)
    })
    for (const ref of [trunks, canopies, caps]) {
      if (!ref.current) continue
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [world, items])

  if (items.length === 0) return null
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, items.length]} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.035, 0.05, 0.2, 6]} />
        <meshStandardMaterial color={PALETTE.timberDark} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={canopies} args={[undefined, undefined, items.length]} castShadow raycast={() => null}>
        <coneGeometry args={[0.22, 0.4, 7]} />
        <meshStandardMaterial roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, items.length]} castShadow raycast={() => null}>
        <coneGeometry args={[0.15, 0.32, 7]} />
        <meshStandardMaterial roughness={0.92} />
      </instancedMesh>
    </group>
  )
}

function Halt({ world, item, night }: { world: World; item: Placed; night: boolean }) {
  const [x, y, z] = tileWorld(world, item)
  const spin = Math.round(item.spin / (Math.PI / 2)) * (Math.PI / 2)
  return (
    <group position={[x, y, z]} rotation={[0, spin, 0]} raycast={() => null}>
      <mesh position={[0.42, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.1, 0.86]} />
        <meshStandardMaterial color="#cabfa6" roughness={0.9} />
      </mesh>
      <mesh position={[0.56, 0.24, 0]} castShadow>
        <boxGeometry args={[0.26, 0.28, 0.5]} />
        <meshStandardMaterial
          color={PALETTE.render}
          roughness={0.8}
          emissive={night ? '#d79a44' : '#000000'}
          emissiveIntensity={night ? 0.45 : 0}
        />
      </mesh>
      <mesh position={[0.5, 0.42, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.62, 8]} />
        <meshStandardMaterial color={PALETTE.timberDark} roughness={0.8} />
      </mesh>
      <mesh position={[0.44, 0.4, 0]} rotation={[0, 0, 0.24]} castShadow>
        <boxGeometry args={[0.46, 0.02, 0.62]} />
        <meshStandardMaterial color={PALETTE.danger} roughness={0.7} />
      </mesh>
      {night && <pointLight position={[0.5, 0.34, 0]} color="#ffca7a" intensity={0.7} distance={2.4} />}
    </group>
  )
}

function TunnelPortal({ world, item }: { world: World; item: Placed }) {
  const [x, y, z] = tileWorld(world, item)
  return (
    <group position={[x, y, z]} raycast={() => null}>
      {[0, Math.PI / 2].map((rot) => (
        <group key={rot} rotation={[0, rot, 0]}>
          {[-0.5, 0.5].map((side) => (
            <mesh key={side} position={[side, 0.16, 0]} castShadow>
              <boxGeometry args={[0.1, 0.32, 0.34]} />
              <meshStandardMaterial color="#7d7466" roughness={0.95} />
            </mesh>
          ))}
          <mesh position={[0, 0.34, 0]} castShadow>
            <boxGeometry args={[1.06, 0.1, 0.34]} />
            <meshStandardMaterial color="#6f6759" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[0.9, 0.3, 0.2]} />
            <meshStandardMaterial color="#14120f" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
