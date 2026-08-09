import { BUILDINGS, buildingById } from '../game/buildings'
import type { BuildingId, FreeTool } from '../game/types'
import { TOOL_INFO, toolInfo, useGame } from '../store/useGame'
import { Icon, type IconName } from './Icon'

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

const TOOL_ICON: Record<FreeTool, IconName> = {
  rail: 'rail',
  erase: 'erase',
  raise: 'raise',
  lower: 'lower',
  tunnel: 'tunnel',
  tree: 'tree',
  water: 'water',
  build: 'station',
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
  const chosen = useGame((s) => s.free.building)
  const setBuilding = useGame((s) => s.setBuilding)
  const unlocked = useGame((s) => s.unlocked)
  const active = toolInfo(tool)
  const def = buildingById(chosen)
  const showing = tool === 'build'

  return (
    <div className="dock pane" role="group" aria-label="Build tools">
      <div className="flyout pane" aria-live="polite">
        {showing ? (
          <>
            <div className="palette" role="group" aria-label="Buildings">
              {BUILDINGS.map((b) => {
                const earned = unlocked.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="palette__item"
                    aria-pressed={chosen === b.id}
                    disabled={!earned}
                    aria-label={
                      earned
                        ? `${b.name} — £${b.cost} to build, £${b.upkeep} a month`
                        : `${b.name} — locked, earned by finishing a survey`
                    }
                    title={earned ? `${b.name} — £${b.cost}` : `${b.name} — locked`}
                    onClick={() => setBuilding(b.id)}
                  >
                    <Icon name={BUILDING_ICON[b.id]} size={18} />
                    <span>{earned ? b.name : 'Locked'}</span>
                  </button>
                )
              })}
            </div>
            <h3>
              {def.name}
              <em>£{def.cost}</em>
              <em style={{ color: 'var(--text-faint)' }}>£{def.upkeep}/mo</em>
            </h3>
            <p>{def.blurb}</p>
          </>
        ) : (
          <>
            <h3>
              {active.name}
              {active.cost > 0 && <em>£{active.cost}</em>}
            </h3>
            <p>{active.hint}</p>
          </>
        )}
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
