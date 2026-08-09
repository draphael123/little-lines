import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import type { Coord, World } from '../game/types'
import { tileWorld } from './geometry'
import { PALETTE } from './palette'

/** A post with a coloured disc — the game's one piece of signage. */
function SignalPost({
  world,
  at,
  colour,
  height = 0.52,
}: {
  world: World
  at: Coord
  colour: string
  height?: number
}) {
  const [x, y, z] = tileWorld(world, at)
  return (
    <group position={[x - 0.34, y, z - 0.34]} raycast={() => null}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.06, 12]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.8} />
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, height, 8]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.7} />
      </mesh>
      <mesh position={[0, height, 0.02]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.018, 16]} />
        <meshStandardMaterial color={colour} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, height, 0.031]}>
        <torusGeometry args={[0.075, 0.008, 8, 20]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.3} metalness={0.9} />
      </mesh>
    </group>
  )
}

function TilePlate({
  world,
  at,
  colour,
  opacity = 0.85,
  inner = 0.3,
  outer = 0.4,
  /** A square outline follows the tile edges; a disc marks a place. */
  square = false,
  lift = 0.012,
}: {
  world: World
  at: Coord
  colour: string
  opacity?: number
  inner?: number
  outer?: number
  square?: boolean
  lift?: number
}) {
  const [x, y, z] = tileWorld(world, at)
  return (
    <mesh
      position={[x, y + lift, z]}
      rotation={[-Math.PI / 2, 0, square ? Math.PI / 4 : 0]}
      raycast={() => null}
    >
      <ringGeometry args={[inner, outer, square ? 4 : 32, 1]} />
      <meshBasicMaterial color={colour} transparent opacity={opacity} />
    </mesh>
  )
}

export interface SettlementMark {
  at: Coord
  growing: boolean
}

interface MarkersProps {
  world: World
  depot?: Coord | null
  destination?: Coord | null
  stops?: Coord[]
  stopsServed?: string[]
  settlements?: SettlementMark[]
  hovered?: Coord | null
  hoverTone?: 'good' | 'bad' | 'neutral'
  hint?: Coord | null
}

export function Markers({
  world,
  depot,
  destination,
  stops = [],
  stopsServed = [],
  settlements = [],
  hovered,
  hoverTone = 'neutral',
  hint,
}: MarkersProps) {
  return (
    <group name="markers" raycast={() => null}>
      {settlements.map((s) => (
        <TilePlate
          key={`town-${s.at.x}-${s.at.z}`}
          world={world}
          at={s.at}
          colour={s.growing ? '#6f8259' : PALETTE.brass}
          opacity={s.growing ? 0.55 : 0.85}
          inner={0.41}
          outer={0.48}
        />
      ))}
      {depot && (
        <>
          <TilePlate world={world} at={depot} colour="#f3ead8" opacity={0.9} />
          <SignalPost world={world} at={depot} colour="#f3ead8" />
        </>
      )}
      {destination && (
        <>
          <TilePlate world={world} at={destination} colour={PALETTE.danger} opacity={0.9} />
          <SignalPost world={world} at={destination} colour={PALETTE.danger} height={0.62} />
        </>
      )}
      {stops.map((s) => (
        <group key={`stop-${s.x}-${s.z}`}>
          <TilePlate
            world={world}
            at={s}
            colour={stopsServed.includes(`${s.x},${s.z}`) ? '#6f8259' : PALETTE.brass}
            opacity={0.9}
          />
          <SignalPost
            world={world}
            at={s}
            colour={stopsServed.includes(`${s.x},${s.z}`) ? '#6f8259' : PALETTE.brass}
            height={0.42}
          />
        </group>
      ))}
      {hovered && (
        <TilePlate
          world={world}
          at={hovered}
          colour={hoverTone === 'bad' ? PALETTE.danger : hoverTone === 'good' ? '#f2f7ea' : '#e0dacb'}
          opacity={hoverTone === 'bad' ? 0.8 : 0.95}
          inner={0.62}
          outer={0.71}
          square
          lift={0.02}
        />
      )}
      {hint && <HintRing world={world} at={hint} />}
    </group>
  )
}

function HintRing({ world, at }: { world: World; at: Coord }) {
  const mesh = useRef<Mesh>(null)
  const [x, y, z] = tileWorld(world, at)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const s = 1 + Math.sin(t * 3.4) * 0.12
    mesh.current?.scale.set(s, s, 1)
  })
  return (
    <mesh
      ref={mesh}
      position={[x, y + 0.016, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
    >
      <ringGeometry args={[0.26, 0.42, 24]} />
      <meshBasicMaterial color={PALETTE.danger} transparent opacity={0.85} />
    </mesh>
  )
}
