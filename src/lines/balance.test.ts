/**
 * Does the loop hold up?
 *
 * The stack is the only clock, so the numbers that matter are how long a run
 * lasts and whether playing well actually lengthens it. Neither is something
 * you can reason about from the constants — the reward for a perfect fit feeds
 * back into how many tiles you get to attempt — so it is measured instead, by
 * playing the game.
 *
 * The bounds are deliberately wide. This is here to catch a run that collapses
 * in ten tiles or never ends at all, not to freeze the tuning.
 */
import { describe, expect, it } from 'vitest'
import { assess, openHexes } from './board'
import { OPENING_STACK } from './deck'
import { heldTile, isOver, newGame, placeTile, turnHand, type Game } from './game'
import type { HexKey } from './hex'

interface Move {
  key: HexKey
  rotation: number
  score: number
}

/** The best placement on the board, by score alone. */
function bestMove(game: Game): Move | null {
  let best: Move | null = null
  for (const key of openHexes(game.tiles)) {
    for (let rotation = 0; rotation < 6; rotation += 1) {
      const held = heldTile(turnHand(game, rotation - game.rotation))
      if (!held) return null
      const { score } = assess(game.tiles, key, held)
      if (best === null || score > best.score) best = { key, rotation, score }
    }
  }
  return best
}

/** A player who takes the highest-scoring placement available, and no more. */
function playGreedily(seed: number, cap = 4000): Game {
  let game = newGame(seed)
  let steps = 0
  while (!isOver(game) && steps < cap) {
    const move = bestMove(game)
    if (!move) break
    game = placeTile(turnHand(game, move.rotation - game.rotation), move.key).game
    steps += 1
  }
  return game
}

/** A player who puts every tile down in the first place it will go. */
function playCarelessly(seed: number, cap = 4000): Game {
  let game = newGame(seed)
  let steps = 0
  while (!isOver(game) && steps < cap) {
    const open = openHexes(game.tiles)
    if (open.length === 0) break
    game = placeTile(game, open[steps % open.length]).game
    steps += 1
  }
  return game
}

describe('a run', () => {
  const seeds = [1, 17, 404, 90210, 7777]

  it('always ends', () => {
    for (const seed of seeds) {
      const game = playGreedily(seed)
      expect(isOver(game)).toBe(true)
    }
  })

  it('outlasts the stack it started with, without going on forever', () => {
    for (const seed of seeds) {
      const game = playGreedily(seed)
      // Measured at 44–133 placements from a stack of 42. The bounds are wide
      // because the point is the shape of the curve, not today's numbers: a run
      // should beat the opening stack and should not fill the whole region.
      expect(game.placed).toBeGreaterThan(OPENING_STACK)
      expect(game.placed).toBeLessThan(600)
    }
  })

  it('rewards playing well with a longer run and a better score', () => {
    for (const seed of seeds) {
      const careful = playGreedily(seed)
      const careless = playCarelessly(seed)

      expect(careful.placed).toBeGreaterThan(careless.placed)
      expect(careful.score).toBeGreaterThan(careless.score)
    }
  })

  it('earns tiles back from fitting well, not from quests alone', () => {
    for (const seed of seeds) {
      const game = playGreedily(seed)
      expect(game.snugs).toBeGreaterThan(0)
      expect(game.snugs + game.perfects).toBeLessThanOrEqual(game.placed)
    }
  })

  it('leaves quests both met and missed, rather than all of one', () => {
    const tallies = seeds.map((seed) => {
      const game = playGreedily(seed)
      return {
        asked: game.quests.length,
        done: game.quests.filter((q) => q.state === 'done').length,
        missed: game.quests.filter((q) => q.state === 'missed').length,
      }
    })

    const asked = tallies.reduce((sum, t) => sum + t.asked, 0)
    const done = tallies.reduce((sum, t) => sum + t.done, 0)

    expect(asked).toBeGreaterThan(0)
    expect(done).toBeGreaterThan(0)
    // A player who is not even trying to finish them should not finish them all.
    expect(done).toBeLessThan(asked)
  })
})
