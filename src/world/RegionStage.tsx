import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import { SceneBoundary } from './SceneBoundary'
import { detectWebGL } from './webgl'
import { RegionScene, type RegionSceneProps } from './RegionScene'

/** The canvas for the continuous region. */
export function RegionStage(props: RegionSceneProps) {
  const supported = useMemo(() => detectWebGL(), [])
  const [failed, setFailed] = useState<string | null>(null)

  if (!supported || failed) {
    return (
      <div className="fallback" role="region" aria-label="3D map unavailable">
        <div>
          <h2>{failed ? 'The region could not be drawn' : 'This browser cannot draw the map'}</h2>
          <p className="lede">
            {failed
              ? `Something in the scene failed while it was being built: ${failed}.`
              : 'Little Lines draws its landscape with WebGL, and this browser has not made it available.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 1.75]}
        camera={{ position: [0, 1400, 1800], fov: 42, near: 5, far: 30000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <SceneBoundary onError={setFailed}>
          <Suspense fallback={null}>
            <RegionScene {...props} />
          </Suspense>
        </SceneBoundary>
      </Canvas>
    </div>
  )
}
