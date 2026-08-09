/**
 * The board as text.
 *
 * A hex map is hard to reason about in a debugger and impossible to reason
 * about in a diff, so the solver gets a renderer that owes nothing to WebGL.
 * Every cell is `<elevation><water>`, laid out on the same flat-topped
 * staggering the scene uses, so a sketch and a screenshot describe the same
 * board.
 */
import { channelOf, isSea, type Board, type Water } from './flow'
import { hexesWithin, keyOf, ringIndex, unkey, type HexKey } from './hex'

const GLYPH = { dry: '.', rill: '-', stream: '=', river: '#' } as const

export function glyphFor(key: HexKey, water: Water): string {
  if ((water.depth.get(key) ?? 0) > 0) return '~'
  return GLYPH[channelOf(water.flow.get(key) ?? 0)]
}

export function sketch(board: Board, water: Water): string {
  const { radius } = board
  const rows: string[][] = []
  const height = 4 * radius + 1
  const width = (2 * radius + 1) * 3
  for (let i = 0; i < height; i += 1) rows.push(Array<string>(width).fill(' '))

  for (const hex of hexesWithin(radius)) {
    const key = keyOf(hex.q, hex.r)
    const row = 2 * hex.r + hex.q + 2 * radius
    const col = (hex.q + radius) * 3

    const elevation = board.ground.get(key)
    const cell =
      elevation !== undefined
        ? `${elevation}${glyphFor(key, water)}`
        : isSea(key, radius)
          ? '~~'
          : '  '

    rows[row][col] = cell[0]
    rows[row][col + 1] = cell[1]
  }

  return rows
    .map((row) => row.join('').replace(/\s+$/, ''))
    .filter((row) => row.length > 0)
    .join('\n')
}

/** A one-line tally to put under a sketch. */
export function tally(board: Board, water: Water): string {
  const placed = board.ground.size
  let wettest = 0
  let wettestKey: HexKey | null = null
  for (const [key, flow] of water.flow) {
    if (flow <= wettest) continue
    wettest = flow
    wettestKey = key
  }
  const where = wettestKey === null ? '—' : (({ q, r }) => `${q},${r}`)(unkey(wettestKey))
  const ponded = [...water.depth.values()].filter((d) => d > 0).length

  return [
    `${placed} tiles`,
    `${ponded} under water`,
    `biggest channel ${wettest.toFixed(1)} at ${where}`,
    `to sea ${water.toSea.toFixed(1)}`,
    `soaked away ${water.soaked.toFixed(1)}`,
  ].join(' · ')
}

/** Rings are the unit the board is described in, so export the shorthand. */
export const ringOf = (key: HexKey): number => {
  const { q, r } = unkey(key)
  return ringIndex(q, r)
}
