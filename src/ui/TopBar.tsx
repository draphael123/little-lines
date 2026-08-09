import { useEffect, useRef, useState } from 'react'
import { totalPopulation } from '../game/economy'
import { LEVELS } from '../game/levels'
import type { RouteReport } from '../game/scoring'
import type { Speed } from '../game/types'
import { selectStarsTotal, useGame } from '../store/useGame'
import { Icon } from './Icon'

const SPEEDS: Array<{ id: Speed; label: string }> = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
]

/** The one persistent strip: where you are, how things stand, and the clock. */
export function TopBar({ report }: { report: RouteReport }) {
  const mode = useGame((s) => s.mode)
  const setMode = useGame((s) => s.setMode)
  const night = useGame((s) => s.night)
  const setNight = useGame((s) => s.setNight)
  const free = useGame((s) => s.free)
  const setSpeed = useGame((s) => s.setSpeed)
  const stars = useGame(selectStarsTotal)
  const population = Math.round(totalPopulation(free.settlements))

  return (
    <header className="topbar pane">
      <div className="brand">
        <b>Little Lines</b>
        <i>{mode === 'puzzle' ? 'Survey' : mode === 'free' ? 'Free build' : 'Region'}</i>
      </div>

      <nav aria-label="Game modes">
        <div className="switch" role="group" aria-label="Choose a mode">
          <button type="button" aria-pressed={mode === 'puzzle'} onClick={() => setMode('puzzle')}>
            Survey
          </button>
          <button type="button" aria-pressed={mode === 'free'} onClick={() => setMode('free')}>
            Build
          </button>
          <button type="button" aria-pressed={mode === 'region'} onClick={() => setMode('region')}>
            Region
          </button>
        </div>
      </nav>

      <div className="spacer" />

      <div className="stats">
        {mode === 'region' ? (
          <Stat icon="grow" value="4 km" unit="continuous" label="region size" />
        ) : mode === 'puzzle' ? (
          <>
            <Stat icon="rail" value={`${report.trackTiles}`} unit={`of ${report.par}`} label="track laid against par" />
            <Stat
              icon="water"
              value={`${report.bridges}`}
              unit={`of ${report.bridgeBudget}`}
              label="bridges used"
              warn={report.overBudget}
            />
            <Stat
              icon="station"
              value={`${report.stopsServed}`}
              unit={`of ${report.stopsRequired}`}
              label="required halts served"
            />
            <span className="rule" />
            <Stat icon="hint" value={`${stars}`} unit={`of ${LEVELS.length * 3}`} label="campaign stars" />
          </>
        ) : (
          <>
            <Stat icon="people" value={population.toLocaleString()} unit="people" label="population" />
            <Stat
              icon="coin"
              value={`£${Math.floor(free.balance).toLocaleString()}`}
              unit=""
              label="account balance"
              warn={free.balance < 60}
            />
            <Stat icon="train" value={`${free.trains}`} unit={free.trains === 1 ? 'train' : 'trains'} label="trains in service" />
          </>
        )}
      </div>

      {mode === 'free' && (
        <>
          <span className="rule" />
          <div className="switch" role="group" aria-label="Running speed">
            {SPEEDS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={free.speed === s.id}
                onClick={() => setSpeed(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      <span className="rule" />
      <button
        type="button"
        className="btn btn--quiet btn--icon"
        aria-pressed={night}
        aria-label={night ? 'Switch to daylight' : 'Switch to night'}
        title={night ? 'Daylight' : 'Night'}
        onClick={() => setNight(!night)}
      >
        <Icon name={night ? 'moon' : 'sun'} />
      </button>
      <OfficeMenu />
    </header>
  )
}

function Stat({
  icon,
  value,
  unit,
  label,
  warn,
}: {
  icon: Parameters<typeof Icon>[0]['name']
  value: string
  unit: string
  label: string
  warn?: boolean
}) {
  return (
    <div className="stat" data-warn={warn ? 'true' : undefined} title={label}>
      <Icon name={icon} size={15} />
      <b>{value}</b>
      {unit && <span>{unit}</span>}
      <span className="sr-only">{label}</span>
    </div>
  )
}

function OfficeMenu() {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const setFieldGuide = useGame((s) => s.setFieldGuide)
  const openTutorial = useGame((s) => s.openTutorial)
  const setLevelPicker = useGame((s) => s.setLevelPicker)
  const resetEverything = useGame((s) => s.resetEverything)

  useEffect(() => {
    if (!open) {
      setConfirmReset(false)
      return
    }
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

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className="btn btn--quiet btn--icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Survey Office menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="menu" />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Survey Office">
          <p>Campaign</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setLevelPicker(true)
              setOpen(false)
            }}
          >
            Choose a survey
          </button>
          <p>Reference</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setFieldGuide(true)
              setOpen(false)
            }}
          >
            Field guide &amp; sound
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openTutorial()
              setOpen(false)
            }}
          >
            Replay the tour
          </button>
          <p>Danger</p>
          <button
            type="button"
            role="menuitem"
            style={confirmReset ? { color: 'var(--danger)' } : undefined}
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
