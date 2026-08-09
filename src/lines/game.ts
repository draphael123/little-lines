/**
 * A run, from the opening station to the last tile in the stack.
 *
 * The stack is the only clock. There is no timer and no way to lose: you place
 * tiles until you run out, and placing well earns you more of them. A perfect
 * fit buys one back, and finishing what a tile asked for buys a handful. That
 * single loop is the whole tension, and everything else in here exists to keep
 * it honest.
 *
 * The state is plain data with the generator's own state inside it, so a run is
 * reproducible from its seed and a placement is a pure function of what came
 * before it.
 */
import { assess, canPlace, openHexes, tilesEarned, type Assessment, type Placed } from './board'
import { drawTile, openingTile, OPENING_STACK } from './deck'
import { keyOf, type HexKey } from './hex'
import { reviewQuests, type Quest } from './quests'
import { rotate, type Tile } from './tiles'

export interface Game {
  seed: number
  /** The generator's state, carried so a run replays exactly. */
  rng: number
  tiles: Map<HexKey, Tile>
  quests: Quest[]
  /** The tile waiting to be placed, or nothing once the stack is spent. */
  hand: Tile | null
  /** Sixths of a turn applied to the tile in hand before it goes down. */
  rotation: number
  /** Tiles left after the one in hand. */
  stack: number
  score: number
  placed: number
  /** Placements where every neighbour agreed and there were three or more. */
  snugs: number
  /** Holes filled six ways. */
  perfects: number
  nextQuestId: number
}

export const ORIGIN: HexKey = keyOf(0, 0)

export function newGame(seed: number): Game {
  const tiles = new Map<HexKey, Tile>([[ORIGIN, openingTile()]])
  const drawn = drawTile(seed)

  return {
    seed,
    rng: drawn.state,
    tiles,
    quests: [],
    hand: drawn.value,
    rotation: 0,
    stack: OPENING_STACK - 1,
    score: 0,
    placed: 0,
    snugs: 0,
    perfects: 0,
    nextQuestId: 1,
  }
}

export function isOver(game: Game): boolean {
  return game.hand === null
}

/** The tile in hand as it would actually go down. */
export function heldTile(game: Game): Tile | null {
  return game.hand ? rotate(game.hand, game.rotation) : null
}

/** What is coming next, without disturbing the stack. */
export function peekNext(game: Game): Tile | null {
  if (game.stack <= 0) return null
  return drawTile(game.rng).value
}

export function turnHand(game: Game, turns: number): Game {
  if (!game.hand) return game
  return { ...game, rotation: (((game.rotation + turns) % 6) + 6) % 6 }
}

export interface Placement {
  game: Game
  placed: boolean
  reason?: string
  key: HexKey
  assessment?: Assessment
  completed: Quest[]
  missed: Quest[]
  /** Tiles won back by this placement. */
  gained: number
  scored: number
  snug: boolean
  perfect: boolean
  over: boolean
}

export function placeTile(game: Game, key: HexKey): Placement {
  const empty: Omit<Placement, 'game' | 'placed' | 'key'> = {
    completed: [],
    missed: [],
    gained: 0,
    scored: 0,
    snug: false,
    perfect: false,
    over: isOver(game),
  }

  const held = heldTile(game)
  if (!held) return { ...empty, game, placed: false, key, reason: 'The stack is empty.' }
  if (!canPlace(game.tiles as Placed, key)) {
    return {
      ...empty,
      game,
      placed: false,
      key,
      reason: game.tiles.has(key) ? 'Something is already there.' : 'Tiles go next to tiles.',
    }
  }

  const assessment = assess(game.tiles as Placed, key, held)

  const tiles = new Map(game.tiles)
  tiles.set(key, held)

  let quests = game.quests
  let nextQuestId = game.nextQuestId
  if (held.quest) {
    quests = [...quests, { id: nextQuestId, key, spec: held.quest, state: 'open' }]
    nextQuestId += 1
  }

  const review = reviewQuests(tiles as Placed, quests)

  // A good fit buys a tile back; so does everything the board just finished.
  const gained = tilesEarned(assessment) + review.tilesWon
  const scored = assessment.score + review.scoreWon

  let stack = game.stack + gained
  let rng = game.rng
  let hand: Tile | null = null
  // The other way a run ends: the country is full and there is nowhere left to
  // put anything. Rarer than running out of tiles, and a better ending.
  const room = openHexes(tiles as Placed).length > 0
  if (stack > 0 && room) {
    const drawn = drawTile(rng)
    hand = drawn.value
    rng = drawn.state
    stack -= 1
  }

  const next: Game = {
    ...game,
    rng,
    tiles,
    quests: review.quests,
    hand,
    // A fresh tile arrives the way it was drawn; carrying the last rotation
    // over means half your placements start by undoing something invisible.
    rotation: 0,
    stack,
    score: game.score + scored,
    placed: game.placed + 1,
    snugs: game.snugs + (assessment.snug ? 1 : 0),
    perfects: game.perfects + (assessment.perfect ? 1 : 0),
    nextQuestId,
  }

  return {
    game: next,
    placed: true,
    key,
    assessment,
    completed: review.completed,
    missed: review.missed,
    gained,
    scored,
    snug: assessment.snug,
    perfect: assessment.perfect,
    over: hand === null,
  }
}

/**
 * A short line for the live region and the ticker. Written the way you would
 * say it out loud, because that is where it ends up.
 */
export function narrate(result: Placement): string {
  if (!result.placed) return result.reason ?? 'That will not go there.'

  const parts: string[] = []
  const assessment = result.assessment as Assessment
  if (result.perfect) parts.push('A perfect fill')
  else if (result.snug) parts.push('A snug fit')
  else if (assessment.matched > 0) parts.push(`${assessment.matched} sides matched`)
  else parts.push('Placed')

  if (assessment.railJoins > 0) {
    parts.push(assessment.railJoins === 1 ? 'the line joins up' : `${assessment.railJoins} rails join`)
  }
  if (assessment.broken > 0) {
    parts.push(assessment.broken === 1 ? 'one line stops dead' : `${assessment.broken} lines stop dead`)
  }
  for (const quest of result.completed) {
    parts.push(quest.spec.kind === 'stations' ? 'a station is served' : 'a request is met')
  }
  if (result.gained > 0) parts.push(`${result.gained} more ${result.gained === 1 ? 'tile' : 'tiles'}`)
  if (result.over) parts.push('and that was the last of them')

  return `${parts.join(', ')}.`
}
