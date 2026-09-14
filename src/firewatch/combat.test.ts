import { describe, expect, it } from 'vitest'
import {
  BLOCK,
  DODGE,
  HEAVY,
  LIGHT,
  MAX_HEALTH,
  MAX_STAMINA,
  attack,
  busy,
  canRun,
  dodge,
  guard,
  immune,
  newFighter,
  stanceLength,
  stepFighter,
  striking,
  takeHit,
  through,
} from './combat'

/** Run a fighter forward in sixtieths, so the tests read like play. */
function run(fighter: ReturnType<typeof newFighter>, seconds: number, running = false) {
  const step = 1 / 60
  for (let t = 0; t < seconds; t += step) stepFighter(fighter, step, running)
}

describe('swinging', () => {
  it('costs stamina and plays out', () => {
    const fighter = newFighter()
    expect(attack(fighter, false)).toBe(true)
    expect(fighter.stamina).toBe(MAX_STAMINA - LIGHT.stamina)
    expect(fighter.stance).toBe('light')
    run(fighter, stanceLength('light') + 0.05)
    expect(fighter.stance).toBe('ready')
  })

  it('will not start a second swing over the first', () => {
    const fighter = newFighter()
    attack(fighter, false)
    expect(attack(fighter, true)).toBe(false)
    expect(fighter.stance).toBe('light')
  })

  it('is refused on an empty tank', () => {
    const fighter = newFighter()
    fighter.stamina = HEAVY.stamina - 1
    expect(attack(fighter, true)).toBe(false)
    expect(fighter.stance).toBe('ready')
  })

  it('only connects during its own window, and only once', () => {
    const fighter = newFighter()
    attack(fighter, false)
    expect(striking(fighter)).toBe(false)
    run(fighter, LIGHT.windUp + LIGHT.open / 2)
    expect(striking(fighter)).toBe(true)
    fighter.spent = true
    expect(striking(fighter)).toBe(false)
    run(fighter, LIGHT.open)
    expect(striking(fighter)).toBe(false)
  })

  it('takes longer and hits harder the heavier it is', () => {
    expect(stanceLength('heavy')).toBeGreaterThan(stanceLength('light'))
    expect(HEAVY.damage).toBeGreaterThan(LIGHT.damage)
    expect(HEAVY.stamina).toBeGreaterThan(LIGHT.stamina)
  })
})

describe('rolling', () => {
  it('goes the way you are holding, and normalises it', () => {
    const fighter = newFighter()
    expect(dodge(fighter, 3, 3)).toBe(true)
    expect(Math.hypot(fighter.dodgeX, fighter.dodgeZ)).toBeCloseTo(1, 6)
  })

  it('rolls backwards when you are holding nothing', () => {
    const fighter = newFighter()
    dodge(fighter, 0, 0)
    expect(fighter.dodgeZ).toBe(-1)
  })

  it('carries you clear part way through, but not at either end', () => {
    const fighter = newFighter()
    dodge(fighter, 0, 1)
    expect(immune(fighter)).toBe(false)
    run(fighter, DODGE.immuneFrom + 0.02)
    expect(immune(fighter)).toBe(true)
    run(fighter, DODGE.immuneTo)
    expect(immune(fighter)).toBe(false)
    run(fighter, DODGE.seconds)
    expect(fighter.stance).toBe('ready')
  })
})

describe('being hit', () => {
  it('misses entirely mid-roll', () => {
    const fighter = newFighter()
    dodge(fighter, 0, 1)
    run(fighter, DODGE.immuneFrom + 0.05)
    expect(takeHit(fighter, 20)).toBe('missed')
    expect(fighter.health).toBe(MAX_HEALTH)
  })

  it('costs stamina and a little blood through a guard', () => {
    const fighter = newFighter()
    guard(fighter, true)
    expect(takeHit(fighter, 20)).toBe('blocked')
    expect(fighter.stamina).toBe(MAX_STAMINA - BLOCK.hit)
    expect(fighter.health).toBeCloseTo(MAX_HEALTH - 20 * BLOCK.chip, 6)
  })

  it('costs the lot in the open, and staggers you', () => {
    const fighter = newFighter()
    expect(takeHit(fighter, 20)).toBe('hurt')
    expect(fighter.health).toBe(MAX_HEALTH - 20)
    expect(fighter.stance).toBe('stagger')
    expect(busy(fighter)).toBe(true)
  })

  it('never drops below nothing', () => {
    const fighter = newFighter()
    takeHit(fighter, 500)
    expect(fighter.health).toBe(0)
  })
})

describe('wind', () => {
  it('drains while the guard is up, and the guard falls when it runs out', () => {
    const fighter = newFighter()
    expect(guard(fighter, true)).toBe(true)
    const step = 1 / 60
    let held = 0
    while (fighter.stance === 'block' && held < 30) {
      stepFighter(fighter, step, false)
      held += step
    }
    expect(fighter.stance).toBe('ready')
    expect(fighter.stamina).toBeLessThan(1)
    expect(held).toBeCloseTo(MAX_STAMINA / BLOCK.hold, 0)
    // And it cannot go straight back up on an empty tank.
    expect(guard(fighter, true)).toBe(false)
  })

  it('comes back once you stop spending it, after a pause', () => {
    const fighter = newFighter()
    attack(fighter, true)
    run(fighter, 0.5)
    const low = fighter.stamina
    run(fighter, 2)
    expect(fighter.stamina).toBeGreaterThan(low)
    expect(fighter.stamina).toBeLessThanOrEqual(MAX_STAMINA)
  })

  it('drains while you run, and a run needs some left', () => {
    const fighter = newFighter()
    run(fighter, 3, true)
    expect(fighter.stamina).toBeLessThan(MAX_STAMINA)
    fighter.stamina = 2
    expect(canRun(fighter)).toBe(false)
    fighter.stamina = 40
    expect(canRun(fighter)).toBe(true)
    attack(fighter, false)
    expect(canRun(fighter)).toBe(false)
  })

  it('heals slowly once nothing has happened for a while', () => {
    const fighter = newFighter()
    takeHit(fighter, 30)
    run(fighter, 1)
    expect(fighter.health).toBe(MAX_HEALTH - 30)
    run(fighter, 6)
    expect(fighter.health).toBeGreaterThan(MAX_HEALTH - 30)
    expect(fighter.health).toBeLessThanOrEqual(MAX_HEALTH)
  })
})

describe('reading the stance', () => {
  it('reports how far through a swing is', () => {
    const fighter = newFighter()
    attack(fighter, true)
    expect(through(fighter)).toBe(0)
    run(fighter, stanceLength('heavy') / 2)
    expect(through(fighter)).toBeGreaterThan(0.4)
    expect(through(fighter)).toBeLessThan(0.62)
  })

  it('has standing ready and holding a guard as not busy', () => {
    const fighter = newFighter()
    expect(busy(fighter)).toBe(false)
    guard(fighter, true)
    expect(busy(fighter)).toBe(false)
    expect(stanceLength('ready')).toBe(Infinity)
  })
})
