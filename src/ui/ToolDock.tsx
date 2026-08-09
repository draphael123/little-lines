import type { FreeTool } from '../game/types'
import { TOOL_INFO, toolInfo, useGame } from '../store/useGame'
import { Icon, type IconName } from './Icon'

const TOOL_ICON: Record<FreeTool, IconName> = {
  rail: 'rail',
  erase: 'erase',
  raise: 'raise',
  lower: 'lower',
  tunnel: 'tunnel',
  tree: 'tree',
  water: 'water',
  station: 'station',
}

/**
 * The bottom dock. In Build it is the tool palette with a flyout explaining
 * whatever is selected; in Survey there are no tools, so it carries the four
 * editing actions instead.
 */
export function ToolDock() {
  const mode = useGame((s) => s.mode)
  return mode === 'free' ? <BuildTools /> : <SurveyActions />
}

function BuildTools() {
  const tool = useGame((s) => s.free.tool)
  const setTool = useGame((s) => s.setTool)
  const active = toolInfo(tool)

  return (
    <div className="dock pane" role="group" aria-label="Build tools">
      <div className="flyout pane" aria-live="polite">
        <h3>
          {active.name}
          {active.cost > 0 && <em>£{active.cost}</em>}
        </h3>
        <p>{active.hint}</p>
      </div>
      {TOOL_INFO.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tool"
          aria-pressed={tool === t.id}
          aria-label={`${t.name}${t.cost > 0 ? `, £${t.cost}` : ''} — key ${t.key}`}
          title={`${t.name} (${t.key})`}
          onClick={() => setTool(t.id)}
        >
          <Icon name={TOOL_ICON[t.id]} size={22} />
          <kbd aria-hidden="true">{t.key}</kbd>
        </button>
      ))}
    </div>
  )
}

function SurveyActions() {
  const undo = useGame((s) => s.undo)
  const redo = useGame((s) => s.redo)
  const askHint = useGame((s) => s.askHint)
  const clearRoute = useGame((s) => s.clearRoute)
  const canUndo = useGame((s) => s.past.length > 0)
  const canRedo = useGame((s) => s.future.length > 0)
  const running = useGame((s) => s.puzzleRunning)

  const actions = [
    { id: 'undo', icon: 'undo' as IconName, label: 'Undo', run: undo, off: !canUndo || running },
    { id: 'redo', icon: 'redo' as IconName, label: 'Redo', run: redo, off: !canRedo || running },
    { id: 'hint', icon: 'hint' as IconName, label: 'Hint', run: askHint, off: running },
    { id: 'clear', icon: 'clear' as IconName, label: 'Clear the line', run: clearRoute, off: running },
  ]

  return (
    /* No flyout here: the dispatch panel already carries the running commentary,
       and repeating it under the cursor was just noise. */
    <div className="dock pane" role="group" aria-label="Survey actions">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className="tool"
          aria-label={a.label}
          title={a.label}
          disabled={a.off}
          onClick={a.run}
          style={a.off ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
        >
          <Icon name={a.icon} size={22} />
        </button>
      ))}
    </div>
  )
}
