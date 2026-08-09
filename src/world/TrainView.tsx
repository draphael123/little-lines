import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { components, componentPath, type RailNetwork } from './rail'
import { SPEEDS, TrainRunner, makePath, type Pose, type SpeedName } from './trainRun'

const LIVERIES = ['#8d3b2c', '#2f5670', '#41603c', '#6a5730', '#5c4257']

export interface TrainState {
  key: string
  runner: TrainRunner
  livery: string
}

/**
 * Builds one runner per train and hands their poses back every frame, so the
 * scene can draw them and the camera can ride one.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTrains(
  network: RailNetwork,
  roster: number,
  speed: SpeedName,
): TrainState[] {
  return useMemo(() => {
    const groups = components(network)
    if (groups.length === 0) return []
    const out: TrainState[] = []
    for (let i = 0; i < roster; i++) {
      const group = groups[i % groups.length]
      const path = makePath(componentPath(network, group))
      if (path.length < 40) continue
      const seen = out.filter((t) => t.key.startsWith(`g${i % groups.length}-`)).length
      out.push({
        key: `g${i % groups.length}-${seen}`,
        runner: new TrainRunner(path, SPEEDS[speed], (seen * 0.37) % 1),
        livery: LIVERIES[i % LIVERIES.length],
      })
    }
    return out
  }, [network, roster, speed])
}

/** A tank engine and two coaches, at metre scale. */
function Locomotive({ livery, night }: { livery: string; night: boolean }) {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[3, 0.7, 12]} />
        <meshStandardMaterial color="#23262a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.7, 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.5, 1.5, 7, 14]} />
        <meshStandardMaterial color={livery} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 3.2, -3.2]} castShadow>
        <boxGeometry args={[3.1, 3, 4.4]} />
        <meshStandardMaterial color="#31343a" roughness={0.65} />
      </mesh>
      <mesh position={[0, 4.5, 5]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 2, 10]} />
        <meshStandardMaterial color="#1c1e22" roughness={0.7} />
      </mesh>
      <mesh position={[0, 3, 6.1]}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial
          color="#ffe9b8"
          emissive="#ffcd72"
          emissiveIntensity={night ? 3 : 0.6}
        />
      </mesh>
      {night && (
        <spotLight
          position={[0, 3, 6.4]}
          target-position={[0, 0, 90]}
          angle={0.5}
          penumbra={0.7}
          distance={180}
          intensity={900}
          color="#ffd79a"
        />
      )}
      {[0, 1].map((i) => (
        <group key={i} position={[0, 0, -14 - i * 13]}>
          <mesh position={[0, 2.6, 0]} castShadow>
            <boxGeometry args={[3, 3.2, 11]} />
            <meshStandardMaterial
              color="#d8d2c4"
              roughness={0.6}
              emissive={night ? '#e0a856' : '#000000'}
              emissiveIntensity={night ? 0.55 : 0}
            />
          </mesh>
          <mesh position={[0, 4.3, 0]} castShadow>
            <boxGeometry args={[3.2, 0.4, 11.4]} />
            <meshStandardMaterial color="#4a5058" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Trains({
  trains,
  running,
  night,
  onPose,
}: {
  trains: TrainState[]
  running: boolean
  night: boolean
  /** Reports the pose of the train being followed, if any. */
  onPose?: (index: number, pose: Pose) => void
}) {
  const groups = useRef<Array<Group | null>>([])

  useEffect(() => {
    groups.current = groups.current.slice(0, trains.length)
  }, [trains])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    trains.forEach((train, i) => {
      if (running) train.runner.update(step)
      const pose = train.runner.pose()
      const g = groups.current[i]
      if (g) {
        g.position.set(...pose.position)
        g.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')
      }
      onPose?.(i, pose)
    })
  })

  return (
    <group name="trains" raycast={() => null}>
      {trains.map((train, i) => (
        <group
          key={train.key}
          ref={(el) => {
            groups.current[i] = el
          }}
        >
          <Locomotive livery={train.livery} night={night} />
        </group>
      ))}
    </group>
  )
}
