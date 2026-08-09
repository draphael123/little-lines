/**
 * The room, drawn.
 *
 * One dark floor, one light at the centre, and a ring of chalk that lights up
 * where something is leaning on it. The load glow is not decoration — it is
 * the only readout of the polar field the whole game turns on, so it has to be
 * legible before it is pretty.
 */

import { BINS, INNER_R, NOMINAL_R, OUTER_R, binAngle, binDelta, binOf } from './seal.ts'
import type { Seal, Sigil, Vec } from './seal.ts'
import type { Game } from './game.ts'
import { makeDab, makeFloor, makeGrain } from './textures.ts'

export interface View {
  w: number
  h: number
  scale: number
  cx: number
  cy: number
}

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
}

interface Blob {
  angle: number
  radius: number
  size: number
  drift: number
  phase: number
}

export interface Visuals {
  floor: HTMLCanvasElement
  grain: HTMLCanvasElement
  dab: HTMLCanvasElement
  glow: HTMLCanvasElement
  glowCtx: CanvasRenderingContext2D | null
  motes: Mote[]
  sparks: Spark[]
  smoke: Blob[]
  t: number
  blurOk: boolean
  reduced: boolean
}

const VISIBLE_R = 600

export function fitView(w: number, h: number): View {
  // Sat a little above centre: the tool dock lives along the bottom edge, and
  // a circle that runs behind it cannot be drawn on.
  return {
    w,
    h,
    scale: Math.min(w, h) / (2 * VISIBLE_R),
    cx: w / 2,
    cy: h * 0.455,
  }
}

export function toWorld(view: View, px: number, py: number): Vec {
  return { x: (px - view.cx) / view.scale, y: (py - view.cy) / view.scale }
}

export function createVisuals(reduced: boolean): Visuals {
  const glow = document.createElement('canvas')
  const probe = document.createElement('canvas').getContext('2d')
  const smoke: Blob[] = []
  for (let i = 0; i < 26; i++) {
    smoke.push({
      angle: (i / 26) * Math.PI * 2,
      radius: 30 + (i % 5) * 26,
      size: 70 + (i % 7) * 22,
      drift: 0.1 + (i % 4) * 0.05,
      phase: i * 1.7,
    })
  }
  return {
    floor: makeFloor(1024),
    grain: makeGrain(220),
    dab: makeDab(64),
    glow,
    glowCtx: glow.getContext('2d'),
    motes: [],
    sparks: [],
    smoke,
    t: 0,
    blurOk: !!probe && typeof probe.filter === 'string',
    reduced,
  }
}

function mix(a: number[], b: number[], t: number): string {
  const k = Math.max(0, Math.min(1, t))
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(
    a[1] + (b[1] - a[1]) * k,
  )},${Math.round(a[2] + (b[2] - a[2]) * k)})`
}

const CHALK = [226, 219, 199]
const EMBER = [255, 148, 66]
const WHITE_HOT = [255, 246, 226]

/** Where the thing is pushing, as one number per bin. */
function loadField(game: Game): Float32Array {
  const load = new Float32Array(BINS)
  for (const probe of game.probes) {
    const centre = Math.round(probe.bin)
    for (let d = -14; d <= 14; d++) {
      const b = (centre + d + BINS) % BINS
      const f = 0.5 + 0.5 * Math.cos((Math.abs(d) / 14) * Math.PI)
      load[b] = Math.max(load[b], f * probe.bite)
    }
  }
  return load
}

function ringPoint(bin: number, r: number): Vec {
  const a = binAngle(bin)
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

export function render(
  ctx: CanvasRenderingContext2D,
  game: Game,
  vis: Visuals,
  view: View,
  dt: number,
  pointer: Vec | null,
  drawing: Vec[] | null,
): void {
  vis.t += dt
  const { scale, cx, cy } = view

  if (vis.glow.width !== Math.floor(view.w / 2) || vis.glow.height !== Math.floor(view.h / 2)) {
    vis.glow.width = Math.max(1, Math.floor(view.w / 2))
    vis.glow.height = Math.max(1, Math.floor(view.h / 2))
  }
  const glowCtx = vis.glowCtx
  if (glowCtx) {
    glowCtx.setTransform(1, 0, 0, 1, 0, 0)
    glowCtx.clearRect(0, 0, vis.glow.width, vis.glow.height)
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#07060a'
  ctx.fillRect(0, 0, view.w, view.h)

  const shake = vis.reduced ? 0 : game.shake
  const sx = shake > 0 ? (Math.random() - 0.5) * shake * 9 : 0
  const sy = shake > 0 ? (Math.random() - 0.5) * shake * 9 : 0
  ctx.save()
  ctx.translate(sx, sy)

  const world = (p: Vec) => ({ x: cx + p.x * scale, y: cy + p.y * scale })
  const toGlow = (p: Vec) => ({ x: (cx + p.x * scale + sx) / 2, y: (cy + p.y * scale + sy) / 2 })

  drawFloor(ctx, vis, view)
  drawBrazier(ctx, game, view, vis)
  drawEntity(ctx, game, vis, view, dt)
  if (game.phase === 'inscribe') drawGuides(ctx, view, vis)

  const load = loadField(game)
  drawChalk(ctx, glowCtx, game.seal, load, world, toGlow, scale, vis)
  if (drawing && drawing.length > 1) drawPending(ctx, drawing, world, scale)
  drawSigils(ctx, glowCtx, game.seal, world, toGlow, scale, vis)
  drawPressure(ctx, glowCtx, game, world, toGlow, scale)

  updateParticles(game, vis, dt, load)
  drawParticles(ctx, vis, world, scale)

  if (glowCtx) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    if (vis.blurOk) ctx.filter = `blur(${Math.max(4, Math.round(view.w / 150))}px)`
    ctx.globalAlpha = vis.blurOk ? 0.95 : 0.5
    ctx.drawImage(vis.glow, -sx, -sy, view.w, view.h)
    ctx.filter = 'none'
    ctx.restore()
  }

  if (pointer && (game.phase === 'inscribe' || game.phase === 'bind')) {
    drawCursor(ctx, game, pointer, world, scale, vis)
  }

  ctx.restore()

  drawVignette(ctx, view)
  drawGrain(ctx, vis, view)
}

function drawFloor(ctx: CanvasRenderingContext2D, vis: Visuals, view: View): void {
  const size = Math.max(view.w, view.h) * 1.1
  ctx.save()
  ctx.globalAlpha = 1
  ctx.drawImage(vis.floor, view.cx - size / 2, view.cy - size / 2, size, size)
  ctx.restore()
}

/** The mark at the centre, and the light it throws. */
function drawBrazier(ctx: CanvasRenderingContext2D, game: Game, view: View, vis: Visuals): void {
  const lit = game.phase === 'bind' || game.phase === 'broken'
  const flicker = 0.9 + Math.sin(vis.t * 7.3) * 0.05 + Math.sin(vis.t * 3.1) * 0.05
  const reach = OUTER_R * view.scale * (lit ? 1.35 : 1.05)
  const heat = lit ? Math.min(1, game.t / game.summon.duration) : 0

  const g = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, reach)
  const core = lit ? mix([255, 150, 70], [190, 120, 255], heat * 0.8) : 'rgb(190,110,55)'
  g.addColorStop(0, core)
  g.addColorStop(0.12, lit ? 'rgba(150,70,40,0.42)' : 'rgba(120,62,32,0.3)')
  g.addColorStop(0.55, 'rgba(60,28,20,0.13)')
  g.addColorStop(1, 'rgba(0,0,0,0)')

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = (lit ? 0.85 : 0.6) * flicker
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(view.cx, view.cy, reach, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // The mark itself.
  ctx.save()
  ctx.translate(view.cx, view.cy)
  ctx.strokeStyle = lit ? 'rgba(255,214,170,0.85)' : 'rgba(220,190,150,0.4)'
  ctx.lineWidth = Math.max(1, 1.6 * view.scale * 1.2)
  const r = 16 * view.scale
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.stroke()
  ctx.restore()
}

/** The band where chalk counts, shown only while you are drawing it. */
function drawGuides(ctx: CanvasRenderingContext2D, view: View, vis: Visuals): void {
  ctx.save()
  ctx.translate(view.cx, view.cy)
  const pulse = 0.5 + 0.5 * Math.sin(vis.t * 1.4)
  for (const [r, alpha, dash] of [
    [INNER_R, 0.16, [5, 9]],
    [NOMINAL_R, 0.1 + pulse * 0.05, [2, 12]],
    [OUTER_R, 0.16, [5, 9]],
  ] as const) {
    ctx.strokeStyle = `rgba(190,175,140,${alpha})`
    ctx.lineWidth = 1
    ctx.setLineDash(dash.map((d) => d * view.scale * 1.4))
    ctx.beginPath()
    ctx.arc(0, 0, r * view.scale, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * What is inside the circle. Never a creature — a mass of smoke that gathers
 * towards wherever it is pushing, so you read its attention rather than its
 * body.
 */
function drawEntity(
  ctx: CanvasRenderingContext2D,
  game: Game,
  vis: Visuals,
  view: View,
  dt: number,
): void {
  if (game.phase !== 'bind' && game.phase !== 'broken') return
  const pull = game.probes.length ? binAngle(Math.round(game.probes[0].bin)) : 0
  const intensity = Math.min(1, 0.35 + game.t / game.summon.duration)

  ctx.save()
  ctx.translate(view.cx, view.cy)
  for (const blob of vis.smoke) {
    blob.angle += blob.drift * dt * (vis.reduced ? 0.3 : 1)
    const toward = Math.cos(blob.angle - pull) * 0.5 + 0.5
    const r = (blob.radius + toward * 90 * intensity) * view.scale
    const wobble = Math.sin(vis.t * 0.7 + blob.phase) * 12 * view.scale
    const x = Math.cos(blob.angle) * r + wobble
    const y = Math.sin(blob.angle) * r + wobble * 0.6
    const size = blob.size * view.scale * (0.8 + toward * 0.5)
    const g = ctx.createRadialGradient(x, y, 0, x, y, size)
    g.addColorStop(0, `rgba(46,18,58,${0.3 + toward * 0.28 * intensity})`)
    g.addColorStop(0.6, `rgba(22,8,30,${0.16 * intensity})`)
    g.addColorStop(1, 'rgba(6,3,10,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

const BUCKETS = 10

/**
 * The chalk. Cold chalk is matte and nearly dark; chalk under load runs up
 * through ember to white, and worn chalk thins out and fades. Segments are
 * batched by colour bucket so a night's worth of strokes is still a handful of
 * paths rather than thousands.
 */
function drawChalk(
  ctx: CanvasRenderingContext2D,
  glowCtx: CanvasRenderingContext2D | null,
  seal: Seal,
  load: Float32Array,
  world: (p: Vec) => Vec,
  toGlow: (p: Vec) => Vec,
  scale: number,
  vis: Visuals,
): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const stroke of seal.strokes) {
    if (stroke.points.length < 2) continue
    if (stroke.wasted) {
      ctx.strokeStyle = 'rgba(120,112,96,0.13)'
      ctx.lineWidth = Math.max(1, 1.6 * scale * 1.4)
      ctx.beginPath()
      const first = world(stroke.points[0])
      ctx.moveTo(first.x, first.y)
      for (let i = 1; i < stroke.points.length; i++) {
        const p = world(stroke.points[i])
        ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
      continue
    }

    let runStart = 0
    let runBucket = -1
    const flush = (end: number) => {
      if (runBucket < 0 || end - runStart < 1) return
      const t = runBucket / (BUCKETS - 1)
      // t folds wear and load together: worn chalk fades, loaded chalk burns.
      const heat = Math.max(0, t * 2 - 1)
      const wear = Math.min(1, t * 2)
      ctx.strokeStyle = mix(CHALK, heat > 0 ? EMBER : CHALK, Math.min(1, heat * 1.6))
      ctx.globalAlpha = 0.16 + wear * 0.7
      ctx.lineWidth = Math.max(1, (1.1 + wear * 2.4 + heat * 2.2) * scale * 1.5)
      ctx.beginPath()
      const p0 = world(stroke.points[runStart])
      ctx.moveTo(p0.x, p0.y)
      for (let i = runStart + 1; i <= end; i++) {
        const p = world(stroke.points[i])
        ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }

    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]
      const b = binOf(p.x, p.y)
      const ceiling = Math.max(0.001, seal.layers[b])
      const ratio = Math.min(1, seal.integrity[b] / ceiling)
      const value = Math.min(1, ratio * 0.5 + load[b] * 0.5 + (load[b] > 0.1 ? 0.5 : 0))
      const bucket = Math.min(BUCKETS - 1, Math.max(0, Math.round(value * (BUCKETS - 1))))
      if (bucket !== runBucket) {
        flush(i - 1)
        runStart = Math.max(0, i - 1)
        runBucket = bucket
      }
    }
    flush(stroke.points.length - 1)

    // The hot pass, into the glow buffer.
    if (glowCtx) {
      glowCtx.save()
      glowCtx.lineCap = 'round'
      glowCtx.globalCompositeOperation = 'lighter'
      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i]
        const b = binOf(p.x, p.y)
        const l = load[b]
        if (l < 0.06) continue
        const ceiling = Math.max(0.001, seal.layers[b])
        const worn = 1 - Math.min(1, seal.integrity[b] / ceiling)
        const a = world(stroke.points[i - 1])
        const c = world(p)
        const ga = toGlow({ x: 0, y: 0 })
        void ga
        glowCtx.strokeStyle = mix(EMBER, WHITE_HOT, worn)
        glowCtx.globalAlpha = Math.min(1, l * (0.75 + worn * 0.25))
        glowCtx.lineWidth = Math.max(1.5, (2.2 + l * 5) * scale * 0.9)
        glowCtx.beginPath()
        glowCtx.moveTo(a.x / 2, a.y / 2)
        glowCtx.lineTo(c.x / 2, c.y / 2)
        glowCtx.stroke()
      }
      glowCtx.restore()
    }
  }

  ctx.globalAlpha = 1
  ctx.restore()
  void vis
}

/** The line under the cursor, before it is committed. */
function drawPending(
  ctx: CanvasRenderingContext2D,
  points: Vec[],
  world: (p: Vec) => Vec,
  scale: number,
): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(240,232,210,0.75)'
  ctx.lineWidth = Math.max(1, 2.2 * scale * 1.5)
  ctx.beginPath()
  const first = world(points[0])
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i++) {
    const p = world(points[i])
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.restore()
}

const SIGIL_COLOUR: Record<string, number[]> = {
  ward: [255, 196, 120],
  anchor: [140, 210, 235],
  silence: [190, 150, 245],
}

function drawSigilGlyph(ctx: CanvasRenderingContext2D, sigil: Sigil, size: number): void {
  ctx.beginPath()
  if (sigil.kind === 'ward') {
    ctx.arc(0, 0, size * 0.62, 0, Math.PI * 2)
    ctx.moveTo(-size * 0.62, 0)
    ctx.lineTo(size * 0.62, 0)
    ctx.moveTo(0, -size * 0.62)
    ctx.lineTo(0, size * 0.62)
  } else if (sigil.kind === 'anchor') {
    ctx.moveTo(0, -size * 0.8)
    ctx.lineTo(size * 0.62, 0)
    ctx.lineTo(0, size * 0.8)
    ctx.lineTo(-size * 0.62, 0)
    ctx.closePath()
    ctx.moveTo(-size * 0.85, 0)
    ctx.lineTo(size * 0.85, 0)
  } else {
    ctx.arc(0, 0, size * 0.7, Math.PI * 0.15, Math.PI * 0.85)
    ctx.moveTo(-size * 0.7, -size * 0.2)
    ctx.lineTo(size * 0.7, -size * 0.2)
    ctx.moveTo(0, -size * 0.75)
    ctx.lineTo(0, -size * 0.35)
  }
  ctx.stroke()
}

function drawSigils(
  ctx: CanvasRenderingContext2D,
  glowCtx: CanvasRenderingContext2D | null,
  seal: Seal,
  world: (p: Vec) => Vec,
  toGlow: (p: Vec) => Vec,
  scale: number,
  vis: Visuals,
): void {
  for (const sigil of seal.sigils) {
    const p = world(sigil.at)
    const size = 20 * scale * 1.4
    const colour = SIGIL_COLOUR[sigil.kind] ?? CHALK
    const alive = !sigil.spent
    const pulse = 0.75 + 0.25 * Math.sin(vis.t * 2 + sigil.bin)

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(Math.atan2(sigil.at.y, sigil.at.x) + Math.PI / 2)
    ctx.lineWidth = Math.max(1, 1.7 * scale * 1.5)
    ctx.strokeStyle = alive
      ? `rgba(${colour[0]},${colour[1]},${colour[2]},${0.5 + pulse * 0.35})`
      : 'rgba(110,100,92,0.25)'
    drawSigilGlyph(ctx, sigil, size)
    ctx.restore()

    if (glowCtx && (alive || sigil.burst > 0)) {
      const g = toGlow(sigil.at)
      glowCtx.save()
      glowCtx.globalCompositeOperation = 'lighter'
      glowCtx.translate(g.x, g.y)
      glowCtx.rotate(Math.atan2(sigil.at.y, sigil.at.x) + Math.PI / 2)
      glowCtx.lineWidth = Math.max(1, 1.8 * scale)
      const strength = sigil.burst > 0 ? 0.9 : 0.3 * pulse
      glowCtx.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${strength})`
      drawSigilGlyph(glowCtx, sigil, size / 2)
      glowCtx.restore()
    }
  }
}

/** Where it is leaning, and how close that arc is to going. */
function drawPressure(
  ctx: CanvasRenderingContext2D,
  glowCtx: CanvasRenderingContext2D | null,
  game: Game,
  world: (p: Vec) => Vec,
  toGlow: (p: Vec) => Vec,
  scale: number,
): void {
  if (game.phase !== 'bind' && game.phase !== 'broken') return
  const centre = world({ x: 0, y: 0 })

  for (const probe of game.probes) {
    if (probe.bite < 0.05) continue
    const tip = ringPoint(Math.round(probe.bin), NOMINAL_R)
    const p = world(tip)
    // A strand reaching from the mark out to the arc it is working on.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const grad = ctx.createLinearGradient(centre.x, centre.y, p.x, p.y)
    grad.addColorStop(0, 'rgba(90,30,120,0)')
    grad.addColorStop(0.7, `rgba(150,64,185,${0.16 * probe.bite})`)
    grad.addColorStop(1, `rgba(255,150,95,${0.5 * probe.bite})`)
    ctx.strokeStyle = grad
    ctx.lineWidth = Math.max(2, 14 * scale * probe.bite)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(centre.x, centre.y)
    const mid = ringPoint(Math.round(probe.bin) + 12, NOMINAL_R * 0.55)
    const m = world(mid)
    ctx.quadraticCurveTo(m.x, m.y, p.x, p.y)
    ctx.stroke()
    ctx.restore()

    if (glowCtx) {
      const g = toGlow(tip)
      glowCtx.save()
      glowCtx.globalCompositeOperation = 'lighter'
      const rg = glowCtx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 44 * scale)
      rg.addColorStop(0, `rgba(255,180,110,${0.8 * probe.bite})`)
      rg.addColorStop(1, 'rgba(255,120,60,0)')
      glowCtx.fillStyle = rg
      glowCtx.beginPath()
      glowCtx.arc(g.x, g.y, 44 * scale, 0, Math.PI * 2)
      glowCtx.fill()
      glowCtx.restore()
    }
  }

  if (game.failing) {
    const p = world(ringPoint(game.failing.bin, NOMINAL_R))
    const urgency = Math.min(1, game.failing.timer / 1.75)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(255,${Math.round(240 - urgency * 140)},200,${0.5 + urgency * 0.4})`
    ctx.lineWidth = Math.max(1, 2 * scale * 1.5)
    ctx.beginPath()
    ctx.arc(p.x, p.y, (18 + urgency * 26) * scale * 1.4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function updateParticles(game: Game, vis: Visuals, dt: number, load: Float32Array): void {
  const budget = vis.reduced ? 12 : 46
  if (vis.motes.length < budget && Math.random() < 0.6) {
    const a = Math.random() * Math.PI * 2
    const r = 60 + Math.random() * 460
    vis.motes.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      size: 0.8 + Math.random() * 1.8,
      life: 3 + Math.random() * 6,
    })
  }
  for (let i = vis.motes.length - 1; i >= 0; i--) {
    const m = vis.motes[i]
    m.x += m.vx * dt
    m.y += m.vy * dt
    m.life -= dt
    if (m.life <= 0) vis.motes.splice(i, 1)
  }

  // Sparks come off whichever arc is being worked, and burst on a breach.
  if (game.phase === 'bind' && !vis.reduced) {
    for (const probe of game.probes) {
      if (probe.bite < 0.4 || Math.random() > 0.5) continue
      const b = Math.round(probe.bin)
      if (load[b] < 0.3) continue
      const at = ringPoint(b + (Math.random() - 0.5) * 16, NOMINAL_R + (Math.random() - 0.5) * 30)
      const out = Math.atan2(at.y, at.x)
      const speed = 60 + Math.random() * 140
      vis.sparks.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(out) * speed,
        vy: Math.sin(out) * speed,
        life: 0.5 + Math.random() * 0.5,
        max: 1,
      })
    }
  }
  for (let i = vis.sparks.length - 1; i >= 0; i--) {
    const s = vis.sparks[i]
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vx *= 1 - dt * 1.6
    s.vy *= 1 - dt * 1.6
    s.life -= dt
    if (s.life <= 0) vis.sparks.splice(i, 1)
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  vis: Visuals,
  world: (p: Vec) => Vec,
  scale: number,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const m of vis.motes) {
    const p = world(m)
    ctx.globalAlpha = Math.min(0.22, m.life * 0.06)
    ctx.fillStyle = '#d8c7a6'
    ctx.beginPath()
    ctx.arc(p.x, p.y, m.size * scale * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const s of vis.sparks) {
    const p = world(s)
    ctx.globalAlpha = Math.min(1, s.life / s.max)
    ctx.fillStyle = s.life > 0.5 ? '#ffe6b8' : '#ff9a4a'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.5 * scale * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  game: Game,
  pointer: Vec,
  world: (p: Vec) => Vec,
  scale: number,
  vis: Visuals,
): void {
  const p = world(pointer)
  const r = Math.hypot(pointer.x, pointer.y)
  const inBand = r >= INNER_R && r <= OUTER_R
  const dry = game.chalk <= 0
  ctx.save()
  ctx.strokeStyle = dry
    ? 'rgba(180,90,80,0.5)'
    : inBand
      ? 'rgba(240,232,210,0.6)'
      : 'rgba(150,140,125,0.28)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, 7 * scale * 1.5, 0, Math.PI * 2)
  ctx.stroke()
  if (game.tool) {
    ctx.setLineDash([3, 5])
    ctx.beginPath()
    ctx.arc(p.x, p.y, 15 * scale * 1.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
  void vis
}

function drawVignette(ctx: CanvasRenderingContext2D, view: View): void {
  const g = ctx.createRadialGradient(
    view.cx,
    view.cy,
    Math.min(view.w, view.h) * 0.28,
    view.cx,
    view.cy,
    Math.max(view.w, view.h) * 0.78,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, view.w, view.h)
  ctx.restore()
}

function drawGrain(ctx: CanvasRenderingContext2D, vis: Visuals, view: View): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.5
  const ox = Math.floor(Math.random() * vis.grain.width)
  const oy = Math.floor(Math.random() * vis.grain.height)
  for (let x = -ox; x < view.w; x += vis.grain.width) {
    for (let y = -oy; y < view.h; y += vis.grain.height) {
      ctx.drawImage(vis.grain, x, y)
    }
  }
  ctx.restore()
}

export { binDelta }
