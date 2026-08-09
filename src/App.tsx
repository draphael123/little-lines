import { useEffect } from 'react'
import { initAudio } from './audio/engine'
import { BoardStage } from './lines/BoardStage'
import { Hand, Help, Requests, Summary, Ticker, TopBar } from './ui/GameHUD'
import { useGame, useHeldTile } from './store/useGame'

export default function App() {
  const tiles = useGame((s) => s.game.tiles)
  const held = useHeldTile()
  const hovered = useGame((s) => s.hovered)
  const night = useGame((s) => s.night)
  const announcement = useGame((s) => s.announcement)

  useShortcuts()
  useAudioUnlock()

  return (
    <div className="game">
      <a className="skip" href="#board">
        Skip to the board
      </a>

      <div className="world" id="board" role="region" aria-label="The country">
        <BoardStage
          tiles={tiles}
          held={held}
          hovered={hovered}
          night={night}
          onHover={(key) => useGame.getState().hover(key)}
          onPlace={(key) => useGame.getState().place(key)}
        />
      </div>

      <div className="hud">
        <TopBar />
        <Requests />
        <Hand />
        <Ticker />
      </div>

      <Summary />
      <Help />

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const state = useGame.getState()
      if (state.showHelp) return

      switch (event.key.toLowerCase()) {
        case 'q':
          event.preventDefault()
          state.turn(-1)
          break
        case 'e':
          event.preventDefault()
          state.turn(1)
          break
        case 'n':
          state.setNight(!state.night)
          break
        case '?':
          state.setShowHelp(true)
          break
        case 'r':
          // Only once a run is finished; restarting mid-run by accident is the
          // one destructive thing in the game.
          if (state.game.hand === null) state.restart()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Browsers only allow an audio context after a gesture; take the first one. */
function useAudioUnlock() {
  const audio = useGame((s) => s.audio)
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
