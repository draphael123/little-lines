import { useEffect, useMemo } from 'react'
import { initAudio } from './audio/engine'
import { selectReports, useRegion } from './store/useRegion'
import { RegionDock, RegionPanel, RegionReadout, RegionTopBar } from './ui/RegionHUD'
import { RegionGuide, RegionTutorial } from './ui/RegionTutorial'
import { RegionStage } from './world/RegionStage'

export default function App() {
  const seed = useRegion((s) => s.seed)
  const night = useRegion((s) => s.night)
  const network = useRegion((s) => s.network)
  const structures = useRegion((s) => s.structures)
  const settlements = useRegion((s) => s.settlements)
  const tool = useRegion((s) => s.tool)
  const view = useRegion((s) => s.view)
  const lift = useRegion((s) => s.lift)
  const trains = useRegion((s) => s.trains)
  const speed = useRegion((s) => s.speed)
  const running = useRegion((s) => s.running)
  const announcement = useRegion((s) => s.announcement)

  // The survey is derived, so it is recomputed from exactly the things that
  // shape it rather than on every store change.
  const reports = useMemo(
    () => selectReports({ network, structures, settlements, trains } as Parameters<typeof selectReports>[0]),
    [network, structures, settlements, trains],
  )

  useShortcuts()
  useClock()
  useAudioUnlock()

  return (
    <div className="game">
      <a className="skip" href="#board">
        Skip to the map
      </a>

      <div className="world" id="board" role="region" aria-label="The region">
        <RegionStage
          seed={seed}
          night={night}
          network={network}
          structures={structures}
          settlements={settlements}
          tool={tool}
          view={view}
          lift={lift}
          trains={trains}
          speed={speed}
          running={running}
          onLay={(result) => useRegion.getState().lay(result)}
          onAdjust={(edgeId, delta) => useRegion.getState().adjust(edgeId, delta)}
          onPlace={(x, z, y) => useRegion.getState().place(x, z, y)}
          onDemolish={(x, z) => useRegion.getState().demolish(x, z)}
          onStatus={(text, ok) => useRegion.getState().setStatus(text, ok)}
          onHover={(p) => useRegion.getState().setHovered(p)}
        />
      </div>

      <div className="hud">
        <RegionTopBar />
        <RegionPanel reports={reports} />
        <RegionDock />
        <RegionReadout />
      </div>

      <RegionTutorial />
      <RegionGuide />

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

const TOOL_KEYS = ['look', 'rail', 'raise', 'lower', 'build', 'demolish'] as const

function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const state = useRegion.getState()
      if (state.showTutorial || state.showGuide) return

      const digit = Number(event.key)
      if (digit >= 1 && digit <= TOOL_KEYS.length) {
        event.preventDefault()
        state.setTool(TOOL_KEYS[digit - 1])
        return
      }
      switch (event.key.toLowerCase()) {
        case ' ':
          event.preventDefault()
          state.setRunning(!state.running)
          break
        case 'n':
          state.setNight(!state.night)
          break
        case 'f':
          state.setView(state.view === 'follow' ? 'free' : 'follow')
          break
        case 'c':
          state.setView(state.view === 'cab' ? 'free' : 'cab')
          break
        case 'q':
          if (state.tool === 'rail') state.setLift(state.lift - 4)
          break
        case 'e':
          if (state.tool === 'rail') state.setLift(state.lift + 4)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * The clock. Time only passes while the trains are running, and the tick is
 * driven from real elapsed time so a throttled background tab resumes sensibly
 * rather than jumping. Deliberately outside the render loop, so the country
 * keeps growing even without a canvas.
 */
function useClock() {
  const running = useRegion((s) => s.running)
  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(1.5, (now - last) / 1000)
      last = now
      useRegion.getState().advance(dt)
    }, 350)
    return () => window.clearInterval(id)
  }, [running])
}

/** Browsers only allow an audio context after a gesture; take the first one. */
function useAudioUnlock() {
  const audio = useRegion((s) => s.audio)
  useEffect(() => {
    if (!audio.music && !audio.sfx) return
    const unlock = () => {
      initAudio()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [audio.music, audio.sfx])
}
