/**
 * Where the water goes.
 *
 * Rain falls on every tile you have placed, runs downhill through the tiles
 * next to it, pools wherever your own land has closed a basin, and leaves at
 * the shore. Water that reaches the frontier of the region — land you have not
 * placed yet — soaks away and feeds nothing. That is the whole tension of the
 * game: a river only exists while there is ground on both sides of it.
 *
 * The solve is a priority flood followed by an accumulation, and it runs from
 * scratch after every placement. Two properties matter more than speed:
 *
 * - It never stalls in a pit. Filling depressions before routing is the whole
 *   point of the flood; a plain downhill walk stops at the first hollow and
 *   leaves the map covered in dead ends.
 * - It is deterministic. Ties in the heap break on insertion order, so the same
 *   board always produces the same river, and a preview of a placement is
 *   exactly what the placement will do.
 */
import { neighbourKeys, ringIndex, unkey, type HexKey } from './hex'

/** Ground elevation is in whole steps. Step 0 is the shoreline. */
export const MAX_ELEVATION = 6

export interface Board {
  /** The outermost ring, at `radius`, is sea. Land may be placed inside it. */
  radius: number
  /** Elevation step of every tile placed so far. Absent means unplaced. */
  ground: ReadonlyMap<HexKey, number>
}

export interface Water {
  /** Surface level once depressions have filled: `ground` plus any standing water. */
  filled: Map<HexKey, number>
  /** `filled - ground`. Greater than zero is a lake. */
  depth: Map<HexKey, number>
  /** Rain passing through a tile, including its own. */
  flow: Map<HexKey, number>
  /** Where each tile sends its water. `null` means it leaves the region. */
  down: Map<HexKey, HexKey | null>
  /** Rain that reached the sea. */
  toSea: number
  /** Rain that ran off into unplaced land and was wasted. */
  soaked: number
}

export interface RainOptions {
  /** Rain on a shoreline tile. */
  base?: number
  /** Extra rain per elevation step — high ground catches more of the weather. */
  perStep?: number
}

export function rainAt(elevation: number, options: RainOptions = {}): number {
  const { base = 1, perStep = 0.25 } = options
  return base + perStep * elevation
}

/* -------------------------------------------------------------- the board */

export function isSea(key: HexKey, radius: number): boolean {
  const { q, r } = unkey(key)
  return ringIndex(q, r) === radius
}

export function inBounds(key: HexKey, radius: number): boolean {
  const { q, r } = unkey(key)
  return ringIndex(q, r) <= radius
}

/* ------------------------------------------------------------------- heap */

/**
 * A binary heap over `(level, sequence)`. The sequence is what makes the whole
 * solve reproducible: without it, cells at equal level pop in whatever order
 * the heap happens to leave them in, and lake outlets wander between runs.
 */
class LevelHeap {
  private keys: HexKey[] = []
  private levels: number[] = []
  private seqs: number[] = []
  private next = 0

  get size(): number {
    return this.keys.length
  }

  push(key: HexKey, level: number): void {
    this.keys.push(key)
    this.levels.push(level)
    this.seqs.push(this.next)
    this.next += 1
    this.up(this.keys.length - 1)
  }

  pop(): { key: HexKey; level: number } | undefined {
    if (this.keys.length === 0) return undefined
    const key = this.keys[0]
    const level = this.levels[0]
    const last = this.keys.length - 1
    this.swap(0, last)
    this.keys.pop()
    this.levels.pop()
    this.seqs.pop()
    if (this.keys.length > 0) this.down(0)
    return { key, level }
  }

  private before(a: number, b: number): boolean {
    if (this.levels[a] !== this.levels[b]) return this.levels[a] < this.levels[b]
    return this.seqs[a] < this.seqs[b]
  }

  private swap(a: number, b: number): void {
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
    ;[this.levels[a], this.levels[b]] = [this.levels[b], this.levels[a]]
    ;[this.seqs[a], this.seqs[b]] = [this.seqs[b], this.seqs[a]]
  }

  private up(start: number): void {
    let i = start
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.before(i, parent)) break
      this.swap(i, parent)
      i = parent
    }
  }

  private down(start: number): void {
    let i = start
    for (;;) {
      const left = i * 2 + 1
      const right = left + 1
      let best = i
      if (left < this.keys.length && this.before(left, best)) best = left
      if (right < this.keys.length && this.before(right, best)) best = right
      if (best === i) break
      this.swap(i, best)
      i = best
    }
  }
}

/* ------------------------------------------------------------- the solver */

export function solveWater(board: Board, rain: RainOptions = {}): Water {
  const { radius, ground } = board

  const filled = new Map<HexKey, number>()
  const parent = new Map<HexKey, HexKey | null>()
  const order: HexKey[] = []
  const heap = new LevelHeap()
  const seen = new Set<HexKey>()

  /**
   * Every tile that is not land is a sink, whether it is sea or simply ground
   * you have not placed. Both are pushed below any possible elevation, so a
   * tile touching either always drains rather than ponding — you cannot hold a
   * lake against the edge of your own region.
   */
  const openSink = (key: HexKey): void => {
    if (seen.has(key)) return
    seen.add(key)
    filled.set(key, -Infinity)
    parent.set(key, null)
    heap.push(key, -Infinity)
  }

  for (const key of ground.keys()) {
    for (const n of neighbourKeys(key)) {
      if (!inBounds(n, radius)) continue
      if (!ground.has(n)) openSink(n)
    }
  }

  while (heap.size > 0) {
    const popped = heap.pop()
    if (!popped) break
    const { key, level } = popped
    if (ground.has(key)) order.push(key)

    for (const n of neighbourKeys(key)) {
      if (seen.has(n)) continue
      const elevation = ground.get(n)
      if (elevation === undefined) continue
      seen.add(n)
      const surface = Math.max(elevation, level)
      filled.set(n, surface)
      parent.set(n, key)
      heap.push(n, surface)
    }
  }

  /* Downhill, on the filled surface rather than the ground: across a lake the
   * surface is flat, so the flood tree — which was grown outwards from the
   * outlets — is what points at the spill point. */
  const down = new Map<HexKey, HexKey | null>()
  for (const key of order) {
    const surface = filled.get(key) as number
    let bestKey: HexKey | null = null
    let bestLevel = surface

    for (const n of neighbourKeys(key)) {
      if (!inBounds(n, radius)) continue
      const level = ground.has(n) ? (filled.get(n) as number) : -Infinity
      if (level < bestLevel) {
        bestLevel = level
        bestKey = ground.has(n) ? n : null
      }
    }

    if (bestLevel < surface) {
      down.set(key, bestKey)
      continue
    }

    const via = parent.get(key) ?? null
    down.set(key, via !== null && ground.has(via) ? via : null)
  }

  /* Accumulate. The flood popped every tile after the tile it drains into, so
   * walking the pop order backwards visits every contributor before its
   * receiver, with no sorting and no risk of a cycle. */
  const flow = new Map<HexKey, number>()
  for (const [key, elevation] of ground) flow.set(key, rainAt(elevation, rain))

  let toSea = 0
  let soaked = 0
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const key = order[i]
    const carried = flow.get(key) as number
    const target = down.get(key) ?? null
    if (target === null) {
      if (leavesToSea(key, radius, ground)) toSea += carried
      else soaked += carried
      continue
    }
    flow.set(target, (flow.get(target) as number) + carried)
  }

  const depth = new Map<HexKey, number>()
  for (const [key, elevation] of ground) {
    depth.set(key, (filled.get(key) as number) - elevation)
  }

  return { filled, depth, flow, down, toSea, soaked }
}

/** A tile drains to the sea if any sink it touches is sea rather than bare ground. */
function leavesToSea(key: HexKey, radius: number, ground: ReadonlyMap<HexKey, number>): boolean {
  for (const n of neighbourKeys(key)) {
    if (!inBounds(n, radius)) continue
    if (ground.has(n)) continue
    if (isSea(n, radius)) return true
  }
  return false
}

/* -------------------------------------------------------------- reporting */

export type Channel = 'dry' | 'rill' | 'stream' | 'river'

export const CHANNEL_AT: ReadonlyArray<[Channel, number]> = [
  ['river', 16],
  ['stream', 6],
  ['rill', 2],
  ['dry', 0],
]

export function channelOf(flow: number): Channel {
  for (const [channel, floor] of CHANNEL_AT) if (flow >= floor) return channel
  return 'dry'
}

export interface Lake {
  cells: HexKey[]
  level: number
}

/** Contiguous standing water, grouped so a quest can ask for a lake of a size. */
export function lakes(water: Water): Lake[] {
  const wet = new Set<HexKey>()
  for (const [key, depth] of water.depth) if (depth > 0) wet.add(key)

  const found: Lake[] = []
  const done = new Set<HexKey>()
  for (const start of wet) {
    if (done.has(start)) continue
    const cells: HexKey[] = []
    const queue = [start]
    done.add(start)
    while (queue.length > 0) {
      const key = queue.pop() as HexKey
      cells.push(key)
      for (const n of neighbourKeys(key)) {
        if (!wet.has(n) || done.has(n)) continue
        done.add(n)
        queue.push(n)
      }
    }
    found.push({ cells, level: water.filled.get(start) as number })
  }
  return found.sort((a, b) => b.cells.length - a.cells.length)
}
