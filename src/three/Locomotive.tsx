import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { PALETTE } from './palette'

interface LocomotiveProps {
  night: boolean
  /** Metres per second the engine believes it is doing — drives the wheels and smoke. */
  rolling: number
  livery?: string
}

const SMOKE_PUFFS = 6

/**
 * A tank engine and one coach: boiler, cab, chimney, turning wheels, a lamp
 * that lights at night and a thread of smoke that thins as it rises.
 */
export function Locomotive({ night, rolling, livery = PALETTE.signal }: LocomotiveProps) {
  const wheels = useRef<Group>(null)
  const smoke = useRef<Group>(null)
  const clock = useRef(0)

  useFrame((_, dt) => {
    clock.current += dt
    if (wheels.current) {
      for (const child of wheels.current.children) child.rotation.x -= rolling * dt * 7
    }
    if (smoke.current) {
      smoke.current.children.forEach((puff, i) => {
        const life = ((clock.current * Math.max(0.35, rolling) * 0.9 + i / SMOKE_PUFFS) % 1)
        const mesh = puff as Mesh
        mesh.position.set(
          Math.sin(life * 6 + i) * 0.06 * life,
          0.1 + life * 0.66,
          -life * 0.24,
        )
        const grow = 0.045 + life * 0.16
        mesh.scale.setScalar(grow)
        const material = mesh.material as { opacity: number; transparent: boolean }
        material.transparent = true
        material.opacity = Math.max(0, (1 - life) * 0.42 * Math.min(1, rolling * 1.6))
      })
    }
  })

  return (
    <group>
      {/* chassis */}
      <mesh position={[0, 0.085, 0]} castShadow>
        <boxGeometry args={[0.19, 0.05, 0.52]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.7} />
      </mesh>
      {/* boiler */}
      <mesh position={[0, 0.155, 0.09]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.082, 0.082, 0.3, 16]} />
        <meshStandardMaterial color={livery} roughness={0.48} metalness={0.14} />
      </mesh>
      <mesh position={[0, 0.155, 0.245]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.086, 0.086, 0.03, 16]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.3} metalness={0.9} />
      </mesh>
      {/* cab */}
      <mesh position={[0, 0.19, -0.14]} castShadow>
        <boxGeometry args={[0.17, 0.17, 0.19]} />
        <meshStandardMaterial color={PALETTE.timberDark} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.295, -0.14]} castShadow>
        <boxGeometry args={[0.2, 0.022, 0.22]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.7} />
      </mesh>
      {/* chimney and dome */}
      <mesh position={[0, 0.255, 0.2]} castShadow>
        <cylinderGeometry args={[0.032, 0.042, 0.11, 12]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.225, 0.05]} castShadow>
        <sphereGeometry args={[0.04, 12, 8]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.28} metalness={0.9} />
      </mesh>
      {/* lamp */}
      <mesh position={[0, 0.17, 0.27]}>
        <sphereGeometry args={[0.026, 10, 8]} />
        <meshStandardMaterial
          color="#ffe9b8"
          emissive="#ffcd72"
          emissiveIntensity={night ? 2.4 : 0.5}
          roughness={0.3}
        />
      </mesh>
      {night && (
        <spotLight
          position={[0, 0.17, 0.28]}
          target-position={[0, 0, 3]}
          angle={0.55}
          penumbra={0.7}
          distance={4.2}
          intensity={5}
          color="#ffd79a"
        />
      )}

      {/* wheels */}
      <group ref={wheels}>
        {(
          [
            [-0.1, 0.055, 0.16],
            [0.1, 0.055, 0.16],
            [-0.1, 0.055, 0.0],
            [0.1, 0.055, 0.0],
            [-0.1, 0.055, -0.16],
            [0.1, 0.055, -0.16],
          ] as Array<[number, number, number]>
        ).map((p, i) => (
          <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.022, 12]} />
            <meshStandardMaterial color={PALETTE.ink} roughness={0.5} metalness={0.4} />
          </mesh>
        ))}
      </group>

      {/* one coach behind */}
      <group position={[0, 0, -0.52]}>
        <mesh position={[0, 0.17, 0]} castShadow>
          <boxGeometry args={[0.17, 0.16, 0.4]} />
          <meshStandardMaterial
            color={PALETTE.cream}
            roughness={0.62}
            emissive={night ? '#e0a856' : '#000000'}
            emissiveIntensity={night ? 0.5 : 0}
          />
        </mesh>
        <mesh position={[0, 0.262, 0]} castShadow>
          <boxGeometry args={[0.19, 0.028, 0.42]} />
          <meshStandardMaterial color={PALETTE.slate} roughness={0.6} />
        </mesh>
        {(
          [
            [-0.095, 0.05, 0.13],
            [0.095, 0.05, 0.13],
            [-0.095, 0.05, -0.13],
            [0.095, 0.05, -0.13],
          ] as Array<[number, number, number]>
        ).map((p, i) => (
          <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.042, 0.042, 0.02, 10]} />
            <meshStandardMaterial color={PALETTE.ink} roughness={0.5} metalness={0.4} />
          </mesh>
        ))}
      </group>

      {/* smoke */}
      <group ref={smoke} position={[0, 0.28, 0.2]}>
        {Array.from({ length: SMOKE_PUFFS }, (_, i) => (
          <mesh key={i} raycast={() => null}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#efe7da" transparent opacity={0.3} roughness={1} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
