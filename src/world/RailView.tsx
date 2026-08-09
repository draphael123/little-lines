import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial } from 'three'
import type { Heightfield } from './heightfield'
import type { RailNetwork, Vec3 } from './rail'
import { buildTrack, type MeshData } from './trackMesh'

function toGeometry(data: MeshData): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(data.positions, 3))
  g.setAttribute('normal', new BufferAttribute(data.normals, 3))
  g.computeBoundingSphere()
  return g
}

/** The network as built: ballast, sleepers, railheads and viaducts. */
export function RailView({ field, network }: { field: Heightfield; network: RailNetwork }) {
  const built = useMemo(
    () =>
      network.edges.map((edge) => {
        const meshes = buildTrack(field, edge.points)
        return {
          id: edge.id,
          ballast: toGeometry(meshes.ballast),
          sleepers: toGeometry(meshes.sleepers),
          rails: toGeometry(meshes.rails),
          structure: toGeometry(meshes.structure),
        }
      }),
    [field, network],
  )

  useEffect(
    () => () => {
      for (const b of built) {
        b.ballast.dispose()
        b.sleepers.dispose()
        b.rails.dispose()
        b.structure.dispose()
      }
    },
    [built],
  )

  return (
    <group name="rail" raycast={() => null}>
      {built.map((b) => (
        <group key={b.id}>
          <mesh geometry={b.ballast} receiveShadow raycast={() => null}>
            <meshStandardMaterial color="#6b6459" roughness={1} />
          </mesh>
          <mesh geometry={b.structure} castShadow receiveShadow raycast={() => null}>
            <meshStandardMaterial color="#8d8579" roughness={0.95} />
          </mesh>
          <mesh geometry={b.sleepers} castShadow receiveShadow raycast={() => null}>
            <meshStandardMaterial color="#4f4030" roughness={0.95} />
          </mesh>
          <mesh geometry={b.rails} castShadow raycast={() => null}>
            <meshStandardMaterial color="#b9bec2" roughness={0.34} metalness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** The line you are dragging right now, before it is committed. */
export function RailPreview({
  points,
  ok,
}: {
  points: Vec3[] | null
  ok: boolean
}) {
  const geometry = useMemo(() => {
    if (!points || points.length < 2) return null
    const g = new BufferGeometry()
    const flat = new Float32Array(points.length * 3)
    points.forEach((p, i) => {
      flat[i * 3] = p[0]
      flat[i * 3 + 1] = p[1] + 1.2
      flat[i * 3 + 2] = p[2]
    })
    g.setAttribute('position', new BufferAttribute(flat, 3))
    return g
  }, [points])

  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null

  // `line` collides with the SVG intrinsic, so the three object is named.
  return (
    <primitive object={new Line(geometry, new LineBasicMaterial({ color: ok ? 0xf0b357 : 0xe2604c }))} />
  )
}
