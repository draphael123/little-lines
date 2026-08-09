import { describe, expect, it } from 'vitest'
import {
  assess,
  canPlace,
  groupAt,
  groupCanGrow,
  loosEndsAt,
  openHexes,
  SCORE,
  stationsJoinedTo,
  tally,
  BOARD_LIMIT,
} from './board'
import { keyOf, type HexKey } from './hex'
import { rotate, type EdgeKind, type Tile } from './tiles'

const all = (kind: EdgeKind): Tile => ({ edges: [kind, kind, kind, kind, kind, kind], station: false })

/** A tile spelled out edge by edge, clockwise from due east. */
const tile = (edges: EdgeKind[], station = false): Tile => ({ edges, station })

const board = (entries: Array<[[number, number], Tile]>): Map<HexKey, Tile> =>
  new Map(entries.map(([[q, r], t]) => [keyOf(q, r), t]))

const O = keyOf(0, 0)
const E = keyOf(1, 0)

describe('where a tile may go', () => {
  it('wants a neighbour', () => {
    const tiles = board([[[0, 0], all('meadow')]])
    expect(canPlace(tiles, E)).toBe(true)
    expect(canPlace(tiles, keyOf(4, 0))).toBe(false)
  })

  it('will not stack tiles or leave the region', () => {
    const tiles = board([[[0, 0], all('meadow')]])
    expect(canPlace(tiles, O)).toBe(false)
    expect(canPlace(tiles, keyOf(BOARD_LIMIT + 1, 0))).toBe(false)
  })

  it('offers every empty hex around what is down', () => {
    const tiles = board([[[0, 0], all('meadow')]])
    expect(openHexes(tiles)).toHaveLength(6)
  })
})

/** The six hexes round a hole, all showing `kind` inwards. */
const surround = (kind: EdgeKind, hole: [number, number] = [0, 0]) =>
  board(
    ([[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as Array<[number, number]>).map(
      ([dq, dr]) => [[hole[0] + dq, hole[1] + dr], all(kind)],
    ),
  )

describe('what a placement is worth', () => {
  it('pays for the sides that agree', () => {
    const tiles = board([[[0, 0], all('wood')]])
    const report = assess(tiles, E, all('wood'))

    expect(report.matched).toBe(1)
    expect(report.broken).toBe(0)
    expect(report.score).toBe(SCORE.match)
  })

  it('only calls it perfect when a hole is filled six ways', () => {
    // Matching every neighbour you happen to have is not enough.
    const edge = assess(board([[[0, 0], all('wood')]]), E, all('wood'))
    expect(edge.matched).toBe(edge.borders.length)
    expect(edge.perfect).toBe(false)

    const hole = assess(surround('wood'), O, all('wood'))
    expect(hole.borders).toHaveLength(6)
    expect(hole.perfect).toBe(true)
    // a six-way fill is a snug fit as well, and collects both
    expect(hole.snug).toBe(true)
    expect(hole.score).toBe(6 * SCORE.match + SCORE.snug + SCORE.perfect)
  })

  it('is not perfect if one of the six disagrees', () => {
    const tiles = surround('wood')
    tiles.set(keyOf(1, 0), all('crop'))
    expect(assess(tiles, O, all('wood')).perfect).toBe(false)
  })

  it('pays more when the sides that agree are railway', () => {
    const tiles = board([[[0, 0], all('rail')]])
    const rails = assess(tiles, E, all('rail'))
    const woods = assess(board([[[0, 0], all('wood')]]), E, all('wood'))

    expect(rails.railJoins).toBe(1)
    expect(rails.score).toBe(woods.score + SCORE.railJoin)
  })

  it('allows a mismatch, and charges only for a line that stops dead', () => {
    const tiles = board([[[0, 0], all('wood')]])

    const bland = assess(tiles, E, all('crop'))
    expect(bland.matched).toBe(0)
    expect(bland.broken).toBe(0)
    expect(bland.score).toBe(0)

    const stopped = assess(tiles, E, all('rail'))
    expect(stopped.broken).toBe(1)
    expect(stopped.score).toBe(SCORE.broken)
  })

  it('is not perfect when there is nothing to be perfect against', () => {
    expect(assess(new Map(), O, all('wood')).perfect).toBe(false)
  })

  it('still counts a rail join inside a perfect fill', () => {
    const report = assess(surround('rail'), O, all('rail'))
    expect(report.railJoins).toBe(6)
    expect(report.score).toBe(6 * SCORE.match + 6 * SCORE.railJoin + SCORE.snug + SCORE.perfect)
  })

  it('reads each border from both sides', () => {
    // west edge of the new tile (direction 3) faces east edge of the old (0)
    const tiles = board([[[0, 0], tile(['rail', 'wood', 'wood', 'wood', 'wood', 'wood'])]])
    const report = assess(tiles, E, tile(['wood', 'wood', 'wood', 'rail', 'wood', 'wood']))

    expect(report.borders).toHaveLength(1)
    expect(report.borders[0]).toMatchObject({ direction: 3, mine: 'rail', theirs: 'rail', matched: true })
  })
})

describe('groups', () => {
  it('joins tiles that agree along the border they share', () => {
    const tiles = board([
      [[0, 0], all('wood')],
      [[1, 0], all('wood')],
      [[2, 0], all('wood')],
    ])
    expect(groupAt(tiles, O, 'wood').size).toBe(3)
  })

  it('stops where the ground changes', () => {
    const tiles = board([
      [[0, 0], all('wood')],
      [[1, 0], all('crop')],
    ])
    expect(groupAt(tiles, O, 'wood').size).toBe(1)
  })

  it('does not leak through a tile that only touches the group edge-on', () => {
    // The middle tile shows wood only to the east, so the group cannot come
    // back round through it from the west.
    const tiles = board([
      [[0, 0], all('wood')],
      [[1, 0], tile(['wood', 'crop', 'crop', 'crop', 'crop', 'crop'])],
      [[2, 0], all('wood')],
    ])
    expect(groupAt(tiles, O, 'wood').size).toBe(1)
    expect(groupAt(tiles, keyOf(2, 0), 'wood').size).toBe(2)
  })

  it('knows when a group can still grow', () => {
    const open = board([[[0, 0], all('wood')]])
    expect(groupCanGrow(open, groupAt(open, O, 'wood'), 'wood')).toBe(true)

    const boxed = board([
      [[0, 0], all('wood')],
      [[1, 0], all('crop')],
      [[1, -1], all('crop')],
      [[0, -1], all('crop')],
      [[-1, 0], all('crop')],
      [[-1, 1], all('crop')],
      [[0, 1], all('crop')],
    ])
    expect(groupCanGrow(boxed, groupAt(boxed, O, 'wood'), 'wood')).toBe(false)
  })
})

describe('the railway', () => {
  const station = (edges: EdgeKind[]) => tile(edges, true)

  it('joins two stations along a run of rail', () => {
    const line = tile(['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'])
    const tiles = board([
      [[0, 0], station(['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'])],
      [[1, 0], line],
      [[2, 0], station(['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'])],
    ])
    expect(stationsJoinedTo(tiles, O)).toHaveLength(1)
  })

  it('leaves them apart when the line does not meet', () => {
    const tiles = board([
      [[0, 0], station(['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'])],
      // this one shows meadow to the west, so the rail stops at the border
      [[1, 0], station(['rail', 'meadow', 'meadow', 'meadow', 'meadow', 'meadow'])],
    ])
    expect(stationsJoinedTo(tiles, O)).toHaveLength(0)
  })

  it('finds the rail that ends in nothing', () => {
    const tiles = board([[[0, 0], tile(['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'])]])
    expect(loosEndsAt(tiles, O)).toEqual([0, 3])

    const met = board([
      [[0, 0], tile(['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'])],
      [[1, 0], tile(['meadow', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'])],
    ])
    expect(loosEndsAt(met, O)).toEqual([3])
  })

  it('rotates a tile without changing what it is', () => {
    const original = tile(['rail', 'wood', 'crop', 'rail', 'lake', 'town'])
    const turned = rotate(original, 2)
    expect(turned.edges[2]).toBe('rail')
    expect(turned.edges[5]).toBe('rail')
    expect(rotate(original, 6).edges).toEqual(original.edges)
  })
})

describe('the tally', () => {
  it('counts tiles, stations and the biggest joined-up network', () => {
    const line: EdgeKind[] = ['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow']
    const tiles = board([
      [[0, 0], tile(line, true)],
      [[1, 0], tile(line)],
      [[2, 0], tile(line, true)],
      [[0, 2], all('wood')],
    ])
    const counted = tally(tiles)

    expect(counted.tiles).toBe(4)
    expect(counted.stations).toBe(2)
    expect(counted.joined).toBe(2)
    expect(counted.groups.meadow).toBeGreaterThan(0)
  })
})
