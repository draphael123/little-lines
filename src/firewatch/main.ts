/**
 * The demo itself: a renderer, a loop, three menus and the few lines of radio
 * traffic that give you something to do once you are up the tower.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {
  audioRunning,
  blockSound,
  dodgeSound,
  duck,
  hitSound,
  hurtSound,
  listen,
  setLevels,
  startAudio,
  swingSound,
} from './audio'
import {
  MAX_HEALTH,
  MAX_STAMINA,
  HEAVY,
  LIGHT,
  DODGE,
  attack,
  canRun,
  dodge,
  guard,
  newFighter,
  stepFighter,
  striking,
} from './combat'
import { buildQuintain } from './quintain'
import { buildSword } from './sword'
import { DECK, EYE, SMOKE, TRUNK, bearingGap, bearingOf, groundAt, readBearing } from './lookout'
import { createMenu } from './menu'
import { Player } from './player'
import { buildWorld } from './scene'
import { QUALITY, type Settings } from './settings'

const canvas = document.getElementById('fw-canvas') as HTMLCanvasElement | null
const healthBar = document.getElementById('fw-health')
const staminaBar = document.getElementById('fw-stamina')
const flash = document.getElementById('fw-flash')
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
  document.querySelectorAll('.fw-screen').forEach((screen) => screen.classList.remove('is-on'))
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

  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Flat and graphic on purpose: tone mapping washes the dusk palette out.
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.08, 4000)

  // A little bloom, so the low sun, the brazier and the town's windows carry
  // the way they do at dusk. Threshold is high: nothing else should glow.
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
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

  // The sword hangs off the camera, so the camera has to be in the scene.
  const sword = buildSword()
  camera.add(sword.group)
  scene.add(camera)

  const quintain = buildQuintain()
  scene.add(quintain.group)

  const fighter = newFighter()
  const aim = new THREE.Vector3()
  const toTarget = new THREE.Vector3()
  const brazier = new THREE.Vector3(TRUNK.x + DECK.halfX - 1.0, DECK.y + 1.1, TRUNK.z + DECK.minZ + 1.1)

  /* ----------------------------------------------------------- the menus */

  type Mode = 'intro' | 'playing' | 'paused'
  let mode: Mode = 'intro'

  const lock = () => {
    if (document.pointerLockElement !== surface) {
      const request = surface.requestPointerLock()
      if (request instanceof Promise) request.catch(() => {})
    }
  }

  const menu = createMenu({
    onBegin() {
      startAudio()
      mode = 'playing'
      menu.show('playing')
      lock()
    },
    onResume() {
      mode = 'playing'
      menu.show('playing')
      duck(false)
      lock()
    },
    onQuit() {
      mode = 'intro'
      menu.show('intro')
      player.reset()
      duck(false)
      if (document.pointerLockElement === surface) document.exitPointerLock()
    },
    onSettings(settings: Settings) {
      apply(settings)
    },
  })

  function pause() {
    if (mode !== 'playing') return
    mode = 'paused'
    menu.show('paused')
    player.relax()
    duck(true)
    if (document.pointerLockElement === surface) document.exitPointerLock()
  }

  function apply(settings: Settings) {
    camera.fov = settings.fov
    camera.updateProjectionMatrix()
    player.sensitivity = settings.sensitivity
    player.invertY = settings.invertY
    player.headBob = settings.headBob

    const quality = QUALITY[settings.quality]
    const ratio = Math.min(window.devicePixelRatio, quality.pixelRatio)
    renderer.setPixelRatio(ratio)
    composer.setPixelRatio(ratio)
    bloom.enabled = settings.bloom && quality.bloom
    world.setFoliageRange(quality.foliage)

    setLevels({ music: settings.music, ambience: settings.ambience })
  }

  /* ---------------------------------------------------------------- input */

  let dragging = false
  let guardHeld = false
  const locked = () => document.pointerLockElement === surface

  surface.addEventListener('contextmenu', (event) => event.preventDefault())

  surface.addEventListener('pointerdown', (event) => {
    if (mode !== 'playing') return
    if (!locked()) {
      // The first press is for taking the pointer, not for swinging.
      dragging = true
      surface.setPointerCapture(event.pointerId)
      lock()
      return
    }
    if (event.button === 0) swing(false)
    else if (event.button === 1) swing(true)
    else if (event.button === 2) guardHeld = true
  })
  surface.addEventListener('pointerup', (event) => {
    if (event.button === 2) guardHeld = false
  })
  surface.addEventListener('pointerup', (event) => {
    dragging = false
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
  })

  // Losing the pointer is how Escape reaches us: the browser eats the key.
  let lockedAt = 0
  document.addEventListener('pointerlockchange', () => {
    lockedAt = performance.now()
    if (!locked() && mode === 'playing' && !dragging) pause()
  })

  document.addEventListener('pointermove', (event) => {
    if (mode !== 'playing') return
    // Pointer lock is the good way to look around. Where it is refused — an
    // iframe, a browser that will not grant it — dragging has to do the same
    // job, so the camera is never stuck.
    // Taking the pointer warps the cursor to the middle of the screen, and
    // the browser reports that jump as movement. Swallow the first report
    // after a lock change, and cap the rest: no hand moves a mouse that fast,
    // so anything larger is the browser, not the player.
    if (performance.now() - lockedAt < 80) return
    const cap = (value: number) => Math.max(-110, Math.min(110, value))
    if (locked()) player.look(cap(event.movementX), cap(event.movementY))
    else if (dragging) player.look(cap(event.movementX) * 1.4, cap(event.movementY) * 1.4)
  })

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      if (mode === 'playing') pause()
      else back()
      return
    }
    if (mode !== 'playing' || event.repeat) return
    if (event.code === 'KeyE') {
      if (player.interact()) event.preventDefault()
      return
    }
    if (event.code === 'KeyR') {
      callItIn()
      return
    }
    if (event.code === 'KeyF') {
      swing(true)
      return
    }
    if (event.code === 'Space') {
      roll()
      event.preventDefault()
      return
    }
    player.press(event.code)
  })
  window.addEventListener('keyup', (event) => player.release(event.code))
  window.addEventListener('blur', () => {
    player.relax()
    guardHeld = false
    pause()
  })

  /** Escape, from anywhere that is not the game: settings, then pause. */
  function back() {
    if (menu.screen === 'settings') {
      menu.show(mode === 'paused' ? 'paused' : 'intro')
    } else if (mode === 'paused') {
      mode = 'playing'
      menu.show('playing')
      duck(false)
      lock()
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    composer.setSize(window.innerWidth, window.innerHeight)
  })

  /* ----------------------------------------------------------------- sword */

  function swing(heavy: boolean) {
    if (player.stance !== 'ground') return
    if (attack(fighter, heavy)) swingSound(heavy)
  }

  function roll() {
    if (player.stance !== 'ground') return
    const x = player.pressing('KeyD') - player.pressing('KeyA')
    const z = player.pressing('KeyW') - player.pressing('KeyS')
    if (dodge(fighter, x, z)) {
      // The roll's direction is whatever it settled on, including the step
      // back you get for pressing it with nothing held.
      player.startDash(fighter.dodgeX, fighter.dodgeZ, DODGE.speed, 0.3)
      dodgeSound()
    }
  }

  /** The blade is out: is the shield where the blade is going? */
  function testStrike() {
    if (!striking(fighter)) return
    const swingOf = fighter.stance === 'heavy' ? HEAVY : LIGHT
    camera.getWorldDirection(aim)
    toTarget.copy(quintain.shield).sub(camera.position)
    const range = toTarget.length()
    if (range > swingOf.reach) return
    // A swing is a wide arc, not a laser: anything roughly in front counts.
    if (toTarget.normalize().dot(aim) < 0.55) return
    fighter.spent = true
    quintain.strike(swingOf.damage)
    hitSound(fighter.stance === 'heavy')
    hurtFlash(0.12, '#ffd9a8')
  }

  let flashLeft = 0
  function hurtFlash(seconds: number, colour: string) {
    if (!flash) return
    flash.style.background = colour
    flash.style.opacity = '0.5'
    flashLeft = seconds
  }

  /* ----------------------------------------------------------------- radio */

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

  /* ------------------------------------------------------------------ loop */

  const clock = new THREE.Clock()
  let elapsed = 0

  const debug = { camera, player, scene, renderer, world, menu, audioRunning, groundAt, eye: EYE, fighter, quintain, sword, paused: false }
  if (new URLSearchParams(window.location.search).has('debug')) {
    ;(window as unknown as Record<string, unknown>).__fw = debug
  }

  /** The title card's camera: a slow turn around the tower, above the wood. */
  function circleTheTower(at: number) {
    const angle = at * 0.055 + 2.2
    const radius = 62 + Math.sin(at * 0.07) * 8
    camera.position.set(
      TRUNK.x + Math.cos(angle) * radius,
      30 + Math.sin(at * 0.09) * 4,
      TRUNK.z + Math.sin(angle) * radius,
    )
    camera.lookAt(TRUNK.x, DECK.y + 2.5, TRUNK.z)
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05)

    if (debug.paused) {
      // Held still for a screenshot; the camera is driven from outside.
    } else if (mode === 'intro') {
      elapsed += dt
      circleTheTower(elapsed)
      world.update(elapsed, dt, camera.position)
    } else if (mode === 'playing') {
      elapsed += dt
      const running = player.speed > 4.2

      // The guard goes up the moment it can, so holding it through a swing
      // raises it as the swing ends rather than being thrown away.
      if (guardHeld) guard(fighter, true)
      else guard(fighter, false)

      stepFighter(fighter, dt, running)
      player.runAllowed = canRun(fighter)
      player.locked = fighter.stance === 'stagger'
      testStrike()

      player.update(dt)
      world.update(elapsed, dt, camera.position)

      const landed = quintain.update(dt, camera.position, fighter)
      if (landed === 'blocked') {
        blockSound()
        hurtFlash(0.1, '#cfd6dd')
      } else if (landed === 'hurt') {
        hurtSound()
        hurtFlash(0.3, '#b23a2e')
      }

      sword.pose(fighter, elapsed, Math.min(1, player.speed / 4), dt)
      listen(camera.position.y, camera.position.distanceTo(brazier))

      if (flashLeft > 0 && flash) {
        flashLeft -= dt
        flash.style.opacity = String(Math.max(0, flashLeft) * 1.6)
      }

      if (healthBar) healthBar.style.width = `${(fighter.health / MAX_HEALTH) * 100}%`
      if (staminaBar) staminaBar.style.width = `${(fighter.stamina / MAX_STAMINA) * 100}%`
    }

    const playing = mode === 'playing'
    sword.group.visible = playing && player.stance !== 'climbing' && player.stance !== 'descending'
    const vitals = document.getElementById('fw-vitals')
    if (vitals) vitals.hidden = !playing
    const onDeck = player.stance === 'deck'
    const bearing = bearingOf(player.facing)
    const gap = bearingGap(bearing, SMOKE.bearing)

    // The sighting ring follows your eye, the way you would swing it yourself.
    if (playing && onDeck) world.finder.rotation.y = player.facing + Math.PI / 2

    if (compass) compass.hidden = !(playing && onDeck)
    if (playing && onDeck && bearingOut) bearingOut.textContent = `${readBearing(bearing)}°`
    if (playing && onDeck && sighted && !radioing && line < 0) {
      sighted.textContent = gap < 14 ? 'SMOKE IN SIGHT — R TO RADIO IT IN' : ''
    }

    if (prompt) {
      const offer = playing ? player.offer : null
      const text = offer === 'climb' ? 'E — climb the ladder' : offer === 'descend' ? 'E — climb down' : ''
      prompt.textContent = text
      prompt.classList.toggle('is-on', text !== '')
    }

    if (playing && line >= 0 && elapsed >= nextLineAt) {
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

    if (hint) hint.classList.toggle('is-dim', !playing)

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
