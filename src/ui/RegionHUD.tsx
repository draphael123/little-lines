import { useEffect, useMemo, useRef, useState } from 'react'
import { BUILDINGS, buildingById, type BuildingId } from '../world/buildings'
import { MILESTONES, milestoneAt, nextMilestone, progressTo, unlockedFor } from '../world/milestones'
import type { RegionTool, ViewMode } from '../world/RegionScene'
import { TIER_LABEL, type TownReport } from '../world/towns'
import type { SpeedName } from '../world/trainRun'
import {
  selectCapacity,
  selectMiles,
  selectPopulation,
  selectServed,
  selectStations,
  selectUpkeep,
  useRegion,
} from '../store/useRegion'
import type { Objective } from '../world/objective'
import { Icon, type IconName } from './Icon'

const TOOLS: Array<{ id: RegionTool; icon: IconName; label: string; key: string }> = [
  { id: 'look', icon: 'home', label: 'Look around', key: '1' },
  { id: 'rail', icon: 'rail', label: 'Lay rail', key: '2' },
  { id: 'raise', icon: 'raise', label: 'Raise the line', key: '3' },
  { id: 'lower', icon: 'lower', label: 'Lower the line', key: '4' },
  { id: 'build', icon: 'station', label: 'Place a building', key: '5' },
  { id: 'demolish', icon: 'erase', label: 'Clear', key: '6' },
]

const BUILDING_ICON: Record<BuildingId, IconName> = {
  station: 'station',
  terminus: 'station',
  watertower: 'water',
  shed: 'train',
  depot: 'coin',
  market: 'people',
  school: 'hint',
  clinic: 'clinic',
}

const VIEWS: Array<{ id: ViewMode; label: string; icon: IconName }> = [
  { id: 'free', label: 'Free camera', icon: 'home' },
  { id: 'follow', label: 'Follow the train', icon: 'train' },
  { id: 'cab', label: 'Ride in the cab', icon: 'people' },
]

const SPEEDS: SpeedName[] = ['slow', 'normal', 'fast']

/* ------------------------------------------------------------------ top */

export function RegionTopBar() {
  const population = useRegion(selectPopulation)
  const balance = useRegion((s) => s.balance)
  const upkeep = useRegion(selectUpkeep)
  const miles = useRegion(selectMiles)
  const trains = useRegion((s) => s.trains)
  const capacity = useRegion(selectCapacity)
  const speed = useRegion((s) => s.speed)
  const setSpeed = useRegion((s) => s.setSpeed)
  const running = useRegion((s) => s.running)
  const setRunning = useRegion((s) => s.setRunning)
  const night = useRegion((s) => s.night)
  const setNight = useRegion((s) => s.setNight)

  return (
    <header className="topbar pane">
      <div className="brand">
        <b>Little Lines</b>
        <i>The region</i>
      </div>
      <div className="spacer" />
      <div className="stats">
        <Stat icon="people" value={population.toLocaleString()} unit="people" label="population" />
        <Stat
          icon="coin"
          value={`£${Math.floor(balance).toLocaleString()}`}
          unit={`−£${upkeep}/mo`}
          label="balance and monthly upkeep"
          warn={balance < 400}
        />
        <Stat icon="rail" value={miles.toFixed(1)} unit="km of line" label="line laid" />
        <Stat icon="train" value={`${trains}`} unit={`of ${capacity}`} label="trains running" />
      </div>
      <span className="rule" />
      <Ladder />
      <span className="rule" />
      <button
        type="button"
        className="btn btn--quiet btn--icon"
        aria-pressed={running}
        aria-label={running ? 'Hold the trains' : 'Set the trains running'}
        title={running ? 'Hold' : 'Run'}
        onClick={() => setRunning(!running)}
      >
        <Icon name={running ? 'pause' : 'play'} />
      </button>
      <div className="switch" role="group" aria-label="Running speed">
        {SPEEDS.map((s) => (
          <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <span className="rule" />
      <button
        type="button"
        className="btn btn--quiet btn--icon"
        aria-pressed={night}
        aria-label={night ? 'Switch to daylight' : 'Switch to night'}
        onClick={() => setNight(!night)}
      >
        <Icon name={night ? 'moon' : 'sun'} />
      </button>
      <RegionMenu />
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
  icon: IconName
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

function RegionMenu() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const openTutorial = useRegion((s) => s.openTutorial)
  const setGuide = useRegion((s) => s.setGuide)
  const reset = useRegion((s) => s.reset)

  useEffect(() => {
    if (!open) {
      setConfirm(false)
      return
    }
    const onDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
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
        type="button"
        className="btn btn--quiet btn--icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="menu" />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Menu">
          <p>Help</p>
          <button type="button" role="menuitem" onClick={() => { openTutorial(); setOpen(false) }}>
            How to play
          </button>
          <button type="button" role="menuitem" onClick={() => { setGuide(true); setOpen(false) }}>
            Reference &amp; sound
          </button>
          <p>Danger</p>
          <button
            type="button"
            role="menuitem"
            style={confirm ? { color: 'var(--danger)' } : undefined}
            onClick={() => {
              if (!confirm) return setConfirm(true)
              reset()
              setOpen(false)
            }}
          >
            {confirm ? 'Tap again to start over' : 'Start a new country'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ dock */

export function RegionDock() {
  const tool = useRegion((s) => s.tool)
  const setTool = useRegion((s) => s.setTool)
  const building = useRegion((s) => s.building)
  const setBuilding = useRegion((s) => s.setBuilding)
  // Selected as a number, not an array: zustand compares selector results by
  // identity, and a fresh array every read is an infinite render loop.
  const served = useRegion(selectServed)
  const unlocked = useMemo(() => unlockedFor(served), [served])
  const status = useRegion((s) => s.status)
  const lift = useRegion((s) => s.lift)
  const setLift = useRegion((s) => s.setLift)
  const def = buildingById(building)

  return (
    <div className="dock pane" role="group" aria-label="Tools">
      <div className="flyout pane" aria-live="polite">
        {tool === 'build' ? (
          <>
            <div className="palette" role="group" aria-label="Buildings">
              {BUILDINGS.map((b) => {
                const open = unlocked.some((u) => u.id === b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="palette__item"
                    aria-pressed={building === b.id}
                    disabled={!open}
                    aria-label={
                      open
                        ? `${b.name} — £${b.cost} to build, £${b.upkeep} a month`
                        : `${b.name} — opens once the railway carries ${b.unlockAt} people`
                    }
                    onClick={() => setBuilding(b.id)}
                  >
                    <Icon name={BUILDING_ICON[b.id]} size={17} />
                    <span>{open ? b.name : `${b.unlockAt}+`}</span>
                  </button>
                )
              })}
            </div>
            <h3>
              {def.name}
              <em>£{def.cost.toLocaleString()}</em>
              <em style={{ color: 'var(--text-faint)' }}>£{def.upkeep}/mo</em>
              {def.range > 0 && <em style={{ color: 'var(--text-faint)' }}>{def.range} m reach</em>}
            </h3>
            <p>{def.blurb}</p>
          </>
        ) : (
          <>
            <h3>
              {TOOLS.find((t) => t.id === tool)?.label}
              {tool === 'rail' && lift !== 0 && (
                <em>{lift > 0 ? `+${lift} m` : `${lift} m`}</em>
              )}
            </h3>
            <p>{status.text}</p>
            {tool === 'rail' && (
              <div className="chips" style={{ marginTop: 8 }}>
                <button type="button" className="chip" onClick={() => setLift(lift - 4)}>
                  Lower the new line
                </button>
                <button type="button" className="chip" onClick={() => setLift(0)}>
                  On the ground
                </button>
                <button type="button" className="chip" onClick={() => setLift(lift + 4)}>
                  Raise the new line
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tool"
          aria-pressed={tool === t.id}
          aria-label={`${t.label} — key ${t.key}`}
          title={`${t.label} (${t.key})`}
          onClick={() => setTool(t.id)}
        >
          <Icon name={t.icon} size={22} />
          <kbd aria-hidden="true">{t.key}</kbd>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ panel */

const STATE_LABEL: Record<TownReport['state'], string> = {
  unserved: 'No station',
  isolated: 'No link',
  growing: 'Growing',
  full: 'At capacity',
  declining: 'Emptying',
}
const STATE_COLOUR: Record<TownReport['state'], string> = {
  unserved: 'var(--danger)',
  isolated: 'var(--accent)',
  growing: 'var(--good)',
  full: 'var(--info)',
  declining: 'var(--danger)',
}

export function RegionPanel({ reports }: { reports: TownReport[] }) {
  const [open, setOpen] = useState(true)
  const trains = useRegion((s) => s.trains)
  const capacity = useRegion(selectCapacity)
  const setTrains = useRegion((s) => s.setTrains)
  const stations = useRegion(selectStations)
  const passengers = useRegion((s) => s.passengers)
  const months = useRegion((s) => s.months)
  const growing = reports.filter((r) => r.state === 'growing' || r.state === 'full').length

  return (
    <aside className="side pane" data-open={open} aria-label="The country">
      <div className="side__head">
        <h2>The country</h2>
        <button
          type="button"
          className="btn btn--quiet btn--icon"
          aria-expanded={open}
          aria-label={open ? 'Collapse the panel' : 'Expand the panel'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="panel" />
        </button>
      </div>
      <div className="side__body">
        <div className="grid2">
          <div className="metric">
            <b>
              {growing} <small>/ {reports.length}</small>
            </b>
            <span>Places growing</span>
          </div>
          <div className="metric">
            <b>{stations}</b>
            <span>Stations</span>
          </div>
          <div className="metric">
            <b>{Math.floor(passengers).toLocaleString()}</b>
            <span>Passengers carried</span>
          </div>
          <div className="metric">
            <b>{Math.floor(months)}</b>
            <span>Months open</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="trains">
            Trains running — {trains} of {capacity}
            {capacity === 1 && ' (build an engine shed for more)'}
          </label>
          <input
            id="trains"
            type="range"
            min={1}
            max={Math.max(1, capacity)}
            step={1}
            value={trains}
            onChange={(e) => setTrains(Number(e.target.value))}
          />
        </div>

        {reports.length > 0 ? (
          <ul className="rowlist">
            {[...reports]
              .sort((a, b) => b.settlement.population - a.settlement.population)
              .map((r) => (
                <li key={r.settlement.id}>
                  <b>{r.settlement.name}</b>
                  <span className="num">{Math.round(r.settlement.population)}</span>
                  <small>
                    {TIER_LABEL[r.tier]} · site {Math.round(r.quality * 100)}%
                  </small>
                  <span className="tag" style={{ color: STATE_COLOUR[r.state] }}>
                    {STATE_LABEL[r.state]}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="lede">No settlements on this map.</p>
        )}
      </div>
    </aside>
  )
}

/* ---------------------------------------------------------------- readout */

export function RegionReadout() {
  const view = useRegion((s) => s.view)
  const setView = useRegion((s) => s.setView)
  const hovered = useRegion((s) => s.hovered)

  return (
    <div className="readout">
      <div className="readout__tile pane">
        <span>
          Easting <b>{hovered ? Math.round(hovered.x) : '—'}</b>
        </span>
        <span>
          Northing <b>{hovered ? Math.round(hovered.z) : '—'}</b>
        </span>
      </div>
      <div className="views pane" role="group" aria-label="Camera">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            aria-label={v.label}
            title={v.label}
            onClick={() => setView(v.id)}
          >
            <Icon name={v.icon} size={17} />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the ladder */

/**
 * How far up the ladder the railway has climbed. Reads in people carried
 * rather than people in the region, because that is what actually earns the
 * next rung — and it makes the very first station feel like it did something.
 */
function Ladder() {
  const served = useRegion(selectServed)
  const here = milestoneAt(served)
  const next = nextMilestone(served)
  const fraction = progressTo(served)
  const rung = MILESTONES.indexOf(here) + 1

  return (
    <div
      className="ladder"
      role="group"
      aria-label={
        next
          ? `${here.name}, rung ${rung} of ${MILESTONES.length}. ${Math.round(served)} of ${next.served} people carried towards ${next.name}.`
          : `${here.name} — the top of the ladder.`
      }
    >
      <div className="ladder__head">
        <b>{here.name}</b>
        <i>
          {next
            ? `${Math.round(served).toLocaleString()} / ${next.served.toLocaleString()} carried`
            : `${Math.round(served).toLocaleString()} carried`}
        </i>
      </div>
      <div className="ladder__track" aria-hidden="true">
        <span style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- what to do next */

/**
 * The advisor. One instruction at a time, derived from the state of the
 * country, so it is never stale and never needs stepping through.
 */
export function RegionObjective({ objective }: { objective: Objective }) {
  const setTool = useRegion((s) => s.setTool)
  const setBuilding = useRegion((s) => s.setBuilding)
  const tool = useRegion((s) => s.tool)

  const act = () => {
    if (!objective.tool) return
    setTool(objective.tool)
    if (objective.building) setBuilding(objective.building as BuildingId)
  }

  return (
    <aside
      className={`objective pane${objective.idle ? ' objective--idle' : ''}`}
      aria-label="What to do next"
    >
      <span className="objective__tag">{objective.idle ? 'Where you are' : 'Next'}</span>
      <b>{objective.title}</b>
      <p>{objective.detail}</p>
      {objective.tool && tool !== objective.tool && (
        <button type="button" className="btn btn--accent" onClick={act}>
          {objective.tool === 'rail' ? 'Take the rail tool' : 'Take the build tool'}
        </button>
      )}
    </aside>
  )
}

/* -------------------------------------------------------------- the fanfare */

/** Shown once, when a rung is reached. Dismisses itself if left alone. */
export function RegionFanfare() {
  const fanfare = useRegion((s) => s.fanfare)
  const clear = useRegion((s) => s.clearFanfare)

  useEffect(() => {
    if (!fanfare) return
    const id = window.setTimeout(clear, 9000)
    return () => window.clearTimeout(id)
  }, [fanfare, clear])

  if (!fanfare) return null
  const opened = fanfare.unlocks ? buildingById(fanfare.unlocks) : null

  return (
    <div className="fanfare pane" role="status">
      <span className="fanfare__tag">Milestone</span>
      <b>{fanfare.name}</b>
      <p>{fanfare.blurb}</p>
      <div className="fanfare__rewards">
        <span>
          <Icon name="coin" size={15} /> £{fanfare.grant.toLocaleString()} grant
        </span>
        {opened && (
          <span>
            <Icon name="station" size={15} /> {opened.name} unlocked
          </span>
        )}
      </div>
      <button type="button" className="btn btn--quiet" onClick={clear}>
        Good
      </button>
    </div>
  )
}
