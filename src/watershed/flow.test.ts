import { describe, expect, it } from 'vitest'
import {
  channelOf,
  lakes,
  rainAt,
  solveWater,
  type Board,
} from './flow'
import { hexesWithin, keyOf, ringIndex, type Hex, type HexKey } from './hex'
import { survey, type Tile } from './terrain'

/**
 * Boards are described by a function from hex to elevation, `null` meaning
 * ground you have not placed. The outermost ring is always sea and is never
 * land, so `radius` 4 gives you three rings and a centre to build on.
 */
function makeBoard(radius: number, elevation: (hex: Hex) => number | null): Board {
  const ground = new Map<HexKey, number>()
  for (const hex of hexesWithin(radius)) {
    if (ringIndex(hex.q, hex.r) === radius) continue
    const step = elevation(hex)
    if (step !== null) ground.set(keyOf(hex.q, hex.r), step)
  }
  return { radius, ground }
}

const ring = (hex: Hex) => ringIndex(hex.q, hex.r)

function totalRain(board: Board): number {
  let sum = 0
  for (const step of board.ground.values()) sum += rainAt(step)
  return sum
}

describe('the flood', () => {
  it('carries every drop off the board', () => {
    const board = makeBoard(5, (hex) => ring(hex))
    const water = solveWater(board)
    expect(water.toSea + water.soaked).toBeCloseTo(totalRain(board), 6)
  })

  it('never lets flow fall off going downstream', () => {
    const board = makeBoard(5, (hex) => ring(hex))
    const water = solveWater(board)

    for (const [key, target] of water.down) {
      if (target === null) continue
      expect(water.flow.get(target)).toBeGreaterThanOrEqual(water.flow.get(key) as number)
    }
  })

  it('gathers a slope into one channel at the shore', () => {
    const board = makeBoard(6, (hex) => ring(hex))
    const water = solveWater(board)

    const shore = [...board.ground.keys()].filter((key) => water.down.get(key) === null)
    const biggest = Math.max(...shore.map((key) => water.flow.get(key) as number))
    expect(channelOf(biggest)).toBe('river')
  })

  it('is the same water every time', () => {
    const board = makeBoard(5, (hex) => (hex.q * 7 + hex.r * 3) % 4)
    const a = solveWater(board)
    const b = solveWater(board)
    expect([...b.flow.entries()]).toEqual([...a.flow.entries()])
    expect([...b.down.entries()]).toEqual([...a.down.entries()])
  })
})

describe('standing water', () => {
  const hollow = makeBoard(4, (hex) => {
    const r = ring(hex)
    if (r === 0) return 0
    if (r === 3) return 0
    return 3
  })

  it('fills a basin your own land has closed', () => {
    const water = solveWater(hollow)
    const centre = keyOf(0, 0)

    expect(water.depth.get(centre)).toBe(3)
    expect(lakes(water)).toHaveLength(1)
  })

  it('empties it again when the rim is notched', () => {
    const notch = new Set([keyOf(1, 0), keyOf(2, 0)])
    const board = makeBoard(4, (hex) => {
      const r = ring(hex)
      if (notch.has(keyOf(hex.q, hex.r))) return 0
      if (r === 0 || r === 3) return 0
      return 3
    })

    const water = solveWater(board)
    expect(water.depth.get(keyOf(0, 0))).toBe(0)
    expect(lakes(water)).toHaveLength(0)

    // and everything the hollow caught now goes out through the gap
    expect(water.flow.get(keyOf(1, 0))).toBeGreaterThan(water.flow.get(keyOf(-1, 0)) as number)
  })

  it('will not hold a lake against ground you have not placed', () => {
    const board = makeBoard(4, (hex) => {
      const r = ring(hex)
      if (r === 0) return 0
      if (r === 1) return keyOf(hex.q, hex.r) === keyOf(1, 0) ? null : 3
      if (r === 3) return 0
      return 3
    })

    const water = solveWater(board)
    expect(water.depth.get(keyOf(0, 0))).toBe(0)
  })
})

describe('the frontier', () => {
  it('wastes water that runs off into unplaced land', () => {
    const island = makeBoard(6, (hex) => (ring(hex) <= 2 ? 3 - ring(hex) : null))
    const water = solveWater(island)

    expect(water.toSea).toBe(0)
    expect(water.soaked).toBeCloseTo(totalRain(island), 6)
  })

  it('sends it to the sea once the region reaches the shore', () => {
    const reaching = makeBoard(6, (hex) => Math.max(0, 4 - ring(hex)))
    const water = solveWater(reaching)

    expect(water.toSea).toBeGreaterThan(0)
    expect(water.toSea + water.soaked).toBeCloseTo(totalRain(reaching), 6)
  })
})

describe('what the ground makes of it', () => {
  it('leaves a marsh thirsty on a dry slope and contents it in a lake', () => {
    const dry = makeBoard(5, (hex) => 5 - ring(hex))
    const centre = keyOf(0, 0)
    const marsh: Tile = { terrain: 'marsh', elevation: 5 }

    expect(survey(new Map([[centre, marsh]]), solveWater(dry)).content).toBe(0)

    const basin = makeBoard(4, (hex) => {
      const r = ring(hex)
      return r === 0 || r === 3 ? 0 : 3
    })
    const drowned: Tile = { terrain: 'marsh', elevation: 0 }
    expect(survey(new Map([[centre, drowned]]), solveWater(basin)).content).toBe(1)
  })

  it('drowns a hamlet that a later placement puts under a lake', () => {
    const centre = keyOf(0, 0)
    const hamlet = new Map<HexKey, Tile>([[centre, { terrain: 'hamlet', elevation: 0 }]])

    const open = makeBoard(4, (hex) => (ring(hex) <= 3 ? 0 : null))
    expect(survey(hamlet, solveWater(open)).verdicts.get(centre)).toBe('content')

    const dammed = makeBoard(4, (hex) => (ring(hex) === 0 || ring(hex) === 3 ? 0 : 3))
    expect(survey(hamlet, solveWater(dammed)).verdicts.get(centre)).toBe('drowned')
  })
})
