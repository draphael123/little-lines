import { LEVELS } from '../game/levels'
import type { RouteReport } from '../game/scoring'
import type { LevelDef } from '../game/types'
import { selectStarsTotal, useGame } from '../store/useGame'
import { Stars } from './Stars'

export function PuzzlePanel({ level, report }: { level: LevelDef; report: RouteReport }) {
  const progress = useGame((s) => s.progress[level.id])
  const totalStars = useGame(selectStarsTotal)
  const setLevelPicker = useGame((s) => s.setLevelPicker)
  const undo = useGame((s) => s.undo)
  const redo = useGame((s) => s.redo)
  const clearRoute = useGame((s) => s.clearRoute)
  const askHint = useGame((s) => s.askHint)
  const canUndo = useGame((s) => s.past.length > 0)
  const canRedo = useGame((s) => s.future.length > 0)
  const running = useGame((s) => s.puzzleRunning)

  return (
    <>
      <section className="card" aria-labelledby="briefing-title">
        <p className="card__eyebrow">
          Survey {level.index + 1} of {LEVELS.length}
        </p>
        <h2 className="card__title" id="briefing-title">
          {level.name}
        </h2>
        <p className="card__sub">
          {level.depotName} depot → {level.destinationName}
        </p>
        <p className="card__body">{level.brief}</p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: 12,
          }}
        >
          <Stars
            count={progress?.stars ?? 0}
            label={`${progress?.stars ?? 0} of 3 stars earned on ${level.name}`}
          />
          <button type="button" className="btn" onClick={() => setLevelPicker(true)}>
            Choose a survey
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="objective-title">
        <p className="card__eyebrow" id="objective-title">
          Objective
        </p>
        <dl className="readout">
          <div>
            <dt>Track laid</dt>
            <dd className={report.trackTiles > level.par ? 'over' : undefined}>
              {report.trackTiles} <small>/ par {level.par}</small>
            </dd>
          </div>
          <div>
            <dt>Total climb</dt>
            <dd>
              {report.climb} <small>levels</small>
            </dd>
          </div>
          <div>
            <dt>Bridges</dt>
            <dd className={report.overBudget ? 'over' : undefined}>
              {report.bridges} <small>/ {level.bridgeBudget}</small>
            </dd>
          </div>
          <div>
            <dt>Required stops</dt>
            <dd>
              {report.stopsServed} <small>/ {report.stopsRequired}</small>
            </dd>
          </div>
          <div>
            <dt>Campaign stars</dt>
            <dd>
              {totalStars} <small>/ {LEVELS.length * 3}</small>
            </dd>
          </div>
          <div>
            <dt>Best here</dt>
            <dd>
              {progress?.bestTiles ?? '—'} {progress?.bestTiles ? <small>lengths</small> : null}
            </dd>
          </div>
        </dl>

        <div className="chips" style={{ marginTop: 12 }}>
          <button type="button" className="chip" onClick={undo} disabled={!canUndo || running}>
            Undo
          </button>
          <button type="button" className="chip" onClick={redo} disabled={!canRedo || running}>
            Redo
          </button>
          <button type="button" className="chip" onClick={askHint} disabled={running}>
            Hint
          </button>
          <button type="button" className="chip" onClick={clearRoute} disabled={running}>
            Clear
          </button>
        </div>
      </section>
    </>
  )
}
