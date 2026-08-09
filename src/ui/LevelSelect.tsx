import { LEVELS } from '../game/levels'
import { selectStarsTotal, useGame } from '../store/useGame'
import { Dialog } from './Dialog'
import { Stars } from './Stars'

export function LevelSelect() {
  const open = useGame((s) => s.showLevels)
  const setOpen = useGame((s) => s.setLevelPicker)
  const selectLevel = useGame((s) => s.selectLevel)
  const current = useGame((s) => s.levelId)
  const progress = useGame((s) => s.progress)
  const total = useGame(selectStarsTotal)

  return (
    <Dialog
      open={open}
      title="The campaign"
      labelSuffix={`${total} of ${LEVELS.length * 3} stars earned · every survey is open from the start`}
      onClose={() => setOpen(false)}
    >
      <div className="cards">
        {LEVELS.map((level) => {
          const earned = progress[level.id]
          return (
            <button
              key={level.id}
              type="button"
              className="card"
              aria-current={level.id === current}
              onClick={() => selectLevel(level.id)}
            >
              <span>Survey {level.index + 1}</span>
              <b>{level.name}</b>
              <span>
                {level.kinds[0].length}×{level.kinds.length} · par {level.par} ·{' '}
                {level.bridgeBudget} bridge{level.bridgeBudget === 1 ? '' : 's'}
                {level.stops.length > 0 &&
                  ` · ${level.stops.length} halt${level.stops.length === 1 ? '' : 's'}`}
              </span>
              <Stars
                count={earned?.stars ?? 0}
                label={`${earned?.stars ?? 0} of 3 stars on ${level.name}`}
              />
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}
