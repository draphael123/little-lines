import { useEffect, useRef, useState } from 'react'
import { LEVELS } from '../game/levels'
import { selectStarsTotal, useGame } from '../store/useGame'

export function TopNav() {
  const mode = useGame((s) => s.mode)
  const setMode = useGame((s) => s.setMode)
  return (
    <header className="topnav">
      <div className="wordmark">
        <strong>Little Lines</strong>
        <span>Survey &amp; Free Build</span>
      </div>

      <nav aria-label="Game modes">
        <div className="segmented" role="group" aria-label="Choose a mode">
          <button type="button" aria-pressed={mode === 'puzzle'} onClick={() => setMode('puzzle')}>
            Puzzle Post
          </button>
          <button type="button" aria-pressed={mode === 'free'} onClick={() => setMode('free')}>
            Free Build
          </button>
        </div>
      </nav>

      <div className="topnav__spacer" />
      <SurveyOffice />
    </header>
  )
}

function SurveyOffice() {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const mode = useGame((s) => s.mode)
  const setMode = useGame((s) => s.setMode)
  const night = useGame((s) => s.night)
  const setNight = useGame((s) => s.setNight)
  const setFieldGuide = useGame((s) => s.setFieldGuide)
  const openTutorial = useGame((s) => s.openTutorial)
  const resetEverything = useGame((s) => s.resetEverything)
  const stars = useGame(selectStarsTotal)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) setConfirmReset(false)
  }, [open])

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className="btn btn--brass"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Survey Office
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Survey Office">
          <p className="menu__label">Mode</p>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'puzzle'}
            onClick={() => {
              setMode('puzzle')
              setOpen(false)
            }}
          >
            Puzzle Post
            {mode === 'puzzle' && <span className="tick" aria-hidden="true">✓</span>}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'free'}
            onClick={() => {
              setMode('free')
              setOpen(false)
            }}
          >
            Free Build
            {mode === 'free' && <span className="tick" aria-hidden="true">✓</span>}
          </button>

          <p className="menu__label">Lighting</p>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={night}
            onClick={() => setNight(!night)}
          >
            Night lamps
            <span className="tick" aria-hidden="true">{night ? '✓' : ''}</span>
          </button>

          <p className="menu__label">Reference</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setFieldGuide(true)
              setOpen(false)
            }}
          >
            Field guide
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openTutorial()
              setOpen(false)
            }}
          >
            Replay the four-page tour
          </button>

          <p className="menu__label">Campaign — {stars} of {LEVELS.length * 3} stars</p>
          <button
            type="button"
            role="menuitem"
            className={confirmReset ? 'btn--danger' : undefined}
            style={confirmReset ? { color: 'var(--signal)' } : undefined}
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true)
                return
              }
              resetEverything()
              setOpen(false)
            }}
          >
            {confirmReset ? 'Tap again to erase everything' : 'Reset all progress'}
          </button>
        </div>
      )}
    </div>
  )
}
