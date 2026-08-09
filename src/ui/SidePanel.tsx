import { useEffect, useState } from 'react'
import {
  MILESTONES,
  SIZE_UNLOCKS,
  TIER_LABEL,
  nextMilestone,
  type SettlementReport,
} from '../game/economy'
import { WORLD_SIZES } from '../game/grid'
import { LEVELS } from '../game/levels'
import type { RouteReport } from '../game/scoring'
import type { Coord, LevelDef, RailLine, WorldSize, World } from '../game/types'
import { selectStarsTotal, useGame } from '../store/useGame'
import { AccessibleGrid } from './AccessibleGrid'
import { Icon } from './Icon'
import { Stars } from './Stars'

const SIZES: WorldSize[] = ['small', 'wide', 'grand']

interface SidePanelProps {
  level: LevelDef
  report: RouteReport
  country: SettlementReport[]
  world: World
  lines: RailLine[]
  onPick: (c: Coord) => void
}

/**
 * The one docked panel. It carries whatever the current mode actually needs —
 * the briefing in Survey, the state of the country in Build — and always the
 * keyboard grid, so the game is fully playable without the canvas.
 */
export function SidePanel({ level, report, country, world, lines, onPick }: SidePanelProps) {
  const mode = useGame((s) => s.mode)
  const [open, setOpen] = useState(true)

  return (
    <aside className="side pane" data-open={open} aria-label={mode === 'puzzle' ? 'Survey briefing' : 'The country'}>
      <div className="side__head">
        <h2>{mode === 'puzzle' ? level.name : 'The country'}</h2>
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
        {mode === 'puzzle' ? (
          <SurveyBody level={level} report={report} />
        ) : (
          <CountryBody country={country} />
        )}
        <AccessibleGrid
          world={world}
          lines={lines}
          onPick={onPick}
          onFocusTile={(c) => useGame.getState().setHovered(c)}
          label={
            mode === 'puzzle'
              ? `${level.name}: ${world.w} by ${world.h} survey grid`
              : `Free build map: ${world.w} by ${world.h} grid`
          }
        />
      </div>
    </aside>
  )
}

function SurveyBody({ level, report }: { level: LevelDef; report: RouteReport }) {
  const progress = useGame((s) => s.progress[level.id])
  const totalStars = useGame(selectStarsTotal)
  const setLevelPicker = useGame((s) => s.setLevelPicker)
  const delivered = useGame((s) => s.delivered)
  const nextLevel = useGame((s) => s.nextLevel)
  const clearRoute = useGame((s) => s.clearRoute)

  return (
    <>
      <p className="lede">
        <strong>
          {level.depotName} → {level.destinationName}
        </strong>
        <br />
        {level.brief}
      </p>

      <div className="grid2">
        <Metric label="Track laid" value={String(report.trackTiles)} unit={`/ ${level.par} par`} warn={report.trackTiles > level.par} />
        <Metric label="Total climb" value={String(report.climb)} unit="levels" />
        <Metric label="Bridges" value={String(report.bridges)} unit={`/ ${level.bridgeBudget}`} warn={report.overBudget} />
        <Metric label="Halts served" value={String(report.stopsServed)} unit={`/ ${report.stopsRequired}`} />
      </div>

      {delivered && (
        <div>
          <p className="lede" style={{ marginBottom: 8 }}>
            <strong>Delivered to {level.destinationName}.</strong> {report.trackTiles} lengths against a
            par of {level.par}.
          </p>
          <div style={{ marginBottom: 8 }}>
            <Stars count={report.stars} label={`${report.stars} of 3 stars awarded`} />
          </div>
          <div className="chips">
            <button type="button" className="btn btn--accent" onClick={nextLevel}>
              Next survey
            </button>
            <button type="button" className="chip" onClick={clearRoute}>
              Survey again
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <span>
          Survey {level.index + 1} of {LEVELS.length} · {totalStars} of {LEVELS.length * 3} stars
        </span>
        <div className="chips">
          <Stars count={progress?.stars ?? 0} label={`${progress?.stars ?? 0} of 3 stars here`} />
          <button type="button" className="chip" onClick={() => setLevelPicker(true)}>
            Choose a survey
          </button>
        </div>
      </div>
    </>
  )
}

const STATE_LABEL: Record<SettlementReport['state'], string> = {
  unserved: 'No station',
  isolated: 'No link',
  growing: 'Growing',
  full: 'At capacity',
}
const STATE_COLOUR: Record<SettlementReport['state'], string> = {
  unserved: 'var(--danger)',
  isolated: 'var(--accent)',
  growing: 'var(--good)',
  full: 'var(--info)',
}

function CountryBody({ country }: { country: SettlementReport[] }) {
  const free = useGame((s) => s.free)
  const best = useGame((s) => s.career.bestPopulation)
  const setFreeSize = useGame((s) => s.setFreeSize)
  const setTrains = useGame((s) => s.setTrains)
  const grow = useGame((s) => s.grow)
  const clearSandbox = useGame((s) => s.clearSandbox)
  const milestone = useGame((s) => s.milestone)
  const dismissMilestone = useGame((s) => s.dismissMilestone)

  const [pendingSize, setPendingSize] = useState<WorldSize | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 6000)
    return () => clearTimeout(t)
  }, [confirmClear])

  const growing = country.filter((r) => r.state === 'growing' || r.state === 'full').length
  const { next, progress } = nextMilestone(best)

  return (
    <>
      {milestone && (
        <div className="lede" style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 10 }}>
          <strong>{milestone}</strong>
          <br />
          {MILESTONES.find((m) => m.title === milestone)?.detail}
          <div className="chips" style={{ marginTop: 8 }}>
            <button type="button" className="chip" onClick={dismissMilestone}>
              Very good
            </button>
          </div>
        </div>
      )}

      <div className="grid2">
        <Metric label="Served" value={String(growing)} unit={`/ ${country.length} places`} />
        <Metric label="Passengers" value={Math.floor(free.passengers).toLocaleString()} unit="carried" />
      </div>

      {next && (
        <div className="field">
          <span>
            {next.title} — {best} / {next.population}
          </span>
          <div className="bar">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={next.population}
            aria-valuenow={Math.min(best, next.population)}
            aria-label={`Progress towards ${next.title}`}
            style={{ fontSize: 11.5, color: 'var(--text-faint)' }}
          >
            {next.detail}
          </span>
        </div>
      )}

      {country.length > 0 ? (
        <ul className="rowlist">
          {[...country]
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
        <p className="lede">
          No settlements on this map yet. Grow a landscape and a few hamlets will find likely ground.
        </p>
      )}

      <div className="field">
        <label htmlFor="trains">Trains in service — {free.trains}</label>
        <input
          id="trains"
          type="range"
          min={1}
          max={5}
          step={1}
          value={free.trains}
          onChange={(e) => setTrains(Number(e.target.value))}
        />
      </div>

      <div className="field">
        <span id="size-label">Map size</span>
        <div className="chips" role="group" aria-labelledby="size-label">
          {SIZES.map((size) => {
            const unlocked = best >= SIZE_UNLOCKS[size]
            return (
              <button
                key={size}
                type="button"
                className="chip"
                aria-pressed={free.size === size}
                disabled={!unlocked}
                onClick={() => {
                  if (free.size === size) return
                  if (pendingSize === size) {
                    setFreeSize(size)
                    setPendingSize(null)
                  } else setPendingSize(size)
                }}
              >
                {!unlocked
                  ? `${WORLD_SIZES[size].label} · locked at ${SIZE_UNLOCKS[size]}`
                  : pendingSize === size
                    ? 'Confirm — replaces this map'
                    : `${WORLD_SIZES[size].label} · ${WORLD_SIZES[size].w}×${WORLD_SIZES[size].h}`}
              </button>
            )
          })}
        </div>
      </div>

      <div className="chips">
        <button type="button" className="btn" onClick={grow}>
          <Icon name="grow" size={16} />
          Grow a landscape
        </button>
        <button
          type="button"
          className={confirmClear ? 'btn btn--danger' : 'btn'}
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true)
              return
            }
            clearSandbox()
            setConfirmClear(false)
          }}
        >
          {confirmClear ? 'Confirm — clear the map' : 'Clear the map'}
        </button>
      </div>
    </>
  )
}

function Metric({
  label,
  value,
  unit,
  warn,
}: {
  label: string
  value: string
  unit?: string
  warn?: boolean
}) {
  return (
    <div className="metric" data-warn={warn ? 'true' : undefined}>
      <b>
        {value} {unit && <small>{unit}</small>}
      </b>
      <span>{label}</span>
    </div>
  )
}
