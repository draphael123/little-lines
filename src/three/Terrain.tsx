import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { blockLevel, idx } from '../game/grid'
import { MAX_ELEVATION, type Coord, type World } from '../game/types'
import { SKIRT, STEP, TILE, surfaceY, tileWorld } from './geometry'
import { tileColour } from './palette'

/**
 * A shader patch that paints the sides of every carved block as bare earth
 * while the top keeps its painted finish. `objectNormal.y` is the world
 * up-component because instances are never rotated.
 */
function carveMaterial(material: MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpness;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nvUpness = objectNormal.y;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpness;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float faceUp = smoothstep(0.25, 0.85, vUpness);
         vec3 earth = diffuseColor.rgb * 0.42 + vec3(0.20, 0.145, 0.085);
         diffuseColor.rgb = mix(earth, diffuseColor.rgb, faceUp);`,
      )
  }
  material.needsUpdate = true
}

interface TerrainProps {
  world: World
  onPick?: (c: Coord) => void
  onHover?: (c: Coord | null) => void
}

/**
 * One InstancedMesh per elevation level, so a block that stands three levels
 * high gets a correctly proportioned bevel instead of a stretched one.
 */
export function Terrain({ world, onPick, onHover }: TerrainProps) {
  const levels = useMemo(() => {
    const buckets: Array<{ level: number; tiles: Coord[] }> = []
    for (let level = 0; level <= MAX_ELEVATION; level++) buckets.push({ level, tiles: [] })
    for (let z = 0; z < world.h; z++) {
      for (let x = 0; x < world.w; x++) {
        const tile = world.tiles[idx(world.w, x, z)]
        const level = Math.max(0, Math.min(MAX_ELEVATION, Math.round(blockLevel(tile))))
        buckets[level].tiles.push({ x, z })
      }
    }
    return buckets.filter((b) => b.tiles.length > 0)
  }, [world])

  return (
    <group name="terrain">
      {levels.map((bucket) => (
        <TerrainLevel
          key={bucket.level}
          world={world}
          level={bucket.level}
          tiles={bucket.tiles}
          onPick={onPick}
          onHover={onHover}
        />
      ))}
    </group>
  )
}

function TerrainLevel({
  world,
  level,
  tiles,
  onPick,
  onHover,
}: TerrainProps & { level: number; tiles: Coord[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const height = SKIRT + level * STEP
  const geometry = useMemo(
    () => new RoundedBoxGeometry(TILE, height, TILE, 2, 0.05),
    [height],
  )
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 0.94, metalness: 0.02, flatShading: false })
    carveMaterial(m)
    return m
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useLayoutEffect(() => {
    const inst = mesh.current
    if (!inst) return
    const dummy = new Object3D()
    const colour = new Color()
    tiles.forEach((c, i) => {
      const [x, , z] = tileWorld(world, c)
      const tile = world.tiles[idx(world.w, c.x, c.z)]
      const top = surfaceY(blockLevel(tile))
      dummy.position.set(x, top - height / 2, z)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
      colour.setHex(tileColour(tile, c.x, c.z))
      inst.setColorAt(i, colour)
    })
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    inst.computeBoundingSphere()
  }, [world, tiles, height])

  const resolve = (event: ThreeEvent<PointerEvent>): Coord | null => {
    const id = event.instanceId
    if (id === undefined || id < 0 || id >= tiles.length) return null
    return tiles[id]
  }

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, tiles.length]}
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
    />
  )
}
