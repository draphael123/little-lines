import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, type Mesh } from 'three'
import type { Coord, World } from '../game/types'
import { buildTerrainMesh } from './terrainMesh'

interface TerrainProps {
  world: World
  onPick?: (c: Coord) => void
  onHover?: (c: Coord | null) => void
}

/**
 * One mesh for the whole survey. A raycast returns a triangle index, which the
 * builder's `tileByTriangle` map turns back into a tile — so picking is exact
 * even though the ground is no longer one object per square.
 */
export function Terrain({ world, onPick, onHover }: TerrainProps) {
  const mesh = useRef<Mesh>(null)

  const { geometry, tileByTriangle } = useMemo(() => {
    const built = buildTerrainMesh(world)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(built.positions, 3))
    g.setAttribute('normal', new BufferAttribute(built.normals, 3))
    g.setAttribute('color', new BufferAttribute(built.colors, 3))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return { geometry: g, tileByTriangle: built.tileByTriangle }
  }, [world])

  useEffect(() => () => geometry.dispose(), [geometry])

  const resolve = (event: ThreeEvent<PointerEvent>): Coord | null => {
    const face = event.faceIndex
    if (face === undefined || face === null) return null
    if (face < 0 || face >= tileByTriangle.length) return null
    const index = tileByTriangle[face]
    if (index < 0) return null
    return { x: index % world.w, z: Math.floor(index / world.w) }
  }

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      name="terrain"
      castShadow
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation()
        const c = resolve(e)
        if (c) onHover?.(c)
      }}
      onPointerOut={() => onHover?.(null)}
      onPointerDown={(e) => {
        e.stopPropagation()
        const c = resolve(e)
        if (c) onPick?.(c)
      }}
    >
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
    </mesh>
  )
}
