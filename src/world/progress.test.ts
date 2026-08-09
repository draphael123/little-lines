import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './buildings'
import { MILESTONES, crossed, milestoneAt, nextMilestone, progressTo, rungFor, unlockedFor } from './milestones'
import { objectiveFor } from './objective'
import { emptyNetwork, type RailNetwork } from './rail'
import type { TownReport } from './towns'

describe('the ladder', () => {
  it('starts at the bottom and rises', () => {
    expect(rungFor(0)).toBe(0)
    expect(milestoneAt(0).name).toBe(MILESTONES[0].name)
    expect(rungFor(1e9)).toBe(MILESTONES.length - 1)
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].served).toBeGreaterThan(MILESTONES[i - 1].served)
    }
  })

  it('opens nothing beyond the first station at the very start', () => {
    // The whole point of measuring people *carried* rather than people in the
    // region: with the region total, a fresh map already unlocked five of the
    // eight buildings before a single rail was laid.
    const open = unlockedFor(0).map((b) => b.id)
    expect(open).toContain('station')
    expect(open).not.toContain('shed')
    expect(open).not.toContain('market')
    expect(open).not.toContain('terminus')
  })

  it('names a milestone for every building that has to be unlocked', () => {
    const gated = BUILDINGS.filter((b) => b.unlockAt > 0).map((b) => b.id).sort()
    const announced = MILESTONES.map((m) => m.unlocks).filter(Boolean).sort()
    expect(announced).toEqual(gated)
  })

  it('agrees with each building about its own threshold', () => {
    for (const milestone of MILESTONES) {
      if (!milestone.unlocks) continue
      const building = BUILDINGS.find((b) => b.id === milestone.unlocks)!
      expect(building.unlockAt).toBe(milestone.served)
      // reached exactly at the threshold, not one short of it
      expect(unlockedFor(milestone.served).map((b) => b.id)).toContain(building.id)
      expect(unlockedFor(milestone.served - 1).map((b) => b.id)).not.toContain(building.id)
    }
  })

  it('reports progress between rungs', () => {
    const second = MILESTONES[1]
    expect(progressTo(0)).toBeCloseTo(0, 5)
    expect(progressTo(second.served / 2)).toBeCloseTo(0.5, 2)
    expect(progressTo(second.served)).toBeCloseTo(0, 5) // now at the foot of the next
    expect(progressTo(1e9)).toBe(1)
    expect(nextMilestone(1e9)).toBeNull()
  })

  it('pays a rung once, even when several are cleared at a stroke', () => {
    const jump = crossed(0, MILESTONES[3].served)
    expect(jump.map((m) => m.name)).toEqual([
      MILESTONES[1].name,
      MILESTONES[2].name,
      MILESTONES[3].name,
    ])
    // going back down earns nothing, and standing still earns nothing
    expect(crossed(MILESTONES[3].served, 0)).toEqual([])
    expect(crossed(500, 500)).toEqual([])
  })
})

/* ------------------------------------------------------------- what to do */

const report = (name: string, state: TownReport['state'], population = 40): TownReport =>
  ({
    settlement: { id: name, x: 0, z: 0, name, population, peak: population, wasServed: true },
    tier: 'hamlet',
    station: null,
    networkId: null,
    linked: state === 'growing' || state === 'full',
    service: 1,
    quality: 1,
    cap: 500,
    growth: 0,
    fares: 1,
    amenities: [],
    state,
    reason: '',
  }) as TownReport

const base = {
  network: emptyNetwork() as RailNetwork,
  structures: [],
  reports: [] as TownReport[],
  balance: 5000,
  running: true,
  served: 0,
  trains: 1,
  capacity: 1,
}

describe('what to do next', () => {
  it('asks for a line before anything else', () => {
    const o = objectiveFor(base)
    expect(o.tool).toBe('rail')
    expect(o.title).toMatch(/line/i)
  })

  it('asks for a station once there is a line', () => {
    const network: RailNetwork = { ...emptyNetwork(), edges: [{ id: 'e1' } as never] }
    const o = objectiveFor({ ...base, network })
    expect(o.tool).toBe('build')
    expect(o.building).toBe('station')
  })

  it('explains why one station is not enough', () => {
    const network: RailNetwork = { ...emptyNetwork(), edges: [{ id: 'e1' } as never] }
    const o = objectiveFor({
      ...base,
      network,
      structures: [{ id: 'b1', kind: 'station', x: 0, z: 0, y: 0 }],
      reports: [report('Alone', 'isolated')],
    })
    expect(o.title).toMatch(/somewhere else/i)
  })

  it('says to press play when nothing is running', () => {
    const network: RailNetwork = { ...emptyNetwork(), edges: [{ id: 'e1' } as never] }
    const o = objectiveFor({
      ...base,
      network,
      running: false,
      structures: [{ id: 'b1', kind: 'station', x: 0, z: 0, y: 0 }],
      reports: [report('A', 'growing'), report('B', 'growing')],
    })
    expect(o.title).toMatch(/start the trains/i)
  })

  it('raises a place that is emptying above ordinary progress', () => {
    const network: RailNetwork = { ...emptyNetwork(), edges: [{ id: 'e1' } as never] }
    const o = objectiveFor({
      ...base,
      network,
      structures: [{ id: 'b1', kind: 'station', x: 0, z: 0, y: 0 }],
      reports: [report('A', 'growing'), report('Lost', 'declining')],
    })
    expect(o.title).toContain('Lost')
  })

  it('falls back to the next rung when nothing is wrong', () => {
    const network: RailNetwork = { ...emptyNetwork(), edges: [{ id: 'e1' } as never] }
    const o = objectiveFor({
      ...base,
      network,
      served: 20,
      structures: [{ id: 'b1', kind: 'station', x: 0, z: 0, y: 0 }],
      reports: [report('A', 'growing'), report('B', 'growing')],
    })
    expect(o.idle).toBe(true)
    expect(o.title).toBe(MILESTONES[1].name)
  })

  it('always says something', () => {
    // whatever state it is handed, the player is never left without an answer
    const states: TownReport['state'][] = ['unserved', 'isolated', 'growing', 'full', 'declining']
    for (const state of states) {
      for (const running of [true, false]) {
        for (const balance of [-100, 5000]) {
          const o = objectiveFor({ ...base, running, balance, reports: [report('X', state)] })
          expect(o.title.length).toBeGreaterThan(0)
          expect(o.detail.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
