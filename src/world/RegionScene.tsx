import { useEffect, useMemo, useRef } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three'
import { moodFor, type SceneMood } from '../three/palette'
import { REGION, generateRegion, heightAt, type Heightfield } from './heightfield'
import { buildSurface } from './terrainSurface'

/* ------------------------------------------------------------------ ground */

export function RegionTerrain({
  field,
  onHover,
}: {
  field: Heightfield
  onHover?: (point: { x: number; z: number } | null) => void
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
      castShadow
      onPointerMove={(e) => {
        e.stopPropagation()
        onHover?.({ x: e.point.x, z: e.point.z })
      }}
      onPointerOut={() => onHover?.(null)}
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
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, level, 0]}
      receiveShadow
      raycast={() => null}
    >
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

/**
 * A city-builder camera over a region you never see all at once: drag or WASD
 * to travel, wheel to zoom, and the pitch flattens as you descend so that
 * coming down to street level actually looks along the ground.
 */
export function RegionCamera({ field }: { field: Heightfield }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  /** Point on the ground the camera is looking at. */
  const focus = useRef(new Vector3(0, 0, 0))
  const distance = useRef(1800)
  const yaw = useRef(0.6)
  const held = useRef(new Set<string>())
  const dragging = useRef<{ x: number; y: number; button: number } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
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
      } else {
        // travel across the ground, scaled so it feels the same at any height
        const speed = distance.current * 0.0016
        const sin = Math.sin(yaw.current)
        const cos = Math.cos(yaw.current)
        focus.current.x -= (dx * cos - dy * sin) * speed
        focus.current.z -= (dx * sin + dy * cos) * speed
      }
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      distance.current = Math.max(90, Math.min(3400, distance.current * (1 + Math.sign(e.deltaY) * 0.12)))
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
  }, [gl])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const key = e.key.toLowerCase()
      if (key in PAN_KEYS && !e.metaKey && !e.ctrlKey) held.current.add(key)
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', () => held.current.clear())
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
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

    // stay over the region, and keep the focus on the ground
    const edge = REGION * 0.52
    focus.current.x = Math.max(-edge, Math.min(edge, focus.current.x))
    focus.current.z = Math.max(-edge, Math.min(edge, focus.current.z))
    focus.current.y = heightAt(field, focus.current.x, focus.current.z)

    // close in, the camera flattens out; far out, it looks down
    const t = Math.max(0, Math.min(1, (distance.current - 90) / 3300))
    const pitch = 0.22 + t * 0.72
    const d = distance.current
    const target = new Vector3(
      focus.current.x - Math.sin(yaw.current) * Math.cos(pitch) * d,
      focus.current.y + Math.sin(pitch) * d,
      focus.current.z - Math.cos(yaw.current) * Math.cos(pitch) * d,
    )
    camera.position.lerp(target, 0.22)
    camera.lookAt(focus.current)
  })

  return null
}

/* ------------------------------------------------------------------ scene */

export function RegionScene({ seed, night }: { seed: number; night: boolean }) {
  const field = useMemo(() => generateRegion({ seed }), [seed])
  const mood = moodFor(night)
  const hovered = useRef<Mesh | null>(null)

  return (
    <>
      <color attach="background" args={[mood.horizon]} />
      <fogExp2 attach="fog" args={[mood.fog, 0.00016]} />

      <hemisphereLight args={[mood.hemi.sky, mood.hemi.ground, mood.hemi.intensity]} />
      <directionalLight
        position={[1400, 2200, 900]}
        intensity={mood.sun.intensity}
        color={mood.sun.colour}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={2}
        shadow-camera-left={-1600}
        shadow-camera-right={1600}
        shadow-camera-top={1600}
        shadow-camera-bottom={-1600}
        shadow-camera-near={100}
        shadow-camera-far={6000}
      />
      <directionalLight position={[-900, 700, -1100]} intensity={mood.fill.intensity} color={mood.fill.colour} />

      <Sky mood={mood} />
      <Sea mood={mood} level={field.seaLevel} />
      <RegionTerrain field={field} onHover={() => (hovered.current = null)} />
      <RegionCamera field={field} />
    </>
  )
}
