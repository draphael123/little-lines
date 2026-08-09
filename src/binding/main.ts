/**
 * Bootstrap: the canvas, the pointer, the clock.
 */

import './../styles/binding.css'
import { INNER_R, OUTER_R, SIGILS, strokeLength } from './seal.ts'
import type { SigilKind, Vec } from './seal.ts'
import { beginRound, lay, light, newGame, placeSigil, snuff, step } from './game.ts'
import type { Game } from './game.ts'
import { createVisuals, fitView, render, toWorld } from './render.ts'
import type { View } from './render.ts'
import { createUI } from './ui.ts'
import { SUMMONS } from './summons.ts'

const root = document.getElementById('root')
const canvas = document.getElementById('scene') as HTMLCanvasElement | null
const ctx = canvas?.getContext('2d') ?? null

if (!root || !canvas || !ctx) {
  throw new Error('The Binding needs a canvas to draw on.')
}

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const game: Game = newGame(0)
const vis = createVisuals(reduced)
let view: View = fitView(window.innerWidth, window.innerHeight)

/** Points are kept at least this far apart, so a long night stays cheap to draw. */
const MIN_SPACING = 5

let pending: Vec[] | null = null
let pendingCost = 0
let pointer: Vec | null = null

function resize(): void {
  if (!canvas || !ctx) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  view = fitView(w, h)
}

const ui = createUI(root, {
  onTool: (tool) => {
    game.tool = game.tool === tool ? null : tool
  },
  onLight: () => {
    light(game)
    ui.say(`The circle is lit. ${game.summon.name} is here.`)
  },
  onAdvance: () => {
    if (game.phase === 'brief') {
      game.phase = 'inscribe'
      return
    }
    const next = game.phase === 'dawn' ? 0 : game.round + 1
    beginRound(game, Math.min(next, SUMMONS.length - 1))
    if (game.phase === 'dawn') game.phase = 'brief'
  },
  onRetry: () => beginRound(game, game.round),
  onBegin: () => beginRound(game, 0),
})

// ------------------------------------------------------------------ pointer

function worldAt(event: PointerEvent): Vec {
  return toWorld(view, event.clientX, event.clientY)
}

/** Clicking a sigil during the binding snuffs it. */
function sigilUnder(at: Vec): number {
  let found = -1
  let best = 34
  game.seal.sigils.forEach((sigil, i) => {
    if (sigil.spent) return
    const d = Math.hypot(sigil.at.x - at.x, sigil.at.y - at.y)
    if (d < best) {
      best = d
      found = i
    }
  })
  return found
}

canvas.addEventListener('pointerdown', (event) => {
  if (game.phase !== 'inscribe' && game.phase !== 'bind') return
  const at = worldAt(event)
  pointer = at
  canvas.setPointerCapture(event.pointerId)

  if (game.tool) {
    if (placeSigil(game, game.tool, at)) {
      ui.say(`${SIGILS[game.tool].name} set.`)
      game.tool = null
    } else {
      ui.say('Not there — a sigil has to stand on the circle.')
    }
    return
  }

  const index = game.phase === 'bind' ? sigilUnder(at) : -1
  if (index >= 0) {
    snuff(game, index)
    ui.say('Sigil snuffed.')
    return
  }

  pending = [at]
  pendingCost = 0
})

canvas.addEventListener('pointermove', (event) => {
  const at = worldAt(event)
  pointer = at
  if (!pending) return
  const last = pending[pending.length - 1]
  const d = Math.hypot(at.x - last.x, at.y - last.y)
  if (d < MIN_SPACING) return
  if (pendingCost + d > game.chalk) {
    // Out of chalk: the line simply stops where the stick did.
    return
  }
  pendingCost += d
  pending.push(at)
})

function commit(): void {
  if (!pending) return
  if (pending.length > 1) {
    const cost = strokeLength(pending)
    lay(game, pending, cost)
    const r = Math.hypot(pending[0].x, pending[0].y)
    if (r < INNER_R || r > OUTER_R) {
      ui.say('That chalk is outside the band. It holds nothing.')
    }
  }
  pending = null
  pendingCost = 0
}

canvas.addEventListener('pointerup', commit)
canvas.addEventListener('pointercancel', commit)
canvas.addEventListener('pointerleave', () => {
  pointer = null
})

window.addEventListener('keydown', (event) => {
  const tools: (SigilKind | null)[] = [null, 'ward', 'anchor', 'silence']
  const n = Number(event.key)
  if (n >= 1 && n <= 4) {
    game.tool = tools[n - 1]
    event.preventDefault()
    return
  }
  if (event.key === 'Escape') game.tool = null
  if (event.key === ' ' && game.phase === 'inscribe') {
    light(game)
    event.preventDefault()
  }
})

window.addEventListener('resize', resize)

// --------------------------------------------------------------------- loop

let last = performance.now()

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  step(game, dt)

  for (const event of game.events) {
    if (event === 'breach') ui.say('The circle is open. Get chalk on it.')
    if (event === 'broken') ui.say(`${game.summon.name} is out. The circle broke.`)
    if (event === 'held') ui.say(`${game.summon.name} is bound.`)
  }
  game.events.length = 0

  if (ctx) render(ctx, game, vis, view, dt, pointer, pending)
  ui.update(game)
  requestAnimationFrame(frame)
}

resize()
ui.update(game)
requestAnimationFrame(frame)
