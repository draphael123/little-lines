import { useEffect, useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import { BufferAttribute, BufferGeometry } from 'three'
import { idx } from '../game/grid'
import type { World } from '../game/types'
import { TILE, WATER_DROP, tileWorld } from './geometry'
import type { SceneMood } from './palette'

/**
 * Every water tile as one merged surface. The quads are built in the local XY
 * plane so the mesh can be laid flat with a single rotation — which is what
 * the reflector needs in order to mirror the scene correctly.
 */
function waterGeometry(world: World): { geometry: BufferGeometry; count: number } {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  let count = 0
  const half = TILE / 2
  for (let z = 0; z < world.h; z++) {
    for (let x = 0; x < world.w; x++) {
      if (world.tiles[idx(world.w, x, z)].kind !== 'water') continue
      count++
      const [wx, , wz] = tileWorld(world, { x, z })
      const x0 = wx - half
      const x1 = wx + half
      const y0 = -wz - half
      const y1 = -wz + half
      const quad = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y0],
        [x1, y1],
        [x0, y1],
      ]
      for (const [px, py] of quad) {
        positions.push(px, py, 0)
        normals.push(0, 0, 1)
        uvs.push((px + world.w / 2) / world.w, (py + world.h / 2) / world.h)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.computeBoundingSphere()
  return { geometry, count }
}

export function Water({ world, mood }: { world: World; mood: SceneMood }) {
  const { geometry, count } = useMemo(() => waterGeometry(world), [world])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (count === 0) return null
  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -WATER_DROP, 0]}
      receiveShadow
      raycast={() => null}
      name="water"
    >
      <MeshReflectorMaterial
        color={mood.waterColour}
        resolution={512}
        mirror={0.45}
        mixBlur={2.4}
        mixStrength={1.6}
        blur={[220, 70]}
        depthScale={0.6}
        minDepthThreshold={0.3}
        maxDepthThreshold={1.2}
        roughness={mood.waterRoughness}
        metalness={0.22}
        transparent
        opacity={0.9}
      />
    </mesh>
  )
}
