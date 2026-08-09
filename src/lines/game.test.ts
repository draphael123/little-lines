import { describe, expect, it } from 'vitest'
import { assess } from './board'
import { drawTile, OPENING_STACK } from './deck'
import { heldTile, isOver, narrate, newGame, ORIGIN, peekNext, placeTile, turnHand, type Game } from './game'
import { keyOf, neighbourKey, type HexKey } from './hex'
import { progressOf, reviewQuests, rewardFor, type Quest } from './quests'
import { countEdges, hasRail, rotate, type EdgeKind, type Tile } from './tiles'

const all = (kind: EdgeKind): Tile => ({ edges: [kind, kind, kind, kind, kind, kind], station: false })

/** Put a known tile in hand, so a test is about the rules and not the stack. */
const holding = (game: Game, tile: Tile): Game => ({ ...game, hand: tile, rotation: 0 })

describe('a new run', () => {
  it('opens with a station on the board and a tile in hand', () => {
    const game = newGame(7)
    expect(game.tiles.size).toBe(1)
    expect(game.tiles.get(ORIGIN)?.station).toBe(true)
    expect(game.hand).not.toBeNull()
    expect(game.stack).toBe(OPENING_STACK - 1)
    expect(isOver(game)).toBe(false)
  })

  it('replays exactly from its seed, and differs between seeds', () => {
    const a = newGame(11)
    const b = newGame(11)
    const c = newGame(12)

    expect(a.hand).toEqual(b.hand)
    expect(peekNext(a)).toEqual(peekNext(b))
    // Not a guarantee for every pair of seeds, but these two do differ.
    expect(JSON.stringify(a.hand) + JSON.stringify(peekNext(a))).not.toEqual(
      JSON.stringify(c.hand) + JSON.stringify(peekNext(c)),
    )
  })

  it('shows what is coming without spending it', () => {
    const game = newGame(3)
    const first = peekNext(game)
    expect(peekNext(game)).toEqual(first)

    const after = placeTile(holding(game, all('meadow')), neighbourKey(ORIGIN, 0))
    expect(after.game.hand).toEqual(first)
  })
})

describe('placing', () => {
  it('puts the tile down the way it is turned', () => {
    const game = holding(newGame(1), all('meadow'))
    const turned = turnHand(game, 2)
    const spelled: Tile = { edges: ['rail', 'wood', 'wood', 'wood', 'wood', 'wood'], station: false }

    const result = placeTile(turnHand(holding(game, spelled), 2), neighbourKey(ORIGIN, 0))
    expect(result.game.tiles.get(neighbourKey(ORIGIN, 0))?.edges[2]).toBe('rail')
    expect(heldTile(turned)).toEqual(rotate(all('meadow'), 2))
  })

  it('refuses an occupied hex and a hex touching nothing', () => {
    const game = newGame(1)
    expect(placeTile(game, ORIGIN).placed).toBe(false)
    expect(placeTile(game, keyOf(9, 0)).placed).toBe(false)
    expect(placeTile(game, keyOf(9, 0)).game).toBe(game)
  })

  it('spends a tile from the stack for each one placed', () => {
    const game = holding(newGame(5), all('lake'))
    const before = game.stack
    const after = placeTile(game, neighbourKey(ORIGIN, 2)).game

    // one drawn to replace the hand, and nothing earned by a lake against a town
    expect(after.stack).toBe(before - 1)
    expect(after.placed).toBe(1)
  })

  it('hands a tile back for a hole filled six ways', () => {
    const base = newGame(5)
    const hole = keyOf(3, 0)
    const tiles = new Map(base.tiles)
    for (let direction = 0; direction < 6; direction += 1) {
      tiles.set(neighbourKey(hole, direction), all('wood'))
    }

    const result = placeTile({ ...base, tiles, hand: all('wood'), rotation: 0 }, hole)

    expect(result.perfect).toBe(true)
    expect(result.gained).toBe(2)
    expect(result.game.perfects).toBe(1)
    expect(result.game.snugs).toBe(1)
    // spent one, earned two back
    expect(result.game.stack).toBe(base.stack + 1)
  })

  it('does not hand one back merely for matching the neighbours it has', () => {
    const base = newGame(5)
    const answer: Tile = { edges: ['meadow', 'meadow', 'meadow', 'rail', 'meadow', 'meadow'], station: false }
    const result = placeTile(holding(base, answer), neighbourKey(ORIGIN, 0))

    expect(result.assessment?.matched).toBe(1)
    expect(result.perfect).toBe(false)
    expect(result.gained).toBe(0)
  })

  it('starts every fresh tile square on', () => {
    const game = turnHand(holding(newGame(2), all('crop')), 3)
    expect(game.rotation).toBe(3)
    expect(placeTile(game, neighbourKey(ORIGIN, 1)).game.rotation).toBe(0)
  })

  it('ends when the stack is spent', () => {
    let game: Game = { ...newGame(4), stack: 0, hand: all('meadow') }
    const result = placeTile(game, neighbourKey(ORIGIN, 0))

    expect(result.over).toBe(true)
    expect(isOver(result.game)).toBe(true)
    expect(placeTile(result.game, neighbourKey(ORIGIN, 1)).placed).toBe(false)

    game = result.game
    expect(turnHand(game, 1)).toBe(game)
  })
})

describe('quests', () => {
  const questTile = (spec: NonNullable<Tile['quest']>, edges: EdgeKind[], station = false): Tile => ({
    edges,
    station,
    quest: spec,
  })

  it('starts asking the moment its tile is down', () => {
    const game = holding(
      newGame(8),
      questTile({ kind: 'group', ground: 'wood', target: 4 }, ['wood', 'wood', 'wood', 'wood', 'wood', 'wood']),
    )
    const after = placeTile(game, neighbourKey(ORIGIN, 2)).game

    expect(after.quests).toHaveLength(1)
    expect(progressOf(after.tiles, after.quests[0])).toMatchObject({ progress: 1, target: 4 })
  })

  it('pays out when the board answers it', () => {
    const quest: Quest = {
      id: 1,
      key: keyOf(0, 0),
      spec: { kind: 'group', ground: 'wood', target: 2 },
      state: 'open',
    }
    const tiles = new Map<HexKey, Tile>([
      [keyOf(0, 0), all('wood')],
      [keyOf(1, 0), all('wood')],
    ])

    const review = reviewQuests(tiles, [quest])
    expect(review.completed).toHaveLength(1)
    expect(review.quests[0].state).toBe('done')
    expect(review.tilesWon).toBe(rewardFor(quest.spec).tiles)
  })

  it('is missed rather than failed when its group is walled in', () => {
    const quest: Quest = {
      id: 1,
      key: keyOf(0, 0),
      spec: { kind: 'group', ground: 'wood', target: 5 },
      state: 'open',
    }
    const tiles = new Map<HexKey, Tile>([[keyOf(0, 0), all('wood')]])
    for (let direction = 0; direction < 6; direction += 1) {
      tiles.set(neighbourKey(keyOf(0, 0), direction), all('crop'))
    }

    const review = reviewQuests(tiles, [quest])
    expect(review.missed).toHaveLength(1)
    expect(review.tilesWon).toBe(0)
    // and nothing that was already on the board has been taken away
    expect(tiles.size).toBe(7)
  })

  it('never settles a station quest early, because a line can always be extended', () => {
    const line: EdgeKind[] = ['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow']
    const tiles = new Map<HexKey, Tile>([[keyOf(0, 0), { edges: line, station: true }]])
    const quest: Quest = { id: 1, key: keyOf(0, 0), spec: { kind: 'stations', target: 2 }, state: 'open' }

    expect(progressOf(tiles, quest).canGrow).toBe(true)
    expect(reviewQuests(tiles, [quest]).missed).toHaveLength(0)
  })

  it('settles several at once when one tile finishes them all', () => {
    const tiles = new Map<HexKey, Tile>([
      [keyOf(0, 0), all('wood')],
      [keyOf(1, 0), all('wood')],
    ])
    const quests: Quest[] = [
      { id: 1, key: keyOf(0, 0), spec: { kind: 'group', ground: 'wood', target: 2 }, state: 'open' },
      { id: 2, key: keyOf(1, 0), spec: { kind: 'group', ground: 'wood', target: 2 }, state: 'open' },
    ]
    expect(reviewQuests(tiles, quests).completed).toHaveLength(2)
  })
})

describe('the stack', () => {
  it('is about half railway, and never all one thing', () => {
    let state = 99
    let rail = 0
    let stations = 0
    let quests = 0
    const runs = 600

    for (let i = 0; i < runs; i += 1) {
      const drawn = drawTile(state)
      state = drawn.state
      if (hasRail(drawn.value)) rail += 1
      if (drawn.value.station) stations += 1
      if (drawn.value.quest) quests += 1
      expect(drawn.value.edges).toHaveLength(6)
      // a station without rail would be a station nothing can reach
      if (drawn.value.station) expect(hasRail(drawn.value)).toBe(true)
    }

    expect(rail / runs).toBeGreaterThan(0.4)
    expect(rail / runs).toBeLessThan(0.7)
    expect(stations).toBeGreaterThan(0)
    expect(quests).toBeGreaterThan(0)
  })

  it('never lays rail down a single edge except as a deliberate stub', () => {
    let state = 1234
    for (let i = 0; i < 400; i += 1) {
      const drawn = drawTile(state)
      state = drawn.state
      const rails = countEdges(drawn.value, 'rail')
      expect(rails).toBeLessThanOrEqual(3)
    }
  })

  it('only ever asks about ground its own tile has', () => {
    let state = 555
    for (let i = 0; i < 800; i += 1) {
      const drawn = drawTile(state)
      state = drawn.state
      const quest = drawn.value.quest
      if (!quest) continue
      if (quest.kind === 'stations') expect(drawn.value.station).toBe(true)
      else expect(drawn.value.edges).toContain(quest.ground)
    }
  })
})

describe('what the game says out loud', () => {
  it('describes a perfect fit, and a line that stops dead', () => {
    const tiles = new Map<HexKey, Tile>([[keyOf(0, 0), all('rail')]])
    const key = neighbourKey(keyOf(0, 0), 0)

    const hole = new Map<HexKey, Tile>()
    for (let direction = 0; direction < 6; direction += 1) {
      hole.set(neighbourKey(keyOf(0, 0), direction), all('rail'))
    }

    const joined = narrate({
      game: newGame(1),
      placed: true,
      key: keyOf(0, 0),
      assessment: assess(hole, keyOf(0, 0), all('rail')),
      completed: [],
      missed: [],
      gained: 1,
      scored: 10,
      snug: true,
      perfect: true,
      over: false,
    })
    expect(joined).toContain('perfect fill')
    expect(joined).toContain('6 rails join')

    const stopped = narrate({
      game: newGame(1),
      placed: true,
      key,
      assessment: assess(tiles, key, all('wood')),
      completed: [],
      missed: [],
      gained: 0,
      scored: 0,
      snug: false,
      perfect: false,
      over: false,
    })
    expect(stopped).toContain('stops dead')
  })

  it('says why a placement was refused', () => {
    expect(narrate(placeTile(newGame(1), ORIGIN))).toContain('already')
  })
})
