import { describe, expect, it } from 'vitest'
import {
  BINS,
  INNER_R,
  NOMINAL_R,
  OUTER_R,
  addSigil,
  addStroke,
  binDelta,
  binOf,
  erode,
  inspect,
  layerWeight,
  makeSeal,
  perceived,
  resistance,
  strokeLength,
  support,
} from './seal.ts'
import type { Vec } from './seal.ts'

/** One unbroken sweep of chalk, in degrees, which are also bins. */
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

/**
 * A ring with a bite out of it. It has to be the long way round rather than a
 * ring with points removed, because a stroke is continuous — lifting the chalk
 * and putting it down again is a different stroke, and drawing straight across
 * the gap would close it.
 */
function openRing(gapFrom: number, gapTo: number, radius = NOMINAL_R): Vec[] {
  return arc(gapTo, gapFrom + 360, radius)
}

describe('bins', () => {
  it('maps a full turn onto every bin exactly once', () => {
    const seen = new Set<number>()
    for (let i = 0; i < BINS; i++) {
      const a = ((i + 0.5) / BINS) * Math.PI * 2 - Math.PI
      seen.add(binOf(Math.cos(a), Math.sin(a)))
    }
    expect(seen.size).toBe(BINS)
  })

  it('measures the short way round the wrap', () => {
    expect(binDelta(10, 350)).toBe(-20)
    expect(binDelta(350, 10)).toBe(20)
    expect(binDelta(0, 180)).toBe(180)
  })
})

describe('layer weight', () => {
  it('is worth nothing outside the band', () => {
    expect(layerWeight(INNER_R - 1)).toBe(0)
    expect(layerWeight(OUTER_R + 1)).toBe(0)
    expect(layerWeight(0)).toBe(0)
  })

  it('is worth most on the nominal ring', () => {
    expect(layerWeight(NOMINAL_R)).toBeCloseTo(1, 5)
    expect(layerWeight(INNER_R + 2)).toBeLessThan(0.6)
    expect(layerWeight(OUTER_R - 2)).toBeLessThan(0.6)
  })
})

describe('inscribing', () => {
  it('closes the circle with one clean ring', () => {
    const seal = makeSeal()
    addStroke(seal, ring(), false)
    const report = inspect(seal)
    expect(report.closed).toBe(true)
    expect(report.gaps).toBe(0)
    expect(report.weakest).toBeGreaterThan(0.9)
  })

  it('leaves a hole where the ring is open', () => {
    const seal = makeSeal()
    addStroke(seal, openRing(100, 140), false)
    const report = inspect(seal)
    expect(report.closed).toBe(false)
    expect(report.gaps).toBeGreaterThan(20)
    // The gap runs from 100° to 140°, which is bins 100..140.
    expect(report.weakestBin).toBeGreaterThan(100)
    expect(report.weakestBin).toBeLessThan(140)
  })

  it('stacks a second ring on top of the first', () => {
    const one = makeSeal()
    addStroke(one, ring(), false)
    const two = makeSeal()
    addStroke(two, ring(), false)
    addStroke(two, ring(NOMINAL_R - 60), false)
    expect(inspect(two).mean).toBeGreaterThan(inspect(one).mean * 1.7)
  })

  it('credits a bin once per stroke, so scribbling one arc is not a circle', () => {
    const back: Vec[] = []
    for (let pass = 0; pass < 24; pass++) {
      back.push(...arc(pass % 2 === 0 ? 0 : 40, pass % 2 === 0 ? 40 : 0))
    }
    const scribbled = makeSeal()
    addStroke(scribbled, back, false)
    const clean = makeSeal()
    addStroke(clean, ring(), false)
    // Costs more chalk than a whole ring, and holds only the arc it covers.
    expect(strokeLength(back)).toBeGreaterThan(strokeLength(ring()))
    expect(support(scribbled)[20]).toBeLessThanOrEqual(support(clean)[20] + 1e-6)
    expect(inspect(scribbled).closed).toBe(false)
  })

  it('does not let a spoke hold an arc the way a ring does', () => {
    const spoke = makeSeal()
    addStroke(
      spoke,
      [
        { x: INNER_R + 4, y: 0 },
        { x: OUTER_R - 4, y: 0 },
      ],
      false,
    )
    const round = makeSeal()
    addStroke(round, ring(), false)
    expect(support(spoke)[180]).toBeLessThan(support(round)[180] * 0.7)
  })

  it('wastes chalk laid outside the band', () => {
    const seal = makeSeal()
    const stroke = addStroke(
      seal,
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
      ],
      false,
    )
    expect(stroke.wasted).toBe(true)
    expect(inspect(seal).mean).toBe(0)
  })
})

describe('sigils', () => {
  it('a ward strengthens its own arc and nothing else', () => {
    const seal = makeSeal()
    addStroke(seal, ring(), false)
    const before = support(seal)
    addSigil(seal, 'ward', { x: NOMINAL_R, y: 0 })
    const after = support(seal)
    expect(after[180]).toBeGreaterThan(before[180] + 0.8)
    expect(after[0]).toBeCloseTo(before[0], 5)
  })

  it('a ward counts for less against something that eats wards', () => {
    const seal = makeSeal()
    addStroke(seal, ring(), false)
    addSigil(seal, 'ward', { x: NOMINAL_R, y: 0 })
    expect(support(seal, 0.4)[180]).toBeLessThan(support(seal, 1)[180])
  })

  it('silence changes what is seen, not what is there', () => {
    const seal = makeSeal()
    addStroke(seal, openRing(100, 140), false)
    const at = binAngleVec(120, NOMINAL_R)
    addSigil(seal, 'silence', at)
    const real = support(seal)
    const seen = perceived(seal)
    expect(real[120]).toBeLessThan(0.1)
    expect(seen[120]).toBeGreaterThan(2)
  })

  it('an anchor makes its arc wear slowly', () => {
    const seal = makeSeal()
    addStroke(seal, ring(), false)
    addSigil(seal, 'anchor', { x: NOMINAL_R, y: 0 })
    expect(resistance(seal, 180)).toBeLessThan(0.35)
    expect(resistance(seal, 0)).toBe(1)
  })
})

describe('patching', () => {
  it('restores a worn arc, but no higher than it was inscribed', () => {
    const seal = makeSeal()
    addStroke(seal, ring(), false)
    addStroke(seal, ring(NOMINAL_R - 60), false)
    const ceiling = seal.layers[90]
    for (let i = 0; i < 20; i++) erode(seal, 90, 1)
    expect(seal.integrity[90]).toBe(0)

    for (let i = 0; i < 12; i++) addStroke(seal, arc(60, 120), true)
    // It comes back to about where it started, and no amount of chalk
    // poured into one arc turns it into a wall.
    expect(seal.integrity[90]).toBeGreaterThan(ceiling * 0.9)
    expect(seal.integrity[90]).toBeLessThanOrEqual(ceiling + 0.51)
  })

  it('wins only a little ground where nothing was inscribed', () => {
    const patched = makeSeal()
    addStroke(patched, arc(60, 120), true)
    const inscribed = makeSeal()
    addStroke(inscribed, arc(60, 120), false)
    expect(patched.integrity[90]).toBeGreaterThan(0)
    expect(patched.integrity[90]).toBeLessThan(inscribed.integrity[90] * 0.4)
  })
})

describe('erosion', () => {
  it('wears the arc it is applied to, and its neighbours less', () => {
    const seal = makeSeal()
    addStroke(seal, ring(), false)
    erode(seal, 90, 0.5)
    expect(seal.integrity[90]).toBeLessThan(0.55)
    expect(seal.integrity[95]).toBeGreaterThan(seal.integrity[90])
    expect(seal.integrity[270]).toBeCloseTo(1, 5)
  })

  it('never goes below nothing', () => {
    const seal = makeSeal()
    addStroke(seal, ring(), false)
    for (let i = 0; i < 40; i++) erode(seal, 90, 1)
    expect(seal.integrity[90]).toBe(0)
  })
})

function binAngleVec(bin: number, radius: number): Vec {
  const a = ((bin + 0.5) / BINS) * Math.PI * 2 - Math.PI
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius }
}
