import { useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import { BackSide, Color, ShaderMaterial } from 'three'
import type { World } from '../game/types'
import { WATER_DROP, tableSize } from './geometry'
import type { SceneMood } from './palette'
import { SEABED_Y } from './terrainMesh'

/**
 * What the land sits in. There is no table any more: the survey is a headland
 * with the sea running out to a fogged horizon, so the camera can drop to
 * ground level and still be looking at a place.
 */
export function Environment({ world, mood }: { world: World; mood: SceneMood }) {
  const [w, d] = useMemo(() => tableSize(world), [world])
  const reach = Math.max(w, d) * 9

  const skyMaterial = useMemo(
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
          uniform vec3 top;
          uniform vec3 bottom;
          varying float vH;
          void main() {
            float t = smoothstep(-0.08, 0.55, vH);
            gl_FragColor = vec4(mix(bottom, top, t), 1.0);
          }
        `,
      }),
    [mood.sky, mood.horizon],
  )

  return (
    <group name="environment" raycast={() => null}>
      {/* sky dome */}
      <mesh material={skyMaterial} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[reach * 1.4, 24, 16]} />
      </mesh>

      {/* One sheet of water for the whole world: the rivers cut down into the
          land and meet it, so they run out to the open sea by themselves. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -WATER_DROP, 0]}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[reach * 2, reach * 2]} />
        <MeshReflectorMaterial
          color={mood.sea}
          resolution={512}
          mirror={0.38}
          mixBlur={3.5}
          mixStrength={1.3}
          blur={[320, 100]}
          depthScale={0.9}
          minDepthThreshold={0.2}
          maxDepthThreshold={1.4}
          roughness={mood.seaRoughness}
          metalness={0.3}
          transparent
          opacity={0.93}
        />
      </mesh>

      {/* the seabed the coastal cliffs run down to */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEABED_Y, 0]} raycast={() => null}>
        <planeGeometry args={[reach * 2, reach * 2]} />
        <meshStandardMaterial color="#31413c" roughness={1} />
      </mesh>
    </group>
  )
}
