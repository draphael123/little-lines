/**
 * The sword, as rules rather than animation.
 *
 * Every timing, cost and window lives here: which stance you are in, how far
 * through it you are, what a swing can reach and when, what a dodge makes you
 * immune to, and what it all costs in stamina. `sword.ts` reads this to pose
 * the blade and `main.ts` reads it to draw the bars, but nothing here imports
 * a renderer, so the whole thing is exercised headlessly.
 */

export type Stance = 'ready' | 'light' | 'heavy' | 'block' | 'dodge' | 'stagger'

export interface Swing {
  /** Seconds from the start of the swing to the start of the hit window. */
  windUp: number
  /** Seconds the blade can connect for. */
  open: number
  /** Seconds after the hit window before you can act again. */
  recover: number
  stamina: number
  damage: number
  /** How far in front of the eye the blade reaches, in metres. */
  reach: number
}

export const LIGHT: Swing = { windUp: 0.12, open: 0.1, recover: 0.26, stamina: 9, damage: 14, reach: 2.8 }
export const HEAVY: Swing = { windUp: 0.34, open: 0.14, recover: 0.52, stamina: 22, damage: 34, reach: 3.2 }

export const DODGE = { seconds: 0.46, stamina: 24, speed: 9.2, immuneFrom: 0.04, immuneTo: 0.3 }
export const BLOCK = { hold: 6, hit: 16, chip: 0.25, raise: 9 }
export const STAGGER = 0.6

export const MAX_HEALTH = 100
export const MAX_STAMINA = 100

export interface Fighter {
  stance: Stance
  /** Seconds spent in the current stance. */
  since: number
  health: number
  stamina: number
  /** True once a swing has spent its hit on something. */
  spent: boolean
  /** Which way a dodge is going, in local space: x right, z forward. */
  dodgeX: number
  dodgeZ: number
  /** Seconds since anything was struck or spent, for the regeneration delay. */
  rested: number
}

export function newFighter(): Fighter {
  return {
    stance: 'ready',
    since: 0,
    health: MAX_HEALTH,
    stamina: MAX_STAMINA,
    spent: false,
    dodgeX: 0,
    dodgeZ: 1,
    rested: 9,
  }
}

const swingOf = (stance: Stance): Swing | null =>
  stance === 'light' ? LIGHT : stance === 'heavy' ? HEAVY : null

/** Total seconds a stance lasts. */
export function stanceLength(stance: Stance): number {
  const swing = swingOf(stance)
  if (swing) return swing.windUp + swing.open + swing.recover
  if (stance === 'dodge') return DODGE.seconds
  if (stance === 'stagger') return STAGGER
  return Infinity
}

/** True while the blade is out and has not yet spent its hit. */
export function striking(fighter: Fighter): boolean {
  const swing = swingOf(fighter.stance)
  if (!swing || fighter.spent) return false
  return fighter.since >= swing.windUp && fighter.since <= swing.windUp + swing.open
}

/** True while a dodge is carrying you clear of everything. */
export function immune(fighter: Fighter): boolean {
  return (
    fighter.stance === 'dodge' &&
    fighter.since >= DODGE.immuneFrom &&
    fighter.since <= DODGE.immuneTo
  )
}

/** True while anything other than standing ready is being played out. */
export function busy(fighter: Fighter): boolean {
  return fighter.stance !== 'ready' && fighter.stance !== 'block'
}

/** How far through the current stance, 0 to 1. */
export function through(fighter: Fighter): number {
  const length = stanceLength(fighter.stance)
  return length === Infinity ? 0 : Math.min(1, fighter.since / length)
}

function begin(fighter: Fighter, stance: Stance) {
  fighter.stance = stance
  fighter.since = 0
  fighter.spent = false
}

/* --------------------------------------------------------------- commands */

/** Swing. Refused while busy, or with nothing left in the tank. */
export function attack(fighter: Fighter, heavy: boolean): boolean {
  if (busy(fighter)) return false
  const swing = heavy ? HEAVY : LIGHT
  if (fighter.stamina < swing.stamina) return false
  fighter.stamina -= swing.stamina
  fighter.rested = 0
  begin(fighter, heavy ? 'heavy' : 'light')
  return true
}

/** Roll. `x` and `z` are the direction you are holding, in local space. */
export function dodge(fighter: Fighter, x: number, z: number): boolean {
  if (busy(fighter)) return false
  if (fighter.stamina < DODGE.stamina) return false
  const length = Math.hypot(x, z)
  fighter.dodgeX = length > 0.01 ? x / length : 0
  fighter.dodgeZ = length > 0.01 ? z / length : -1
  fighter.stamina -= DODGE.stamina
  fighter.rested = 0
  begin(fighter, 'dodge')
  return true
}

/**
 * Raise or drop the guard. Holding it costs, it cannot start mid-swing, and a
 * guard that has just been broken cannot go straight back up — otherwise an
 * empty tank flickers between raised and fallen every frame.
 */
export function guard(fighter: Fighter, up: boolean): boolean {
  if (up && fighter.stance === 'ready' && fighter.stamina >= BLOCK.raise) {
    begin(fighter, 'block')
    return true
  }
  if (!up && fighter.stance === 'block') {
    begin(fighter, 'ready')
    return true
  }
  return false
}

/**
 * Something hit you. Returns what it cost: blocking spends stamina and a
 * quarter of the damage, a dodge costs nothing, and being caught in the open
 * costs the lot and staggers you.
 */
export function takeHit(fighter: Fighter, damage: number): 'missed' | 'blocked' | 'hurt' {
  if (immune(fighter)) return 'missed'
  fighter.rested = 0
  if (fighter.stance === 'block' && fighter.stamina >= BLOCK.hit) {
    fighter.stamina -= BLOCK.hit
    fighter.health = Math.max(0, fighter.health - damage * BLOCK.chip)
    return 'blocked'
  }
  fighter.health = Math.max(0, fighter.health - damage)
  begin(fighter, 'stagger')
  return 'hurt'
}

/** One frame. Stances play out; stamina comes back after a pause, health slowly. */
export function stepFighter(fighter: Fighter, dt: number, running: boolean) {
  fighter.since += dt
  fighter.rested += dt

  if (busy(fighter) && fighter.since >= stanceLength(fighter.stance)) {
    begin(fighter, 'ready')
  }

  if (fighter.stance === 'block') {
    fighter.stamina = Math.max(0, fighter.stamina - BLOCK.hold * dt)
    // A guard you cannot hold falls.
    if (fighter.stamina <= 0) begin(fighter, 'ready')
  } else if (running) {
    fighter.stamina = Math.max(0, fighter.stamina - 7 * dt)
  } else if (fighter.rested > 0.8) {
    fighter.stamina = Math.min(MAX_STAMINA, fighter.stamina + 26 * dt)
  }

  if (fighter.rested > 5) {
    fighter.health = Math.min(MAX_HEALTH, fighter.health + 3.5 * dt)
  }
}

/** Can you break into a run? Not on an empty tank, and not mid-swing. */
export function canRun(fighter: Fighter): boolean {
  return !busy(fighter) && fighter.stance !== 'block' && fighter.stamina > 4
}
