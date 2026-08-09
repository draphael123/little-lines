import { useEffect, useMemo, useRef, useState } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  Vector3,
  type InstancedMesh,
  type PerspectiveCamera,
} from 'three'
import { moodFor, type SceneMood } from './palette'
import type { Structure } from './buildings'
import { REGION, generateRegion, heightAt, type Heightfield } from './heightfield'
import { RailPreview, RailView } from './RailView'
import { layEdge, nearestEdge, type LayResult, type RailNetwork, type Vec3 } from './rail'
import { keepClear, scatterTrees } from './scatter'
import { StructureView } from './StructureView'
import { buildSurface } from './terrainSurface'
import { planCountry } from './townLayout'
import type { Settlement } from './towns'
import { Buildings, Roads, Woods } from './TownView'
import { Trains, useTrains } from './TrainView'
import type { Pose, SpeedName } from './trainRun'

export type RegionTool = 'look' | 'rail' | 'raise' | 'lower' | 'build' | 'demolish'
export type ViewMode = 'free' | 'follow' | 'cab'

/* ------------------------------------------------------------------ ground */

function RegionTerrain({
  field,
  onHover,
  onDown,
  onUp,
}: {
  field: Heightfield
  onHover?: (point: { x: number; z: number } | null) => void
  onDown?: (point: { x: number; z: number }) => void
  onUp?: (point: { x: number; z: number }) => void
}) {
  const geometry = useMemo(() => {
    const surface = buildSurface(field)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(surface.positions, 3))
    g.setAttribute('normal', new BufferAttribute(surface.normals, 3))
    g.setAttribute('color', new BufferAttribute(surface.colors, 3))
    g.setIndex(new BufferAttribute(surface.indices, 1))
    g.computeBoundingSphere()
    return g
  }, [field])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      name="region-terrain"
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation()
        onHover?.({ x: e.point.x, z: e.point.z })
      }}
      onPointerOut={() => onHover?.(null)}
      onPointerDown={(e) => e.button === 0 && onDown?.({ x: e.point.x, z: e.point.z })}
      onPointerUp={(e) => e.button === 0 && onUp?.({ x: e.point.x, z: e.point.z })}
    >
      <meshStandardMaterial vertexColors roughness={0.97} metalness={0} />
    </mesh>
  )
}

/* -------------------------------------------------------------- sky & sea */

function Sky({ mood }: { mood: SceneMood }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new Color(mood.sky) },
          bottom: { value: new Color(mood.horizon) },
        },
        vertexShader: `
          varying float vH;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vH = normalize(world.xyz).y;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform vec3 top; uniform vec3 bottom; varying float vH;
          void main() {
            gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.06, 0.5, vH)), 1.0);
          }
        `,
      }),
    [mood.sky, mood.horizon],
  )
  return (
    <mesh material={material} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[REGION * 2.4, 24, 16]} />
    </mesh>
  )
}

function Sea({ mood, level }: { mood: SceneMood; level: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, level, 0]} receiveShadow raycast={() => null}>
      <planeGeometry args={[REGION * 5, REGION * 5]} />
      <MeshReflectorMaterial
        color={mood.sea}
        resolution={512}
        mirror={0.35}
        mixBlur={4}
        mixStrength={1.2}
        blur={[400, 120]}
        depthScale={1.1}
        minDepthThreshold={0.2}
        maxDepthThreshold={1.6}
        roughness={mood.seaRoughness}
        metalness={0.3}
        transparent
        opacity={0.94}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ camera */

const PAN_KEYS: Record<string, [number, number]> = {
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
}

interface CameraProps {
  field: Heightfield
  /** Left-drag travels only when the look tool is out. */
  freeDrag: boolean
  view: ViewMode
  ridePose: React.RefObject<Pose | null>
}

/**
 * Three ways to watch the country: travel over it freely, follow a train from
 * behind, or ride in the cab. The free camera flattens its pitch as it comes
 * down, so street level looks along the ground rather than down at it.
 */
function RegionCamera({ field, freeDrag, view, ridePose }: CameraProps) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const focus = useRef(new Vector3(0, 0, 0))
  const distance = useRef(1500)
  const yaw = useRef(0.6)
  const held = useRef(new Set<string>())
  const dragging = useRef<{ x: number; y: number; button: number } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      if (!freeDrag && e.button === 0) return
      dragging.current = { x: e.clientX, y: e.clientY, button: e.button }
    }
    const up = () => {
      dragging.current = null
    }
    const move = (e: PointerEvent) => {
      const drag = dragging.current
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      if (drag.button === 2 || e.shiftKey) {
        yaw.current -= dx * 0.005
        return
      }
      const speed = distance.current * 0.0016
      const sin = Math.sin(yaw.current)
      const cos = Math.cos(yaw.current)
      focus.current.x -= (dx * cos - dy * sin) * speed
      focus.current.z -= (dx * sin + dy * cos) * speed
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      distance.current = Math.max(60, Math.min(3400, distance.current * (1 + Math.sign(e.deltaY) * 0.12)))
    }
    const context = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointermove', move)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', context)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointermove', move)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', context)
    }
  }, [gl, freeDrag])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const key = e.key.toLowerCase()
      if (key in PAN_KEYS && !e.metaKey && !e.ctrlKey) held.current.add(key)
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase())
    const blur = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)

    if (view !== 'free' && ridePose.current) {
      const pose = ridePose.current
      const [px, py, pz] = pose.position
      const fx = Math.sin(pose.yaw)
      const fz = Math.cos(pose.yaw)
      const target =
        view === 'cab'
          ? new Vector3(px + fx * 2, py + 4.4, pz + fz * 2)
          : new Vector3(px - fx * 48 + 8, py + 21, pz - fz * 48)
      camera.position.lerp(target, view === 'cab' ? 0.6 : 0.12)
      camera.lookAt(px + fx * 140, py + (view === 'cab' ? 1 : -8), pz + fz * 140)
      // keep the free camera where the train is, so leaving the ride is smooth
      focus.current.set(px, py, pz)
      return
    }

    if (held.current.size > 0) {
      const speed = distance.current * 0.9 * step
      const sin = Math.sin(yaw.current)
      const cos = Math.cos(yaw.current)
      for (const key of held.current) {
        const [kx, kz] = PAN_KEYS[key]
        focus.current.x += (kx * cos - kz * sin) * speed
        focus.current.z += (kx * sin + kz * cos) * speed
      }
    }

    const edge = REGION * 0.52
    focus.current.x = Math.max(-edge, Math.min(edge, focus.current.x))
    focus.current.z = Math.max(-edge, Math.min(edge, focus.current.z))
    focus.current.y = heightAt(field, focus.current.x, focus.current.z)

    const t = Math.max(0, Math.min(1, (distance.current - 60) / 3340))
    const pitch = 0.16 + t * 0.78
    const d = distance.current
    camera.position.lerp(
      new Vector3(
        focus.current.x - Math.sin(yaw.current) * Math.cos(pitch) * d,
        focus.current.y + Math.sin(pitch) * d,
        focus.current.z - Math.cos(yaw.current) * Math.cos(pitch) * d,
      ),
      0.22,
    )
    camera.lookAt(focus.current)
  })

  return null
}

/* ------------------------------------------------------------------ scene */

export interface RegionSceneProps {
  seed: number
  night: boolean
  network: RailNetwork
  structures: Structure[]
  settlements: Settlement[]
  tool: RegionTool
  view: ViewMode
  lift: number
  trains: number
  speed: SpeedName
  running: boolean
  onLay: (result: LayResult) => void
  onAdjust: (edgeId: string, delta: number) => void
  onPlace: (x: number, z: number, y: number) => void
  onDemolish: (x: number, z: number) => void
  onStatus: (text: string, ok: boolean) => void
  onHover: (point: { x: number; z: number } | null) => void
}

export function RegionScene(props: RegionSceneProps) {
  const {
    seed, night, network, structures, settlements, tool, view, lift,
    trains: roster, speed, running,
    onLay, onAdjust, onPlace, onDemolish, onStatus, onHover,
  } = props

  const field = useMemo(() => generateRegion({ seed }), [seed])
  const mood = moodFor(night)
  const [preview, setPreview] = useState<{ points: Vec3[]; ok: boolean } | null>(null)
  const anchor = useRef<{ x: number; z: number } | null>(null)
  const ridePose = useRef<Pose | null>(null)

  const trainStates = useTrains(network, roster, speed)

  /** Ground the towns and the woods must leave alone. */
  const railPoints = useMemo(
    () => network.edges.flatMap((e) => e.points.map((p) => ({ x: p[0], z: p[2] }))),
    [network],
  )
  const nearRail = useMemo(() => keepClear(railPoints, 26), [railPoints])

  const country = useMemo(
    () => planCountry(field, settlements, nearRail),
    [field, settlements, nearRail],
  )

  const trees = useMemo(() => {
    const nearTown = keepClear(
      settlements.map((s) => ({ x: s.x, z: s.z })),
      260,
    )
    return scatterTrees(field, {
      spacing: 30,
      taken: (x, z) => nearRail(x, z) || nearTown(x, z),
    })
  }, [field, settlements, nearRail])

  /* ---- pointer work */
  const beginDrag = (point: { x: number; z: number }) => {
    if (tool !== 'rail') return
    anchor.current = point
    setPreview(null)
  }

  const moveTo = (point: { x: number; z: number } | null) => {
    onHover(point)
    if (tool !== 'rail' || !anchor.current || !point) return
    const result = layEdge(field, network, anchor.current, point, { lift })
    setPreview(
      result.ok && result.edge
        ? { points: result.edge.points, ok: true }
        : { points: straight(field, anchor.current, point), ok: false },
    )
  }

  const endDrag = (point: { x: number; z: number }) => {
    if (tool === 'build') {
      onPlace(point.x, point.z, heightAt(field, point.x, point.z))
      return
    }
    if (tool === 'demolish') {
      onDemolish(point.x, point.z)
      return
    }
    if (tool === 'raise' || tool === 'lower') {
      const hit = nearestEdge(network, point.x, point.z)
      if (!hit) {
        onStatus('No line near enough to raise or lower.', false)
        return
      }
      onAdjust(hit.edge.id, tool === 'raise' ? 4 : -4)
      return
    }
    if (tool !== 'rail' || !anchor.current) return
    const from = anchor.current
    anchor.current = null
    setPreview(null)
    const result = layEdge(field, network, from, point, { lift })
    if (!result.ok) {
      onStatus(result.reason ?? 'That line cannot be built.', false)
      return
    }
    onLay(result)
  }

  return (
    <>
      <color attach="background" args={[mood.horizon]} />
      <fogExp2 attach="fog" args={[mood.fog, 0.00015]} />

      <hemisphereLight args={[mood.hemi.sky, mood.hemi.ground, mood.hemi.intensity]} />
      <directionalLight
        position={[1400, 2200, 900]}
        intensity={mood.sun.intensity}
        color={mood.sun.colour}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={2}
        shadow-camera-left={-1700}
        shadow-camera-right={1700}
        shadow-camera-top={1700}
        shadow-camera-bottom={-1700}
        shadow-camera-near={100}
        shadow-camera-far={6000}
      />
      <directionalLight
        position={[-900, 700, -1100]}
        intensity={mood.fill.intensity}
        color={mood.fill.colour}
      />

      <Sky mood={mood} />
      <Sea mood={mood} level={field.seaLevel} />
      <RegionTerrain field={field} onHover={moveTo} onDown={beginDrag} onUp={endDrag} />

      <Woods trees={trees} />
      <Roads field={field} roads={country.roads} />
      <Buildings buildings={country.buildings} night={night} />

      <RailView field={field} network={network} />
      <StructureView structures={structures} night={night} />
      <RailPreview points={preview?.points ?? null} ok={preview?.ok ?? true} />

      <Trains
        trains={trainStates}
        running={running}
        night={night}
        onPose={(i, pose) => {
          if (i === 0) ridePose.current = pose
        }}
      />

      <RegionCamera field={field} freeDrag={tool === 'look'} view={view} ridePose={ridePose} />
      <Inspector />
    </>
  )
}

/**
 * A testing seam. A hidden or backgrounded tab never fires requestAnimationFrame,
 * so the canvas can be perfectly correct and still show nothing — indistinguishable
 * from a broken scene. This exposes the renderer so a frame can be forced at a
 * chosen size and read back as pixels. Development only; stripped from the build.
 */
function Inspector() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { LITTLE_LINES?: unknown }
    w.LITTLE_LINES = {
      /** Renders one frame at the given size and returns it as a PNG data URL. */
      shoot(width = 1440, height = 900) {
        const cam = camera as PerspectiveCamera
        gl.setSize(width, height, false)
        cam.aspect = width / height
        cam.updateProjectionMatrix()
        gl.render(scene, cam)
        return gl.domElement.toDataURL('image/png')
      },
      scene,
      gl,
      camera,
      /** What is actually in the scene, by name and instance count. */
      census() {
        const out: Record<string, number> = {}
        scene.traverse((o) => {
          const key = o.name || o.type
          out[key] = (out[key] ?? 0) + ((o as InstancedMesh).count ?? 1)
        })
        return { objects: out, camera: camera.position.toArray() }
      },
    }
    return () => {
      delete w.LITTLE_LINES
    }
  }, [gl, scene, camera])

  return null
}

/** A straight run along the ground, used to show a refused line in red. */
function straight(field: Heightfield, a: { x: number; z: number }, b: { x: number; z: number }): Vec3[] {
  const out: Vec3[] = []
  const steps = 28
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    out.push([x, heightAt(field, x, z) + 2, z])
  }
  return out
}
