import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorld, withTile } from './grid'
import { discard, readSave, storageKey, writeSave } from './save'
import {
  deserializeLines,
  deserializeRoute,
  deserializeWorld,
  serializeLines,
  serializeRoute,
  serializeWorld,
} from './serialize'
import { boreTunnel } from './terrain'
import type { RailLine } from './types'

const asNumber = (raw: unknown) => (typeof raw === 'number' ? raw : null)

describe('reading a save defensively', () => {
  beforeEach(() => window.localStorage.clear())

  it('returns the fallback when nothing is stored', () => {
    expect(readSave('nothing', asNumber, 7)).toBe(7)
  })

  it('round-trips a value', () => {
    expect(writeSave('count', 12)).toBe(true)
    expect(readSave('count', asNumber, 0)).toBe(12)
  })

  it('survives malformed JSON and throws the bad entry away', () => {
    window.localStorage.setItem(storageKey('count'), '{not json')
    expect(readSave('count', asNumber, 3)).toBe(3)
    expect(window.localStorage.getItem(storageKey('count'))).toBeNull()
  })

  it('survives a well formed value of the wrong shape', () => {
    writeSave('count', { unexpected: true })
    expect(readSave('count', asNumber, 5)).toBe(5)
  })

  it('survives a reviver that throws', () => {
    writeSave('count', 1)
    expect(
      readSave(
        'count',
        () => {
          throw new Error('bad revive')
        },
        99,
      ),
    ).toBe(99)
  })

  it('keeps playing when storage itself is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(writeSave('count', 1)).toBe(false)
    expect(readSave('count', asNumber, 42)).toBe(42)
    expect(() => discard('count')).not.toThrow()
    setItem.mockRestore()
  })

  it('namespaces its keys by version', () => {
    expect(storageKey('sandbox')).toMatch(/^little-lines:v\d+:sandbox$/)
  })
})

describe('serialising a world', () => {
  it('round-trips terrain, features and tunnels', () => {
    let world = createWorld(6, 4)
    world = withTile(world, { x: 1, z: 1 }, { kind: 'water' })
    world = withTile(world, { x: 2, z: 2 }, { kind: 'forest', feature: 'tree' })
    world = withTile(world, { x: 3, z: 1 }, { kind: 'rock', h: 3 })
    world = withTile(world, { x: 4, z: 0 }, { h: 2 })
    world = withTile(world, { x: 5, z: 3 }, { feature: 'station' })
    world = boreTunnel(world, { x: 3, z: 1 }).world

    const restored = deserializeWorld(serializeWorld(world))
    expect(restored).not.toBeNull()
    expect(restored!.w).toBe(world.w)
    expect(restored!.h).toBe(world.h)
    expect(restored!.tiles).toEqual(world.tiles)
  })

  it('rejects a blob whose strings do not match its dimensions', () => {
    expect(deserializeWorld({ w: 4, h: 4, k: '..', e: '00', t: '', f: '', r: '' })).toBeNull()
    expect(deserializeWorld({ w: 0, h: 0, k: '', e: '', t: '', f: '', r: '' })).toBeNull()
    expect(deserializeWorld('nonsense')).toBeNull()
    expect(deserializeWorld(null)).toBeNull()
  })

  it('drops cottages written by an earlier build', () => {
    const world = createWorld(2, 1)
    const blob = { ...serializeWorld(world), f: 'h-' }
    expect(deserializeWorld(blob)!.tiles[0].feature).toBeNull()
  })

  it('forces water back to the water table', () => {
    const world = createWorld(2, 1)
    const blob = { ...serializeWorld(world), k: '~.', e: '30' }
    expect(deserializeWorld(blob)!.tiles[0].h).toBe(0)
  })
})

describe('serialising lines', () => {
  const world = createWorld(8, 8)
  const lines: RailLine[] = [
    { id: 'a', tiles: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }] },
    { id: 'b', tiles: [{ x: 5, z: 5 }, { x: 5, z: 6 }] },
  ]

  it('round-trips', () => {
    expect(deserializeLines(serializeLines(lines), world)).toEqual(lines)
  })

  it('drops tiles that fall outside the world and lines too short to run', () => {
    const restored = deserializeLines(
      [
        { id: 'a', t: '1.1 99.99 2.1' },
        { id: 'b', t: '4.4' },
        { id: '', t: '1.1 1.2' },
        'rubbish',
      ],
      world,
    )
    expect(restored).toHaveLength(1)
    expect(restored[0].tiles).toEqual([{ x: 1, z: 1 }, { x: 2, z: 1 }])
  })

  it('round-trips a campaign route and survives junk', () => {
    const route = [{ x: 0, z: 3 }, { x: 1, z: 3 }, { x: 2, z: 3 }]
    expect(deserializeRoute(serializeRoute(route), world)).toEqual(route)
    expect(deserializeRoute(undefined, world)).toEqual([])
    expect(deserializeRoute('x.y z', world)).toEqual([])
  })
})
