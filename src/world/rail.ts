/**
 * Rail in continuous space.
 *
 * A railway is a graph of nodes joined by curved edges, not a sequence of
 * squares. You drag a line from somewhere to somewhere else; if either end
 * lands near existing track it joins onto it and you have a junction. The
 * curve leaves an existing node along the direction the track was already
 * running, so the joins look like joins.
 *
 * The vertical profile is the interesting part: real railways do not follow
 * the ground, they cut through the high bits and are carried over the low
 * ones. So the ground is sampled along the curve and then smoothed and
 * gradient-limited into a profile a train could actually work. If the ends are
 * too far apart in height for the distance between them, the line is refused.
 */
import { heightAt, inRegion, isWater, type Heightfield } from './heightfield'

export type Vec3 = [number, number, number]

export interface RailNode {
  id: string
  x: number
  z: number
  y: number
}

export interface RailEdge {
  id: string
  a: string
  b: string
  /** Sampled centre line, world space, already profiled. */
  points: Vec3[]
  length: number
  /** Metres of the run that stand clear of the ground and need a viaduct. */
  bridged: number
}

export interface RailNetwork {
  nodes: Record<string, RailNode>
  edges: RailEdge[]
}

export const emptyNetwork = (): RailNetwork => ({ nodes: {}, edges: [] })

/** Steepest gradient a locomotive will work, as a fraction. */
export const MAX_GRADE = 0.04
/** How close a new end has to land to join onto existing track. */
export const SNAP_RADIUS = 70
/** Metres between sampled points along an edge. */
export const SAMPLE_SPACING = 12
/** Above this much clearance the track is on a viaduct rather than the ground. */
export const DECK_CLEARANCE = 3

const dist2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(bx - ax, bz - az)

/* ---------------------------------------------------------------- geometry */

/** A cubic Bézier, so a line can leave a junction along the existing track. */
function bezier(
  a: { x: number; z: number },
  b: { x: number; z: number },
  tangent: { x: number; z: number } | null,
  samples: number,
): Array<{ x: number; z: number }> {
  const span = dist2(a.x, a.z, b.x, b.z)
  const pull = span * 0.36
  const dirx = (b.x - a.x) / (span || 1)
  const dirz = (b.z - a.z) / (span || 1)
  const t = tangent ?? { x: dirx, z: dirz }
  const c1 = { x: a.x + t.x * pull, z: a.z + t.z * pull }
  const c2 = { x: b.x - dirx * pull * 0.55, z: b.z - dirz * pull * 0.55 }

  const out: Array<{ x: number; z: number }> = []
  for (let i = 0; i <= samples; i++) {
    const s = i / samples
    const u = 1 - s
    out.push({
      x: u * u * u * a.x + 3 * u * u * s * c1.x + 3 * u * s * s * c2.x + s * s * s * b.x,
      z: u * u * u * a.z + 3 * u * u * s * c1.z + 3 * u * s * s * c2.z + s * s * s * b.z,
    })
  }
  return out
}

/** The direction track already runs at a node, so a new edge can continue it. */
export function tangentAt(network: RailNetwork, nodeId: string): { x: number; z: number } | null {
  const node = network.nodes[nodeId]
  if (!node) return null
  for (const edge of network.edges) {
    if (edge.a === nodeId && edge.points.length > 1) {
      const p = edge.points[1]
      const d = Math.hypot(p[0] - node.x, p[2] - node.z) || 1
      return { x: (node.x - p[0]) / d, z: (node.z - p[2]) / d }
    }
    if (edge.b === nodeId && edge.points.length > 1) {
      const p = edge.points[edge.points.length - 2]
      const d = Math.hypot(p[0] - node.x, p[2] - node.z) || 1
      return { x: (node.x - p[0]) / d, z: (node.z - p[2]) / d }
    }
  }
  return null
}

/**
 * Turn ground heights into a profile a train can work.
 *
 * The ground is eased out first, then the run is swept forwards and backwards
 * clamping every step to the ruling gradient until it settles. An end is only
 * pinned when it is a junction with existing track; a line ending in open
 * country is free to sit in a cutting or on an embankment, which is what a
 * real railway does rather than starting at ground level come what may.
 *
 * Returns null when both ends are pinned and no legal profile can join them.
 */
export function profile(
  ground: number[],
  /** One horizontal run per step, or a single figure for an even sampling. */
  spacing: number | number[],
  pins: [number | null, number | null],
): number[] | null {
  const n = ground.length
  if (n === 0) return []
  if (n === 1) return [pins[0] ?? pins[1] ?? ground[0]]

  // Bézier samples are not evenly spaced, so each step gets its own allowance.
  const steps: number[] = []
  for (let i = 1; i < n; i++) {
    steps.push(MAX_GRADE * (Array.isArray(spacing) ? (spacing[i - 1] ?? 0) : spacing))
  }
  const total = steps.reduce((a, b) => a + b, 0)

  const [pinStart, pinEnd] = pins
  if (pinStart !== null && pinEnd !== null && Math.abs(pinEnd - pinStart) > total + 1e-6) {
    return null
  }

  const out = [...ground]
  // ease the ground out so the line does not ripple over every hummock
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 1; i < n - 1; i++) out[i] = out[i] * 0.36 + (out[i - 1] + out[i + 1]) * 0.32
  }
  if (pinStart !== null) out[0] = pinStart
  if (pinEnd !== null) out[n - 1] = pinEnd

  const pinned = (i: number) =>
    (i === 0 && pinStart !== null) || (i === n - 1 && pinEnd !== null)
  const clampTo = (i: number, anchor: number, allowance: number) => {
    if (pinned(i)) return
    out[i] = Math.max(anchor - allowance, Math.min(anchor + allowance, out[i]))
  }

  // Alternating sweeps converge on the nearest profile inside the gradient.
  for (let pass = 0; pass < 80; pass++) {
    let worst = 0
    for (let i = 1; i < n; i++) clampTo(i, out[i - 1], steps[i - 1])
    for (let i = n - 2; i >= 0; i--) clampTo(i, out[i + 1], steps[i])
    for (let i = 1; i < n; i++) {
      worst = Math.max(worst, Math.abs(out[i] - out[i - 1]) - steps[i - 1])
    }
    if (worst < 1e-9) break
  }
  return out
}

export interface LayResult {
  ok: boolean
  reason?: string
  edge?: RailEdge
  /** Nodes that had to be created for this edge. */
  created?: RailNode[]
}

export interface LayOptions {
  /** Existing node to start from, if the drag began on the network. */
  fromNode?: string
  toNode?: string
}

let seq = 0
const nextId = (prefix: string) => `${prefix}${(seq++).toString(36)}${Date.now().toString(36).slice(-4)}`

/** Nearest existing node within the snap radius, if any. */
export function snapNode(network: RailNetwork, x: number, z: number): RailNode | null {
  let best: RailNode | null = null
  let bestD = SNAP_RADIUS
  for (const node of Object.values(network.nodes)) {
    const d = dist2(node.x, node.z, x, z)
    if (d < bestD) {
      best = node
      bestD = d
    }
  }
  return best
}

/**
 * Work out the edge a drag would produce, without committing it. The UI uses
 * this for the preview, and the store uses the same call to commit.
 */
export function layEdge(
  field: Heightfield,
  network: RailNetwork,
  from: { x: number; z: number },
  to: { x: number; z: number },
  options: LayOptions = {},
): LayResult {
  if (!inRegion(from.x, from.z) || !inRegion(to.x, to.z)) {
    return { ok: false, reason: 'Outside the region.' }
  }
  const span = dist2(from.x, from.z, to.x, to.z)
  if (span < 40) return { ok: false, reason: 'Too short to be a railway.' }
  if (span > 2600) return { ok: false, reason: 'Too long for one length of line.' }

  const startNode = options.fromNode ? network.nodes[options.fromNode] : snapNode(network, from.x, from.z)
  const endNode = options.toNode ? network.nodes[options.toNode] : snapNode(network, to.x, to.z)
  if (startNode && endNode && startNode.id === endNode.id) {
    return { ok: false, reason: 'That is the same junction at both ends.' }
  }

  const a = startNode ? { x: startNode.x, z: startNode.z } : from
  const b = endNode ? { x: endNode.x, z: endNode.z } : to
  const samples = Math.max(4, Math.round(dist2(a.x, a.z, b.x, b.z) / SAMPLE_SPACING))
  const flat = bezier(a, b, startNode ? tangentAt(network, startNode.id) : null, samples)

  const ground = flat.map((p) => heightAt(field, p.x, p.z))
  let run = 0
  for (let i = 1; i < flat.length; i++) {
    run += dist2(flat[i - 1].x, flat[i - 1].z, flat[i].x, flat[i].z)
  }
  const spacing = run / Math.max(1, flat.length - 1)
  const steps: number[] = []
  for (let i = 1; i < flat.length; i++) {
    steps.push(dist2(flat[i - 1].x, flat[i - 1].z, flat[i].x, flat[i].z))
  }

  // Only a junction pins the height of an end. A line finishing in open
  // country settles wherever the gradient wants it, in a cutting or on an
  // embankment.
  const heights = profile(ground, steps, [startNode?.y ?? null, endNode?.y ?? null])
  if (!heights) {
    const climb = Math.round(Math.abs((endNode?.y ?? 0) - (startNode?.y ?? 0)))
    return {
      ok: false,
      reason: `Too steep: ${climb} m between those junctions in ${Math.round(run)} m of line. Take a longer way round.`,
    }
  }
  const startY = heights[0]
  const endY = heights[heights.length - 1]

  let bridged = 0
  const points: Vec3[] = flat.map((p, i) => {
    const clearance = heights[i] - ground[i]
    if (clearance > DECK_CLEARANCE || isWater(field, p.x, p.z)) bridged += spacing
    return [p.x, heights[i], p.z]
  })

  let length = 0
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
      points[i][2] - points[i - 1][2],
    )
  }

  const created: RailNode[] = []
  const aId = startNode?.id ?? nextId('n')
  if (!startNode) created.push({ id: aId, x: a.x, z: a.z, y: startY })
  const bId = endNode?.id ?? nextId('n')
  if (!endNode) created.push({ id: bId, x: b.x, z: b.z, y: endY })

  return {
    ok: true,
    created,
    edge: { id: nextId('e'), a: aId, b: bId, points, length, bridged },
  }
}

export function addEdge(network: RailNetwork, result: LayResult): RailNetwork {
  if (!result.ok || !result.edge) return network
  const nodes = { ...network.nodes }
  for (const node of result.created ?? []) nodes[node.id] = node
  return { nodes, edges: [...network.edges, result.edge] }
}

export function removeEdge(network: RailNetwork, edgeId: string): RailNetwork {
  const edges = network.edges.filter((e) => e.id !== edgeId)
  const used = new Set(edges.flatMap((e) => [e.a, e.b]))
  const nodes: Record<string, RailNode> = {}
  for (const [id, node] of Object.entries(network.nodes)) if (used.has(id)) nodes[id] = node
  return { nodes, edges }
}

export const totalLength = (network: RailNetwork) =>
  network.edges.reduce((n, e) => n + e.length, 0)

/* --------------------------------------------------------------- networks */

/** Connected components of the graph: one per separate railway. */
export function components(network: RailNetwork): string[][] {
  const parent: Record<string, string> = {}
  const find = (a: string): string => {
    parent[a] ??= a
    return parent[a] === a ? a : (parent[a] = find(parent[a]))
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (const edge of network.edges) union(edge.a, edge.b)

  const groups = new Map<string, string[]>()
  for (const edge of network.edges) {
    const root = find(edge.a)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(edge.id)
  }
  return [...groups.values()]
}

/** Which component each edge belongs to, by index. */
export function componentOfEdge(network: RailNetwork): Map<string, number> {
  const out = new Map<string, number>()
  components(network).forEach((group, i) => {
    for (const id of group) out.set(id, i)
  })
  return out
}

/** The closest point on the network to somewhere, for placing a station. */
export function nearestOnNetwork(
  network: RailNetwork,
  x: number,
  z: number,
  within = 120,
): { edgeId: string; point: Vec3; index: number; distance: number } | null {
  let best: { edgeId: string; point: Vec3; index: number; distance: number } | null = null
  for (const edge of network.edges) {
    edge.points.forEach((p, i) => {
      const d = dist2(p[0], p[2], x, z)
      if (d < within && (!best || d < best.distance)) {
        best = { edgeId: edge.id, point: p, index: i, distance: d }
      }
    })
  }
  return best
}

/** One continuous run of points through a component, for a train to follow. */
export function componentPath(network: RailNetwork, edgeIds: string[]): Vec3[] {
  const edges = edgeIds
    .map((id) => network.edges.find((e) => e.id === id))
    .filter((e): e is RailEdge => !!e)
  if (edges.length === 0) return []

  const remaining = [...edges]
  const first = remaining.shift()!
  const path = [...first.points]
  let headNode = first.b
  let tailNode = first.a

  let progress = true
  while (progress && remaining.length > 0) {
    progress = false
    for (let i = 0; i < remaining.length; i++) {
      const edge = remaining[i]
      if (edge.a === headNode) {
        path.push(...edge.points.slice(1))
        headNode = edge.b
      } else if (edge.b === headNode) {
        path.push(...[...edge.points].reverse().slice(1))
        headNode = edge.a
      } else if (edge.b === tailNode) {
        path.unshift(...edge.points.slice(0, -1))
        tailNode = edge.a
      } else if (edge.a === tailNode) {
        path.unshift(...[...edge.points].reverse().slice(0, -1))
        tailNode = edge.b
      } else {
        continue
      }
      remaining.splice(i, 1)
      progress = true
      break
    }
  }
  return path
}
