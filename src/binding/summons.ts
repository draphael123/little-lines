/**
 * What you called up, and how it goes about getting out.
 *
 * A summons is a set of numbers and a way of choosing where to push. It never
 * has a shape — the game only ever draws what it does to the room — so there
 * is nothing here but behaviour.
 */

import { BINS, binDelta } from './seal.ts'

export interface Summon {
  id: string
  name: string
  epithet: string
  /** Read before the circle is lit. */
  brief: string
  /** The one thing this summons is here to teach. */
  tell: string
  /** Seconds you have to hold it. */
  duration: number
  /** How many places it pushes at once. */
  heads: number
  /** 0 blunders about, 1 finds the true weakest arc every time. */
  cunning: number
  /** How hard it leans, over the length of the binding. */
  force: number
  /** Wards count for this much against it. */
  wardScale: number
  /** Chalk you are given for the inscription. */
  chalk: number
}

export const SUMMONS: Summon[] = [
  {
    id: 'ashling',
    name: 'The Ashling',
    epithet: 'small, and stupid, and hungry',
    brief:
      'It came up out of the hearth with the smoke and it does not really know where it is. It will lean on the circle wherever it happens to be facing.',
    tell: 'Close the ring. A circle with a hole in it is a doorway.',
    duration: 42,
    heads: 1,
    cunning: 0.12,
    force: 0.78,
    wardScale: 1,
    chalk: 3800,
  },
  {
    id: 'vetch',
    name: 'Vetch',
    epithet: 'who waits, and reads',
    brief:
      'Vetch has been bound eleven times and has got out of nine. It will not waste itself on your strongest arc. It will find the thinnest place you left and it will stay there.',
    tell: 'It attacks what looks weakest. Silence makes a weak arc look strong.',
    duration: 58,
    heads: 1,
    cunning: 0.82,
    force: 0.95,
    wardScale: 1,
    chalk: 4800,
  },
  {
    id: 'morrow',
    name: 'Morrow',
    epithet: 'the double-mouthed',
    brief:
      'Morrow pushes in two places at once, and it has no great fear of a ward — it has eaten wards before. What it cannot easily chew through is chalk that will not wear.',
    tell: 'Two heads, and wards barely bite. Anchor the arcs, and keep chalk back.',
    duration: 72,
    heads: 2,
    cunning: 0.62,
    force: 1.05,
    wardScale: 0.4,
    chalk: 5200,
  },
]

export interface Probe {
  /** Where it is pushing now. */
  bin: number
  /** Where it is trying to get to. */
  target: number
  /** Seconds until it looks again. */
  rethink: number
  /** Eases in when it settles, so a fresh probe does not hit at full force. */
  bite: number
}

/** Deterministic noise, so a binding can be replayed in a test. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Pick somewhere to push.
 *
 * Cunning is how often it really looks. A sharp thing reads the whole circle
 * and goes straight to the thinnest arc in it; a dull one glances at a few
 * places and leans on the worst of those, which is usually nowhere useful.
 * Sampling alone could not model this — a hundred random glances still miss a
 * narrow weakness most of the time, so a clever summons has to actually scan.
 */
export function chooseTarget(
  field: Float32Array,
  cunning: number,
  random: () => number,
  avoid: number[] = [],
  minSeparation = 70,
): number {
  const blocked = (b: number) =>
    avoid.some((other) => Math.abs(binDelta(other, b)) < minSeparation)

  const acuity = cunning * cunning
  const looks = random() < acuity ? BINS : 6

  let bestBin = -1
  let bestValue = Infinity
  for (let i = 0; i < looks; i++) {
    const b = looks === BINS ? i : Math.floor(random() * BINS)
    if (blocked(b)) continue
    if (field[b] < bestValue) {
      bestValue = field[b]
      bestBin = b
    }
  }
  if (bestBin < 0) {
    // Everywhere it looked was spoken for. Take anything that is not.
    for (let i = 0; i < BINS; i++) {
      const b = Math.floor(random() * BINS)
      if (!blocked(b)) return b
    }
    return Math.floor(random() * BINS)
  }
  return bestBin
}

export function makeProbe(bin: number): Probe {
  return { bin, target: bin, rethink: 0, bite: 0 }
}

/** How hard a probe leans while it is still on its way somewhere. */
export const TRAVELLING_BITE = 0.35

/**
 * Move a probe towards its target, the short way round.
 *
 * It keeps leaning while it walks. An earlier version let bite fall to nothing
 * in transit, and since a dull summons spends most of a night in transit, the
 * circle was barely touched and — worse — nothing on screen showed where the
 * thing was. Pressure you cannot see is pressure the player cannot answer.
 */
export function advanceProbe(probe: Probe, dt: number, cunning: number): void {
  const speed = 34 + cunning * 66
  const d = binDelta(probe.bin, probe.target)
  const step = Math.sign(d) * Math.min(Math.abs(d), speed * dt)
  probe.bin = (probe.bin + step + BINS) % BINS
  const settled = Math.abs(binDelta(probe.bin, probe.target)) < 6
  const want = settled ? 1 : TRAVELLING_BITE
  const rate = probe.bite < want ? 1.6 : 2.2
  probe.bite += Math.sign(want - probe.bite) * Math.min(Math.abs(want - probe.bite), rate * dt)
}

/**
 * How hard it is leaning at time t. It arrives gently, finds its feet, and
 * then bears down — the last third of a binding is where circles break.
 */
export function pressureAt(summon: Summon, t: number): number {
  const p = Math.max(0, Math.min(1, t / summon.duration))
  const ramp = Math.min(1, t / 4)
  return summon.force * ramp * (0.55 + 0.85 * p * p)
}
