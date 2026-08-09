import { TOOL_INFO, useGame } from '../store/useGame'
import { AudioMenu } from './AudioMenu'
import { Dialog } from './Dialog'

const RULES = [
  {
    title: 'Gradients',
    text: 'Rail rises or falls one elevation level per length, never two. Terrain may be steeper than that; the track simply cannot follow it.',
  },
  {
    title: 'Rock',
    text: 'Rock tiles block construction. In Free Build a tunnel drops the rail to the level of the surrounding ground and the mountain stays standing above it.',
  },
  {
    title: 'Water',
    text: 'Track over water becomes a bridge: a timber deck on trestles, its height interpolated between the two banks. Each water tile spends one bridge from a level’s budget.',
  },
  {
    title: 'Required halts',
    text: 'A brass disc marks a halt that the line must pass through. It turns green once the route serves it.',
  },
  {
    title: 'Scoring',
    text: 'Three stars at or under par, two within two lengths of par, one for arriving at all. Your best length for each survey is kept.',
  },
  {
    title: 'Loops and shuttles',
    text: 'In Free Build a line whose two ends finish next to each other is a closed loop and its trains circulate. Any other line is open, and its trains shuttle back and forth with a pause at each end.',
  },
  {
    title: 'How settlement works',
    text: 'You never build a town. A hamlet grows only when a station stands within two tiles of it and that station shares a network with a station serving somewhere else. Lines that touch anywhere form one network, so junctions really do connect.',
  },
  {
    title: 'Service quality',
    text: 'A network with more stations than its trains can work grows slowly. Roughly one train for every two stations keeps a network at full service; add engines or thin the stations out.',
  },
  {
    title: 'Where towns thrive',
    text: 'Flat meadow within sight of water grows fastest and carries the most people. High ground and land hemmed in by rock grow slowly and cap out small. Nowhere is ruled out — some places are simply villages forever.',
  },
  {
    title: 'Money',
    text: 'Rail £12 a length, £70 over water, ground works £15, a station £180, a tunnel £220. Fares come in continuously from the population being carried. There is no bankruptcy: a thin account only means waiting.',
  },
  {
    title: 'Milestones',
    text: 'The largest country you have ever grown is remembered across worlds. It opens the wide table at 120 people and the grand table at 350.',
  },
]

export function FieldGuide() {
  const open = useGame((s) => s.showFieldGuide)
  const setOpen = useGame((s) => s.setFieldGuide)
  return (
    <Dialog
      open={open}
      title="Field guide"
      labelSuffix="Everything the survey office can tell you"
      onClose={() => setOpen(false)}
    >
      <div className="guide">
        {RULES.map((rule) => (
          <section key={rule.title}>
            <h3>{rule.title}</h3>
            <p>{rule.text}</p>
          </section>
        ))}
      </div>

      <h3 style={{ marginTop: 22, fontSize: 18 }}>Build tools</h3>
      <div className="guide" style={{ marginTop: 8 }}>
        {TOOL_INFO.map((tool) => (
          <section key={tool.id}>
            <h3 style={{ fontSize: 15 }}>
              <kbd
                style={{
                  fontFamily: 'var(--ui)',
                  fontSize: 10,
                  border: '1px solid var(--hair-strong)',
                  padding: '1px 5px',
                  marginRight: 8,
                }}
              >
                {tool.key}
              </kbd>
              {tool.name}
            </h3>
            <p>{tool.hint}</p>
          </section>
        ))}
      </div>

      <h3 style={{ marginTop: 22, fontSize: 18 }}>Sound</h3>
      <AudioMenu />
    </Dialog>
  )
}
