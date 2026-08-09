import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import { SceneBoundary } from './SceneBoundary'
import { detectWebGL } from './webgl'
import { BoardScene, type BoardSceneProps } from './BoardScene'

/**
 * The canvas, and the two things that can go wrong with it.
 *
 * The fallback replaces the canvas only when the browser genuinely cannot draw
 * it — it never covers a working one. The boundary is for the other failure:
 * React unmounts a broken subtree silently, and inside a canvas that is
 * indistinguishable from a renderer quietly drawing nothing.
 */
export function BoardStage(props: BoardSceneProps) {
  const supported = useMemo(() => detectWebGL(), [])
  const [failed, setFailed] = useState<string | null>(null)

  if (!supported || failed) {
    return (
      <div className="fallback" role="region" aria-label="The board cannot be drawn">
        <div>
          <h2>{failed ? 'The board could not be drawn' : 'This browser cannot draw the board'}</h2>
          <p className="lede">
            {failed
              ? `Something in the scene failed while it was being built: ${failed}.`
              : 'Little Lines draws its country with WebGL, and this browser has not made it available.'}
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
        camera={{ position: [0, 9, 11], fov: 42, near: 0.5, far: 400 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <SceneBoundary onError={setFailed}>
          <Suspense fallback={null}>
            <BoardScene {...props} />
          </Suspense>
        </SceneBoundary>
      </Canvas>
    </div>
  )
}
