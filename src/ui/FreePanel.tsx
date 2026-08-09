import { useEffect, useState } from 'react'
import { COSTS, SIZE_UNLOCKS } from '../game/economy'
import { WORLD_SIZES } from '../game/grid'
import { routeIsClosed } from '../game/track'
import type { Speed, WorldSize } from '../game/types'
import { TOOL_INFO, toolInfo, useGame } from '../store/useGame'

const SIZES: WorldSize[] = ['small', 'wide', 'grand']
const SPEEDS: Speed[] = ['slow', 'normal', 'fast']

export function FreePanel() {
  const free = useGame((s) => s.free)
  const setTool = useGame((s) => s.setTool)
  const setFreeSize = useGame((s) => s.setFreeSize)
  const setTrains = useGame((s) => s.setTrains)
  const setSpeed = useGame((s) => s.setSpeed)
  const grow = useGame((s) => s.grow)
  const clearSandbox = useGame((s) => s.clearSandbox)
  const startNewLine = useGame((s) => s.startNewLine)
  const undo = useGame((s) => s.undo)
  const redo = useGame((s) => s.redo)
  const canUndo = useGame((s) => s.freePast.length > 0)
  const canRedo = useGame((s) => s.freeFuture.length > 0)
  const best = useGame((s) => s.career.bestPopulation)

  const [pendingSize, setPendingSize] = useState<WorldSize | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const active = toolInfo(free.tool)

  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 6000)
    return () => clearTimeout(t)
  }, [confirmClear])

  const loops = free.lines.filter((l) => routeIsClosed(l.tiles)).length
  const shuttles = free.lines.length - loops

  return (
    <>
      <section className="card" aria-labelledby="tools-title">
        <p className="card__eyebrow" id="tools-title">
          Tools — keys 1 to 8
        </p>
        <div className="tools" style={{ marginTop: 10 }} role="group" aria-label="Free build tools">
          {TOOL_INFO.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-pressed={free.tool === tool.id}
              onClick={() => setTool(tool.id)}
            >
              <kbd aria-hidden="true">{tool.key}</kbd>
              {tool.name}
            </button>
          ))}
        </div>
        <div className="status" data-tone="info" style={{ marginTop: 12 }} aria-live="polite">
          <strong>
            {active.name}
            {active.cost > 0 && ` · £${active.cost}`}
            {active.id === 'rail' && ` · £${COSTS.bridge} over water`}
          </strong>
          {active.hint}
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          <button type="button" className="chip" onClick={startNewLine}>
            Begin a new line
          </button>
          <button type="button" className="chip" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="chip" onClick={redo} disabled={!canRedo}>
            Redo
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="layout-title">
        <p className="card__eyebrow" id="layout-title">
          The layout
        </p>
        <dl className="readout">
          <div>
            <dt>Lines</dt>
            <dd>{free.lines.length}</dd>
          </div>
          <div>
            <dt>Loops / shuttles</dt>
            <dd>
              {loops} <small>/ {shuttles}</small>
            </dd>
          </div>
        </dl>

        <div className="field" style={{ marginTop: 14 }}>
          <span id="size-label">Table size</span>
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
                  title={
                    unlocked
                      ? undefined
                      : `Grow a country of ${SIZE_UNLOCKS[size]} to open this table`
                  }
                  onClick={() => {
                    if (free.size === size) return
                    if (pendingSize === size) {
                      setFreeSize(size)
                      setPendingSize(null)
                    } else {
                      setPendingSize(size)
                    }
                  }}
                >
                  {!unlocked
                    ? `${WORLD_SIZES[size].label} · locked at ${SIZE_UNLOCKS[size]}`
                    : pendingSize === size
                      ? 'Confirm — replaces this world'
                      : `${WORLD_SIZES[size].label} · ${WORLD_SIZES[size].w}×${WORLD_SIZES[size].h}`}
                </button>
              )
            })}
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="trains">
            <span>Trains in service — {free.trains}</span>
          </label>
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

        <div className="field" style={{ marginTop: 12 }}>
          <span id="speed-label">Running speed</span>
          <div className="chips" role="group" aria-labelledby="speed-label">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className="chip"
                aria-pressed={free.speed === speed}
                onClick={() => setSpeed(speed)}
              >
                {speed[0].toUpperCase() + speed.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="chips" style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={grow}>
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
            {confirmClear ? 'Confirm — clear the world' : 'Clear the world'}
          </button>
        </div>
      </section>
    </>
  )
}
