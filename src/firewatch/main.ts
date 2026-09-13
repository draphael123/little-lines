/**
 * The demo itself: a renderer, a loop, and the few lines of radio traffic
 * that give you something to do once you are up the tree.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { buildWorld } from './scene'
import { Player } from './player'
import { SMOKE, bearingGap, bearingOf, readBearing } from './lookout'

const canvas = document.getElementById('fw-canvas') as HTMLCanvasElement | null
const overlay = document.getElementById('fw-overlay')
const prompt = document.getElementById('fw-prompt')
const compass = document.getElementById('fw-compass')
const bearingOut = document.getElementById('fw-bearing')
const sighted = document.getElementById('fw-sighted')
const radio = document.getElementById('fw-radio')
const fallback = document.getElementById('fw-fallback')
const hint = document.getElementById('fw-hint')

function fail(reason: string) {
  if (fallback) {
    fallback.hidden = false
    const why = fallback.querySelector('[data-reason]')
    if (why) why.textContent = reason
  }
  if (overlay) overlay.hidden = true
}

if (!canvas) {
  fail('The page did not load its canvas.')
} else {
  start(canvas)
}

function start(surface: HTMLCanvasElement) {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas: surface, antialias: true, powerPreference: 'high-performance' })
  } catch {
    fail('This browser could not open a WebGL context.')
    return
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Flat and graphic on purpose: tone mapping washes the dusk palette out.
  renderer.toneMapping = THREE.NoToneMapping

  let begun = false

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.08, 4000)

  // A little bloom, so the low sun, the brazier and the town's windows carry
  // the way they do at dusk. Threshold is high: nothing else should glow.
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  // Half resolution: bloom is a blur, and nobody can tell.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
    0.42,
    0.65,
    0.92,
  )
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const world = buildWorld(scene)
  const player = new Player(camera)

  /* ------------------------------------------------------------- input */

  const locked = () => document.pointerLockElement === surface
  let dragging = false

  // Pointer lock is the good way to look around. Where it is refused — an
  // iframe, a browser that will not grant it — dragging has to do the same
  // job, so the demo never ends up with a camera you cannot turn.
  surface.addEventListener('pointerdown', (event) => {
    begun = true
    if (overlay) overlay.classList.remove('is-open')
    dragging = true
    surface.setPointerCapture(event.pointerId)
    if (!locked()) {
      const request = surface.requestPointerLock()
      if (request instanceof Promise) request.catch(() => {})
    }
  })
  surface.addEventListener('pointerup', (event) => {
    dragging = false
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
  })

  document.addEventListener('pointerlockchange', () => {
    if (locked()) begun = true
    else player.relax()
    if (overlay) overlay.classList.toggle('is-open', begun && !locked() && !dragging)
  })

  document.addEventListener('pointermove', (event) => {
    if (locked()) player.look(event.movementX, event.movementY)
    else if (dragging) player.look(event.movementX * 1.4, event.movementY * 1.4)
  })

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return
    if (event.code === 'KeyE' || event.code === 'Space') {
      const did = player.interact()
      if (did) event.preventDefault()
      return
    }
    if (event.code === 'KeyR') {
      callItIn()
      return
    }
    player.press(event.code)
  })
  window.addEventListener('keyup', (event) => player.release(event.code))
  window.addEventListener('blur', () => player.relax())

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    composer.setSize(window.innerWidth, window.innerHeight)
  })

  /* ------------------------------------------------------------- radio */

  const script = [
    ['You', `Dispatch, Lookout Four. I've got a column up on the north ridge.`],
    ['Dispatch', `Lookout Four, go ahead. Give me a bearing.`],
    ['You', `Bearing ${readBearing(SMOKE.bearing)}. Call it a mile and a half out, past the saddle.`],
    ['Dispatch', `White smoke or black?`],
    ['You', `White. Leaning east with the wind.`],
    ['Dispatch', `Copy. Somebody's campfire getting ideas. Keep your eyes on it and I'll walk a crew up.`],
    ['Dispatch', `Nice work, Four. Sit tight. It's a good evening for it.`],
  ] as const

  let line = -1
  let nextLineAt = 0
  let radioing = false

  function say(who: string, text: string) {
    if (!radio) return
    const entry = document.createElement('p')
    entry.className = 'fw-line'
    entry.innerHTML = `<span>${who}</span>${text}`
    radio.appendChild(entry)
    while (radio.children.length > 3) radio.removeChild(radio.children[0])
    requestAnimationFrame(() => entry.classList.add('is-in'))
    window.setTimeout(() => {
      entry.classList.remove('is-in')
      window.setTimeout(() => entry.remove(), 900)
    }, 7000)
  }

  function callItIn() {
    if (radioing || player.stance !== 'deck') return
    const gap = bearingGap(bearingOf(player.facing), SMOKE.bearing)
    if (gap > 26) {
      say('Note', 'Face the smoke before you call it in.')
      return
    }
    radioing = true
    line = 0
    nextLineAt = 0
    if (sighted) sighted.textContent = 'REPORTED'
  }

  /* -------------------------------------------------------------- loop */

  // A hook for driving the demo from a test harness. Opt in with ?debug, so
  // an ordinary visit has nothing hanging off the window object.
  const debug = { camera, player, scene, renderer, world, paused: false }
  if (new URLSearchParams(window.location.search).has('debug')) {
    ;(window as unknown as Record<string, unknown>).__fw = debug
  }

  const clock = new THREE.Clock()
  let elapsed = 0

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05)
    elapsed += dt

    if (debug.paused) {
      composer.render()
      requestAnimationFrame(frame)
      return
    }
    player.update(dt)
    world.update(elapsed, dt, camera.position)

    const onDeck = player.stance === 'deck'
    const bearing = bearingOf(player.facing)
    const gap = bearingGap(bearing, SMOKE.bearing)

    // The fire finder follows your eye, the way you would swing it yourself.
    if (onDeck) world.finder.rotation.y = player.facing + Math.PI / 2

    if (compass) compass.hidden = !onDeck
    if (onDeck && bearingOut) bearingOut.textContent = `${readBearing(bearing)}°`
    if (onDeck && sighted && !radioing && line < 0) {
      sighted.textContent = gap < 14 ? 'SMOKE IN SIGHT — R TO RADIO IT IN' : ''
    }

    if (prompt) {
      const offer = player.offer
      let text = ''
      if (offer === 'climb') text = 'E — climb the ladder'
      else if (offer === 'descend') text = 'E — climb down'
      else if (player.stance === 'climbing') text = ''
      prompt.textContent = text
      prompt.classList.toggle('is-on', text !== '' && begun)
    }

    if (line >= 0 && elapsed >= nextLineAt) {
      if (line < script.length) {
        const [who, text] = script[line]
        say(who, text)
        nextLineAt = elapsed + 3.4 + text.length * 0.022
        line += 1
      } else {
        line = -1
        radioing = false
        if (sighted) sighted.textContent = 'CREW ON THE WAY'
      }
    }

    if (hint) hint.classList.toggle('is-dim', !begun)

    composer.render()
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)

  // Losing the context should say so rather than freeze on the last frame.
  surface.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    fail('The browser dropped the WebGL context. Reload to start again.')
  })
}
