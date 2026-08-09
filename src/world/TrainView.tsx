import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type Group, type InstancedMesh } from 'three'
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

/* -------------------------------------------------------------------- steam */

const PUFFS = 90
const PUFF_LIFE = 4.2

/**
 * Chimney smoke, pooled.
 *
 * One instanced mesh for every train on the network: a puff is emitted from
 * whichever chimney is working, then left behind in world space to rise, swell
 * and fade, so the smoke trails along the line the train has just come down
 * rather than riding with it. A fixed pool means no allocation per frame and a
 * hard ceiling on the cost.
 */
export function Steam({ trains, running }: { trains: TrainState[]; running: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const pool = useMemo(
    () =>
      Array.from({ length: PUFFS }, () => ({
        age: Infinity,
        x: 0,
        y: 0,
        z: 0,
        drift: 0,
        spin: 0,
        size: 1,
      })),
    [],
  )
  const dummy = useMemo(() => new Object3D(), [])
  const cursor = useRef(0)
  const since = useRef(0)

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    const instances = mesh.current
    if (!instances) return

    // Emit: one puff per working chimney, at a steady interval.
    if (running && trains.length > 0) {
      since.current += step
      const gap = 0.16
      while (since.current >= gap) {
        since.current -= gap
        for (const train of trains) {
          if (!train.runner.moving) continue
          const pose = train.runner.pose()
          const puff = pool[cursor.current % PUFFS]
          cursor.current++
          puff.age = 0
          puff.x = pose.position[0] + Math.sin(pose.yaw) * 5
          puff.y = pose.position[1] + 5.4
          puff.z = pose.position[2] + Math.cos(pose.yaw) * 5
          puff.drift = (cursor.current % 7) * 0.12 - 0.36
          puff.spin = (cursor.current % 11) * 0.57
          puff.size = 1 + (cursor.current % 5) * 0.14
        }
      }
    }

    let drawn = 0
    for (const puff of pool) {
      if (puff.age > PUFF_LIFE) continue
      puff.age += step
      if (puff.age > PUFF_LIFE) continue
      const t = puff.age / PUFF_LIFE
      dummy.position.set(
        puff.x + puff.drift * puff.age * 3.5,
        puff.y + puff.age * 5.2,
        puff.z + puff.drift * puff.age * 1.6,
      )
      // swelling as it cools, and turning over as it goes
      const size = (1.6 + t * 7) * puff.size
      dummy.scale.setScalar(size)
      dummy.rotation.set(0, puff.spin + t, 0)
      dummy.updateMatrix()
      instances.setMatrixAt(drawn, dummy.matrix)
      drawn++
    }
    instances.count = drawn
    instances.instanceMatrix.needsUpdate = true

    // One opacity for the whole pool: individually fading each puff would mean
    // a material per instance. The oldest puffs are the largest, so swelling
    // alone reads convincingly as dispersal.
    const material = instances.material as { opacity: number }
    material.opacity = 0.3
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, PUFFS]}
      frustumCulled={false}
      raycast={() => null}
    >
      <sphereGeometry args={[1, 7, 6]} />
      <meshStandardMaterial color="#e8e4dc" transparent opacity={0.3} roughness={1} depthWrite={false} />
    </instancedMesh>
  )
}
