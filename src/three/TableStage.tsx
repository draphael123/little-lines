import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import type { World } from '../game/types'
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

  if (!supported || crashed) return <WebGLFallback crashed={crashed} />

  return (
    <div className="stage__canvas">
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
        <Suspense fallback={null}>
          <SceneRoot />
        </Suspense>
      </Canvas>
    </div>
  )
}

function WebGLFallback({ crashed }: { crashed: boolean }) {
  return (
    <div className="fallback" role="region" aria-label="3D table unavailable">
      <div className="fallback__inner">
        <p className="card__eyebrow">The relief table</p>
        <h2 className="card__title">
          {crashed ? 'The table lost its graphics context' : 'This browser cannot draw the 3D table'}
        </h2>
        <p className="card__body">
          {crashed
            ? 'The browser dropped the WebGL context — usually a graphics driver hiccup or a tab left in the background too long. Reloading the page will set the table back up; your progress is saved.'
            : 'Little Lines draws its miniature railway with WebGL, and this browser has not made it available. Hardware acceleration being switched off is the usual reason.'}
        </p>
        <p className="card__body">
          Everything is still playable. Open the <strong>Keyboard survey grid</strong> in the panel
          beside the table: it is the same survey as a grid of buttons, with the same rules, the same
          scoring and the same saved progress.
        </p>
      </div>
    </div>
  )
}
