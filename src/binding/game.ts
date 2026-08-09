/**
 * The night, as a state machine.
 *
 * Inscribe, light the circle, hold it, and either the chalk holds until dawn
 * or it does not. Like the seal, this module never touches a canvas: the
 * renderer reads the state and draws it, and the tests drive it headless.
 */

import {
  FAIL_SUPPORT,
  SIGILS,
  addSigil,
  addStroke,
  erode,
  inspect,
  makeSeal,
  perceived,
  strokeLength,
  support,
  truncateToBudget,
} from './seal.ts'
import type { Seal, SigilKind, Vec } from './seal.ts'
import { SUMMONS, advanceProbe, chooseTarget, makeProbe, pressureAt, rng } from './summons.ts'
import type { Probe, Summon } from './summons.ts'

export type Phase = 'title' | 'brief' | 'inscribe' | 'bind' | 'held' | 'broken' | 'dawn'

/** Seconds a broken arc can sit open before the thing is through it. */
export const GRACE = 1.75

/**
 * Layers of chalk taken per second at the centre of a probe, under unit
 * pressure. Set so that a single hand-drawn ring is genuinely marginal and a
 * second ring is worth the chalk it costs.
 */
export const EROSION = 0.105

export type GameEvent = 'lit' | 'breach' | 'saved' | 'broken' | 'held' | 'snuff' | 'mark'

export interface Game {
  phase: Phase
  round: number
  summon: Summon
  seal: Seal
  chalk: number
  chalkMax: number
  /** Seconds into the binding. */
  t: number
  probes: Probe[]
  failing: { bin: number; timer: number } | null
  saves: number
  breaches: number
  /** The lowest the circle ever got while under load. */
  worst: number
  tool: SigilKind | null
  events: GameEvent[]
  shake: number
  random: () => number
}

export function newGame(round = 0, seed = 20260809): Game {
  const summon = SUMMONS[Math.min(round, SUMMONS.length - 1)]
  return {
    phase: 'title',
    round,
    summon,
    seal: makeSeal(),
    chalk: summon.chalk,
    chalkMax: summon.chalk,
    t: 0,
    probes: [],
    failing: null,
    saves: 0,
    breaches: 0,
    worst: Infinity,
    tool: null,
    events: [],
    shake: 0,
    random: rng(seed + round * 7717),
  }
}

export function beginRound(game: Game, round: number): void {
  const summon = SUMMONS[Math.min(round, SUMMONS.length - 1)]
  game.round = round
  game.summon = summon
  game.seal = makeSeal()
  game.chalk = summon.chalk
  game.chalkMax = summon.chalk
  game.t = 0
  game.probes = []
  game.failing = null
  game.saves = 0
  game.breaches = 0
  game.worst = Infinity
  game.tool = null
  game.phase = 'brief'
  game.shake = 0
}

export function canAfford(game: Game, amount: number): boolean {
  return game.chalk >= amount
}

/**
 * Lay chalk, as far as the chalk goes. Returns what it cost.
 */
export function lay(game: Game, points: Vec[], cost: number): number {
  if (points.length < 2 || game.chalk <= 0) return 0
  const affordable = cost <= game.chalk ? points : truncateToBudget(points, game.chalk)
  if (affordable.length < 2) return 0
  const spend = Math.min(cost, strokeLength(affordable))
  game.chalk = Math.max(0, game.chalk - spend)
  addStroke(game.seal, affordable, game.phase === 'bind')
  game.events.push('mark')
  return spend
}

export function placeSigil(game: Game, kind: SigilKind, at: Vec): boolean {
  const cost = SIGILS[kind].cost
  if (!canAfford(game, cost)) return false
  const r = Math.hypot(at.x, at.y)
  if (r < 120 || r > 470) return false
  game.chalk -= cost
  addSigil(game.seal, kind, at)
  game.events.push('mark')
  return true
}

/** Burn a sigil for one hard shove of strength across its arc. */
export function snuff(game: Game, index: number): boolean {
  const sigil = game.seal.sigils[index]
  if (!sigil || sigil.spent) return false
  sigil.spent = true
  sigil.burst = 1
  game.events.push('snuff')
  game.shake = Math.max(game.shake, 0.5)
  return true
}

export function light(game: Game): void {
  if (game.phase !== 'inscribe') return
  const field = perceived(game.seal, game.summon.wardScale)
  const spread = Math.floor(360 / Math.max(1, game.summon.heads))
  game.probes = []
  for (let i = 0; i < game.summon.heads; i++) {
    const start = chooseTarget(
      field,
      game.summon.cunning,
      game.random,
      game.probes.map((p) => p.target),
      spread * 0.45,
    )
    game.probes.push(makeProbe(start))
  }
  game.phase = 'bind'
  game.t = 0
  game.events.push('lit')
}

/** The current state of the circle, for the renderer and the HUD. */
export function reading(game: Game): { real: Float32Array; seen: Float32Array } {
  return {
    real: support(game.seal, game.summon.wardScale),
    seen: perceived(game.seal, game.summon.wardScale),
  }
}

export function step(game: Game, dt: number): void {
  game.shake = Math.max(0, game.shake - dt * 1.8)
  for (const sigil of game.seal.sigils) {
    if (sigil.burst > 0) sigil.burst = Math.max(0, sigil.burst - dt / 3.2)
  }
  if (game.phase !== 'bind') return

  game.t += dt
  const pressure = pressureAt(game.summon, game.t)
  const seen = perceived(game.seal, game.summon.wardScale)

  for (let i = 0; i < game.probes.length; i++) {
    const probe = game.probes[i]
    probe.rethink -= dt
    if (probe.rethink <= 0) {
      const others = game.probes.filter((_, j) => j !== i).map((p) => p.target)
      probe.target = chooseTarget(seen, game.summon.cunning, game.random, others, 78)
      probe.rethink = 2.4 - game.summon.cunning * 1.5 + game.random() * 0.7
    }
    advanceProbe(probe, dt, game.summon.cunning)
    erode(game.seal, Math.round(probe.bin) % 360, pressure * probe.bite * dt * EROSION)
  }

  const real = support(game.seal, game.summon.wardScale)
  let lowest = Infinity
  let lowestBin = 0
  for (const probe of game.probes) {
    const b = Math.round(probe.bin) % 360
    if (real[b] < lowest) {
      lowest = real[b]
      lowestBin = b
    }
  }
  if (lowest < game.worst) game.worst = lowest

  if (lowest <= FAIL_SUPPORT) {
    if (!game.failing) {
      game.failing = { bin: lowestBin, timer: 0 }
      game.breaches++
      game.events.push('breach')
      game.shake = 1
    } else {
      game.failing.bin = lowestBin
      game.failing.timer += dt
      game.shake = Math.max(game.shake, 0.35 + game.failing.timer / GRACE)
      if (game.failing.timer >= GRACE) {
        game.phase = 'broken'
        game.events.push('broken')
        game.shake = 1.6
        return
      }
    }
  } else if (game.failing) {
    game.failing = null
    game.saves++
    game.events.push('saved')
  }

  if (game.t >= game.summon.duration) {
    game.phase = game.round >= SUMMONS.length - 1 ? 'dawn' : 'held'
    game.events.push('held')
    game.failing = null
  }
}

export interface Summary {
  chalkLeft: number
  chalkPct: number
  saves: number
  breaches: number
  gaps: number
  verdict: string
}

export function summarise(game: Game): Summary {
  const report = inspect(game.seal)
  const pct = Math.round((game.chalk / game.chalkMax) * 100)
  let verdict: string
  if (game.phase === 'broken') {
    verdict =
      game.breaches > 1
        ? 'It had been through the circle twice before you lost it.'
        : 'It found the thin place, and you were not quick enough with the chalk.'
  } else if (game.saves > 0) {
    verdict = `You patched it ${game.saves} time${game.saves === 1 ? '' : 's'} while it was open. Close, but the chalk held.`
  } else if (pct > 45) {
    verdict = 'It never got near. You could have done that with half the chalk.'
  } else {
    verdict = 'A good circle. It leaned on it all night and found nothing.'
  }
  return {
    chalkLeft: Math.round(game.chalk),
    chalkPct: pct,
    saves: game.saves,
    breaches: game.breaches,
    gaps: report.gaps,
    verdict,
  }
}
