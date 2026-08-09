import { describe, expect, it } from 'vitest'
import { solveWater, type Board } from './flow'
import { hexesWithin, keyOf, ringIndex, type Hex, type HexKey } from './hex'
import { sketch, tally } from './sketch'

const RADIUS = 7

function build(elevation: (hex: Hex) => number | null): Board {
  const ground = new Map<HexKey, number>()
  for (const hex of hexesWithin(RADIUS)) {
    if (ringIndex(hex.q, hex.r) === RADIUS) continue
    const step = elevation(hex)
    if (step !== null) ground.set(keyOf(hex.q, hex.r), step)
  }
  return { radius: RADIUS, ground }
}

/** A cone of hills with a flat hollow bitten out of the middle. */
const bowl = (hex: Hex) => Math.min(5, Math.max(0, ringIndex(hex.q, hex.r) - 2))

describe('the sketch', () => {
  it('draws the sea round the outside and the land inside it', () => {
    const drawn = sketch(build(bowl), solveWater(build(bowl)))
    expect(drawn).toContain('~~')
    expect(drawn.split('\n').length).toBeGreaterThan(RADIUS)
  })

  it('shows a bowl full and the same bowl drained', () => {
    const full = build(bowl)
    expect(sketch(full, solveWater(full))).toMatch(/\d~/)

    // Cut one spoke of the rim down to the shoreline and the hollow empties.
    const cut = build((hex) => (hex.r === 0 && hex.q > 0 ? 0 : bowl(hex)))
    const drained = solveWater(cut)
    expect(sketch(cut, drained)).not.toMatch(/\d~/)
    expect(sketch(cut, drained)).toContain('#')
  })

  it('tallies what the board is doing', () => {
    const board = build(bowl)
    const line = tally(board, solveWater(board))
    expect(line).toContain(`${board.ground.size} tiles`)
    expect(line).toContain('to sea')
  })
})
