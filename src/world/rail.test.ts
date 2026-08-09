import { describe, expect, it } from 'vitest'
import { generateRegion } from './heightfield'
import {
  MAX_GRADE,
  SNAP_RADIUS,
  addEdge,
  componentOfEdge,
  componentPath,
  components,
  emptyNetwork,
  layEdge,
  nearestOnNetwork,
  profile,
  removeEdge,
  snapNode,
  totalLength,
  type RailNetwork,
} from './rail'

const field = generateRegion({ seed: 3 })

/**
 * Gentle country for the tests that are about the shape of the graph rather
 * than the shape of the land. Junctions pin both ends of a line, so on real
 * hills a thousand-metre run between two fixed points is often legitimately
 * too steep — which would make retuning the terrain break tests that have
 * nothing to do with terrain.
 */
const gentle = generateRegion({ seed: 3, relief: 20 })

/** Lay a line and commit it, failing loudly if the ground refused it. */
function lay(net: RailNetwork, from: [number, number], to: [number, number]): RailNetwork {
  const result = layEdge(gentle, net, { x: from[0], z: from[1] }, { x: to[0], z: to[1] })
  expect(result.ok, result.reason).toBe(true)
  return addEdge(net, result)
}

describe('the vertical profile', () => {
  it('pins both ends and never exceeds the ruling gradient', () => {
    const ground = [0, 40, 12, 55, 9, 30, 4, 0, 22, 5]
    const spacing = 20
    const out = profile(ground, spacing, [0, 5])!
    expect(out[0]).toBeCloseTo(0, 6)
    expect(out[out.length - 1]).toBeCloseTo(5, 6)
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs(out[i] - out[i - 1])).toBeLessThanOrEqual(MAX_GRADE * spacing + 1e-4)
    }
  })

  it('refuses two junctions no gradient can join', () => {
    // 60 m apart in height, three samples 20 m apart: impossible
    expect(profile([0, 30, 60], 20, [0, 60])).toBeNull()
  })

  it('lets a free end settle into a cutting or an embankment', () => {
    const out = profile([0, 40, 80], 40, [0, null])!
    expect(out[0]).toBeCloseTo(0, 6)
    // the far end could not reach 80 m, so it sits well below the ground
    expect(out[2]).toBeLessThan(40)
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs(out[i] - out[i - 1])).toBeLessThanOrEqual(MAX_GRADE * 40 + 1e-4)
    }
  })

  it('smooths the ground rather than tracing every bump', () => {
    const bumpy = [0, 18, 0, 18, 0, 18, 0]
    const out = profile(bumpy, 40, [0, 0])!
    const swing = Math.max(...out) - Math.min(...out)
    expect(swing).toBeLessThan(9)
  })

  it('copes with the shortest possible runs', () => {
    expect(profile([3, 9], 1000, [3, 9])).toEqual([3, 9])
    expect(profile([4], 10, [4, null])).toEqual([4])
    expect(profile([], 10, [null, null])).toEqual([])
  })
})

describe('laying a line', () => {
  it('produces a curved, profiled edge between two points', () => {
    const result = layEdge(field, emptyNetwork(), { x: -600, z: -200 }, { x: 200, z: 100 })
    expect(result.ok, result.reason).toBe(true)
    const edge = result.edge!
    expect(edge.points.length).toBeGreaterThan(20)
    expect(edge.length).toBeGreaterThan(800)
    // and it obeys the gradient along its whole length
    for (let i = 1; i < edge.points.length; i++) {
      const run = Math.hypot(
        edge.points[i][0] - edge.points[i - 1][0],
        edge.points[i][2] - edge.points[i - 1][2],
      )
      const rise = Math.abs(edge.points[i][1] - edge.points[i - 1][1])
      expect(rise).toBeLessThanOrEqual(run * MAX_GRADE + 0.05)
    }
  })

  it('creates two nodes for a line in open country', () => {
    const result = layEdge(field, emptyNetwork(), { x: -400, z: 0 }, { x: 300, z: 0 })
    expect(result.created).toHaveLength(2)
  })

  it('refuses lines that are too short, too long, or off the region', () => {
    const net = emptyNetwork()
    expect(layEdge(gentle, net, { x: 0, z: 0 }, { x: 10, z: 0 }).ok).toBe(false)
    expect(layEdge(gentle, net, { x: -1900, z: 0 }, { x: 1900, z: 1900 }).ok).toBe(false)
    expect(layEdge(gentle, net, { x: 0, z: 0 }, { x: 99999, z: 0 }).ok).toBe(false)
  })

  it('lets an ordinary line across rolling country through', () => {
    // free ends mean the profile settles rather than tracing the ground, so
    // normal country never refuses a railway
    let laid = 0
    for (let i = 0; i < 24; i++) {
      const x = -1700 + i * 130
      if (layEdge(field, emptyNetwork(), { x, z: -300 }, { x: x + 600, z: -300 }).ok) laid++
    }
    expect(laid).toBeGreaterThan(20)
  })

  it('refuses a line between two junctions that is too steep to work', () => {
    // build up to a high junction, then demand a short line down to a low one
    const high = { id: 'high', x: 0, z: 0, y: 200 }
    const low = { id: 'low', x: 150, z: 0, y: 0 }
    const net: RailNetwork = { nodes: { high, low }, edges: [] }
    const result = layEdge(
      field,
      net,
      { x: high.x, z: high.z },
      { x: low.x, z: low.z },
      { fromNode: 'high', toNode: 'low' },
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/steep/i)
  })

  it('measures how much of the run has to be carried on a viaduct', () => {
    const result = layEdge(field, emptyNetwork(), { x: -1500, z: 1500 }, { x: -700, z: 1500 })
    expect(result.ok, result.reason).toBe(true)
    expect(result.edge!.bridged).toBeGreaterThanOrEqual(0)
    expect(result.edge!.bridged).toBeLessThanOrEqual(result.edge!.length + 1)
  })
})

describe('junctions', () => {
  it('snaps a new line onto an existing node instead of doubling up', () => {
    let net = lay(emptyNetwork(), [-500, 0], [200, 0])
    const end = Object.values(net.nodes).find((n) => Math.abs(n.x - 200) < 1)!
    const near = layEdge(gentle, net, { x: end.x + 20, z: end.z + 20 }, { x: 700, z: 400 })
    expect(near.ok, near.reason).toBe(true)
    // only the far end is new — the near end joined the existing node
    expect(near.created).toHaveLength(1)
    net = addEdge(net, near)
    expect(Object.keys(net.nodes)).toHaveLength(3)
    expect(components(net)).toHaveLength(1)
  })

  it('finds the nearest node only inside the snap radius', () => {
    const net = lay(emptyNetwork(), [-500, 0], [200, 0])
    expect(snapNode(net, 205, 5)).not.toBeNull()
    expect(snapNode(net, 200 + SNAP_RADIUS + 50, 0)).toBeNull()
  })

  it('refuses a line from a junction back to itself', () => {
    const net = lay(emptyNetwork(), [-500, 0], [200, 0])
    const node = Object.values(net.nodes)[0]
    const result = layEdge(gentle, net, { x: node.x, z: node.z }, { x: node.x + 30, z: node.z + 20 })
    expect(result.ok).toBe(false)
  })
})

describe('separate railways', () => {
  it('keeps unconnected lines in separate components', () => {
    let net = lay(emptyNetwork(), [-1500, -800], [-800, -800])
    net = lay(net, [800, 900], [1500, 900])
    expect(components(net)).toHaveLength(2)
    const byEdge = componentOfEdge(net)
    expect(new Set(byEdge.values()).size).toBe(2)
  })

  it('merges them into one when a line joins the two', () => {
    let net = lay(emptyNetwork(), [-1200, 0], [-500, 0])
    net = lay(net, [500, 0], [1200, 0])
    expect(components(net)).toHaveLength(2)
    net = lay(net, [-500, 0], [500, 0])
    expect(components(net)).toHaveLength(1)
  })

  it('threads a component into one runnable path', () => {
    let net = lay(emptyNetwork(), [-1200, 0], [-500, 0])
    net = lay(net, [-500, 0], [200, 300])
    const path = componentPath(net, components(net)[0])
    expect(path.length).toBeGreaterThan(40)
    // consecutive points are close together, so a train can follow it
    for (let i = 1; i < path.length; i++) {
      const step = Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2])
      expect(step).toBeLessThan(60)
    }
  })
})

describe('editing', () => {
  it('adds up the miles of line', () => {
    const net = lay(emptyNetwork(), [-600, 0], [400, 0])
    expect(totalLength(net)).toBeGreaterThan(900)
  })

  it('lifts an edge and tidies away the nodes nothing uses any more', () => {
    let net = lay(emptyNetwork(), [-600, 0], [400, 0])
    const id = net.edges[0].id
    net = removeEdge(net, id)
    expect(net.edges).toHaveLength(0)
    expect(Object.keys(net.nodes)).toHaveLength(0)
  })

  it('keeps a junction that other lines still use', () => {
    let net = lay(emptyNetwork(), [-1200, 0], [-400, 0])
    net = lay(net, [-400, 0], [400, 200])
    const first = net.edges[0].id
    net = removeEdge(net, first)
    expect(net.edges).toHaveLength(1)
    expect(Object.keys(net.nodes)).toHaveLength(2)
  })
})

describe('putting a station on the line', () => {
  it('finds the nearest point on the network', () => {
    const net = lay(emptyNetwork(), [-600, 0], [600, 0])
    const hit = nearestOnNetwork(net, 0, 30)
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeLessThan(60)
    expect(Math.abs(hit!.point[2])).toBeLessThan(60)
  })

  it('finds nothing when the line is miles away', () => {
    const net = lay(emptyNetwork(), [-600, 0], [600, 0])
    expect(nearestOnNetwork(net, 0, 900)).toBeNull()
  })
})
