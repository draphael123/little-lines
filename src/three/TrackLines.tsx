import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { RailLine, World } from '../game/types'
import { buildTrackMeshes, type MeshData } from './geometry'
import { PALETTE } from './palette'

function toGeometry(data: MeshData): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
  geometry.computeBoundingSphere()
  return geometry
}

/** Physical permanent way: timber sleepers, steel railheads and bridge trestles. */
export function TrackLines({ world, lines }: { world: World; lines: RailLine[] }) {
  const built = useMemo(
    () =>
      lines
        .filter((l) => l.tiles.length >= 1)
        .map((line) => {
          const meshes = buildTrackMeshes(world, line.tiles)
          return {
            id: line.id,
            rails: toGeometry(meshes.rails),
            sleepers: toGeometry(meshes.sleepers),
            bridge: toGeometry(meshes.bridge),
          }
        }),
    [world, lines],
  )

  useEffect(
    () => () => {
      for (const b of built) {
        b.rails.dispose()
        b.sleepers.dispose()
        b.bridge.dispose()
      }
    },
    [built],
  )

  return (
    <group name="track" raycast={() => null}>
      {built.map((b) => (
        <group key={b.id}>
          <mesh geometry={b.sleepers} castShadow receiveShadow raycast={() => null}>
            <meshStandardMaterial color={PALETTE.sleeper} roughness={0.92} metalness={0.02} />
          </mesh>
          <mesh geometry={b.rails} castShadow raycast={() => null}>
            <meshStandardMaterial color={PALETTE.rail} roughness={0.32} metalness={0.82} />
          </mesh>
          <mesh geometry={b.bridge} castShadow receiveShadow raycast={() => null}>
            <meshStandardMaterial color={PALETTE.timber} roughness={0.85} metalness={0.03} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
