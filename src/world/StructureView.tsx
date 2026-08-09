import { buildingById, type Structure } from './buildings'

/** Stations, sheds, towers and the civic buildings, drawn at metre scale. */
export function StructureView({
  structures,
  night,
}: {
  structures: Structure[]
  night: boolean
}) {
  return (
    <group name="structures" raycast={() => null}>
      {structures.map((s) => (
        <Building key={s.id} structure={s} night={night} />
      ))}
    </group>
  )
}

function Building({ structure, night }: { structure: Structure; night: boolean }) {
  const lit = night ? '#e0a44e' : '#000000'
  const glow = night ? 0.5 : 0
  const { kind, x, y, z } = structure
  const big = kind === 'terminus'

  return (
    <group position={[x, y, z]} raycast={() => null}>
      {(kind === 'station' || kind === 'terminus') && (
        <>
          <mesh position={[0, 0.6, 0]} receiveShadow castShadow>
            <boxGeometry args={[big ? 16 : 11, 1.2, big ? 62 : 40]} />
            <meshStandardMaterial color="#b7ad99" roughness={0.94} />
          </mesh>
          <mesh position={[big ? 11 : 8, big ? 6 : 4.5, 0]} castShadow>
            <boxGeometry args={[big ? 13 : 9, big ? 11 : 8, big ? 34 : 22]} />
            <meshStandardMaterial
              color="#ddd2bb"
              roughness={0.85}
              emissive={lit}
              emissiveIntensity={glow}
            />
          </mesh>
          <mesh position={[big ? 11 : 8, big ? 12.4 : 9.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[big ? 12 : 8.4, big ? 4 : 3, 4]} />
            <meshStandardMaterial color="#7d4438" roughness={0.85} />
          </mesh>
          {/* platform canopy */}
          <mesh position={[big ? 3 : 2.5, big ? 7.5 : 6, 0]} rotation={[0, 0, 0.12]} castShadow>
            <boxGeometry args={[big ? 13 : 9, 0.5, big ? 46 : 30]} />
            <meshStandardMaterial color="#6a707a" roughness={0.8} metalness={0.2} />
          </mesh>
          {big && (
            <mesh position={[11, 18, 0]} castShadow>
              <cylinderGeometry args={[1.8, 1.8, 7, 10]} />
              <meshStandardMaterial color="#c39a4d" roughness={0.35} metalness={0.85} />
            </mesh>
          )}
          {night && <pointLight position={[6, 9, 0]} color="#ffcb82" intensity={600} distance={140} />}
        </>
      )}

      {kind === 'watertower' && (
        <group>
          {[-3, 3].map((o) => (
            <mesh key={o} position={[o, 5, o]} castShadow>
              <cylinderGeometry args={[0.5, 0.7, 10, 6]} />
              <meshStandardMaterial color="#4a3b2c" roughness={0.95} />
            </mesh>
          ))}
          <mesh position={[0, 12.5, 0]} castShadow>
            <cylinderGeometry args={[5, 5, 6, 14]} />
            <meshStandardMaterial color="#4f6058" roughness={0.7} metalness={0.25} />
          </mesh>
          <mesh position={[0, 16.4, 0]} castShadow>
            <coneGeometry args={[5.6, 2.6, 14]} />
            <meshStandardMaterial color="#3a3a3c" roughness={0.8} />
          </mesh>
        </group>
      )}

      {kind === 'shed' && (
        <group>
          <mesh position={[0, 5, 0]} castShadow receiveShadow>
            <boxGeometry args={[16, 10, 34]} />
            <meshStandardMaterial
              color="#8a7d6b"
              roughness={0.92}
              emissive={lit}
              emissiveIntensity={glow * 0.5}
            />
          </mesh>
          <mesh position={[0, 11.5, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <cylinderGeometry args={[8.6, 8.6, 16, 14, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#4a5158" roughness={0.78} side={2} />
          </mesh>
          <mesh position={[0, 4, 17.2]}>
            <boxGeometry args={[11, 8, 0.6]} />
            <meshStandardMaterial color="#15181b" roughness={1} />
          </mesh>
        </group>
      )}

      {kind === 'depot' && (
        <group>
          <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[18, 7, 38]} />
            <meshStandardMaterial color="#96866f" roughness={0.94} />
          </mesh>
          <mesh position={[0, 7.6, 0]} castShadow>
            <boxGeometry args={[21, 1, 42]} />
            <meshStandardMaterial color="#565c63" roughness={0.82} />
          </mesh>
          {[-12, 0, 12].map((o) => (
            <mesh key={o} position={[7, 9.4, o]} castShadow>
              <boxGeometry args={[5, 3, 5]} />
              <meshStandardMaterial color="#7a6046" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}

      {kind === 'market' && (
        <group>
          <mesh position={[0, 4, 0]} castShadow receiveShadow>
            <boxGeometry args={[22, 8, 26]} />
            <meshStandardMaterial
              color="#ddd0b4"
              roughness={0.86}
              emissive={lit}
              emissiveIntensity={glow}
            />
          </mesh>
          <mesh position={[0, 9.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[19, 4, 4]} />
            <meshStandardMaterial color="#b8863f" roughness={0.82} />
          </mesh>
        </group>
      )}

      {kind === 'school' && (
        <group>
          <mesh position={[0, 5, 0]} castShadow receiveShadow>
            <boxGeometry args={[17, 10, 30]} />
            <meshStandardMaterial
              color="#c9b394"
              roughness={0.88}
              emissive={lit}
              emissiveIntensity={glow}
            />
          </mesh>
          <mesh position={[0, 11.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[15.5, 4, 4]} />
            <meshStandardMaterial color="#5d6670" roughness={0.82} />
          </mesh>
          <mesh position={[0, 15, 10]} castShadow>
            <boxGeometry args={[4, 9, 4]} />
            <meshStandardMaterial color="#c9b394" roughness={0.88} />
          </mesh>
          <mesh position={[0, 20.6, 10]} castShadow>
            <coneGeometry args={[3.4, 4, 4]} />
            <meshStandardMaterial color="#5d6670" roughness={0.8} />
          </mesh>
        </group>
      )}

      {kind === 'clinic' && (
        <group>
          <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[19, 9, 28]} />
            <meshStandardMaterial
              color="#eae4d8"
              roughness={0.8}
              emissive={lit}
              emissiveIntensity={glow}
            />
          </mesh>
          <mesh position={[0, 9.4, 0]} castShadow>
            <boxGeometry args={[21, 1, 30]} />
            <meshStandardMaterial color="#c3ccd2" roughness={0.72} />
          </mesh>
          <mesh position={[9.8, 6, 0]}>
            <boxGeometry args={[0.5, 5, 1.6]} />
            <meshStandardMaterial color="#c0392b" roughness={0.6} />
          </mesh>
          <mesh position={[9.8, 6, 0]}>
            <boxGeometry args={[0.5, 1.6, 5]} />
            <meshStandardMaterial color="#c0392b" roughness={0.6} />
          </mesh>
        </group>
      )}

      {/* a nameplate ring so a building can be picked out from height */}
      <mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[buildingById(kind).range * 0.02 + 8, buildingById(kind).range * 0.02 + 10, 22]} />
        <meshBasicMaterial color="#f0b357" transparent opacity={0.28} />
      </mesh>
    </group>
  )
}
