import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { playSfx } from '../audio/engine'
import type { Coord, RailLine, Speed, World } from '../game/types'
import { SPEED_UNITS, TrainRunner, buildRailPath, poseAt, type RailPath } from './geometry'
import { PALETTE } from './palette'
import { Locomotive } from './Locomotive'

const LIVERIES = [PALETTE.signal, PALETTE.slate, '#6f8259', '#8a6a44', '#7a5b74']

interface RunningTrainProps {
  path: RailPath
  speed: number
  running: boolean
  night: boolean
  offset: number
  livery: string
  announceStops?: boolean
}

function RunningTrain({
  path,
  speed,
  running,
  night,
  offset,
  livery,
  announceStops,
}: RunningTrainProps) {
  const group = useRef<Group>(null)
  const rolling = useRef(0)
  const runner = useMemo(
    () => new TrainRunner(path, { speed, offset, stationPause: 1.6, endPause: 1.4 }),
    // A new runner per path keeps the train on its own line after an edit.
    [path, speed, offset],
  )
  const waiting = useRef(false)

  useEffect(() => {
    const pose = runner.pose()
    group.current?.position.set(...pose.position)
  }, [runner])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    const before = runner.distance
    if (running) runner.update(step)
    const moved = Math.abs(runner.distance - before)
    rolling.current += (moved / Math.max(step, 1e-4) - rolling.current) * 0.2
    const pose = runner.pose()
    const g = group.current
    if (!g) return
    g.position.set(...pose.position)
    g.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')

    if (announceStops) {
      const stopped = running && moved < 1e-4
      if (stopped && !waiting.current) playSfx('arrive')
      waiting.current = stopped
    }
  })

  return (
    <group ref={group}>
      <Locomotive night={night} rolling={running ? Math.max(0.25, rolling.current) : 0} livery={livery} />
    </group>
  )
}

interface FreeTrainsProps {
  world: World
  lines: RailLine[]
  count: number
  speed: Speed
  running: boolean
  night: boolean
}

/** Up to five engines, spread across whatever lines the player has built. */
export function FreeTrains({ world, lines, count, speed, running, night }: FreeTrainsProps) {
  const paths = useMemo(
    () =>
      lines
        .filter((l) => l.tiles.length >= 2)
        .map((l) => ({ id: l.id, path: buildRailPath(world, l.tiles) }))
        .filter((p) => p.path.length > 0.2),
    [world, lines],
  )

  const assignments = useMemo(() => {
    if (paths.length === 0) return []
    const perLine = new Map<string, number>()
    const out: Array<{ key: string; path: RailPath; offset: number; livery: string }> = []
    for (let i = 0; i < count; i++) {
      const target = paths[i % paths.length]
      const seen = perLine.get(target.id) ?? 0
      perLine.set(target.id, seen + 1)
      out.push({
        key: `${target.id}-${seen}`,
        path: target.path,
        offset: target.path.closed ? seen / Math.max(1, Math.ceil(count / paths.length)) : seen * 0.12,
        livery: LIVERIES[i % LIVERIES.length],
      })
    }
    return out
  }, [paths, count])

  return (
    <group name="trains" raycast={() => null}>
      {assignments.map((a) => (
        <RunningTrain
          key={a.key}
          path={a.path}
          speed={SPEED_UNITS[speed]}
          running={running}
          night={night}
          offset={a.offset}
          livery={a.livery}
          announceStops
        />
      ))}
    </group>
  )
}

interface DeliveryTrainProps {
  world: World
  tiles: Coord[]
  running: boolean
  night: boolean
  onArrive: () => void
}

/** The campaign engine: one run from the depot to the destination, then it stops. */
export function DeliveryTrain({ world, tiles, running, night, onArrive }: DeliveryTrainProps) {
  const group = useRef<Group>(null)
  const distance = useRef(0)
  const arrived = useRef(false)
  const path = useMemo(() => buildRailPath(world, tiles), [world, tiles])

  useEffect(() => {
    distance.current = 0
    arrived.current = false
  }, [path, running])

  useFrame((_, dt) => {
    const g = group.current
    if (!g || path.length <= 0) return
    if (running && !arrived.current) {
      distance.current = Math.min(path.length, distance.current + SPEED_UNITS.normal * Math.min(dt, 0.05))
      if (distance.current >= path.length - 1e-4) {
        arrived.current = true
        onArrive()
      }
    }
    const pose = poseAt(path, distance.current)
    g.position.set(...pose.position)
    g.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')
  })

  if (tiles.length < 2) return null
  return (
    <group ref={group} name="delivery-train" raycast={() => null}>
      <Locomotive night={night} rolling={running && !arrived.current ? 1 : 0} />
    </group>
  )
}
