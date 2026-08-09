import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { isBuilding } from '../game/buildings'
import { idx } from '../game/grid'
import type { BuildingId, Coord, World } from '../game/types'
import { tileWorld } from './geometry'
import { PALETTE } from './palette'

interface Placed extends Coord {
  y: number
  spin: number
  size: number
}

function gather(world: World) {
  const trees: Placed[] = []
  const buildings: Array<Placed & { id: BuildingId }> = []
  const tunnels: Placed[] = []
  for (let z = 0; z < world.h; z++) {
    for (let x = 0; x < world.w; x++) {
      const tile = world.tiles[idx(world.w, x, z)]
      const [, y] = tileWorld(world, { x, z })
      const wobble = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1
      const placed: Placed = { x, z, y, spin: wobble * Math.PI * 2, size: 0.82 + wobble * 0.4 }
      if (tile.kind === 'rock' && tile.tunnel) tunnels.push({ ...placed })
      if (tile.feature === 'tree') trees.push(placed)
      else if (isBuilding(tile.feature)) buildings.push({ ...placed, id: tile.feature })
    }
  }
  return { trees, buildings, tunnels }
}

/** Pines, halts and tunnel portals — the furniture of the layout. */
export function Scenery({ world, night }: { world: World; night: boolean }) {
  const { trees, buildings, tunnels } = useMemo(() => gather(world), [world])
  return (
    <group name="scenery" raycast={() => null}>
      <Pines world={world} items={trees} />
      {buildings.map((b) => (
        <Structure key={`b-${b.x}-${b.z}`} world={world} item={b} night={night} />
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

/** Every placeable building, drawn so you can tell them apart at a glance. */
function Structure({
  world,
  item,
  night,
}: {
  world: World
  item: Placed & { id: BuildingId }
  night: boolean
}) {
  const [x, y, z] = tileWorld(world, item)
  const spin = Math.round(item.spin / (Math.PI / 2)) * (Math.PI / 2)
  const lit = night ? '#d79a44' : '#000000'
  const glow = night ? 0.45 : 0

  return (
    <group position={[x, y, z]} rotation={[0, spin, 0]} raycast={() => null}>
      {(item.id === 'station' || item.id === 'terminus') && (
        <>
          {/* platform */}
          <mesh position={[0.42, 0.05, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.1, item.id === 'terminus' ? 0.98 : 0.86]} />
            <meshStandardMaterial color="#cabfa6" roughness={0.9} />
          </mesh>
          {/* booking hall */}
          <mesh position={[0.58, item.id === 'terminus' ? 0.3 : 0.24, 0]} castShadow>
            <boxGeometry
              args={
                item.id === 'terminus' ? [0.32, 0.4, 0.66] : [0.26, 0.28, 0.5]
              }
            />
            <meshStandardMaterial
              color={PALETTE.render}
              roughness={0.8}
              emissive={lit}
              emissiveIntensity={glow}
            />
          </mesh>
          {/* canopy */}
          <mesh position={[0.46, item.id === 'terminus' ? 0.54 : 0.4, 0]} rotation={[0, 0, 0.22]} castShadow>
            <boxGeometry args={[0.48, 0.022, item.id === 'terminus' ? 0.78 : 0.62]} />
            <meshStandardMaterial color={PALETTE.danger} roughness={0.7} />
          </mesh>
          {item.id === 'terminus' && (
            <mesh position={[0.58, 0.62, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.24, 8]} />
              <meshStandardMaterial color={PALETTE.brass} roughness={0.3} metalness={0.85} />
            </mesh>
          )}
          {night && <pointLight position={[0.5, 0.36, 0]} color="#ffca7a" intensity={0.8} distance={2.6} />}
        </>
      )}

      {item.id === 'watertower' && (
        <group position={[0.44, 0, 0]}>
          {[-0.09, 0.09].map((o) => (
            <mesh key={o} position={[o, 0.16, o]} castShadow>
              <cylinderGeometry args={[0.016, 0.02, 0.32, 6]} />
              <meshStandardMaterial color={PALETTE.timberDark} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.42, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.2, 12]} />
            <meshStandardMaterial color="#5c6b63" roughness={0.7} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.54, 0]} castShadow>
            <coneGeometry args={[0.17, 0.09, 12]} />
            <meshStandardMaterial color={PALETTE.timberDark} roughness={0.8} />
          </mesh>
        </group>
      )}

      {item.id === 'shed' && (
        <group position={[0.5, 0, 0]}>
          <mesh position={[0, 0.19, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.38, 0.72]} />
            <meshStandardMaterial color="#8d7f6d" roughness={0.9} emissive={lit} emissiveIntensity={glow * 0.6} />
          </mesh>
          <mesh position={[0, 0.42, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <cylinderGeometry args={[0.23, 0.23, 0.44, 12, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#4c545a" roughness={0.75} side={2} />
          </mesh>
          <mesh position={[-0.22, 0.15, 0]}>
            <boxGeometry args={[0.03, 0.3, 0.4]} />
            <meshStandardMaterial color="#15181b" roughness={1} />
          </mesh>
        </group>
      )}

      {item.id === 'depot' && (
        <group position={[0.5, 0, 0]}>
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.44, 0.28, 0.8]} />
            <meshStandardMaterial color="#9a8b74" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.5, 0.05, 0.86]} />
            <meshStandardMaterial color="#59616a" roughness={0.8} />
          </mesh>
          {[-0.22, 0, 0.22].map((o) => (
            <mesh key={o} position={[0.16, 0.36, o]} castShadow>
              <boxGeometry args={[0.14, 0.1, 0.14]} />
              <meshStandardMaterial color={PALETTE.timber} roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}

      {item.id === 'market' && (
        <group position={[0.46, 0, 0]}>
          <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.5, 0.32, 0.62]} />
            <meshStandardMaterial color="#ddd0b4" roughness={0.85} emissive={lit} emissiveIntensity={glow} />
          </mesh>
          <mesh position={[0, 0.36, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.45, 0.14, 4]} />
            <meshStandardMaterial color="#b8863f" roughness={0.8} />
          </mesh>
          {[-0.18, 0.18].map((o) => (
            <mesh key={o} position={[0.28, 0.1, o]} castShadow>
              <boxGeometry args={[0.12, 0.2, 0.16]} />
              <meshStandardMaterial color="#a35b4a" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}

      {item.id === 'school' && (
        <group position={[0.46, 0, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.4, 0.4, 0.7]} />
            <meshStandardMaterial color="#c9b394" roughness={0.88} emissive={lit} emissiveIntensity={glow} />
          </mesh>
          <mesh position={[0, 0.44, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.38, 0.16, 4]} />
            <meshStandardMaterial color="#5d6670" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.62, 0.24]} castShadow>
            <boxGeometry args={[0.1, 0.24, 0.1]} />
            <meshStandardMaterial color="#c9b394" roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.78, 0.24]} castShadow>
            <coneGeometry args={[0.09, 0.14, 4]} />
            <meshStandardMaterial color="#5d6670" roughness={0.8} />
          </mesh>
        </group>
      )}

      {item.id === 'clinic' && (
        <group position={[0.46, 0, 0]}>
          <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.44, 0.36, 0.66]} />
            <meshStandardMaterial color="#eae4d8" roughness={0.8} emissive={lit} emissiveIntensity={glow} />
          </mesh>
          <mesh position={[0, 0.37, 0]} castShadow>
            <boxGeometry args={[0.48, 0.04, 0.7]} />
            <meshStandardMaterial color="#c3ccd2" roughness={0.7} />
          </mesh>
          <mesh position={[0.23, 0.24, 0]}>
            <boxGeometry args={[0.012, 0.16, 0.05]} />
            <meshStandardMaterial color={PALETTE.danger} roughness={0.6} />
          </mesh>
          <mesh position={[0.23, 0.24, 0]}>
            <boxGeometry args={[0.012, 0.05, 0.16]} />
            <meshStandardMaterial color={PALETTE.danger} roughness={0.6} />
          </mesh>
        </group>
      )}
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
