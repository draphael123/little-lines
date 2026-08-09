// First, before anything else: modules that capture requestAnimationFrame at
// import time must see the patched one. See world/frames.ts.
import { keepFramesComing } from './world/frames'

keepFramesComing()

const { StrictMode } = await import('react')
const { createRoot } = await import('react-dom/client')
const { default: App } = await import('./App')
await import('./styles/app.css')

if (import.meta.env.DEV) {
  // A handle on the region for driving the game without a mouse. Pairs with
  // the renderer seam in world/RegionScene.tsx; stripped from the build.
  const { useRegion } = await import('./store/useRegion')
  ;(window as unknown as { REGION_STORE: unknown }).REGION_STORE = useRegion
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
