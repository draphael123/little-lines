import { dispatchStage, type RouteReport } from '../game/scoring'
import type { LevelDef } from '../game/types'
import { useGame } from '../store/useGame'
import { coachingFor } from './coach'
import { Icon } from './Icon'

const STAGES = ['Build', 'Connect', 'Deliver'] as const

/** Dispatch: where the line stands, what to do next, and the button that runs it. */
export function RunDock({ level, report }: { level: LevelDef; report: RouteReport }) {
  const mode = useGame((s) => s.mode)
  const delivered = useGame((s) => s.delivered)
  const free = useGame((s) => s.free)
  const running = useGame((s) => (s.mode === 'puzzle' ? s.puzzleRunning : s.free.running))
  const toggleRun = useGame((s) => s.toggleRun)
  const status = useGame((s) => s.status)
  const coaching = useGame((s) => coachingFor(s, level, report))

  const stage =
    mode === 'puzzle'
      ? dispatchStage(report, delivered)
      : free.lines.length === 0
        ? 'build'
        : free.running
          ? 'deliver'
          : 'connect'
  const activeIndex = ['build', 'connect', 'deliver'].indexOf(stage)

  const hasLines = free.lines.some((l) => l.tiles.length >= 2)
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
    <div className="rundock pane">
      <div className="stages" role="group" aria-label="Dispatch progress">
        {STAGES.map((s, i) => (
          <div
            key={s}
            className="stage"
            data-state={i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo'}
            aria-current={i === activeIndex ? 'step' : undefined}
          >
            {s}
          </div>
        ))}
      </div>

      <div className="status" data-tone={status.tone} id="dispatch-status">
        <b>{status.text}</b>
        {coaching}
      </div>

      <button
        type="button"
        className="run"
        data-running={running}
        disabled={disabled}
        onClick={toggleRun}
        aria-describedby="dispatch-status"
      >
        <Icon name={running ? 'pause' : 'play'} size={18} />
        {label}
      </button>
    </div>
  )
}
