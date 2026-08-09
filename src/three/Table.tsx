import { useMemo } from 'react'
import type { World } from '../game/types'
import { SKIRT, tableSize } from './geometry'
import { PALETTE } from './palette'

const RAIL_WIDTH = 0.62
const RIM = 0.16

/**
 * The surveyor's table the whole layout sits on: a painted timber frame with a
 * brass rule, corner fittings and a couple of instruments, plus legs so the
 * thing reads as furniture from a low camera.
 */
export function Table({ world }: { world: World }) {
  const [w, d] = useMemo(() => tableSize(world), [world])
  const frameW = w + RAIL_WIDTH * 2
  const frameD = d + RAIL_WIDTH * 2
  const deckY = -SKIRT
  const frameTop = -SKIRT + 0.16
  const frameH = 0.46
  const frameCentreY = frameTop - frameH / 2

  const legInset = 0.55
  const legH = 2.6
  const legPositions: Array<[number, number]> = [
    [frameW / 2 - legInset, frameD / 2 - legInset],
    [-frameW / 2 + legInset, frameD / 2 - legInset],
    [frameW / 2 - legInset, -frameD / 2 + legInset],
    [-frameW / 2 + legInset, -frameD / 2 + legInset],
  ]

  return (
    <group name="table" raycast={() => null}>
      {/* baize deck beneath the carved blocks */}
      <mesh position={[0, deckY - 0.06, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[w + 0.04, 0.12, d + 0.04]} />
        <meshStandardMaterial color="#3d4a3a" roughness={1} />
      </mesh>

      {/* timber frame */}
      {(
        [
          [0, frameCentreY, d / 2 + RAIL_WIDTH / 2, frameW, frameH, RAIL_WIDTH],
          [0, frameCentreY, -d / 2 - RAIL_WIDTH / 2, frameW, frameH, RAIL_WIDTH],
          [w / 2 + RAIL_WIDTH / 2, frameCentreY, 0, RAIL_WIDTH, frameH, d],
          [-w / 2 - RAIL_WIDTH / 2, frameCentreY, 0, RAIL_WIDTH, frameH, d],
        ] as Array<[number, number, number, number, number, number]>
      ).map(([x, y, z, sx, sy, sz], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow raycast={() => null}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial color={PALETTE.timber} roughness={0.62} metalness={0.04} />
        </mesh>
      ))}

      {/* brass rule set into the inner edge of the frame */}
      {(
        [
          [0, frameTop + 0.004, d / 2 + RIM / 2, w + RIM, RIM],
          [0, frameTop + 0.004, -d / 2 - RIM / 2, w + RIM, RIM],
          [w / 2 + RIM / 2, frameTop + 0.004, 0, RIM, d + RIM],
          [-w / 2 - RIM / 2, frameTop + 0.004, 0, RIM, d + RIM],
        ] as Array<[number, number, number, number, number]>
      ).map(([x, y, z, sx, sz], i) => (
        <mesh key={`brass-${i}`} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[sx, sz]} />
          <meshStandardMaterial color={PALETTE.brass} roughness={0.34} metalness={0.85} />
        </mesh>
      ))}

      {/* corner fittings */}
      {legPositions.map(([x, z], i) => (
        <group key={`fit-${i}`}>
          <mesh position={[x, frameTop + 0.03, z]} castShadow raycast={() => null}>
            <cylinderGeometry args={[0.14, 0.16, 0.09, 16]} />
            <meshStandardMaterial color={PALETTE.brass} roughness={0.28} metalness={0.9} />
          </mesh>
          <mesh position={[x, frameTop + 0.085, z]} castShadow raycast={() => null}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshStandardMaterial color={PALETTE.brassDark} roughness={0.24} metalness={0.95} />
          </mesh>
        </group>
      ))}

      {/* instruments: a compass rose and two calibration knobs on the near rail */}
      <group position={[-w / 2 + 0.9, frameTop + 0.012, d / 2 + RAIL_WIDTH / 2]} raycast={() => null}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 24]} />
          <meshStandardMaterial color={PALETTE.brass} roughness={0.3} metalness={0.88} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.004, 0]}>
          <planeGeometry args={[0.028, 0.3]} />
          <meshStandardMaterial color={PALETTE.ink} roughness={0.7} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 4]} position={[0, 0.004, 0]}>
          <planeGeometry args={[0.028, 0.3]} />
          <meshStandardMaterial color={PALETTE.signal} roughness={0.5} />
        </mesh>
      </group>
      {[1.6, 2.2].map((offset) => (
        <mesh
          key={`knob-${offset}`}
          position={[w / 2 - offset, frameTop + 0.05, d / 2 + RAIL_WIDTH / 2]}
          castShadow
          raycast={() => null}
        >
          <cylinderGeometry args={[0.075, 0.09, 0.1, 18]} />
          <meshStandardMaterial color={PALETTE.brass} roughness={0.3} metalness={0.9} />
        </mesh>
      ))}

      {/* legs */}
      {legPositions.map(([x, z], i) => (
        <mesh key={`leg-${i}`} position={[x, frameCentreY - frameH / 2 - legH / 2, z]} castShadow raycast={() => null}>
          <cylinderGeometry args={[0.13, 0.1, legH, 12]} />
          <meshStandardMaterial color={PALETTE.timberDark} roughness={0.75} />
        </mesh>
      ))}

      {/* floor catch so shadows have somewhere to land */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, frameCentreY - frameH / 2 - legH, 0]}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[frameW * 2.4, frameD * 2.4]} />
        <meshStandardMaterial color="#3a3128" roughness={1} />
      </mesh>

      {/* survey grid printed on the baize where the table shows through */}
      <mesh position={[0, deckY + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[w, d, world.w, world.h]} />
        <meshBasicMaterial color="#2f3a2c" wireframe transparent opacity={0.18} />
      </mesh>
    </group>
  )
}
