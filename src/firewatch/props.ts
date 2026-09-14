/**
 * The things somebody left in the wood, and the wood's own furniture: the
 * pond, a dead snag with an owl on it, a ring of standing stones, a burnt-out
 * cottage, a camp by the fire ring, a cart on the road and the signpost that
 * tells you which way the town is.
 *
 * They are all small, and none of them does anything. Their job is to give
 * you a reason to walk somewhere other than straight up the ladder.
 */
import * as THREE from 'three'
import { randoms } from './noise'
import { LANDMARKS, POND, ROAD, TOWN_NAME, groundAt, inPond, roadPoint, waterLevel } from './lookout'

const colour = (hex: string) => new THREE.Color(hex)

export interface Props {
  group: THREE.Group
  update(elapsed: number): void
}

/* ------------------------------------------------------------------ water */

function buildPond(): { mesh: THREE.Mesh; ripple(elapsed: number): void } {
  // A disc, not a square: the corners of a plane would stand out of the bank.
  const geometry = new THREE.RingGeometry(0.02, POND.radius * 0.74, 30, 9)
  geometry.rotateX(-Math.PI / 2)

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshPhongMaterial({
      color: colour('#2c4e58'),
      specular: colour('#ffd6a0'),
      shininess: 150,
      transparent: true,
      opacity: 0.92,
    }),
  )
  mesh.position.set(POND.x, waterLevel(), POND.z)

  const position = geometry.attributes.position as THREE.BufferAttribute
  const base = Float32Array.from(position.array)

  return {
    mesh,
    ripple(elapsed) {
      for (let i = 0; i < position.count; i++) {
        const x = base[i * 3]
        const z = base[i * 3 + 2]
        position.setY(
          i,
          Math.sin(x * 0.5 + elapsed * 1.1) * 0.035 + Math.sin(z * 0.7 - elapsed * 0.8) * 0.03,
        )
      }
      position.needsUpdate = true
      geometry.computeVertexNormals()
    },
  }
}

/** Reeds, lilies and a half-sunk log around the edge of the water. */
function buildPondside(): THREE.Group {
  const group = new THREE.Group()
  const random = randoms(64)
  const reed = new THREE.MeshLambertMaterial({ color: colour('#6f7a3e'), flatShading: true })
  const lily = new THREE.MeshLambertMaterial({
    color: colour('#3f5c3a'),
    flatShading: true,
    side: THREE.DoubleSide,
  })

  for (let i = 0; i < 330; i++) {
    const angle = random() * Math.PI * 2
    const radius = POND.radius * (0.66 + random() * 0.34)
    const x = POND.x + Math.cos(angle) * radius
    const z = POND.z + Math.sin(angle) * radius
    const height = 1.3 + random() * 1.1
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, height, 4), reed)
    stalk.position.set(x, groundAt(x, z) + height / 2, z)
    stalk.rotation.set((random() - 0.5) * 0.3, random() * 3, (random() - 0.5) * 0.3)
    group.add(stalk)
    if (random() < 0.3) {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 5), new THREE.MeshLambertMaterial({ color: colour('#6b4a2e'), flatShading: true }))
      head.position.set(x, groundAt(x, z) + 1.45, z)
      group.add(head)
    }
  }

  for (let i = 0; i < 26; i++) {
    const angle = random() * Math.PI * 2
    const radius = random() * POND.radius * 0.6
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.3 + random() * 0.3, 7), lily)
    pad.rotation.x = -Math.PI / 2
    pad.position.set(POND.x + Math.cos(angle) * radius, waterLevel() + 0.03, POND.z + Math.sin(angle) * radius)
    group.add(pad)
  }

  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.33, 0.4, 5.4, 7),
    new THREE.MeshLambertMaterial({ color: colour('#4a3b2c'), flatShading: true }),
  )
  log.rotation.set(Math.PI / 2, 0.4, 0.08)
  log.position.set(POND.x + 4.4, waterLevel() - 0.1, POND.z + 6.2)
  group.add(log)

  return group
}

/* ------------------------------------------------------------------- snag */

/** A dead tree with an owl on it. The owl turns its head, and that is all. */
function buildSnag(): { group: THREE.Group; owl: THREE.Group; head: THREE.Group } {
  const group = new THREE.Group()
  const at = LANDMARKS.snag
  const dead = new THREE.MeshLambertMaterial({ color: colour('#6b5f4e'), flatShading: true })
  const ground = groundAt(at.x, at.z)

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 9.5, 8), dead)
  trunk.position.set(at.x, ground + 4.75, at.z)
  trunk.rotation.z = 0.05
  group.add(trunk)

  const random = randoms(88)
  for (let i = 0; i < 5; i++) {
    const angle = random() * Math.PI * 2
    const length = 1.4 + random() * 2.2
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.15, length, 5), dead)
    const y = ground + 4.6 + i * 1.1
    branch.position.set(at.x + Math.cos(angle) * length * 0.4, y, at.z + Math.sin(angle) * length * 0.4)
    branch.rotation.set(Math.sin(angle) * 1.1, 0, -Math.cos(angle) * 1.1)
    group.add(branch)
  }

  const owl = new THREE.Group()
  const feather = new THREE.MeshLambertMaterial({ color: colour('#8a765c'), flatShading: true })
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), feather)
  body.scale.set(0.85, 1.15, 0.85)
  owl.add(body)

  const head = new THREE.Group()
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 0), feather)
  head.add(skull)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(0.065, 10),
      new THREE.MeshBasicMaterial({ color: colour('#ffcf6a') }),
    )
    eye.position.set(side * 0.08, 0.03, 0.19)
    head.add(eye)
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), feather)
    tuft.position.set(side * 0.12, 0.2, 0)
    head.add(tuft)
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), new THREE.MeshLambertMaterial({ color: colour('#d8b45c'), flatShading: true }))
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, -0.04, 0.2)
  head.add(beak)
  head.position.y = 0.36
  owl.add(head)

  owl.position.set(at.x + 0.5, ground + 9.6, at.z + 0.1)
  group.add(owl)

  return { group, owl, head }
}

/* -------------------------------------------------------- standing stones */

function buildStones(): THREE.Group {
  const group = new THREE.Group()
  const at = LANDMARKS.stones
  const random = randoms(202)
  const stone = new THREE.MeshLambertMaterial({ color: colour('#7a7568'), flatShading: true })
  const moss = new THREE.MeshLambertMaterial({ color: colour('#5d6b44'), flatShading: true })

  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2
    const radius = 7.4
    const x = at.x + Math.cos(angle) * radius
    const z = at.z + Math.sin(angle) * radius
    const height = 3.6 + random() * 2.6
    const fallen = i === 4
    const monolith = new THREE.Mesh(new THREE.BoxGeometry(1.2 + random() * 0.7, height, 0.75 + random() * 0.4), stone)
    monolith.position.set(x, groundAt(x, z) + (fallen ? 0.45 : height / 2 - 0.2), z)
    monolith.rotation.set(
      fallen ? Math.PI / 2.1 : (random() - 0.5) * 0.2,
      angle + random(),
      (random() - 0.5) * 0.22,
    )
    group.add(monolith)

    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.8), moss)
    cap.position.copy(monolith.position).setY(monolith.position.y + (fallen ? 0.4 : height / 2))
    cap.rotation.copy(monolith.rotation)
    group.add(cap)
  }

  const altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.3), stone)
  altar.position.set(at.x, groundAt(at.x, at.z) + 0.25, at.z)
  altar.rotation.y = 0.3
  group.add(altar)

  return group
}

/* ------------------------------------------------------------------ ruin */

function buildRuin(): THREE.Group {
  const group = new THREE.Group()
  const at = LANDMARKS.ruin
  const random = randoms(151)
  const stone = new THREE.MeshLambertMaterial({ color: colour('#6f6a5e'), flatShading: true })
  const char = new THREE.MeshLambertMaterial({ color: colour('#3b352f'), flatShading: true })
  const ground = groundAt(at.x, at.z)

  // Three walls of a cottage, each broken off at a different height.
  const walls: Array<[number, number, number, number, number]> = [
    [0, -3, 7, 2.6, 0],
    [-3.5, 0, 6, 1.5, Math.PI / 2],
    [3.5, 0.6, 4.8, 0.9, Math.PI / 2],
  ]
  walls.forEach(([dx, dz, length, height, spin]) => {
    const courses = Math.max(2, Math.round(height / 0.42))
    for (let c = 0; c < courses; c++) {
      const shrink = 1 - (c / courses) * (0.15 + random() * 0.4)
      const course = new THREE.Mesh(new THREE.BoxGeometry(length * shrink, 0.4, 0.55), stone)
      course.position.set(at.x + dx, ground + 0.2 + c * 0.42, at.z + dz)
      course.rotation.y = spin + (random() - 0.5) * 0.05
      group.add(course)
    }
  })

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.6, 1.3), stone)
  chimney.position.set(at.x - 3.4, ground + 2.3, at.z + 2.4)
  group.add(chimney)
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.5), char)
  hearth.position.set(at.x - 2.75, ground + 0.55, at.z + 2.4)
  group.add(hearth)

  // Fallen stones in the grass, and a rowan grown up through the floor.
  for (let i = 0; i < 14; i++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.5 + random() * 0.5, 0.3, 0.4), stone)
    const x = at.x + (random() - 0.5) * 9
    const z = at.z + (random() - 0.5) * 8
    block.position.set(x, groundAt(x, z) + 0.14, z)
    block.rotation.set((random() - 0.5) * 0.3, random() * 3, (random() - 0.5) * 0.3)
    group.add(block)
  }
  const rowanTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, 4.6, 6),
    new THREE.MeshLambertMaterial({ color: colour('#4e4136'), flatShading: true }),
  )
  rowanTrunk.position.set(at.x + 1.4, ground + 2.3, at.z + 1.2)
  group.add(rowanTrunk)
  const rowanCrown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.1, 0),
    new THREE.MeshLambertMaterial({ color: colour('#4e6b3c'), flatShading: true }),
  )
  rowanCrown.scale.set(1, 0.75, 1)
  rowanCrown.position.set(at.x + 1.4, ground + 5.2, at.z + 1.2)
  group.add(rowanCrown)

  return group
}

/* ------------------------------------------------------------------ camp */

function buildCamp(): THREE.Group {
  const group = new THREE.Group()
  const at = LANDMARKS.camp
  const ground = groundAt(at.x, at.z)
  const canvasCloth = new THREE.MeshLambertMaterial({
    color: colour('#9d8a63'),
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const wood = new THREE.MeshLambertMaterial({ color: colour('#5a452f'), flatShading: true })
  const iron = new THREE.MeshLambertMaterial({ color: colour('#3c3936'), flatShading: true })

  // A ridge tent: two sloping panels meeting on a pole, and a gable at each
  // end. The numbers are a right-angled triangle rather than a guess, or the
  // two halves do not meet along the ridge.
  const half = 1.25
  const peak = 1.7
  const length = 3.6
  const slant = Math.hypot(half, peak)
  const lean = Math.asin(half / slant)
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(length, slant), canvasCloth)
    panel.position.set(at.x, ground + peak / 2, at.z + (side * half) / 2)
    panel.rotation.x = -side * lean
    group.add(panel)
  }

  const gable = new THREE.Shape()
  gable.moveTo(-half, 0)
  gable.lineTo(half, 0)
  gable.lineTo(0, peak)
  gable.closePath()
  for (const end of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.ShapeGeometry(gable), canvasCloth)
    face.rotation.y = (end * Math.PI) / 2
    face.position.set(at.x + (end * length) / 2, ground, at.z)
    group.add(face)

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, peak, 5), wood)
    pole.position.set(at.x + (end * length) / 2, ground + peak / 2, at.z)
    group.add(pole)

    const guy = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.1, 4), wood)
    guy.position.set(at.x + end * (length / 2 + 0.75), ground + peak / 2, at.z)
    guy.rotation.z = end * 0.95
    group.add(guy)
  }
  const ridgePole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, length + 0.6, 5), wood)
  ridgePole.rotation.z = Math.PI / 2
  ridgePole.position.set(at.x, ground + peak, at.z)
  group.add(ridgePole)

  // A tripod over the fire ring, with a pot hanging off it.
  const fire = { x: 6.2, z: 7.4 }
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.3, 5), wood)
    pole.position.set(fire.x + Math.cos(angle) * 0.55, groundAt(fire.x, fire.z) + 1.1, fire.z + Math.sin(angle) * 0.55)
    pole.rotation.set(Math.sin(angle) * 0.45, 0, -Math.cos(angle) * 0.45)
    group.add(pole)
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.36, 10), iron)
  pot.position.set(fire.x, groundAt(fire.x, fire.z) + 0.85, fire.z)
  group.add(pot)

  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8), new THREE.MeshLambertMaterial({ color: colour('#7a5a4a'), flatShading: true }))
  roll.rotation.z = Math.PI / 2
  roll.position.set(at.x - 2.1, ground + 0.22, at.z + 1.4)
  group.add(roll)

  const axe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), wood)
  axe.position.set(at.x - 3.4, ground + 0.55, at.z - 1.6)
  axe.rotation.z = 0.5
  group.add(axe)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.3), iron)
  blade.position.set(at.x - 3.24, ground + 0.86, at.z - 1.6)
  blade.rotation.z = 0.5
  group.add(blade)

  return group
}

/* ------------------------------------------------------- cart and signpost */

function signTexture(text: string, arrow: 1 | -1): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#8a6a47'
    ctx.fillRect(0, 0, 320, 64)
    // A darker grain, so the board is not a flat slab of colour.
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(90, 66, 42, ${0.1 + Math.random() * 0.18})`
      ctx.lineWidth = 1 + Math.random() * 2
      const y = Math.random() * 64
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(90, y + 4, 200, y - 5, 320, y + 2)
      ctx.stroke()
    }

    ctx.fillStyle = '#33241a'
    ctx.font = 'bold 27px Georgia, serif'
    ctx.textBaseline = 'middle'
    const inset = 26
    ctx.fillText(text, arrow > 0 ? inset : inset + 34, 34)

    // The pointing hand at the end the board points to.
    const tip = arrow > 0 ? 306 : 14
    const back = arrow > 0 ? 272 : 48
    ctx.beginPath()
    ctx.moveTo(tip, 32)
    ctx.lineTo(back, 14)
    ctx.lineTo(back, 50)
    ctx.closePath()
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface Signage {
  timber: THREE.MeshLambertMaterial
  iron: THREE.MeshLambertMaterial
}

/**
 * A fingerpost: a post with one or two boards on it, each turned to point
 * down the road it names. `heading` is the compass direction the board points
 * in, as a yaw in radians.
 */
function fingerpost(
  group: THREE.Group,
  m: Signage,
  at: { x: number; z: number },
  boards: Array<{ text: string; heading: number; height: number }>,
) {
  const ground = groundAt(at.x, at.z)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.0, 7), m.timber)
  post.position.set(at.x, ground + 1.5, at.z)
  group.add(post)

  boards.forEach(({ text, heading, height }) => {
    // Which end of the board the hand goes on, so it always points forwards.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.44, 0.06),
      new THREE.MeshLambertMaterial({ map: signTexture(text, 1) }),
    )
    board.position.set(
      at.x + Math.sin(heading) * 0.78,
      ground + height,
      at.z + Math.cos(heading) * 0.78,
    )
    board.rotation.y = heading - Math.PI / 2
    group.add(board)
  })

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.28, 7), m.iron)
  cap.position.set(at.x, ground + 3.1, at.z)
  group.add(cap)
}

/** A milestone, of the kind that outlasts the road it was cut for. */
function milestone(group: THREE.Group, at: { x: number; z: number }, text: string) {
  const ground = groundAt(at.x, at.z)
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#8e8578'
    ctx.fillRect(0, 0, 128, 128)
    ctx.fillStyle = '#4a4238'
    ctx.font = 'bold 34px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(text, 64, 78)
  }
  const face = new THREE.CanvasTexture(canvas)
  face.colorSpace = THREE.SRGBColorSpace
  const stone = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.8, 0.24),
    new THREE.MeshLambertMaterial({ map: face }),
  )
  stone.position.set(at.x, ground + 0.35, at.z)
  stone.rotation.y = 0.3
  group.add(stone)
}

/** Where the road heads at a given point along it, as a yaw in radians. */
function roadHeading(t: number): number {
  const here = roadPoint(t)
  const ahead = roadPoint(Math.min(1, t + 0.01))
  return Math.atan2(ahead.x - here.x, ahead.z - here.z)
}

function buildWayside(): THREE.Group {
  const group = new THREE.Group()
  const m: Signage = {
    timber: new THREE.MeshLambertMaterial({ color: colour('#6b4f36'), flatShading: true }),
    iron: new THREE.MeshLambertMaterial({ color: colour('#3c3936'), flatShading: true }),
  }

  // The junction where the trail down from the tower meets the road: one arm
  // for the town, one back up the hill.
  const junction = LANDMARKS.signpost
  const townward = roadHeading(0.52)
  fingerpost(group, m, junction, [
    { text: `${TOWN_NAME}  2`, heading: townward, height: 2.5 },
    { text: 'The Lookout', heading: Math.PI, height: 2.05 },
  ])

  // Then the road marks itself the rest of the way in.
  const along: Array<{ t: number; text: string }> = [
    { t: 0.66, text: `${TOWN_NAME}  1` },
    { t: 0.84, text: `${TOWN_NAME}  ½` },
  ]
  along.forEach(({ t, text }) => {
    const at = roadPoint(t)
    const heading = roadHeading(t)
    const verge = {
      x: at.x + Math.cos(heading) * (ROAD.halfWidth + 1.4),
      z: at.z - Math.sin(heading) * (ROAD.halfWidth + 1.4),
    }
    fingerpost(group, m, verge, [{ text, heading, height: 2.4 }])
  })

  const stoneAt = roadPoint(0.75)
  const stoneHeading = roadHeading(0.75)
  milestone(
    group,
    {
      x: stoneAt.x + Math.cos(stoneHeading) * (ROAD.halfWidth + 1.1),
      z: stoneAt.z - Math.sin(stoneHeading) * (ROAD.halfWidth + 1.1),
    },
    '¾',
  )

  // A cart left on the verge, with its load half unpacked.
  const on = roadPoint(0.4)
  const cartGround = groundAt(on.x, on.z + 4.5)
  const cart = new THREE.Group()
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 1.5), m.timber)
  bed.position.y = 0.85
  cart.add(bed)
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.45, 0.1), m.timber)
    rail.position.set(0, 1.13, side * 0.7)
    cart.add(rail)
  }
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 6, 14), m.timber)
    wheel.position.set(-0.4, 0.62, side * 0.85)
    cart.add(wheel)
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.05), m.timber)
      spoke.position.set(-0.4, 0.62, side * 0.85)
      spoke.rotation.z = (i / 6) * Math.PI
      cart.add(spoke)
    }
  }
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.09), m.timber)
  shaft.position.set(2.1, 0.7, 0)
  shaft.rotation.z = -0.18
  cart.add(shaft)
  for (let i = 0; i < 5; i++) {
    const billet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 1.3, 6),
      new THREE.MeshLambertMaterial({ color: colour('#4e3b2b'), flatShading: true }),
    )
    billet.rotation.x = Math.PI / 2
    billet.position.set(-0.6 + (i % 3) * 0.32, 1.05 + Math.floor(i / 3) * 0.26, 0)
    cart.add(billet)
  }
  cart.position.set(on.x, cartGround, on.z + 4.2)
  cart.rotation.y = 0.35
  group.add(cart)

  return group
}

/* ------------------------------------------------------------ undergrowth */

/** Flowers and toadstools, scattered thinly. Small colour, close to the eye. */
function buildUndergrowth(): THREE.Group {
  const group = new THREE.Group()
  const random = randoms(404)

  const petal = new THREE.IcosahedronGeometry(0.042, 0)
  const flowers = new THREE.InstancedMesh(
    petal,
    new THREE.MeshLambertMaterial({ flatShading: true }),
    900,
  )
  const stemGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.26, 4)
  stemGeometry.translate(0, 0.13, 0)
  const stems = new THREE.InstancedMesh(
    stemGeometry,
    new THREE.MeshLambertMaterial({ color: colour('#5f6f3c'), flatShading: true }),
    900,
  )

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3(1, 1, 1)
  const spin = new THREE.Quaternion()
  const white = colour('#e8e2d0')
  const yellow = colour('#e6c664')
  const violet = colour('#9d84c4')
  const tint = new THREE.Color()

  let placed = 0
  let guard = 0
  while (placed < 900 && guard < 9000) {
    guard++
    const angle = random() * Math.PI * 2
    const radius = 5 + Math.sqrt(random()) * 95
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (inPond(x, z, 1)) continue
    const y = groundAt(x, z)

    position.set(x, y + 0.27, z)
    matrix.compose(position, spin, scale)
    flowers.setMatrixAt(placed, matrix)
    const pick = random()
    tint.copy(pick < 0.45 ? white : pick < 0.8 ? yellow : violet)
    flowers.setColorAt(placed, tint)

    position.set(x, y, z)
    matrix.compose(position, spin, scale)
    stems.setMatrixAt(placed, matrix)
    placed++
  }
  flowers.count = placed
  stems.count = placed
  flowers.instanceMatrix.needsUpdate = true
  stems.instanceMatrix.needsUpdate = true
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true
  group.add(flowers, stems)

  // Toadstools, in rings and clumps the way they actually come up.
  const capGeometry = new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
  const caps = new THREE.InstancedMesh(
    capGeometry,
    new THREE.MeshLambertMaterial({ color: colour('#b4463a'), flatShading: true }),
    260,
  )
  const stalkGeometry = new THREE.CylinderGeometry(0.035, 0.045, 0.16, 5)
  stalkGeometry.translate(0, 0.08, 0)
  const stalks = new THREE.InstancedMesh(
    stalkGeometry,
    new THREE.MeshLambertMaterial({ color: colour('#e0d6c0'), flatShading: true }),
    260,
  )

  let fungi = 0
  while (fungi < 260) {
    const angle = random() * Math.PI * 2
    const radius = 8 + random() * 80
    const cx = Math.cos(angle) * radius
    const cz = Math.sin(angle) * radius
    if (inPond(cx, cz, 1)) continue
    const ring = 0.5 + random() * 1.4
    const many = 3 + Math.floor(random() * 5)
    for (let i = 0; i < many && fungi < 260; i++) {
      const a = random() * Math.PI * 2
      const x = cx + Math.cos(a) * ring
      const z = cz + Math.sin(a) * ring
      const y = groundAt(x, z)
      const size = 0.7 + random() * 0.8
      scale.setScalar(size)
      position.set(x, y + 0.16 * size, z)
      matrix.compose(position, spin, scale)
      caps.setMatrixAt(fungi, matrix)
      position.set(x, y, z)
      matrix.compose(position, spin, scale)
      stalks.setMatrixAt(fungi, matrix)
      fungi++
    }
  }
  scale.setScalar(1)
  caps.instanceMatrix.needsUpdate = true
  stalks.instanceMatrix.needsUpdate = true
  group.add(caps, stalks)

  return group
}

/* ------------------------------------------------------------------ props */

export function buildProps(): Props {
  const group = new THREE.Group()

  const pond = buildPond()
  group.add(pond.mesh)
  group.add(buildPondside())

  const snag = buildSnag()
  group.add(snag.group)
  group.add(buildStones())
  group.add(buildRuin())
  group.add(buildCamp())
  group.add(buildWayside())
  group.add(buildUndergrowth())

  return {
    group,
    update(elapsed) {
      pond.ripple(elapsed)
      // The owl looks somewhere else every few seconds, and never smoothly.
      const look = Math.floor(elapsed / 3.5)
      const target = Math.sin(look * 12.9898) * 1.3
      snag.head.rotation.y += (target - snag.head.rotation.y) * 0.08
    },
  }
}
