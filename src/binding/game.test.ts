import { describe, expect, it } from 'vitest'
import { NOMINAL_R, inspect } from './seal.ts'
import type { Vec } from './seal.ts'
import { SUMMONS, chooseTarget, makeProbe, advanceProbe, pressureAt, rng } from './summons.ts'
import { beginRound, lay, light, newGame, placeSigil, snuff, step, summarise } from './game.ts'
import type { Game } from './game.ts'

function arc(fromDeg: number, toDeg: number, radius = NOMINAL_R): Vec[] {
  const points: Vec[] = []
  const steps = Math.max(2, Math.round(Math.abs(toDeg - fromDeg) * 2))
  for (let i = 0; i <= steps; i++) {
    const deg = fromDeg + ((toDeg - fromDeg) * i) / steps
    const a = (deg / 180) * Math.PI - Math.PI
    points.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius })
  }
  return points
}

function ring(radius = NOMINAL_R): Vec[] {
  return arc(0, 360, radius)
}

/** A ring drawn the long way round, leaving a genuine gap. */
function openRing(gapFrom: number, gapTo: number, radius = NOMINAL_R): Vec[] {
  return arc(gapTo, gapFrom + 360, radius)
}

/** Run a whole binding at a fixed step and report how it ended. */
function hold(game: Game, seconds = 200, onStep?: (g: Game) => void): Game {
  const dt = 1 / 60
  for (let i = 0; i < seconds * 60; i++) {
    if (game.phase !== 'bind') break
    step(game, dt)
    onStep?.(game)
  }
  return game
}

describe('the summons', () => {
  it('finds the true weakest arc more often when it is cunning', () => {
    const field = new Float32Array(360).fill(1)
    field[42] = 0.01
    const dull = rng(1)
    const sharp = rng(1)
    let dullHits = 0
    let sharpHits = 0
    for (let i = 0; i < 200; i++) {
      if (Math.abs(chooseTarget(field, 0.1, dull) - 42) < 4) dullHits++
      if (Math.abs(chooseTarget(field, 0.85, sharp) - 42) < 4) sharpHits++
    }
    expect(sharpHits).toBeGreaterThan(dullHits * 3)
    expect(sharpHits).toBeGreaterThan(120)
  })

  it('walks the short way round the wrap', () => {
    const probe = makeProbe(2)
    probe.target = 356
    advanceProbe(probe, 0.1, 0.5)
    expect(probe.bin).toBeGreaterThan(350)
  })

  it('leans harder as the night goes on', () => {
    const vetch = SUMMONS[1]
    expect(pressureAt(vetch, 50)).toBeGreaterThan(pressureAt(vetch, 10) * 1.4)
  })
})

describe('a binding', () => {
  it('holds when the circle is closed and doubled', () => {
    const game = newGame(0)
    beginRound(game, 0)
    game.phase = 'inscribe'
    lay(game, ring(), 1900)
    lay(game, ring(NOMINAL_R - 70), 1500)
    light(game)
    hold(game)
    expect(game.phase).toBe('held')
    expect(game.breaches).toBe(0)
  })

  it('breaks when the ring was left open', () => {
    const game = newGame(1)
    beginRound(game, 1)
    game.phase = 'inscribe'
    lay(game, openRing(100, 150), 1700)
    expect(inspect(game.seal).closed).toBe(false)
    light(game)
    hold(game)
    expect(game.phase).toBe('broken')
    expect(summarise(game).verdict).toMatch(/thin place|twice/)
  })

  it('gives you a moment to patch a breach before it is through', () => {
    const game = newGame(1)
    beginRound(game, 1)
    game.phase = 'inscribe'
    lay(game, openRing(100, 116), 1700)
    light(game)
    let patched = false
    hold(game, 200, (g) => {
      if (g.failing && !patched) {
        patched = true
        // Slap a fresh arc over the hole it found.
        const points: Vec[] = []
        for (let d = -30; d <= 30; d++) {
          const a = ((g.failing.bin + d + 0.5) / 360) * Math.PI * 2 - Math.PI
          points.push({ x: Math.cos(a) * NOMINAL_R, y: Math.sin(a) * NOMINAL_R })
        }
        lay(g, points, 320)
        lay(g, points.map((p) => ({ x: p.x * 0.92, y: p.y * 0.92 })), 300)
      }
    })
    expect(patched).toBe(true)
    expect(game.saves).toBeGreaterThan(0)
  })

  it('lets a silenced arc go unnoticed', () => {
    const seen: number[] = []
    const game = newGame(1)
    beginRound(game, 1)
    game.phase = 'inscribe'
    lay(game, openRing(100, 130), 1700)
    const a = ((115 + 0.5) / 360) * Math.PI * 2 - Math.PI
    placeSigil(game, 'silence', { x: Math.cos(a) * NOMINAL_R, y: Math.sin(a) * NOMINAL_R })
    light(game)
    hold(game, 30, (g) => seen.push(g.probes[0].target))
    const nearTheHole = seen.filter((bin) => bin > 95 && bin < 135).length
    expect(nearTheHole / seen.length).toBeLessThan(0.05)
  })

  it('snuffing a sigil buys strength across its arc', () => {
    const game = newGame(0)
    beginRound(game, 0)
    game.phase = 'inscribe'
    lay(game, ring(), 1900)
    placeSigil(game, 'ward', { x: NOMINAL_R, y: 0 })
    const before = inspect(game.seal).mean
    snuff(game, 0)
    expect(inspect(game.seal).mean).toBeGreaterThan(before)
  })

  it('spends chalk, and cannot spend what is not there', () => {
    const game = newGame(0)
    beginRound(game, 0)
    game.phase = 'inscribe'
    game.chalk = 400
    expect(placeSigil(game, 'ward', { x: NOMINAL_R, y: 0 })).toBe(true)
    expect(game.chalk).toBe(20)
    expect(placeSigil(game, 'ward', { x: 0, y: NOMINAL_R })).toBe(false)
  })

  it('ends the night after the last summons', () => {
    const game = newGame(2)
    beginRound(game, 2)
    game.phase = 'inscribe'
    lay(game, ring(), 1900)
    lay(game, ring(NOMINAL_R - 70), 1500)
    lay(game, ring(NOMINAL_R + 60), 1500)
    light(game)
    hold(game)
    expect(game.phase).toBe('dawn')
  })
})
