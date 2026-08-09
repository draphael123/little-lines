import { dispatchStage, type RouteReport } from '../game/scoring'
import type { LevelDef } from '../game/types'
import { useGame } from '../store/useGame'
import { coachingFor } from './coach'
import { Stars } from './Stars'

const STEPS = [
  { id: 'build', label: 'One', title: 'Build' },
  { id: 'connect', label: 'Two', title: 'Connect' },
  { id: 'deliver', label: 'Three', title: 'Deliver' },
] as const

export function DispatchStrip({ report }: { report: RouteReport }) {
  const mode = useGame((s) => s.mode)
  const delivered = useGame((s) => s.delivered)
  const free = useGame((s) => s.free)

  const stage =
    mode === 'puzzle'
      ? dispatchStage(report, delivered)
      : free.lines.length === 0
        ? 'build'
        : free.running
          ? 'deliver'
          : 'connect'

  const order = STEPS.map((s) => s.id)
  const activeIndex = order.indexOf(stage)

  return (
    <div className="dispatch" role="group" aria-label="Dispatch progress">
      {STEPS.map((step, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo'
        return (
          <div
            key={step.id}
            className="dispatch__step"
            data-state={state}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            {step.label}
            <b>{step.title}</b>
          </div>
        )
      })}
    </div>
  )
}

export function RunButton({ report }: { report: RouteReport }) {
  const mode = useGame((s) => s.mode)
  const running = useGame((s) => (s.mode === 'puzzle' ? s.puzzleRunning : s.free.running))
  const delivered = useGame((s) => s.delivered)
  const toggleRun = useGame((s) => s.toggleRun)
  const hasLines = useGame((s) => s.free.lines.some((l) => l.tiles.length >= 2))

  const disabled = mode === 'puzzle' ? delivered : !hasLines
  const label =
    mode === 'puzzle'
      ? delivered
        ? 'Delivered'
        : running
          ? 'Hold the engine'
          : 'Run the delivery'
      : running
        ? 'Hold all trains'
        : 'Set the lines running'

  return (
    <button
      type="button"
      className="run"
      data-running={running}
      onClick={toggleRun}
      disabled={disabled}
      aria-describedby="dispatch-status"
    >
      <span className="run__lamp" aria-hidden="true" />
      {label}
      {mode === 'puzzle' && !running && !delivered && !report.complete && (
        <span className="sr-only"> — the route is not finished yet</span>
      )}
    </button>
  )
}

export function StatusCard({ level, report }: { level: LevelDef; report: RouteReport }) {
  const status = useGame((s) => s.status)
  const coaching = useGame((s) => coachingFor(s, level, report))
  return (
    <div className="status" data-tone={status.tone} id="dispatch-status">
      <strong>{status.text}</strong>
      <p className="coach" style={{ margin: 0 }}>
        {coaching}
      </p>
    </div>
  )
}

export function CompletionCard({ level, report }: { level: LevelDef; report: RouteReport }) {
  const delivered = useGame((s) => s.delivered)
  const nextLevel = useGame((s) => s.nextLevel)
  const clearRoute = useGame((s) => s.clearRoute)
  if (!delivered) return null
  return (
    <section className="card" aria-live="polite">
      <p className="card__eyebrow">Delivered</p>
      <h3 className="card__title" style={{ fontSize: 20 }}>
        {level.destinationName}
      </h3>
      <p className="card__sub">
        {report.trackTiles} lengths · par {level.par} · {report.climb} levels climbed
      </p>
      <div style={{ margin: '10px 0 12px' }}>
        <Stars count={report.stars} label={`${report.stars} of 3 stars awarded`} />
      </div>
      <div className="chips">
        <button type="button" className="btn btn--brass" onClick={nextLevel}>
          Next survey
        </button>
        <button type="button" className="btn" onClick={clearRoute}>
          Survey it again
        </button>
      </div>
    </section>
  )
}
