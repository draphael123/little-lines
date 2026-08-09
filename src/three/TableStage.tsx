import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import type { World } from '../game/types'
import { SceneBoundary } from './SceneBoundary'
import { SceneRoot } from './SceneRoot'
import { FOV, cameraGoal } from './viewpoints'
import { detectWebGL } from './webgl'

/**
 * Mounts the 3D table when the browser can actually draw it, and a written
 * fallback when it cannot. The two are mutually exclusive on purpose — the
 * fallback never sits on top of a working canvas.
 */
export function TableStage({ world }: { world: World }) {
  const supported = useMemo(() => detectWebGL(), [])
  const [crashed, setCrashed] = useState(false)
  const [sceneError, setSceneError] = useState<string | null>(null)

  if (!supported || crashed || sceneError) {
    return <WebGLFallback crashed={crashed} sceneError={sceneError} />
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 1.85]}
        camera={{ position: cameraGoal(world, 'home'), fov: FOV, near: 0.1, far: 400 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.02
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            setCrashed(true)
          })
        }}
      >
        <SceneBoundary onError={setSceneError}>
          <Suspense fallback={null}>
            <SceneRoot />
          </Suspense>
        </SceneBoundary>
      </Canvas>
    </div>
  )
}

function WebGLFallback({ crashed, sceneError }: { crashed: boolean; sceneError?: string | null }) {
  const heading = sceneError
    ? 'The map could not be drawn'
    : crashed
      ? 'The map lost its graphics context'
      : 'This browser cannot draw the 3D map'
  const detail = sceneError
    ? `Something in the scene failed while it was being built: ${sceneError}. Reloading usually clears it, and your progress is saved either way.`
    : crashed
      ? 'The browser dropped the WebGL context — usually a graphics driver hiccup, or a tab left in the background too long. Reloading will set the map back up; your progress is saved.'
      : 'Little Lines draws its landscape with WebGL, and this browser has not made it available. Hardware acceleration being switched off is the usual reason.'
  return (
    <div className="fallback" role="region" aria-label="3D map unavailable">
      <div>
        <h2>{heading}</h2>
        <p className="lede">{detail}</p>
        <p className="lede">
          Everything is still playable. Open the <strong>keyboard grid</strong> in the panel on the
          left: it is the same map as a grid of buttons, with the same rules, the same scoring and
          the same saved progress.
        </p>
      </div>
    </div>
  )
}
