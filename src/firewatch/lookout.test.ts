import { describe, expect, it } from 'vitest'
import { fbm, hash2, randoms } from './noise'
import {
  CLEARING,
  CLIMB_SECONDS,
  DECK,
  EYE,
  LADDER_STAND,
  TRUNK,
  WANDER,
  advanceClimb,
  atLadderFoot,
  atLadderHead,
  bearingGap,
  bearingOf,
  bearingToPoint,
  clampToDeck,
  clampToGround,
  climbPose,
  groundAt,
  readBearing,
  scatterWood,
  type Climb,
} from './lookout'

describe('noise', () => {
  it('is the same every time for the same place', () => {
    expect(hash2(12, -7, 3)).toBe(hash2(12, -7, 3))
    expect(fbm(1.25, -3.5)).toBe(fbm(1.25, -3.5))
  })

  it('stays inside its range', () => {
    for (let i = 0; i < 400; i++) {
      const value = fbm(i * 0.37, -i * 0.11, 5, 9)
      expect(value).toBeGreaterThanOrEqual(-1)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('gives a repeatable stream from a seed, and a different one from another', () => {
    const a = randoms(4)
    const b = randoms(4)
    const c = randoms(5)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(randoms(4)()).not.toBe(c())
  })
})

describe('the ground', () => {
  it('is level where the tree stands, so the ladder meets it', () => {
    expect(Math.abs(groundAt(TRUNK.x, TRUNK.z))).toBeLessThan(0.01)
    expect(Math.abs(groundAt(LADDER_STAND.x, LADDER_STAND.z))).toBeLessThan(0.05)
  })

  it('has some relief once you are away from the clearing', () => {
    let most = 0
    for (let x = -200; x <= 200; x += 13) {
      for (let z = -200; z <= 200; z += 13) {
        most = Math.max(most, Math.abs(groundAt(x, z)))
      }
    }
    expect(most).toBeGreaterThan(1)
  })
})

describe('the wood', () => {
  const trees = scatterWood(120, 9)

  it('grows a wood rather than a handful of trees', () => {
    expect(trees.length).toBeGreaterThan(150)
  })

  it('keeps out of the clearing and off the map edge', () => {
    for (const tree of trees) {
      const r = Math.hypot(tree.x, tree.z)
      expect(r).toBeGreaterThan(CLEARING - 1)
      expect(r).toBeLessThanOrEqual(120)
      expect(tree.y).toBeCloseTo(groundAt(tree.x, tree.z), 6)
    }
  })

  it('is the same wood on a second run', () => {
    expect(scatterWood(120, 9).length).toBe(trees.length)
  })
})

describe('the ladder', () => {
  it('is offered at the foot and at the head, and nowhere in between', () => {
    expect(atLadderFoot(LADDER_STAND.x, LADDER_STAND.z)).toBe(true)
    expect(atLadderFoot(40, 40)).toBe(false)
    expect(atLadderHead(0, DECK.maxZ - 0.9)).toBe(true)
    expect(atLadderHead(0, DECK.minZ)).toBe(false)
  })

  it('climbs to the deck and stops there', () => {
    let climb: Climb = { stance: 'climbing', t: 0 }
    const frames = Math.ceil(CLIMB_SECONDS * 60) + 10
    for (let i = 0; i < frames && climb.stance === 'climbing'; i++) {
      climb = advanceClimb(climb, 1 / 60)
    }
    expect(climb.stance).toBe('deck')
    expect(climb.t).toBe(1)
    // A finished climb is not nudged any further by more frames.
    expect(advanceClimb(climb, 1)).toEqual(climb)
  })

  it('comes back down to the ground', () => {
    let climb: Climb = { stance: 'descending', t: 1 }
    const frames = Math.ceil(CLIMB_SECONDS * 60) + 10
    for (let i = 0; i < frames && climb.stance === 'descending'; i++) {
      climb = advanceClimb(climb, 1 / 60)
    }
    expect(climb.stance).toBe('ground')
    expect(climb.t).toBe(0)
  })

  it('rises the whole way and never overshoots the deck', () => {
    let last = -Infinity
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const pose = climbPose(t, 0, Math.PI)
      expect(pose.y).toBeGreaterThanOrEqual(last - 0.001)
      expect(pose.y).toBeLessThanOrEqual(DECK.y + EYE + 0.001)
      last = pose.y
    }
    const top = climbPose(1, 0, Math.PI)
    expect(top.y).toBeCloseTo(DECK.y + EYE, 5)
    expect(top.z).toBeLessThan(LADDER_STAND.z)
    expect(top.yaw).toBeCloseTo(0, 5)
  })
})

describe('where you may stand', () => {
  it('keeps you on the deck', () => {
    const out = clampToDeck(99, 99)
    expect(Math.abs(out.x)).toBeLessThan(DECK.halfX)
    expect(out.z).toBeLessThan(DECK.maxZ)
  })

  it('will not let you stand inside the trunk, up or down', () => {
    const deck = clampToDeck(0.01, 0.01)
    expect(Math.hypot(deck.x, deck.z)).toBeGreaterThan(1)
    const centre = clampToDeck(0, 0)
    expect(Math.hypot(centre.x, centre.z)).toBeGreaterThan(1)
    const ground = clampToGround(0, 0)
    expect(Math.hypot(ground.x, ground.z)).toBeGreaterThanOrEqual(TRUNK.base)
  })

  it('turns you back at the edge of the wood', () => {
    const out = clampToGround(900, -900)
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(WANDER, 5)
  })
})

describe('bearings', () => {
  it('reads north at zero and east at ninety', () => {
    expect(bearingOf(0)).toBeCloseTo(0, 5)
    expect(bearingOf(-Math.PI / 2)).toBeCloseTo(90, 5)
    expect(bearingOf(Math.PI / 2)).toBeCloseTo(270, 5)
  })

  it('measures the short way round', () => {
    expect(bearingGap(350, 10)).toBeCloseTo(20, 5)
    expect(bearingGap(10, 350)).toBeCloseTo(20, 5)
    expect(bearingGap(0, 180)).toBeCloseTo(180, 5)
  })

  it('is read out as three figures', () => {
    expect(readBearing(42)).toBe('042')
    expect(readBearing(7.4)).toBe('007')
    expect(readBearing(360)).toBe('000')
  })

  it('puts a point where the bearing says it is', () => {
    const north = bearingToPoint(0, 100)
    expect(north.x).toBeCloseTo(0, 5)
    expect(north.z).toBeCloseTo(-100, 5)
    const east = bearingToPoint(90, 100)
    expect(east.x).toBeCloseTo(100, 5)
    expect(east.z).toBeCloseTo(0, 5)
  })
})
