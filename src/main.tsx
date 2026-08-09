// First, before anything else: modules that capture requestAnimationFrame at
// import time must see the patched one, so the rest of the app is pulled in
// dynamically after the shim is in place rather than hoisted above it.
// See lines/frames.ts.
import { keepFramesComing } from './lines/frames'

keepFramesComing()

const { StrictMode } = await import('react')
const { createRoot } = await import('react-dom/client')
const { default: App } = await import('./App')
await import('./styles/app.css')

if (import.meta.env.DEV) {
  // A handle on the run for driving the game without a mouse. Stripped from
  // the production build.
  const { useGame } = await import('./store/useGame')
  ;(window as unknown as { GAME_STORE: unknown }).GAME_STORE = useGame
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
