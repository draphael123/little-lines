/**
 * The arithmetic that ties the rules to the picture.
 *
 * Edge numbering is shared between two worlds: the rules call the east edge 0,
 * and the geometry has to draw that edge in the east. Getting it wrong does not
 * throw — it silently draws a board where matched borders look mismatched — so
 * it is checked here rather than by squinting at a screenshot.
 */
import { describe, expect, it } from 'vitest'
import { buildBoardGeometry, centreOf, cornersOfEdge, edgeMidpoint, hexAtPoint } from './geometry'
import { DIRECTIONS, hexesWithin, keyOf, toWorld, type HexKey } from './hex'
import { HEX } from './look'
import type { EdgeKind, Tile } from './tiles'

const all = (kind: EdgeKind): Tile => ({ edges: [kind, kind, kind, kind, kind, kind], station: false })

describe('edges and corners', () => {
  it('puts the middle of edge i exactly half way to neighbour i', () => {
    for (let edge = 0; edge < 6; edge += 1) {
      const direction = DIRECTIONS[edge]
      const neighbour = toWorld(direction.q, direction.r, HEX)
      const mid = edgeMidpoint(edge)

      expect(mid.x).toBeCloseTo(neighbour.x / 2, 10)
      expect(mid.z).toBeCloseTo(neighbour.z / 2, 10)
    }
  })

  it('gives every edge two corners, and every corner two edges', () => {
    const used = new Map<number, number>()
    for (let edge = 0; edge < 6; edge += 1) {
      const [a, b] = cornersOfEdge(edge)
      expect(a).not.toBe(b)
      used.set(a, (used.get(a) ?? 0) + 1)
      used.set(b, (used.get(b) ?? 0) + 1)
    }
    expect(used.size).toBe(6)
    for (const count of used.values()) expect(count).toBe(2)
  })

  it('agrees with the neighbouring tile about where the border is', () => {
    // My edge 0 and my eastern neighbour's edge 3 must land on the same point.
    const mine = edgeMidpoint(0)
    const neighbour = toWorld(1, 0, HEX)
    const theirs = edgeMidpoint(3)

    expect(neighbour.x + theirs.x).toBeCloseTo(mine.x, 10)
    expect(neighbour.z + theirs.z).toBeCloseTo(mine.z, 10)
  })
})

describe('picking a hex out of the ground', () => {
  it('finds the hex a centre belongs to', () => {
    for (const hex of hexesWithin(6)) {
      const world = toWorld(hex.q, hex.r, HEX)
      expect(hexAtPoint(world.x, world.z)).toEqual({ q: hex.q, r: hex.r })
    }
  })

  it('stays inside the right hex all the way out to the corners', () => {
    for (const hex of hexesWithin(3)) {
      const world = toWorld(hex.q, hex.r, HEX)
      // 80% of the way to each corner is still comfortably inside
      for (let c = 0; c < 6; c += 1) {
        const angle = (Math.PI / 3) * c
        const x = world.x + Math.cos(angle) * HEX * 0.8
        const z = world.z + Math.sin(angle) * HEX * 0.8
        expect(hexAtPoint(x, z)).toEqual({ q: hex.q, r: hex.r })
      }
    }
  })

  it('lands somewhere sensible on a border rather than throwing', () => {
    const mid = edgeMidpoint(0)
    const picked = hexAtPoint(mid.x, mid.z)
    expect([keyOf(0, 0), keyOf(1, 0)]).toContain(keyOf(picked.q, picked.r))
  })
})

describe('building the board', () => {
  const line: EdgeKind[] = ['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow']

  it('makes a mesh with positions, colours and an index', () => {
    const built = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), all('meadow')]]))

    expect(built.empty).toBe(false)
    expect(built.ground.getAttribute('position').count).toBeGreaterThan(6)
    expect(built.ground.getAttribute('color').count).toBe(built.ground.getAttribute('position').count)
    expect(built.ground.getIndex()?.count).toBeGreaterThan(0)
  })

  it('draws rail only where a tile has rail', () => {
    const bare = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), all('meadow')]]))
    const railed = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), { edges: line, station: false }]]))

    expect(bare.rails.getAttribute('position').count).toBe(0)
    expect(railed.rails.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('puts buffers on rail that meets nothing, and takes them away when it does', () => {
    const alone = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), { edges: line, station: false }]]))
    expect(alone.buffers).toHaveLength(2)

    const met = buildBoardGeometry(
      new Map<HexKey, Tile>([
        [keyOf(0, 0), { edges: line, station: false }],
        [keyOf(1, 0), { edges: line, station: false }],
      ]),
    )
    // four loose ends between them now, not the six two lone tiles would show
    expect(met.buffers).toHaveLength(2)
  })

  it('scatters the same trees every time it is built', () => {
    const tiles = new Map<HexKey, Tile>([[keyOf(2, -1), all('wood')]])
    const first = buildBoardGeometry(tiles)
    const second = buildBoardGeometry(tiles)

    expect(first.trees.length).toBeGreaterThan(0)
    expect(second.trees).toEqual(first.trees)
  })

  it('keeps what it scatters inside the tile it belongs to', () => {
    const key = keyOf(-2, 1)
    const centre = centreOf(key)
    const built = buildBoardGeometry(new Map<HexKey, Tile>([[key, all('wood')]]))

    for (const tree of built.trees) {
      expect(Math.hypot(tree.x - centre.x, tree.z - centre.z)).toBeLessThan(HEX)
    }
  })

  it('stands a station on a station tile and nowhere else', () => {
    const plain = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), all('meadow')]]))
    const stop = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), { edges: line, station: true }]]))

    expect(plain.stations).toHaveLength(0)
    expect(stop.stations).toHaveLength(1)
  })

  it('says so when there is nothing to draw', () => {
    expect(buildBoardGeometry(new Map()).empty).toBe(true)
  })
})

/**
 * Winding, which is the one geometry mistake that does not announce itself.
 * A face wound the wrong way is culled rather than drawn inside out, so the
 * board simply renders as its own sides and everything else looks fine. The
 * vertex normals are always +y, so they cannot be used to check it — the
 * triangles have to be measured.
 */
describe('which way the faces point', () => {
  function upwardTriangles(geometry: ReturnType<typeof buildBoardGeometry>['ground'], above: number) {
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!index) throw new Error('expected an indexed geometry')

    let checked = 0
    let facingUp = 0
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      const ys = [position.getY(a), position.getY(b), position.getY(c)]
      if (ys.some((y) => y < above)) continue

      const ax = position.getX(a)
      const az = position.getZ(a)
      const e1 = [position.getX(b) - ax, ys[1] - ys[0], position.getZ(b) - az]
      const e2 = [position.getX(c) - ax, ys[2] - ys[0], position.getZ(c) - az]
      // the y component of e1 × e2 is all we need
      const normalY = e1[2] * e2[0] - e1[0] * e2[2]

      checked += 1
      if (normalY > 0) facingUp += 1
    }
    return { checked, facingUp }
  }

  it('faces the tile top at the sky', () => {
    const built = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), all('meadow')]]))
    const { checked, facingUp } = upwardTriangles(built.ground, -0.01)

    expect(checked).toBe(6)
    expect(facingUp).toBe(checked)
  })

  it('faces the railway at the sky too', () => {
    const line: EdgeKind[] = ['rail', 'meadow', 'meadow', 'rail', 'meadow', 'meadow']
    const built = buildBoardGeometry(new Map<HexKey, Tile>([[keyOf(0, 0), { edges: line, station: false }]]))
    const { checked, facingUp } = upwardTriangles(built.rails, 0)

    expect(checked).toBeGreaterThan(0)
    expect(facingUp).toBe(checked)
  })
})
