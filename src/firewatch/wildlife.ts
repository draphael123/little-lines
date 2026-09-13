/**
 * The things that move on their own.
 *
 * None of it is simulated in any serious sense: the deer walk loops, the
 * birds fly circles and the fireflies blink on a phase. What sells it is that
 * they notice you — the deer look up when you come near, and leave if you
 * keep coming — because a wood where nothing reacts reads as scenery.
 */
import * as THREE from 'three'
import { randoms } from './noise'
import { DECK, POND, groundAt, inPond, waterLevel } from './lookout'

const colour = (hex: string) => new THREE.Color(hex)

export interface Wildlife {
  group: THREE.Group
  update(elapsed: number, dt: number, watcher: THREE.Vector3): void
}

/* ------------------------------------------------------------------- deer */

interface Deer {
  group: THREE.Group
  head: THREE.Group
  legs: THREE.Mesh[]
  /** Where it wanders, as a loop of points on the ground. */
  route: THREE.Vector3[]
  along: number
  pace: number
  /** 0 grazing, 1 heads-up, 2 leaving. */
  mood: number
  startled: number
}

function buildDeer(stag: boolean, seed: number): Deer {
  const random = randoms(seed)
  const group = new THREE.Group()
  const hide = new THREE.MeshLambertMaterial({
    color: colour(stag ? '#7a5a3c' : '#8a6a48'),
    flatShading: true,
  })
  const pale = new THREE.MeshLambertMaterial({ color: colour('#c3a87e'), flatShading: true })

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 1), hide)
  body.scale.set(1.6, 0.86, 0.78)
  body.position.y = 0.9
  group.add(body)

  const rump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), pale)
  rump.position.set(-0.78, 0.94, 0)
  rump.scale.set(0.75, 0.85, 0.75)
  group.add(rump)

  const legs: THREE.Mesh[] = []
  for (const [lx, lz] of [
    [0.52, 0.3],
    [0.52, -0.3],
    [-0.52, 0.3],
    [-0.52, -0.3],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.82, 5), hide)
    leg.geometry.translate(0, -0.41, 0)
    leg.position.set(lx, 0.84, lz)
    legs.push(leg)
    group.add(leg)
  }

  // The head is its own group so it can come up off the grass.
  const head = new THREE.Group()
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.5, 6), hide)
  neck.position.set(0.1, 0.2, 0)
  neck.rotation.z = -0.55
  head.add(neck)
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), hide)
  skull.scale.set(1.5, 0.85, 0.8)
  skull.position.set(0.32, 0.4, 0)
  head.add(skull)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 5), hide)
    ear.position.set(0.24, 0.5, side * 0.13)
    ear.rotation.z = -0.5
    head.add(ear)
    if (stag) {
      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.56, 5), pale)
      antler.position.set(0.28, 0.66, side * 0.1)
      antler.rotation.set(side * 0.3, 0, -0.35)
      head.add(antler)
      for (let i = 0; i < 2; i++) {
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.28, 5), pale)
        tine.position.set(0.34 + i * 0.11, 0.8 + i * 0.13, side * (0.13 + i * 0.05))
        tine.rotation.set(side * 0.7, 0, -0.2)
        head.add(tine)
      }
    }
  }
  head.position.set(0.58, 1.02, 0)
  group.add(head)

  // A loop of meadow to wander, out in the open where you can see them.
  const centre = new THREE.Vector2(-28 + random() * 18, 40 + random() * 26)
  const route: THREE.Vector3[] = []
  const spread = 9 + random() * 10
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + random() * 0.7
    const x = centre.x + Math.cos(angle) * spread * (0.6 + random() * 0.6)
    const z = centre.y + Math.sin(angle) * spread * (0.6 + random() * 0.6)
    route.push(new THREE.Vector3(x, groundAt(x, z), z))
  }

  group.position.copy(route[0])
  return { group, head, legs, route, along: random() * route.length, pace: 0.5 + random() * 0.3, mood: 0, startled: 0 }
}

function stepDeer(deer: Deer, elapsed: number, dt: number, watcher: THREE.Vector3) {
  const near = deer.group.position.distanceTo(watcher)

  // Heads up at twenty metres, gone at eight.
  if (near < 9) deer.startled = 1
  else if (near > 34) deer.startled = Math.max(0, deer.startled - dt * 0.25)
  deer.mood = deer.startled > 0.5 ? 2 : near < 22 ? 1 : 0

  const speed = deer.mood === 2 ? 4.6 : deer.mood === 1 ? 0 : deer.pace
  deer.along += (speed * dt) / 9
  const count = deer.route.length
  const i = Math.floor(deer.along) % count
  const next = deer.route[(i + 1) % count]
  const here = deer.route[i]
  const t = deer.along % 1

  const x = here.x + (next.x - here.x) * t
  const z = here.z + (next.z - here.z) * t
  deer.group.position.set(x, groundAt(x, z), z)
  const facing = Math.atan2(next.x - here.x, next.z - here.z)
  const turn = ((facing - deer.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  deer.group.rotation.y += turn * Math.min(1, dt * 3)

  // Grazing drops the head; anything else brings it up sharply.
  const graze = deer.mood === 0 ? (Math.sin(elapsed * 0.5 + deer.pace * 9) > 0.2 ? 1 : 0) : 0
  const want = graze ? -0.95 : deer.mood === 1 ? 0.12 : -0.1
  deer.head.rotation.z += (want - deer.head.rotation.z) * Math.min(1, dt * 2.5)

  const swing = Math.sin(elapsed * (deer.mood === 2 ? 11 : 4)) * (speed > 0.1 ? 0.5 : 0.04)
  deer.legs.forEach((leg, index) => {
    leg.rotation.x = swing * (index % 2 === 0 ? 1 : -1) * (index < 2 ? 1 : -1)
  })
}

/* ----------------------------------------------------------------- rabbits */

interface Rabbit {
  group: THREE.Group
  home: THREE.Vector3
  angle: number
  hop: number
}

function buildRabbit(seed: number): Rabbit {
  const random = randoms(seed)
  const group = new THREE.Group()
  const fur = new THREE.MeshLambertMaterial({ color: colour('#9a8b72'), flatShading: true })
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), fur)
  body.scale.set(1.5, 1, 1)
  group.add(body)
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), fur)
  head.position.set(0.2, 0.09, 0)
  group.add(head)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 2, 5), fur)
    ear.position.set(0.19, 0.24, side * 0.05)
    ear.rotation.z = -0.2
    group.add(ear)
  }
  const tail = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshLambertMaterial({ color: colour('#d8cdb8'), flatShading: true }))
  tail.position.set(-0.24, 0.06, 0)
  group.add(tail)

  const angle = random() * Math.PI * 2
  const radius = 17 + random() * 24
  const home = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  home.y = groundAt(home.x, home.z)
  group.position.copy(home)
  return { group, home, angle: random() * Math.PI * 2, hop: random() * 6 }
}

function stepRabbit(rabbit: Rabbit, dt: number, watcher: THREE.Vector3) {
  const near = rabbit.group.position.distanceTo(watcher)
  rabbit.hop += dt * (near < 14 ? 2.6 : 0.55)
  if (near < 14) rabbit.angle += dt * 0.6

  // Hops are discrete: a spring forward, a pause, a look around.
  const beat = rabbit.hop % 1
  const jump = beat < 0.45 ? Math.sin((beat / 0.45) * Math.PI) : 0
  const distance = Math.floor(rabbit.hop) * (near < 14 ? 0.75 : 0.3)
  const x = rabbit.home.x + Math.cos(rabbit.angle) * distance * 0.4
  const z = rabbit.home.z + Math.sin(rabbit.angle) * distance * 0.4
  rabbit.group.position.set(x, groundAt(x, z) + 0.16 + jump * 0.35, z)
  rabbit.group.rotation.y = -rabbit.angle + Math.PI / 2
  rabbit.group.rotation.z = jump * -0.25
}

/* ------------------------------------------------------------------ birds */

interface Flier {
  group: THREE.Group
  wings: THREE.Mesh[]
  radius: number
  height: number
  phase: number
  speed: number
  flap: number
}

function buildFlier(colourHex: string, span: number, seed: number, high: boolean): Flier {
  const random = randoms(seed)
  const group = new THREE.Group()
  const feather = new THREE.MeshLambertMaterial({
    color: colour(colourHex),
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const body = new THREE.Mesh(new THREE.ConeGeometry(span * 0.12, span * 0.7, 5), feather)
  body.rotation.z = Math.PI / 2
  group.add(body)
  const wings: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.62, span * 0.34), feather)
    wing.position.set(0, 0, (side * span) / 3.2)
    wing.rotation.x = Math.PI / 2
    wings.push(wing)
    group.add(wing)
  }
  return {
    group,
    wings,
    radius: high ? 60 + random() * 70 : 12 + random() * 10,
    height: high ? 46 + random() * 26 : DECK.y + 2 + random() * 7,
    phase: random() * Math.PI * 2,
    speed: high ? 0.16 + random() * 0.1 : 0.7 + random() * 0.5,
    flap: high ? 3.2 + random() * 1.4 : 9 + random() * 4,
  }
}

function stepFlier(flier: Flier, elapsed: number, erratic: boolean) {
  const angle = flier.phase + elapsed * flier.speed
  const wobble = erratic ? Math.sin(elapsed * 2.3 + flier.phase) * 4 : 0
  const x = Math.cos(angle) * (flier.radius + wobble)
  const z = Math.sin(angle) * (flier.radius + wobble)
  const y = flier.height + Math.sin(elapsed * (erratic ? 3.1 : 0.6) + flier.phase) * (erratic ? 2.4 : 2.2)
  flier.group.position.set(x, y, z)
  flier.group.rotation.y = -angle + Math.PI / 2
  flier.group.rotation.z = erratic ? Math.sin(elapsed * 4 + flier.phase) * 0.5 : -0.22
  const beat = Math.sin(elapsed * flier.flap + flier.phase)
  flier.wings.forEach((wing, i) => {
    wing.rotation.x = Math.PI / 2 + beat * 0.7 * (i === 0 ? 1 : -1)
  })
}

/* ------------------------------------------------------------------ heron */

function buildHeron(): { group: THREE.Group; neck: THREE.Group } {
  const group = new THREE.Group()
  const pale = new THREE.MeshLambertMaterial({ color: colour('#b9bec4'), flatShading: true })
  const dark = new THREE.MeshLambertMaterial({ color: colour('#4a4f57'), flatShading: true })

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 5), dark)
    leg.position.set(0, 0.39, side * 0.06)
    group.add(leg)
  }
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 0), pale)
  body.scale.set(1.5, 0.9, 0.8)
  body.position.y = 0.86
  group.add(body)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 5), pale)
  tail.rotation.z = Math.PI / 2.2
  tail.position.set(-0.34, 0.88, 0)
  group.add(tail)

  const neck = new THREE.Group()
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.62, 5), pale)
  stem.position.y = 0.31
  neck.add(stem)
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), pale)
  skull.position.y = 0.64
  neck.add(skull)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.34, 5), new THREE.MeshLambertMaterial({ color: colour('#c8a24a'), flatShading: true }))
  beak.rotation.z = -Math.PI / 2
  beak.position.set(0.2, 0.62, 0)
  neck.add(beak)
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.2, 4), dark)
  crest.rotation.z = Math.PI / 2.4
  crest.position.set(-0.12, 0.7, 0)
  neck.add(crest)
  neck.position.set(0.14, 0.92, 0)
  group.add(neck)

  return { group, neck }
}

/* -------------------------------------------------------------- fireflies */

function buildFireflies(count: number, time: { value: number }): THREE.Points {
  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const random = randoms(303)
  let placed = 0
  while (placed < count) {
    const angle = random() * Math.PI * 2
    const radius = 6 + Math.sqrt(random()) * 78
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    positions[placed * 3] = x
    positions[placed * 3 + 1] = groundAt(x, z) + 0.3 + random() * 2.6
    positions[placed * 3 + 2] = z
    phases[placed] = random() * Math.PI * 2
    placed++
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColour: { value: colour('#ffd36b') } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vGlow;
      void main() {
        vec3 drift = vec3(
          sin(uTime * 0.35 + phase) * 1.6,
          sin(uTime * 0.6 + phase * 2.1) * 0.5,
          cos(uTime * 0.31 + phase * 1.3) * 1.6
        );
        vec4 mv = modelViewMatrix * vec4(position + drift, 1.0);
        // Each one keeps its own rhythm, dark for most of it.
        float pulse = sin(uTime * 1.9 + phase * 6.28);
        vGlow = smoothstep(0.55, 1.0, pulse);
        gl_PointSize = (46.0 / max(-mv.z, 1.0)) * (0.6 + vGlow);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColour;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColour, core * core * vGlow);
      }
    `,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return points
}

/* --------------------------------------------------------------- wildlife */

export function buildWildlife(time: { value: number }): Wildlife {
  const group = new THREE.Group()

  const deer = [buildDeer(true, 41), buildDeer(false, 57), buildDeer(false, 83)]
  deer.forEach((d) => group.add(d.group))

  const rabbits = [buildRabbit(11), buildRabbit(23), buildRabbit(37)]
  rabbits.forEach((r) => group.add(r.group))

  const birds = Array.from({ length: 13 }, (_, i) => buildFlier('#2b2a31', 1.5, 900 + i * 7, true))
  birds.forEach((b) => group.add(b.group))

  const bats = Array.from({ length: 7 }, (_, i) => buildFlier('#221c24', 0.5, 400 + i * 13, false))
  bats.forEach((b) => group.add(b.group))

  const heron = buildHeron()
  const shallow = { x: POND.x + POND.radius * 0.52, z: POND.z - POND.radius * 0.3 }
  heron.group.position.set(shallow.x, waterLevel() - 0.62, shallow.z)
  heron.group.rotation.y = 2.1
  group.add(heron.group)

  group.add(buildFireflies(240, time))

  // Midges over the water, which is the other thing a pond at dusk has.
  const midgeCount = 90
  const midges = new Float32Array(midgeCount * 3)
  const midgeRandom = randoms(19)
  for (let i = 0; i < midgeCount; i++) {
    midges[i * 3] = POND.x + (midgeRandom() - 0.5) * 16
    midges[i * 3 + 1] = waterLevel() + 0.3 + midgeRandom() * 1.8
    midges[i * 3 + 2] = POND.z + (midgeRandom() - 0.5) * 16
  }
  const midgeGeometry = new THREE.BufferGeometry()
  midgeGeometry.setAttribute('position', new THREE.BufferAttribute(midges, 3))
  const midgeCloud = new THREE.Points(
    midgeGeometry,
    new THREE.PointsMaterial({ color: colour('#e8c89a'), size: 0.06, transparent: true, opacity: 0.5, depthWrite: false }),
  )
  group.add(midgeCloud)
  const midgeBase = Float32Array.from(midges)
  const midgePositions = midgeGeometry.attributes.position as THREE.BufferAttribute

  return {
    group,
    update(elapsed, dt, watcher) {
      deer.forEach((d) => stepDeer(d, elapsed, dt, watcher))
      rabbits.forEach((r) => stepRabbit(r, dt, watcher))
      birds.forEach((b) => stepFlier(b, elapsed, false))
      bats.forEach((b) => stepFlier(b, elapsed, true))

      // The heron stands still for a long time, then stabs at the water.
      const cycle = (elapsed * 0.1) % 1
      const stab = cycle > 0.86 ? Math.sin((cycle - 0.86) / 0.14 * Math.PI) : 0
      heron.neck.rotation.z = stab * 1.5
      heron.neck.position.y = 0.92 - stab * 0.18

      for (let i = 0; i < midgePositions.count; i++) {
        midgePositions.setX(i, midgeBase[i * 3] + Math.sin(elapsed * 2.1 + i) * 0.5)
        midgePositions.setY(i, midgeBase[i * 3 + 1] + Math.sin(elapsed * 3.3 + i * 2.2) * 0.3)
        midgePositions.setZ(i, midgeBase[i * 3 + 2] + Math.cos(elapsed * 1.7 + i * 1.4) * 0.5)
      }
      midgePositions.needsUpdate = true
    },
  }
}

/** Whether a place is standing in the pond, for anything that must keep dry. */
export const dryLand = (x: number, z: number) => !inPond(x, z)
