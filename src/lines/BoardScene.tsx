import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { MapControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import {
  Matrix4,
  MOUSE,
  Quaternion,
  Vector3,
  type DirectionalLight,
  type InstancedMesh,
} from 'three'
import { canPlace, type Placed } from './board'
import { borderMarks, buildBoardGeometry, centreOf, hexAtPoint } from './geometry'
import { keyOf, type HexKey } from './hex'
import {
  BUFFER,
  HEX,
  HOUSE_ROOF,
  HOUSE_WALL,
  moodFor,
  STATION_ROOF,
  STATION_WALL,
  TREE,
  TREE_TRUNK,
} from './look'
import type { Tile } from './tiles'

const UP = new Vector3(0, 1, 0)

export interface BoardSceneProps {
  tiles: Placed
  held: Tile | null
  hovered: HexKey | null
  night: boolean
  onHover: (key: HexKey | null) => void
  onPlace: (key: HexKey) => void
}

export function BoardScene({ tiles, held, hovered, night, onHover, onPlace }: BoardSceneProps) {
  const mood = moodFor(night)
  const built = useMemo(() => buildBoardGeometry(tiles), [tiles])

  // The board grows, so the shadow camera is fitted to what is actually there
  // rather than to a guess. A fixed frustum either clips the far side of a big
  // board or wastes its whole resolution on an empty one.
  const reach = Math.max(8, (built.ground.boundingSphere?.radius ?? 8) + 4)

  useEffect(() => {
    return () => {
      built.ground.dispose()
      built.rails.dispose()
    }
  }, [built])

  return (
    <>
      <color attach="background" args={[mood.sky]} />
      <fogExp2 attach="fog" args={[mood.fog, mood.fogDensity]} />

      <ambientLight intensity={mood.ambient} />
      <hemisphereLight args={[mood.hemi.sky, mood.hemi.ground, mood.hemi.intensity]} />
      <Sun mood={mood} reach={reach} />

      <mesh geometry={built.ground} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
      </mesh>

      {built.rails.getAttribute('position').count > 0 && (
        <mesh geometry={built.rails} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.6} metalness={0.15} />
        </mesh>
      )}

      <Cluster items={built.trees} colour={TREE} lift={0.34} scale={[0.24, 0.5, 0.24]}>
        <coneGeometry args={[1, 1.4, 6]} />
      </Cluster>
      <Cluster items={built.trees} colour={TREE_TRUNK} lift={0.07} scale={[0.05, 0.12, 0.05]}>
        <cylinderGeometry args={[1, 1.2, 1.4, 5]} />
      </Cluster>

      <Cluster
        items={built.houses}
        colour={HOUSE_WALL}
        lift={0.09}
        scale={[0.17, 0.19, 0.17]}
        glow={mood.windows}
        glowStrength={mood.windowGlow * 0.55}
      >
        <boxGeometry args={[1, 1, 1]} />
      </Cluster>
      <Cluster items={built.houses} colour={HOUSE_ROOF} lift={0.24} scale={[0.17, 0.13, 0.17]}>
        <coneGeometry args={[1, 1, 4]} />
      </Cluster>

      <Cluster
        items={built.stations}
        colour={STATION_WALL}
        lift={0.11}
        scale={[0.3, 0.22, 0.19]}
        glow={mood.windows}
        glowStrength={mood.windowGlow * 0.8}
      >
        <boxGeometry args={[1, 1, 1]} />
      </Cluster>
      <Cluster items={built.stations} colour={STATION_ROOF} lift={0.28} scale={[0.4, 0.1, 0.3]}>
        <boxGeometry args={[1, 1, 1]} />
      </Cluster>

      <Cluster items={built.buffers} colour={BUFFER} lift={0.06} scale={[0.16, 0.1, 0.05]}>
        <boxGeometry args={[1, 1, 1]} />
      </Cluster>

      <Ghost tiles={tiles} held={held} hovered={hovered} />

      <Ground onHover={onHover} onPlace={onPlace} />

      <MapControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={6}
        maxDistance={70}
        maxPolarAngle={Math.PI / 2.35}
        mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
      />
    </>
  )
}

/**
 * One directional light, with its shadow frustum sized to the board. Kept in
 * its own component so refitting it does not re-render the whole scene.
 */
function Sun({ mood, reach }: { mood: ReturnType<typeof moodFor>; reach: number }) {
  const light = useRef<DirectionalLight>(null)

  useLayoutEffect(() => {
    const sun = light.current
    if (!sun) return
    const camera = sun.shadow.camera
    camera.left = -reach
    camera.right = reach
    camera.top = reach
    camera.bottom = -reach
    camera.near = 0.5
    camera.far = reach * 4
    camera.updateProjectionMatrix()
    sun.shadow.bias = -0.0012
    sun.shadow.normalBias = 0.02
  }, [reach])

  return (
    <directionalLight
      ref={light}
      castShadow
      color={mood.sun.colour}
      intensity={mood.sun.intensity}
      position={mood.sun.position}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
    />
  )
}

/**
 * Instanced scenery. Capacity is rounded up in blocks, because `args` changing
 * makes React Three Fiber build a whole new InstancedMesh — and the item count
 * changes on every single placement.
 */
function Cluster({
  items,
  colour,
  lift,
  scale,
  glow,
  glowStrength = 0,
  children,
}: {
  items: Array<{ x: number; z: number; scale: number; turn: number }>
  colour: string
  lift: number
  scale: [number, number, number]
  /** Lit windows, after dark. */
  glow?: string
  glowStrength?: number
  children: ReactNode
}) {
  const mesh = useRef<InstancedMesh>(null)
  const capacity = Math.max(32, Math.ceil((items.length + 1) / 128) * 128)

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return

    const matrix = new Matrix4()
    const position = new Vector3()
    const rotation = new Quaternion()
    const size = new Vector3()

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      position.set(item.x, lift * item.scale, item.z)
      rotation.setFromAxisAngle(UP, item.turn)
      size.set(scale[0] * item.scale, scale[1] * item.scale, scale[2] * item.scale)
      target.setMatrixAt(i, matrix.compose(position, rotation, size))
    }

    target.count = items.length
    target.instanceMatrix.needsUpdate = true
    target.computeBoundingSphere()
  }, [items, lift, scale])

  if (items.length === 0) return null

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, capacity]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      {children}
      <meshStandardMaterial
        color={colour}
        roughness={0.85}
        emissive={glow ?? '#000000'}
        emissiveIntensity={glowStrength}
      />
    </instancedMesh>
  )
}

/**
 * The tile about to be placed, floating over the hex under the pointer, with a
 * mark on every border it would settle. Showing the answer before the player
 * commits is the difference between a puzzle and a guess.
 */
function Ghost({ tiles, held, hovered }: { tiles: Placed; held: Tile | null; hovered: HexKey | null }) {
  const preview = useMemo(() => {
    if (!held || hovered === null) return null
    return buildBoardGeometry(new Map([[hovered, held]]))
  }, [held, hovered])

  const marks = useMemo(() => {
    if (!held || hovered === null) return []
    return borderMarks(tiles, hovered, held)
  }, [tiles, held, hovered])

  useEffect(() => {
    if (!preview) return
    return () => {
      preview.ground.dispose()
      preview.rails.dispose()
    }
  }, [preview])

  if (!preview || hovered === null || !held) return null

  const centre = centreOf(hovered)

  /* Over a hex the tile cannot go, only the outline is drawn. Floating a whole
   * tile over somewhere it will never land reads as an offer rather than a
   * refusal, and over an occupied hex it hides the tile already there. */
  if (!canPlace(tiles, hovered)) {
    return (
      <mesh position={[centre.x, 0.05, centre.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[HEX * 0.52, HEX * 0.62, 6]} />
        <meshBasicMaterial color="#c4562f" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    )
  }

  return (
    <group position={[0, 0.32, 0]}>
      <mesh geometry={preview.ground}>
        <meshStandardMaterial vertexColors transparent opacity={0.85} roughness={0.9} depthWrite={false} />
      </mesh>
      {preview.rails.getAttribute('position').count > 0 && (
        <mesh geometry={preview.rails}>
          <meshStandardMaterial vertexColors transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}

      {marks.map((mark, index) => (
        <mesh key={index} position={[mark.x, -0.28, mark.z]} rotation={[0, mark.turn, 0]} renderOrder={2}>
          <boxGeometry args={[0.5 * HEX, 0.06, 0.1]} />
          <meshBasicMaterial color={mark.broken ? '#c4562f' : '#f2e9c8'} transparent opacity={0.95} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The ground plane the pointer is actually tested against. Raycasting one
 * plane and doing the arithmetic beats giving every tile a collider, and it
 * keeps working over hexes that have nothing in them yet — which is exactly
 * where the player is trying to point.
 */
function Ground({
  onHover,
  onPlace,
}: {
  onHover: (key: HexKey | null) => void
  onPlace: (key: HexKey) => void
}) {
  const { size } = useThree()
  const down = useRef<{ x: number; y: number } | null>(null)

  const keyAt = (x: number, z: number): HexKey => {
    const { q, r } = hexAtPoint(x, z, HEX)
    return keyOf(q, r)
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerMove={(event) => {
        onHover(keyAt(event.point.x, event.point.z))
      }}
      onPointerOut={() => onHover(null)}
      onPointerDown={(event) => {
        down.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        const start = down.current
        down.current = null
        if (!start) return
        // A drag is how the camera is moved, so only a press that stayed put
        // counts as placing something. Scaled to the viewport so the same
        // wobble is forgiven on a phone as on a desktop.
        const slack = Math.max(6, size.width * 0.008)
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > slack) return
        onPlace(keyAt(event.point.x, event.point.z))
      }}
    >
      <planeGeometry args={[600, 600]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
