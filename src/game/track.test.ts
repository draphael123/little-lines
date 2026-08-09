import { describe, expect, it } from 'vitest'
import { createWorld, withTile, worldFromRows } from './grid'
import {
  connectionCheck,
  countBridgeTiles,
  extendCheck,
  isPassable,
  occupiedTiles,
  removeTileFromLine,
  routeIsClosed,
  segmentsTouching,
  totalClimb,
} from './track'
import type { Coord, RailLine } from './types'

const at = (x: number, z: number): Coord => ({ x, z })
const path = (tiles: Array<[number, number]>) => tiles.map(([x, z]) => at(x, z))

describe('what rail may do between two tiles', () => {
  const world = worldFromRows(
    ['.....', '..^..', '..~..', '.....', '.....'],
    ['00000', '01200', '00300', '01234', '00000'],
  )

  it('refuses anything that is not a direct neighbour', () => {
    expect(connectionCheck(world, at(0, 0), at(2, 0)).ok).toBe(false)
    expect(connectionCheck(world, at(0, 0), at(1, 1)).ok).toBe(false)
    expect(connectionCheck(world, at(0, 0), at(1, 0)).ok).toBe(true)
  })

  it('refuses solid rock and allows a bored tunnel', () => {
    expect(isPassable(world, at(2, 1))).toBe(false)
    const bored = withTile(world, at(2, 1), { tunnel: true, h: 0, rockTop: 2 })
    expect(isPassable(bored, at(2, 1))).toBe(true)
  })

  it('allows exactly one level of climb or fall per length', () => {
    expect(connectionCheck(world, at(1, 3), at(2, 3)).ok).toBe(true)
    expect(connectionCheck(world, at(1, 3), at(3, 3)).ok).toBe(false)
    expect(connectionCheck(world, at(0, 3), at(0, 2)).ok).toBe(true)
    // level 0 beside level 3 is a cliff
    expect(connectionCheck(world, at(3, 4), at(3, 3)).ok).toBe(false)
    expect(connectionCheck(world, at(3, 4), at(3, 3)).reason).toMatch(/steep/i)
  })

  it('lets track cross water', () => {
    expect(connectionCheck(world, at(1, 2), at(2, 2)).ok).toBe(true)
  })
})

describe('extending a route', () => {
  const flat = createWorld(8, 8)

  it('starts anywhere passable', () => {
    expect(extendCheck(flat, [], at(2, 2)).ok).toBe(true)
  })

  it('refuses to double back over its own track', () => {
    const route = path([[1, 1], [2, 1], [3, 1]])
    expect(extendCheck(flat, route, at(2, 1)).ok).toBe(false)
    expect(extendCheck(flat, route, at(2, 1)).reason).toMatch(/already runs/i)
  })

  it('closes a loop by bringing the far end back beside the start', () => {
    const almost = path([[1, 1], [2, 1], [2, 2]])
    expect(routeIsClosed(almost)).toBe(false)
    expect(extendCheck(flat, almost, at(1, 2)).ok).toBe(true)
    expect(routeIsClosed([...almost, at(1, 2)])).toBe(true)
    // and still refuses to land on the start tile itself
    expect(extendCheck(flat, [...almost, at(1, 2)], at(1, 1)).ok).toBe(false)
  })

  it('refuses a tile held by another line', () => {
    const occupied = occupiedTiles([{ id: 'other', tiles: path([[3, 1], [3, 2]]) }])
    expect(extendCheck(flat, path([[2, 1]]), at(3, 1), { occupied }).ok).toBe(false)
  })

  it('holds the line to its bridge budget', () => {
    let world = createWorld(8, 8)
    world = withTile(world, at(3, 1), { kind: 'water' })
    world = withTile(world, at(4, 1), { kind: 'water' })
    const upToWater = path([[1, 1], [2, 1]])
    expect(extendCheck(world, upToWater, at(3, 1), { bridgeBudget: 1 }).ok).toBe(true)
    const oneSpent = path([[1, 1], [2, 1], [3, 1]])
    expect(extendCheck(world, oneSpent, at(4, 1), { bridgeBudget: 1 }).ok).toBe(false)
    expect(extendCheck(world, oneSpent, at(4, 1), { bridgeBudget: 2 }).ok).toBe(true)
  })
})

describe('measuring a route', () => {
  it('counts only water tiles as bridges', () => {
    let world = createWorld(6, 6)
    world = withTile(world, at(2, 0), { kind: 'water' })
    world = withTile(world, at(3, 0), { kind: 'water' })
    expect(countBridgeTiles(world, path([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]))).toBe(2)
  })

  it('counts climb but not descent', () => {
    const world = worldFromRows(['....'], ['0121'])
    expect(totalClimb(world, path([[0, 0], [1, 0], [2, 0], [3, 0]]))).toBe(2)
  })
})

describe('loops', () => {
  it('only calls a line closed when it has real length and its ends meet', () => {
    expect(routeIsClosed(path([[0, 0], [1, 0]]))).toBe(false)
    expect(routeIsClosed(path([[0, 0], [1, 0], [1, 1]]))).toBe(false)
    expect(routeIsClosed(path([[0, 0], [1, 0], [1, 1], [0, 1]]))).toBe(true)
  })

  it('finds the closing segment when listing what touches a tile', () => {
    const loop: RailLine = { id: 'l', tiles: path([[0, 0], [1, 0], [1, 1], [0, 1]]) }
    expect(segmentsTouching([loop], at(0, 0))).toHaveLength(2)
  })
})

describe('lifting track', () => {
  const straight: RailLine = { id: 'l', tiles: path([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]) }

  it('leaves two working stubs when a tile is taken from the middle', () => {
    const parts = removeTileFromLine(straight, at(2, 0))
    expect(parts).toHaveLength(2)
    expect(parts[0].tiles).toEqual(path([[0, 0], [1, 0]]))
    expect(parts[1].tiles).toEqual(path([[3, 0], [4, 0]]))
    expect(parts[0].id).not.toBe(parts[1].id)
  })

  it('discards a stub too short to be a line', () => {
    const parts = removeTileFromLine(straight, at(1, 0))
    expect(parts).toHaveLength(1)
    expect(parts[0].tiles).toEqual(path([[2, 0], [3, 0], [4, 0]]))
  })

  it('leaves an untouched line alone', () => {
    expect(removeTileFromLine(straight, at(7, 7))).toEqual([straight])
  })
})
