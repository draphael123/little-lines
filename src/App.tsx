import { useEffect, useMemo } from 'react'
import { initAudio } from './audio/engine'
import { surveyCountry, totalPopulation } from './game/economy'
import { levelById, LEVELS } from './game/levels'
import { reportRoute } from './game/scoring'
import type { Coord, FreeTool, RailLine } from './game/types'
import { TOOL_INFO, useGame, worldForLevel } from './store/useGame'
import { TableStage } from './three/TableStage'
import { StageOverlays } from './ui/StageOverlays'
import { AccessibleGrid } from './ui/AccessibleGrid'
import { CountryPanel, MilestoneToast } from './ui/CountryPanel'
import {
  CompletionCard,
  DispatchStrip,
  RunButton,
  StatusCard,
} from './ui/DispatchPanel'
import { FieldGuide } from './ui/FieldGuide'
import { FreePanel } from './ui/FreePanel'
import { LevelSelect } from './ui/LevelSelect'
import { PuzzlePanel } from './ui/PuzzlePanel'
import { TopNav } from './ui/TopNav'
import { Tutorial } from './ui/Tutorial'

export default function App() {
  const mode = useGame((s) => s.mode)
  const night = useGame((s) => s.night)
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
    () =>
      mode === 'free'
        ? surveyCountry(free.world, free.lines, free.settlements, free.trains)
        : [],
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
    <div className="app" data-night={night}>
      <a className="skip-link" href="#board">
        Skip to the survey table
      </a>
      <TopNav />

      <div className="layout">
        <aside className="rail rail--left" aria-label={mode === 'puzzle' ? 'Level briefing' : 'Build tools'}>
          {mode === 'puzzle' ? <PuzzlePanel level={level} report={report} /> : <FreePanel />}
        </aside>

        <section className="stage" id="board" aria-label="The relief railway table">
          <TableStage world={world} />
          <StageOverlays world={world} />
        </section>

        <aside className="rail rail--right" aria-label="Dispatch">
          <DispatchStrip report={report} />
          <StatusCard level={level} report={report} />
          <div className="hide-on-mobile-dispatch">
            <RunButton report={report} />
          </div>
          {mode === 'puzzle' && <CompletionCard level={level} report={report} />}
          {mode === 'free' && (
            <>
              <MilestoneToast />
              <CountryPanel country={country} />
            </>
          )}
          <AccessibleGrid
            world={world}
            lines={lines}
            onPick={pick}
            onFocusTile={(c) => useGame.getState().setHovered(c)}
            label={
              mode === 'puzzle'
                ? `${level.name}: ${world.w} by ${world.h} survey grid`
                : `Free build table: ${world.w} by ${world.h} grid`
            }
          />
        </aside>
      </div>

      <MobileDispatch />

      <Tutorial />
      <FieldGuide />
      <LevelSelect />

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

function MobileDispatch() {
  const mode = useGame((s) => s.mode)
  const levelId = useGame((s) => s.levelId)
  const route = useGame((s) => s.route)
  const free = useGame((s) => s.free)
  const level = useMemo(() => levelById(levelId) ?? LEVELS[0], [levelId])
  const report = useMemo(() => reportRoute(worldForLevel(level), level, route), [level, route])
  const population = Math.round(totalPopulation(free.settlements))

  return (
    <div className="mobile-dispatch">
      <div className="mobile-dispatch__meta">
        {mode === 'puzzle' ? (
          <>
            <b>
              {report.trackTiles} / {level.par}
            </b>
            lengths against par
          </>
        ) : (
          <>
            <b>{population.toLocaleString()} people</b>
            £{Math.floor(free.balance).toLocaleString()} ·{' '}
            {TOOL_INFO.find((t) => t.id === free.tool)?.name}
          </>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <RunButton report={report} />
      </div>
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
        case 'r':
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
 * background tab resumes sensibly instead of jumping. Deliberately independent
 * of the render loop: the country keeps growing even without a canvas.
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
