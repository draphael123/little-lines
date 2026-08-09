/**
 * The seal — a ring of chalk described as a polar field.
 *
 * Everything the game asks about a containment circle ("how strong is it at
 * this angle", "where is the weakest arc", "has it broken") is a question
 * about one number per angle. So the seal is BINS buckets around the centre,
 * and drawing is the act of depositing into them.
 *
 * Nothing here knows about a canvas. The whole model is data in, data out,
 * which is why the binding can be exercised headless.
 */

export const BINS = 360

/** Where a well-made ring sits, in world units. */
export const NOMINAL_R = 300
/** Chalk laid nearer the mark than this is wasted — that is the thing's ground. */
export const INNER_R = 168
/** Chalk laid further out than this is wasted — it is outside the seal. */
export const OUTER_R = 402

/** A bin is held when its support is above this. At or below it, the seal is going. */
export const FAIL_SUPPORT = 0.06

export interface Vec {
  x: number
  y: number
}

export interface Stroke {
  /** World-space points, with the mark at the origin. */
  points: Vec[]
  /** True when the stroke laid no useful chalk — drawn outside the band. */
  wasted: boolean
  /** Laid during the binding rather than the inscription; drawn hotter. */
  patch: boolean
}

export type SigilKind = 'ward' | 'anchor' | 'silence'

export interface Sigil {
  kind: SigilKind
  /** Centre of the arc it covers. */
  bin: number
  /** Half-width of that arc, in bins. */
  half: number
  /** Where the glyph is actually drawn. */
  at: Vec
  /** Snuffed for a burst, and now inert. */
  spent: boolean
  /** Counts down after snuffing, while the burst is still worth something. */
  burst: number
}

export interface Seal {
  /** What was inscribed: the ceiling each bin can be restored to. */
  layers: Float32Array
  /** What is left of it. */
  integrity: Float32Array
  /** Ceiling won by patching, so it can be held to PATCH_HEADROOM. */
  patched: Float32Array
  strokes: Stroke[]
  sigils: Sigil[]
}

export const SIGILS: Record<
  SigilKind,
  { name: string; cost: number; half: number; note: string }
> = {
  ward: { name: 'Ward', cost: 380, half: 26, note: 'Strengthens the arc it stands on.' },
  anchor: { name: 'Anchor', cost: 380, half: 22, note: 'Its arc wears away far more slowly.' },
  silence: { name: 'Silence', cost: 380, half: 45, note: 'Hides that arc. It will look elsewhere.' },
}

export function makeSeal(): Seal {
  return {
    layers: new Float32Array(BINS),
    integrity: new Float32Array(BINS),
    patched: new Float32Array(BINS),
    strokes: [],
    sigils: [],
  }
}

export function binOf(x: number, y: number): number {
  const a = Math.atan2(y, x)
  const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * BINS)
  return ((b % BINS) + BINS) % BINS
}

export function binAngle(bin: number): number {
  return ((bin + 0.5) / BINS) * Math.PI * 2 - Math.PI
}

/** Shortest signed distance from bin a to bin b, in bins. */
export function binDelta(a: number, b: number): number {
  let d = (b - a) % BINS
  if (d > BINS / 2) d -= BINS
  if (d < -BINS / 2) d += BINS
  return d
}

/**
 * How much a mark at this radius is worth. Chalk on the nominal ring is worth
 * a full layer; chalk out at the edges of the band still holds, but less.
 * Outside the band it is worth nothing at all.
 */
export function layerWeight(r: number): number {
  if (r < INNER_R || r > OUTER_R) return 0
  const t =
    r < NOMINAL_R
      ? (r - INNER_R) / (NOMINAL_R - INNER_R)
      : (OUTER_R - r) / (OUTER_R - NOMINAL_R)
  return 0.5 + 0.5 * Math.max(0, Math.min(1, t))
}

/**
 * The most of a stroke you can afford. Chalk runs out mid-line rather than
 * refusing the line, so a stroke you cannot finish simply stops where the
 * chalk did — which is also what the cursor shows you while you draw.
 */
export function truncateToBudget(points: Vec[], budget: number): Vec[] {
  if (budget <= 0) return []
  const out: Vec[] = [points[0]]
  let left = budget
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (d <= left) {
      out.push(b)
      left -= d
      continue
    }
    if (left > 0) {
      const t = left / d
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
    break
  }
  return out
}

export function strokeLength(points: Vec[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return total
}

/**
 * The deposit a single stroke makes.
 *
 * A stroke credits each bin *once*, with the best radius it managed there —
 * so scribbling back and forth over one arc does not make it invincible, and a
 * spoke driven straight out from the mark is not worth a whole ring. Layers
 * stack across strokes, which is what makes a second ring worth drawing.
 */
export function strokeDeposit(points: Vec[]): Float32Array {
  const best = new Float32Array(BINS)
  if (points.length === 0) return best

  const stamp = (p: Vec) => {
    const r = Math.hypot(p.x, p.y)
    const w = layerWeight(r)
    if (w <= 0) return
    const b = binOf(p.x, p.y)
    if (w > best[b]) best[b] = w
  }

  stamp(points[0])
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    // Resample, so a fast drag does not skip over bins it crossed.
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      stamp({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return best
}

/**
 * Chalk laid on a circle that is already lit does not take as well as chalk
 * laid on a quiet floor. Without this, patching is simply better than planning
 * — you would always be right to keep every stick back and repair on the
 * night, and the inscription would stop being a decision.
 */
export const PATCH_SCALE = 0.55

/**
 * How much *new* ground a patch can win. Chalk laid on a live circle mostly
 * repairs what is already there; it can start a fresh arc where there was
 * nothing, but badly. Without this you could not mend a gap at all, and a
 * player drawing over an obvious hole would watch nothing happen.
 */
export const PATCH_BUILD = 0.25

/**
 * The most a bin's ceiling can ever be raised by patching, however much chalk
 * you pour into it. Without a cap, standing on one arc and redrawing it over
 * and over builds a wall during the binding, and the inscription stops being
 * the decision the game is about.
 */
export const PATCH_HEADROOM = 0.5

export function addStroke(seal: Seal, points: Vec[], patch: boolean): Stroke {
  const deposit = strokeDeposit(points)
  let useful = 0
  for (let b = 0; b < BINS; b++) {
    if (deposit[b] <= 0) continue
    useful++
    if (patch) {
      // Mostly repair, barely construction: a patch restores an arc towards
      // what was inscribed there, and only inches that ceiling up. What you
      // drew before the circle was lit is what you get to defend all night.
      const room = Math.max(0, PATCH_HEADROOM - seal.patched[b])
      const built = Math.min(room, deposit[b] * PATCH_BUILD)
      seal.patched[b] += built
      seal.layers[b] += built
      seal.integrity[b] = Math.min(
        seal.layers[b],
        seal.integrity[b] + deposit[b] * PATCH_SCALE,
      )
    } else {
      seal.layers[b] += deposit[b]
      seal.integrity[b] += deposit[b]
    }
  }
  const stroke: Stroke = { points, wasted: useful === 0, patch }
  seal.strokes.push(stroke)
  return stroke
}

export function addSigil(seal: Seal, kind: SigilKind, at: Vec): Sigil {
  const sigil: Sigil = {
    kind,
    bin: binOf(at.x, at.y),
    half: SIGILS[kind].half,
    at,
    spent: false,
    burst: 0,
  }
  seal.sigils.push(sigil)
  return sigil
}

/** Cosine falloff across an arc: 1 at the centre, 0 at the edges. */
function arcFalloff(distance: number, half: number): number {
  if (distance >= half) return 0
  return 0.5 + 0.5 * Math.cos((distance / half) * Math.PI)
}

const SMOOTH = 3

/**
 * What the seal is actually worth at each angle.
 *
 * Chalk carries load into its neighbours, so a bin is judged partly on the arc
 * around it: an isolated blob does not hold a circle, and a small nick is
 * bridged by the arcs either side of it while a wide gap is not.
 */
export function support(seal: Seal, wardScale = 1): Float32Array {
  const out = new Float32Array(BINS)
  for (let b = 0; b < BINS; b++) {
    let near = 0
    for (let d = -SMOOTH; d <= SMOOTH; d++) {
      if (d === 0) continue
      near += seal.integrity[(b + d + BINS) % BINS]
    }
    out[b] = 0.56 * seal.integrity[b] + (0.44 * near) / (SMOOTH * 2)
  }
  for (const sigil of seal.sigils) {
    const live = !sigil.spent
    const bursting = sigil.spent && sigil.burst > 0
    if (!live && !bursting) continue
    if (sigil.kind === 'anchor') continue
    if (sigil.kind === 'silence' && !bursting) continue
    const amount = bursting ? 2.4 * Math.min(1, sigil.burst) : sigil.kind === 'ward' ? 0.95 : 0
    if (amount <= 0) continue
    const scale = sigil.kind === 'ward' && !bursting ? wardScale : 1
    for (let d = -sigil.half; d <= sigil.half; d++) {
      const b = (sigil.bin + d + BINS) % BINS
      out[b] += amount * scale * arcFalloff(Math.abs(d), sigil.half)
    }
  }
  return out
}

/**
 * What the summons believes it is looking at. Silence does nothing for the
 * strength of the circle — it only makes a weak arc read as a strong one, so
 * the thing goes and works somewhere that can take it.
 */
export function perceived(seal: Seal, wardScale = 1): Float32Array {
  const out = support(seal, wardScale)
  for (const sigil of seal.sigils) {
    if (sigil.spent || sigil.kind !== 'silence') continue
    for (let d = -sigil.half; d <= sigil.half; d++) {
      const b = (sigil.bin + d + BINS) % BINS
      out[b] += 3.2 * arcFalloff(Math.abs(d), sigil.half)
    }
  }
  return out
}

/** How much the chalk at a bin resists being worn away. */
export function resistance(seal: Seal, bin: number): number {
  let best = 1
  for (const sigil of seal.sigils) {
    if (sigil.spent || sigil.kind !== 'anchor') continue
    const d = Math.abs(binDelta(sigil.bin, bin))
    const f = arcFalloff(d, sigil.half)
    if (f > 0) best = Math.min(best, 1 - 0.72 * f)
  }
  return best
}

const ERODE_HALF = 9

/** Wear the circle away around a bin. Returns how much was actually taken. */
export function erode(seal: Seal, bin: number, amount: number): number {
  let taken = 0
  for (let d = -ERODE_HALF; d <= ERODE_HALF; d++) {
    const b = (bin + d + BINS) % BINS
    const share = amount * arcFalloff(Math.abs(d), ERODE_HALF) * resistance(seal, b)
    if (share <= 0) continue
    const before = seal.integrity[b]
    seal.integrity[b] = Math.max(0, before - share)
    taken += before - seal.integrity[b]
  }
  return taken
}

export interface SealReport {
  /** Bins with nothing in them at all. */
  gaps: number
  weakest: number
  weakestBin: number
  mean: number
  closed: boolean
}

export function inspect(seal: Seal): SealReport {
  const field = support(seal)
  let gaps = 0
  let weakest = Infinity
  let weakestBin = 0
  let total = 0
  for (let b = 0; b < BINS; b++) {
    if (field[b] <= FAIL_SUPPORT) gaps++
    if (field[b] < weakest) {
      weakest = field[b]
      weakestBin = b
    }
    total += field[b]
  }
  return { gaps, weakest, weakestBin, mean: total / BINS, closed: gaps === 0 }
}
