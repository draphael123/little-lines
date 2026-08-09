/**
 * A small deterministic generator, carried in the game state rather than kept
 * in a closure.
 *
 * The stack has to be reproducible from a seed — a saved game reloads into the
 * same run, and a test that fails has to be a test that fails again — so the
 * generator's whole state is one integer that lives in the game object with
 * everything else.
 */

export interface Roll<T> {
  value: T
  state: number
}

/** mulberry32. */
export function nextFloat(state: number): Roll<number> {
  let a = (state + 0x6d2b79f5) | 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  a = a | 0
  return { value, state: a }
}

/** An integer in `[0, bound)`. */
export function nextInt(state: number, bound: number): Roll<number> {
  const roll = nextFloat(state)
  return { value: Math.floor(roll.value * bound) % Math.max(1, bound), state: roll.state }
}

export function pick<T>(state: number, items: ReadonlyArray<T>): Roll<T> {
  const roll = nextInt(state, items.length)
  return { value: items[roll.value], state: roll.state }
}

/**
 * A weighted pick. Weights are read alongside the items rather than baked into
 * them so the tables in `deck.ts` stay readable as tables.
 */
export function pickWeighted<T>(
  state: number,
  items: ReadonlyArray<T>,
  weights: ReadonlyArray<number>,
): Roll<T> {
  let total = 0
  for (const weight of weights) total += weight
  const roll = nextFloat(state)
  let cursor = roll.value * total
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i]
    if (cursor <= 0) return { value: items[i], state: roll.state }
  }
  return { value: items[items.length - 1], state: roll.state }
}

/** True with probability `chance`. */
export function chanceOf(state: number, chance: number): Roll<boolean> {
  const roll = nextFloat(state)
  return { value: roll.value < chance, state: roll.state }
}
