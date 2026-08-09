import { useEffect, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { TileFace } from './TileFace'
import { AudioMenu } from './AudioMenu'
import { selectHeld, selectOver, useGame, useNextTile, useOpenQuests } from '../store/useGame'
import { describeTile } from '../lines/tiles'
import { labelFor } from '../lines/quests'
import { tally } from '../lines/board'
import { OPENING_STACK } from '../lines/deck'

/* ----------------------------------------------------------------- top bar */

export function TopBar() {
  const stack = useGame((s) => s.game.stack)
  const score = useGame((s) => s.game.score)
  const best = useGame((s) => s.best)
  const night = useGame((s) => s.night)
  const setNight = useGame((s) => s.setNight)
  const setShowHelp = useGame((s) => s.setShowHelp)

  return (
    <div className="bar">
      <div className="bar__group">
        <Readout label="Tiles left" value={stack} emphasis={stack <= 5} />
        <Readout label="Score" value={score.toLocaleString()} />
        {best > 0 && <Readout label="Best" value={best.toLocaleString()} muted />}
      </div>

      <div className="bar__group">
        <button
          type="button"
          className="chip"
          aria-pressed={night}
          onClick={() => setNight(!night)}
          title="Day or night (N)"
        >
          <Icon name={night ? 'moon' : 'sun'} />
          <span className="sr-only">{night ? 'Night' : 'Day'}</span>
        </button>
        <button type="button" className="chip" onClick={() => setShowHelp(true)} title="How to play (?)">
          <Icon name="hint" />
          <span className="sr-only">How to play</span>
        </button>
      </div>
    </div>
  )
}

function Readout({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string
  value: string | number
  emphasis?: boolean
  muted?: boolean
}) {
  return (
    <div className={`readout${emphasis ? ' readout--warn' : ''}${muted ? ' readout--muted' : ''}`}>
      <span className="readout__label">{label}</span>
      <span className="readout__value">{value}</span>
    </div>
  )
}

/* -------------------------------------------------------------- the tile */

export function Hand() {
  const held = useGame(selectHeld)
  const next = useNextTile()
  const rotation = useGame((s) => s.game.rotation)
  const turn = useGame((s) => s.turn)
  const over = useGame(selectOver)

  if (over) return null

  return (
    <div className="hand">
      <div className="hand__main">
        <button
          type="button"
          className="chip chip--round"
          onClick={() => turn(-1)}
          title="Turn anticlockwise (Q)"
        >
          <Icon name="west" />
          <span className="sr-only">Turn anticlockwise</span>
        </button>

        <div className="hand__tile">
          <TileFace tile={held} turn={rotation} size={96} label={held ? describeTile(held) : undefined} />
        </div>

        <button type="button" className="chip chip--round" onClick={() => turn(1)} title="Turn clockwise (E)">
          <Icon name="east" />
          <span className="sr-only">Turn clockwise</span>
        </button>
      </div>

      <p className="hand__what">{held ? describeTile(held) : 'Nothing left to place'}</p>

      <div className="hand__next">
        <span className="hand__nextLabel">Next</span>
        <TileFace tile={next} size={38} label={next ? `Next: ${describeTile(next)}` : 'Nothing next'} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- quests */

export function Requests() {
  const quests = useOpenQuests()
  if (quests.length === 0) return null

  return (
    <section className="panel" aria-label="What the country is asking for">
      <h2 className="panel__title">Asking</h2>
      <ul className="quests">
        {quests.slice(0, 5).map((quest) => {
          const share = Math.min(1, quest.progress / quest.target)
          return (
            <li key={quest.id} className="quest">
              <div className="quest__row">
                <span className="quest__what">{labelFor(quest.spec)}</span>
                <span className="quest__count">
                  {quest.progress}/{quest.target}
                </span>
              </div>
              <div className="quest__bar">
                <div className="quest__fill" style={{ width: `${share * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      {quests.length > 5 && <p className="panel__more">and {quests.length - 5} more</p>}
    </section>
  )
}

/* ---------------------------------------------------------------- ticker */

/** The last thing that happened, held on screen just long enough to read. */
export function Ticker() {
  const flash = useGame((s) => s.flash)
  const [shown, setShown] = useState(flash)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!flash) return
    setShown(flash)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(null), 2600)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [flash])

  if (!shown) return null
  return (
    <div className={`ticker ticker--${shown.tone}`} key={shown.id}>
      {shown.text}
    </div>
  )
}

/* ------------------------------------------------------------- endgame */

export function Summary() {
  const over = useGame(selectOver)
  const game = useGame((s) => s.game)
  const best = useGame((s) => s.best)
  const restart = useGame((s) => s.restart)

  if (!over) return null
  const counted = tally(game.tiles)
  const beaten = game.score >= best && game.score > 0

  return (
    <Dialog
      open
      title={beaten ? 'A record run' : 'The last tile'}
      onClose={restart}
      dismissible={false}
      footer={
        <button type="button" className="btn btn--accent" onClick={restart}>
          Another country
        </button>
      }
    >
      <p className="lede">
        {game.placed} tiles laid over what began as {OPENING_STACK}. {counted.stations}{' '}
        {counted.stations === 1 ? 'station' : 'stations'} stand in the country, and the longest run of
        railway joins {counted.joined} of them.
      </p>
      <dl className="summary">
        <div>
          <dt>Score</dt>
          <dd>{game.score.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{Math.max(best, game.score).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Snug fits</dt>
          <dd>{game.snugs}</dd>
        </div>
        <div>
          <dt>Perfect fills</dt>
          <dd>{game.perfects}</dd>
        </div>
        <div>
          <dt>Requests met</dt>
          <dd>
            {game.quests.filter((q) => q.state === 'done').length}/{game.quests.length}
          </dd>
        </div>
      </dl>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- help */

export function Help() {
  const open = useGame((s) => s.showHelp)
  const setShowHelp = useGame((s) => s.setShowHelp)

  return (
    <Dialog
      open={open}
      title="Little Lines"
      onClose={() => setShowHelp(false)}
      footer={
        <button type="button" className="btn btn--accent" onClick={() => setShowHelp(false)}>
          Start laying track
        </button>
      }
    >
      <p className="lede">
        Lay tiles next to tiles. Where two tiles meet, the ground on both sides of the border either
        agrees or it does not — and railway is ground like any other, so a line only carries on where
        the tile next to it also shows a line.
      </p>
      <ul className="rules">
        <li>
          <strong>Click</strong> to place, <strong>Q</strong> and <strong>E</strong> to turn the tile,{' '}
          <strong>drag</strong> to move about and <strong>scroll</strong> to come closer.
        </li>
        <li>
          Nothing is ever a mistake. A border that does not match simply earns nothing — you cannot
          lose, you can only run out of tiles.
        </li>
        <li>
          Please three or more neighbours at once and the stack hands a tile back. Fill a hole with all
          six sides agreeing and it hands back two.
        </li>
        <li>
          Tiles arrive carrying a <strong>flag</strong> when the country wants something — a wood grown
          to a certain size, or a station joined to others by rail. Meeting one pays well.
        </li>
      </ul>
      <AudioMenu />
    </Dialog>
  )
}
