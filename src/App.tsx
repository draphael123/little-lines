import { useEffect, useMemo } from 'react'
import { initAudio } from './audio/engine'
import { surveyCountry } from './game/economy'
import { LEVELS, levelById } from './game/levels'
import { reportRoute } from './game/scoring'
import type { Coord, FreeTool, RailLine } from './game/types'
import { TOOL_INFO, useGame, worldForLevel } from './store/useGame'
import { TableStage } from './three/TableStage'
import { FieldGuide } from './ui/FieldGuide'
import { LevelSelect } from './ui/LevelSelect'
import { RunDock } from './ui/RunDock'
import { SidePanel } from './ui/SidePanel'
import { ToolDock } from './ui/ToolDock'
import { TopBar } from './ui/TopBar'
import { Tutorial } from './ui/Tutorial'
import { WorldReadout } from './ui/WorldReadout'

export default function App() {
  const mode = useGame((s) => s.mode)
  const levelId = useGame((s) => s.levelId)
  const route = useGame((s) => s.route)
  const free = useGame((s) => s.free)
  const announcement = useGame((s) => s.announcement)

  const level = useMemo(() => levelById(levelId) ?? LEVELS[0], [levelId])
  const world = mode === 'puzzle' ? worldForLevel(level) : free.world
  const report = useMemo(() => reportRoute(worldForLevel(level), level, route), [level, route])

  const lines = useMemo<RailLine[]>(
    () => (mode === 'puzzle' ? (route.length ? [{ id: 'campaign', tiles: route }] : []) : free.lines),
    [mode, route, free.lines],
  )

  const country = useMemo(
    () => (mode === 'free' ? surveyCountry(free.world, free.lines, free.settlements, free.trains) : []),
    [mode, free.world, free.lines, free.settlements, free.trains],
  )

  useKeyboardShortcuts()
  useAudioUnlock()
  useCountryClock()

  const pick = (c: Coord) => {
    const state = useGame.getState()
    if (state.mode === 'puzzle') state.tapPuzzleTile(c)
    else state.tapFreeTile(c)
  }

  return (
    <div className="game">
      <a className="skip" href="#board">
        Skip to the map
      </a>

      <div className="world" id="board" role="region" aria-label="The railway map">
        <TableStage world={world} />
      </div>

      <div className="hud">
        <TopBar report={report} />
        <SidePanel
          level={level}
          report={report}
          country={country}
          world={world}
          lines={lines}
          onPick={pick}
        />
        <ToolDock />
        <RunDock level={level} report={report} />
        <WorldReadout world={world} />
      </div>

      <Tutorial />
      <FieldGuide />
      <LevelSelect />

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

/** Number keys pick a tool; the usual editing shortcuts work everywhere else. */
function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const state = useGame.getState()
      if (state.showTutorial || state.showFieldGuide || state.showLevels) return

      const digit = Number(event.key)
      if (state.mode === 'free' && digit >= 1 && digit <= TOOL_INFO.length) {
        event.preventDefault()
        state.setTool(TOOL_INFO[digit - 1].id as FreeTool)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      // W A S D pan the camera, so only the remaining letters are shortcuts.
      switch (event.key.toLowerCase()) {
        case 'h':
          if (state.mode === 'puzzle') {
            event.preventDefault()
            state.askHint()
          }
          break
        case 'n':
          event.preventDefault()
          state.setNight(!state.night)
          break
        case ' ':
          event.preventDefault()
          state.toggleRun()
          break
        case '[':
          state.setCamera('west')
          break
        case ']':
          state.setCamera('east')
          break
        case '\\':
          state.setCamera('home')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * The world clock. Time only passes while the lines are running, and the tick
 * is driven from real elapsed time rather than a fixed step so a throttled
 * background tab resumes sensibly. Deliberately independent of the render
 * loop: the country keeps growing even without a canvas.
 */
function useCountryClock() {
  const mode = useGame((s) => s.mode)
  const running = useGame((s) => s.free.running)
  useEffect(() => {
    if (mode !== 'free' || !running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(1.5, (now - last) / 1000)
      last = now
      useGame.getState().advanceCountry(dt)
    }, 400)
    return () => window.clearInterval(id)
  }, [mode, running])
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
