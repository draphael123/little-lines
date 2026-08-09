/**
 * The board, as buffers.
 *
 * Nothing here is a component. The whole board is rebuilt into a handful of
 * merged geometries after every placement and the scene only mounts what comes
 * back — a few hundred tiles is nothing to rebuild, and one mesh per material
 * costs one draw call instead of one per tile.
 *
 * The tile face is a fan of six wedges sharing a centre vertex, and colour is
 * carried per vertex: each corner takes the average of the two edges that meet
 * there and the centre takes the average of all six. That is what makes a
 * matched border disappear and a mismatched one show a seam.
 */
import { BufferAttribute, BufferGeometry, Color } from 'three'
import { loosEndsAt, type Placed } from './board'
import { neighbourKey, opposite, toWorld, unkey, type HexKey } from './hex'
import {
  BALLAST_WIDTH,
  colourOf,
  groundColour,
  HEX,
  LAKE_DROP,
  RAIL_BALLAST,
  RAIL_IRON,
  RAIL_LIFT,
  RAIL_WIDTH,
  SOIL,
  TILE_DEPTH,
} from './look'
import { railEdges, type Tile } from './tiles'

/* ------------------------------------------------------------- hex corners */

/**
 * Corner `c` of a flat-topped hex. Edge `i` runs between corners `6 - i` and
 * `7 - i` (modulo six), which is the one piece of arithmetic tying the rules'
 * edge numbering to the geometry — `DIRECTIONS[0]` is due east, and the edge
 * facing that way is the one between corners 0 and 1.
 */
export function corner(c: number, size = HEX): { x: number; z: number } {
  const angle = (Math.PI / 3) * c
  return { x: size * Math.cos(angle), z: size * Math.sin(angle) }
}

export function cornersOfEdge(edge: number): [number, number] {
  return [(6 - edge) % 6, (7 - edge) % 6]
}

/** The middle of edge `i`, where rail crosses the border. */
export function edgeMidpoint(edge: number, size = HEX): { x: number; z: number } {
  const [a, b] = cornersOfEdge(edge)
  const ca = corner(a, size)
  const cb = corner(b, size)
  return { x: (ca.x + cb.x) / 2, z: (ca.z + cb.z) / 2 }
}

/** The two edges meeting at corner `c`. */
function edgesAtCorner(c: number): [number, number] {
  return [(6 - c) % 6, (7 - c) % 6]
}

/* ------------------------------------------------------------ mesh builder */

class Mesh {
  positions: number[] = []
  normals: number[] = []
  colours: number[] = []
  indices: number[] = []

  get count(): number {
    return this.positions.length / 3
  }

  vertex(x: number, y: number, z: number, normal: [number, number, number], colour: Color): number {
    const index = this.count
    this.positions.push(x, y, z)
    this.normals.push(normal[0], normal[1], normal[2])
    this.colours.push(colour.r, colour.g, colour.b)
    return index
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d)
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colours), 3))
    geometry.setIndex(this.indices)
    geometry.computeBoundingSphere()
    return geometry
  }
}

const UP: [number, number, number] = [0, 1, 0]

function blend(...colours: Color[]): Color {
  const out = new Color(0, 0, 0)
  for (const colour of colours) out.add(colour)
  return out.multiplyScalar(1 / Math.max(1, colours.length))
}

/* ------------------------------------------------------------------ props */

export interface Prop {
  x: number
  y: number
  z: number
  scale: number
  turn: number
}

export interface BoardGeometry {
  ground: BufferGeometry
  rails: BufferGeometry
  trees: Prop[]
  houses: Prop[]
  stations: Prop[]
  buffers: Prop[]
  /** Nothing was placed; the caller should not mount anything. */
  empty: boolean
}

/** A stable number in [0, 1) from a few integers, so scatter never shimmers. */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (b + 0x165667b1), 0xc2b2ae35)
  h = Math.imul(h ^ (c + 0x27d4eb2f), 0x27d4eb2f)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/* ------------------------------------------------------------------ tiles */

function addTile(
  mesh: Mesh,
  key: HexKey,
  tile: Tile,
  size: number,
  props: { trees: Prop[]; houses: Prop[]; stations: Prop[] },
): void {
  const { q, r } = unkey(key)
  const origin = toWorld(q, r, size)

  const edgeColours = tile.edges.map((edge) => groundColour(edge))
  const centreColour = blend(...edgeColours)

  // Water reads as water because it sits lower, not because of its colour.
  const dropAt = (c: number): number => {
    const [a, b] = edgesAtCorner(c)
    const wet = (tile.edges[a] === 'lake' ? 1 : 0) + (tile.edges[b] === 'lake' ? 1 : 0)
    return -LAKE_DROP * (wet / 2)
  }
  const centreDrop = -LAKE_DROP * (tile.edges.filter((e) => e === 'lake').length / 6)

  const centre = mesh.vertex(origin.x, centreDrop, origin.z, UP, centreColour)

  const rim: number[] = []
  for (let c = 0; c < 6; c += 1) {
    const [a, b] = edgesAtCorner(c)
    const point = corner(c, size)
    rim.push(
      mesh.vertex(
        origin.x + point.x,
        dropAt(c),
        origin.z + point.z,
        UP,
        blend(edgeColours[a], edgeColours[b]),
      ),
    )
  }

  /* Wound b-then-a, not a-then-b. Corner index runs the same way as the angle,
   * so (centre, a, b) cross-products to -y and the whole face is culled as a
   * backface — which does not error, it just quietly draws a board made of
   * nothing but its own sides. The normals are given as +y either way, so the
   * winding is the only thing keeping the top visible. */
  for (let edge = 0; edge < 6; edge += 1) {
    const [a, b] = cornersOfEdge(edge)
    mesh.triangle(centre, rim[b], rim[a])
  }

  /* Sides. Only drawn where there is no neighbour: a tile buried in the middle
   * of the board has no visible flank, and skipping them is most of the
   * geometry on a full board. */
  const soil = colourOf(SOIL)
  for (let edge = 0; edge < 6; edge += 1) {
    const [a, b] = cornersOfEdge(edge)
    const ca = corner(a, size)
    const cb = corner(b, size)
    const normal: [number, number, number] = (() => {
      const mx = (ca.x + cb.x) / 2
      const mz = (ca.z + cb.z) / 2
      const length = Math.hypot(mx, mz) || 1
      return [mx / length, 0, mz / length]
    })()

    const topA = mesh.vertex(origin.x + ca.x, dropAt(a), origin.z + ca.z, normal, soil)
    const topB = mesh.vertex(origin.x + cb.x, dropAt(b), origin.z + cb.z, normal, soil)
    const lowA = mesh.vertex(origin.x + ca.x, -TILE_DEPTH, origin.z + ca.z, normal, soil)
    const lowB = mesh.vertex(origin.x + cb.x, -TILE_DEPTH, origin.z + cb.z, normal, soil)
    mesh.quad(topA, topB, lowB, lowA)
  }

  /* Whatever stands on the ground. Scatter is hashed from the tile's own
   * coordinates so it is identical every rebuild — a tree that jumps when the
   * board is rebuilt is worse than no tree. */
  for (let edge = 0; edge < 6; edge += 1) {
    const kind = tile.edges[edge]
    if (kind !== 'wood' && kind !== 'town') continue

    const mid = edgeMidpoint(edge, size)
    const count = kind === 'wood' ? 3 : 2
    for (let n = 0; n < count; n += 1) {
      const jitterA = hash(key, edge, n) - 0.5
      const jitterB = hash(key, edge, n + 32) - 0.5
      // Pulled towards the middle of the tile so nothing straddles a border.
      const towards = 0.42 + 0.3 * hash(key, edge, n + 64)
      const x = origin.x + mid.x * towards + jitterA * 0.42 * size
      const z = origin.z + mid.z * towards + jitterB * 0.42 * size
      const prop: Prop = {
        x,
        y: 0,
        z,
        scale: 0.7 + 0.5 * hash(key, edge, n + 96),
        turn: hash(key, edge, n + 128) * Math.PI * 2,
      }
      if (kind === 'wood') props.trees.push(prop)
      else props.houses.push(prop)
    }
  }

  if (tile.station) {
    props.stations.push({ x: origin.x, y: 0, z: origin.z, scale: 1, turn: 0 })
  }
}

/* ------------------------------------------------------------------- rail */

/** A flat ribbon along a sampled path, laid just above the ground. */
function ribbon(
  mesh: Mesh,
  path: Array<{ x: number; z: number }>,
  width: number,
  lift: number,
  colour: Color,
): void {
  let previous: [number, number] | null = null
  for (let i = 0; i < path.length; i += 1) {
    const here = path[i]
    const before = path[Math.max(0, i - 1)]
    const after = path[Math.min(path.length - 1, i + 1)]
    const dx = after.x - before.x
    const dz = after.z - before.z
    const length = Math.hypot(dx, dz) || 1
    const nx = (-dz / length) * (width / 2)
    const nz = (dx / length) * (width / 2)

    const left = mesh.vertex(here.x + nx, lift, here.z + nz, UP, colour)
    const right = mesh.vertex(here.x - nx, lift, here.z - nz, UP, colour)
    // Right before left, for the same reason the tile face is: the other way
    // round faces the ground and vanishes.
    if (previous) mesh.quad(previous[1], previous[0], left, right)
    previous = [left, right]
  }
}

function quadratic(
  a: { x: number; z: number },
  control: { x: number; z: number },
  b: { x: number; z: number },
  steps: number,
): Array<{ x: number; z: number }> {
  const path: Array<{ x: number; z: number }> = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    path.push({
      x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      z: u * u * a.z + 2 * u * t * control.z + t * t * b.z,
    })
  }
  return path
}

function addRail(mesh: Mesh, key: HexKey, tile: Tile, size: number): void {
  const rails = railEdges(tile)
  if (rails.length === 0) return

  const { q, r } = unkey(key)
  const origin = toWorld(q, r, size)
  const at = (edge: number) => {
    const mid = edgeMidpoint(edge, size)
    return { x: origin.x + mid.x, z: origin.z + mid.z }
  }

  const ballast = colourOf(RAIL_BALLAST)
  const iron = colourOf(RAIL_IRON)

  const lay = (path: Array<{ x: number; z: number }>) => {
    ribbon(mesh, path, BALLAST_WIDTH * size, RAIL_LIFT, ballast)
    ribbon(mesh, path, RAIL_WIDTH * size, RAIL_LIFT * 2, iron)
  }

  if (rails.length === 2) {
    // One curve through the middle, so a turn is a turn rather than a kink.
    lay(quadratic(at(rails[0]), origin, at(rails[1]), 12))
    return
  }

  // A junction really does have a kink in it, and the crossing hides it.
  for (const edge of rails) lay(quadratic(at(edge), origin, origin, 6))
}

/* ------------------------------------------------------------------ build */

export function buildBoardGeometry(tiles: Placed, size = HEX): BoardGeometry {
  const ground = new Mesh()
  const rails = new Mesh()
  const props = { trees: [] as Prop[], houses: [] as Prop[], stations: [] as Prop[] }
  const buffers: Prop[] = []

  for (const [key, tile] of tiles) {
    addTile(ground, key, tile, size, props)
    addRail(rails, key, tile, size)

    // Buffers go where a line leaves a tile and meets nothing, which is only
    // knowable from the board rather than from the tile.
    for (const edge of loosEndsAt(tiles, key)) {
      const { q, r } = unkey(key)
      const origin = toWorld(q, r, size)
      const mid = edgeMidpoint(edge, size)
      buffers.push({
        x: origin.x + mid.x * 0.86,
        y: 0,
        z: origin.z + mid.z * 0.86,
        scale: 1,
        turn: Math.atan2(mid.x, mid.z),
      })
    }
  }

  return {
    ground: ground.build(),
    rails: rails.build(),
    trees: props.trees,
    houses: props.houses,
    stations: props.stations,
    buffers,
    empty: tiles.size === 0,
  }
}

/** Where a hex sits in the world, for the camera and the hover marker. */
export function centreOf(key: HexKey, size = HEX): { x: number; z: number } {
  const { q, r } = unkey(key)
  return toWorld(q, r, size)
}

/**
 * Which hex a point on the ground falls in. Rounding in cube coordinates and
 * then correcting the component that moved furthest is the standard trick, and
 * the only one that does not produce a ragged boundary between hexes.
 */
export function hexAtPoint(x: number, z: number, size = HEX): { q: number; r: number } {
  const q = (x * 2) / 3 / size
  const r = (z / (Math.sqrt(3) * size)) - q / 2

  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(-q - r)

  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - (-q - r))

  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs

  // `| 0` rather than the bare rounding: Math.round of a small negative is -0,
  // which keys and compares as a different value from 0 in some places and not
  // in others, and that is not a bug worth ever hunting twice.
  return { q: rq | 0, r: rr | 0 }
}

/** Borders where the held tile would agree with what is already down. */
export function borderMarks(
  tiles: Placed,
  key: HexKey,
  tile: Tile,
  size = HEX,
): Array<{ x: number; z: number; turn: number; matched: boolean; broken: boolean }> {
  const { q, r } = unkey(key)
  const origin = toWorld(q, r, size)
  const marks: Array<{ x: number; z: number; turn: number; matched: boolean; broken: boolean }> = []

  for (let edge = 0; edge < 6; edge += 1) {
    const other = tiles.get(neighbourKey(key, edge))
    if (!other) continue
    const mine = tile.edges[edge]
    const theirs = other.edges[opposite(edge)]
    if (mine === theirs) {
      const mid = edgeMidpoint(edge, size)
      marks.push({
        x: origin.x + mid.x,
        z: origin.z + mid.z,
        turn: Math.atan2(mid.x, mid.z),
        matched: true,
        broken: false,
      })
    } else if (mine === 'rail' || theirs === 'rail') {
      const mid = edgeMidpoint(edge, size)
      marks.push({
        x: origin.x + mid.x,
        z: origin.z + mid.z,
        turn: Math.atan2(mid.x, mid.z),
        matched: false,
        broken: true,
      })
    }
  }
  return marks
}
