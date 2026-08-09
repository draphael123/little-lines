import { useEffect, useState } from 'react'
import { useGame } from '../store/useGame'
import { Dialog } from './Dialog'

const PAGES = [
  {
    title: 'Laying track',
    lede: 'A line is built one length at a time.',
    body: [
      'Click the pale disc on the depot tile to lay your first length of track. Every length after that must go to a tile next door — no diagonals, no jumps.',
      'Click the last tile of the line again to lift that length. Undo and Redo are in the objective card, and the Hint button will mark a legal next tile whenever a run dead-ends.',
    ],
  },
  {
    title: 'Reading the table',
    lede: 'The survey is a real model, so move around it.',
    body: [
      'Drag to orbit the table, scroll or pinch to zoom, and use the West, Home and East viewpoints above the table to jump to a surveyor’s angle.',
      'The instrument in the top right reads out the tile under your pointer: its coordinates, its elevation and what the ground is made of.',
    ],
  },
  {
    title: 'Gradients, rock and water',
    lede: 'Three things decide where a line can go.',
    body: [
      'Rail may climb or fall only one level per length. The elevation legend at the foot of the table shows the five levels; a two-level step is a cliff and the line will refuse it.',
      'Bare rock blocks construction entirely — go round it, or in Free Build bore a tunnel. Water can be crossed, but each water tile spends one bridge from the level’s timber budget and the trestles go in automatically.',
    ],
  },
  {
    title: 'Delivering, and the country beyond',
    lede: 'Then hand the line over to the engine.',
    body: [
      'Once the line starts at the depot, serves every required halt and reaches the destination inside the bridge budget, the dispatch strip moves to Connect and the big button runs the delivery. Three stars at or under par, two just over, one for arriving at all.',
      'Free Build works differently: you never build a town. The table starts with a few hamlets on likely ground, and each one only grows once a station stands within two tiles of it AND the line reaches somewhere else worth going. A loop around one hamlet carries nobody.',
      'Track, bridges, tunnels and stations cost money; fares arrive from the passengers you actually carry. You cannot go bankrupt — a thin account just means waiting for the traffic. Time passes only while the trains are running, so hold them whenever you want to think.',
    ],
  },
]

export function Tutorial() {
  const open = useGame((s) => s.showTutorial)
  const close = useGame((s) => s.closeTutorial)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (open) setPage(0)
  }, [open])

  const current = PAGES[page]
  const last = page === PAGES.length - 1

  return (
    <Dialog
      open={open}
      title={current.title}
      labelSuffix={`${current.lede}  ·  Page ${page + 1} of ${PAGES.length}`}
      onClose={() => close(true)}
      footer={
        <>
          <div className="pages" aria-hidden="true">
            {PAGES.map((p, i) => (
              <i key={p.title} data-on={i <= page} />
            ))}
          </div>
          <div className="chips">
            <button
              type="button"
              className="btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Back
            </button>
            {last ? (
              <button type="button" className="btn btn--brass" onClick={() => close(true)}>
                Start surveying
              </button>
            ) : (
              <button type="button" className="btn btn--brass" onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            )}
          </div>
        </>
      }
    >
      <div aria-live="polite">
        {current.body.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </div>
    </Dialog>
  )
}
