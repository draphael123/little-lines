/**
 * The watchtower: stone at the bottom, timber at the top, built around a fir
 * that was already old when the first course was laid. It is the only thing
 * in the demo with any craftsmanship in it, so it gets its own file.
 */
import * as THREE from 'three'
import { randoms } from './noise'
import { BASE, DECK, LADDER, TRUNK } from './lookout'

const colour = (hex: string) => new THREE.Color(hex)

export const TOWER_PALETTE = {
  stone: '#6e675c',
  stoneDark: '#544e46',
  timber: '#7a5a40',
  timberPale: '#a07a58',
  slate: '#4c5560',
  iron: '#3c3936',
  coals: '#ff7a33',
  cloth: '#8d3b3f',
}

export interface Tower {
  group: THREE.Group
  /** The brazier's light, and the coals it comes from. */
  brazier: THREE.PointLight
  coals: THREE.Mesh
  /** The sighting ring, which swings to follow where you look. */
  finder: THREE.Group
  pennant: THREE.Mesh
}

/* -------------------------------------------------------------- materials */

function materials() {
  return {
    stone: new THREE.MeshLambertMaterial({ color: colour(TOWER_PALETTE.stone), flatShading: true }),
    stoneDark: new THREE.MeshLambertMaterial({
      color: colour(TOWER_PALETTE.stoneDark),
      flatShading: true,
    }),
    timber: new THREE.MeshLambertMaterial({ color: colour(TOWER_PALETTE.timber), flatShading: true }),
    pale: new THREE.MeshLambertMaterial({
      color: colour(TOWER_PALETTE.timberPale),
      flatShading: true,
    }),
    slate: new THREE.MeshLambertMaterial({ color: colour(TOWER_PALETTE.slate), flatShading: true }),
    iron: new THREE.MeshLambertMaterial({ color: colour(TOWER_PALETTE.iron), flatShading: true }),
  }
}

/* -------------------------------------------------------------- the cloth */

function sigilTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#8d3b3f'
    ctx.fillRect(0, 0, 128, 192)
    ctx.fillStyle = '#c9a24a'
    // A flame over three hills: whatever this watch answers to.
    ctx.beginPath()
    ctx.moveTo(64, 34)
    ctx.bezierCurveTo(92, 70, 88, 104, 64, 118)
    ctx.bezierCurveTo(40, 104, 36, 70, 64, 34)
    ctx.fill()
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(18 + i * 32, 160)
      ctx.arc(34 + i * 32, 160, 16, Math.PI, 0)
    }
    ctx.fill()
    ctx.strokeStyle = '#c9a24a'
    ctx.lineWidth = 5
    ctx.strokeRect(8, 8, 112, 176)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function mapTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#e8d6b4'
    ctx.fillRect(0, 0, 256, 192)
    ctx.strokeStyle = '#9d7d52'
    ctx.lineWidth = 1.5
    for (let ring = 0; ring < 7; ring++) {
      ctx.beginPath()
      for (let a = 0; a <= 40; a++) {
        const angle = (a / 40) * Math.PI * 2
        const wobble = 1 + Math.sin(angle * 3 + ring) * 0.18 + Math.cos(angle * 5 - ring) * 0.1
        const r = (14 + ring * 11) * wobble
        const x = 128 + Math.cos(angle) * r * 0.9
        const y = 96 + Math.sin(angle) * r * 0.7
        if (a === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }
    ctx.strokeStyle = '#3f6b8a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(10, 150)
    ctx.bezierCurveTo(80, 130, 120, 170, 246, 120)
    ctx.stroke()
    ctx.fillStyle = '#b23a2e'
    ctx.beginPath()
    ctx.arc(168, 62, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = 'italic 15px Georgia, serif'
    ctx.fillStyle = '#6b5330'
    ctx.fillText('the north ridge', 132, 48)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/* ------------------------------------------------------------------ parts */

/** The stone drum at the foot, with its buttresses and its doorway. */
function buildBase(m: ReturnType<typeof materials>): THREE.Group {
  const group = new THREE.Group()
  const height = BASE.height

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(BASE.radius - 0.35, BASE.radius, height, 14), m.stone)
  drum.position.y = height / 2
  group.add(drum)

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(BASE.radius + 0.25, BASE.radius + 0.5, 0.7, 14), m.stoneDark)
  plinth.position.y = 0.35
  group.add(plinth)

  const band = new THREE.Mesh(new THREE.CylinderGeometry(BASE.radius - 0.25, BASE.radius - 0.25, 0.42, 14), m.stoneDark)
  band.position.y = height - 0.2
  group.add(band)

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.6
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(1.0, height * 0.82, 1.5), m.stone)
    buttress.position.set(Math.sin(angle) * (BASE.radius - 0.4), height * 0.41, Math.cos(angle) * (BASE.radius - 0.4))
    buttress.rotation.y = angle
    buttress.rotation.x = 0.06
    group.add(buttress)
  }

  // A doorway on the south side, under the ladder. It goes nowhere, but a
  // tower with no way in reads as scenery rather than a building.
  const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 0.5), m.stoneDark)
  jamb.position.set(0, 1.25, BASE.radius - 0.1)
  group.add(jamb)
  const dark = new THREE.MeshBasicMaterial({ color: colour('#150f13') })
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.9), dark)
  opening.position.set(0, 0.95, BASE.radius + 0.17)
  group.add(opening)
  const arch = new THREE.Mesh(new THREE.CircleGeometry(0.56, 14, 0, Math.PI), dark)
  arch.position.set(0, 1.9, BASE.radius + 0.17)
  group.add(arch)

  return group
}

/** The timber cage between the stonework and the deck. */
function buildCage(m: ReturnType<typeof materials>): THREE.Group {
  const group = new THREE.Group()
  const from = 5.2
  const to = DECK.y
  const span = to - from
  const reach = 2.7

  const corners: Array<[number, number]> = [
    [-reach, -reach],
    [reach, -reach],
    [reach, reach],
    [-reach, reach],
  ]

  corners.forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, span, 0.34), m.timber)
    post.position.set(x, from + span / 2, z)
    group.add(post)
  })

  // Cross braces, storey by storey, on every face.
  const storeys = 3
  for (let s = 0; s < storeys; s++) {
    const y0 = from + (span / storeys) * s
    const y1 = from + (span / storeys) * (s + 1)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(reach * 2 + 0.34, 0.22, reach * 2 + 0.34), m.timber)
    rail.position.y = y1
    group.add(rail)
    // Hollow the rail out to a frame by drawing it as four beams instead.
    group.remove(rail)
    for (const side of [-1, 1]) {
      const beamX = new THREE.Mesh(new THREE.BoxGeometry(reach * 2 + 0.34, 0.22, 0.24), m.timber)
      beamX.position.set(0, y1, side * reach)
      group.add(beamX)
      const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, reach * 2 + 0.34), m.timber)
      beamZ.position.set(side * reach, y1, 0)
      group.add(beamZ)
    }

    const height = y1 - y0
    const diagonal = Math.hypot(reach * 2, height)
    const lean = Math.atan2(reach * 2, height)
    for (const side of [-1, 1]) {
      for (const flip of [-1, 1]) {
        const braceX = new THREE.Mesh(new THREE.BoxGeometry(0.2, diagonal, 0.2), m.timber)
        braceX.position.set(0, (y0 + y1) / 2, side * reach)
        braceX.rotation.z = flip * lean
        group.add(braceX)
        const braceZ = new THREE.Mesh(new THREE.BoxGeometry(0.2, diagonal, 0.2), m.timber)
        braceZ.position.set(side * reach, (y0 + y1) / 2, 0)
        braceZ.rotation.x = flip * lean
        group.add(braceZ)
      }
    }
  }

  // Corbels: the deck is carried, not balanced.
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8
    const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.9, 0.26), m.timber)
    corbel.position.set(Math.sin(angle) * 2.4, DECK.y - 1.3, Math.cos(angle) * 2.4)
    corbel.rotation.set(Math.cos(angle) * 0.42, 0, -Math.sin(angle) * 0.42)
    group.add(corbel)
  }

  return group
}

/** The deck, its crenellated parapet, and the gap where the ladder arrives. */
function buildDeck(m: ReturnType<typeof materials>): THREE.Group {
  const group = new THREE.Group()
  const width = DECK.halfX * 2
  const depth = DECK.maxZ - DECK.minZ
  const centreZ = (DECK.maxZ + DECK.minZ) / 2

  const boards = 17
  for (let i = 0; i < boards; i++) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.14, depth / boards - 0.03),
      i % 3 === 0 ? m.pale : m.timber,
    )
    board.position.set(0, DECK.y - 0.07, DECK.minZ + (depth / boards) * (i + 0.5))
    group.add(board)
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.24, depth + 0.5), m.stoneDark)
  sill.position.set(0, DECK.y - 0.26, centreZ)
  group.add(sill)

  // The parapet: a low stone wall with merlons standing on it.
  const wallHeight = 0.52
  const runs: Array<{ from: [number, number]; to: [number, number] }> = [
    { from: [-DECK.halfX, DECK.minZ], to: [DECK.halfX, DECK.minZ] },
    { from: [DECK.halfX, DECK.minZ], to: [DECK.halfX, DECK.maxZ] },
    { from: [-DECK.halfX, DECK.maxZ], to: [-DECK.halfX, DECK.minZ] },
    { from: [-DECK.halfX, DECK.maxZ], to: [-DECK.gapHalfX, DECK.maxZ] },
    { from: [DECK.gapHalfX, DECK.maxZ], to: [DECK.halfX, DECK.maxZ] },
  ]

  runs.forEach((run) => {
    const dx = run.to[0] - run.from[0]
    const dz = run.to[1] - run.from[1]
    const length = Math.hypot(dx, dz)
    const angle = -Math.atan2(dz, dx)

    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, wallHeight, 0.3), m.stone)
    wall.position.set((run.from[0] + run.to[0]) / 2, DECK.y + wallHeight / 2, (run.from[1] + run.to[1]) / 2)
    wall.rotation.y = angle
    group.add(wall)

    const merlons = Math.max(1, Math.round(length / 1.05))
    for (let i = 0; i < merlons; i++) {
      const t = (i + 0.5) / merlons
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), m.stone)
      merlon.position.set(
        run.from[0] + dx * t,
        DECK.y + wallHeight + 0.36,
        run.from[1] + dz * t,
      )
      merlon.rotation.y = angle
      group.add(merlon)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.42), m.stoneDark)
      cap.position.set(run.from[0] + dx * t, DECK.y + wallHeight + 0.77, run.from[1] + dz * t)
      cap.rotation.y = angle
      group.add(cap)
    }
  })

  return group
}

/** Four posts, a conical roof, and a pennant that never quite settles. */
function buildRoof(m: ReturnType<typeof materials>): { group: THREE.Group; pennant: THREE.Mesh } {
  const group = new THREE.Group()
  const postTop = DECK.y + 2.5

  for (const x of [-DECK.halfX + 0.45, DECK.halfX - 0.45]) {
    for (const z of [DECK.minZ + 0.45, DECK.maxZ - 0.45]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.5, 0.24), m.timber)
      post.position.set(x, DECK.y + 1.25, z)
      group.add(post)
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), m.timber)
      bracket.position.set(x * 0.82, postTop - 0.35, z * 0.82)
      bracket.rotation.set(Math.sign(z) * 0.6, 0, -Math.sign(x) * 0.6)
      group.add(bracket)
    }
  }

  const plate = new THREE.Mesh(new THREE.BoxGeometry(DECK.halfX * 2 + 0.3, 0.2, DECK.maxZ * 2 + 0.3), m.timber)
  plate.position.y = postTop + 0.1
  group.add(plate)

  const roof = new THREE.Mesh(new THREE.ConeGeometry(DECK.halfX + 1.1, 3.1, 8), m.slate)
  roof.position.y = postTop + 1.75
  roof.rotation.y = Math.PI / 8
  group.add(roof)

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), m.iron)
  mast.position.y = postTop + 4.2
  group.add(mast)
  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), m.iron)
  finial.position.y = postTop + 5.3
  group.add(finial)

  const pennant = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.5, 8, 1),
    new THREE.MeshLambertMaterial({
      color: colour(TOWER_PALETTE.cloth),
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  )
  pennant.position.set(0.82, postTop + 4.75, 0)
  group.add(pennant)

  return { group, pennant }
}

/** The ladder, a brazier, a table of maps, and the sighting ring. */
function buildFittings(m: ReturnType<typeof materials>): {
  group: THREE.Group
  brazier: THREE.PointLight
  coals: THREE.Mesh
  finder: THREE.Group
} {
  const group = new THREE.Group()
  const random = randoms(12)

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, LADDER.head - LADDER.foot, 0.13),
      m.timber,
    )
    rail.position.set(side * LADDER.halfWidth, (LADDER.head + LADDER.foot) / 2, LADDER.z)
    group.add(rail)
  }
  for (let i = 0; i < LADDER.rungs; i++) {
    const t = (i + 0.5) / LADDER.rungs
    const rung = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, LADDER.halfWidth * 2, 6),
      m.pale,
    )
    rung.rotation.z = Math.PI / 2
    rung.position.set(0, LADDER.foot + t * (DECK.y - LADDER.foot), LADDER.z)
    group.add(rung)
  }

  // The brazier: an iron bowl on three legs, kept in all night.
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.3, 0.42, 10), m.iron)
  bowl.position.set(DECK.halfX - 1.0, DECK.y + 0.82, DECK.minZ + 1.1)
  group.add(bowl)
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 5), m.iron)
    leg.position.set(
      DECK.halfX - 1.0 + Math.cos(angle) * 0.26,
      DECK.y + 0.42,
      DECK.minZ + 1.1 + Math.sin(angle) * 0.26,
    )
    leg.rotation.set(Math.sin(angle) * 0.18, 0, -Math.cos(angle) * 0.18)
    group.add(leg)
  }
  const coals = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 0),
    new THREE.MeshBasicMaterial({ color: colour(TOWER_PALETTE.coals), fog: false }),
  )
  coals.scale.y = 0.4
  coals.position.set(DECK.halfX - 1.0, DECK.y + 1.0, DECK.minZ + 1.1)
  group.add(coals)
  const brazier = new THREE.PointLight(colour('#ff8a3c'), 30, 17, 2)
  brazier.position.copy(coals.position).setY(DECK.y + 1.3)
  group.add(brazier)

  // The table, the map, a stool and a mug.
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.0), m.pale)
  const tableAt = new THREE.Vector3(-1.9, DECK.y + 0.84, DECK.minZ + 0.95)
  table.position.copy(tableAt)
  group.add(table)
  for (const [lx, lz] of [
    [-0.68, -0.38],
    [0.68, -0.38],
    [-0.68, 0.38],
    [0.68, 0.38],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), m.timber)
    leg.position.set(tableAt.x + lx, DECK.y + 0.4, tableAt.z + lz)
    group.add(leg)
  }
  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.82),
    new THREE.MeshLambertMaterial({ map: mapTexture() }),
  )
  map.rotation.set(-Math.PI / 2, 0, 0.1)
  map.position.set(tableAt.x, DECK.y + 0.9, tableAt.z)
  group.add(map)

  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.11, 9), m.pale)
  stool.position.set(-2.4, DECK.y + 0.54, DECK.minZ + 2.2)
  group.add(stool)
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.52, 5), m.timber)
    leg.position.set(
      -2.4 + Math.cos(angle) * 0.18,
      DECK.y + 0.26,
      DECK.minZ + 2.2 + Math.sin(angle) * 0.18,
    )
    group.add(leg)
  }
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 8), m.pale)
  mug.position.set(-1.3, DECK.y + 0.95, DECK.minZ + 0.7)
  group.add(mug)

  // A crate and a coil of rope, because somebody hauls supplies up here.
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.48, 0.48), m.timber)
  crate.position.set(2.6, DECK.y + 0.24, DECK.maxZ - 1.2)
  crate.rotation.y = 0.35
  group.add(crate)
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 12), m.pale)
  rope.rotation.x = Math.PI / 2
  rope.position.set(2.6, DECK.y + 0.55, DECK.maxZ - 1.2)
  group.add(rope)

  // The sighting ring: a brass circle you swing onto the smoke to read off
  // its bearing. It is the one instrument the watch actually needs.
  const finder = new THREE.Group()
  const brass = new THREE.MeshLambertMaterial({ color: colour('#b08a3c'), flatShading: true })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 22), brass)
  ring.rotation.x = Math.PI / 2
  finder.add(ring)
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20), m.iron)
  finder.add(dial)
  const sight = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), brass)
  sight.position.y = 0.16
  finder.add(sight)
  for (const side of [-1, 1]) {
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.04), brass)
    vane.position.set(side * 0.48, 0.28, 0)
    finder.add(vane)
  }
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.1), brass)
    tick.position.set(Math.sin(angle) * 0.36, 0.03, Math.cos(angle) * 0.36)
    tick.rotation.y = angle
    finder.add(tick)
  }
  finder.position.set(1.55, DECK.y + 1.06, DECK.minZ + 0.85)
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.17, 1.05, 8), m.iron)
  stand.position.set(1.55, DECK.y + 0.53, DECK.minZ + 0.85)
  group.add(stand, finder)

  // Banners on the outside of the parapet, and a couple of lanterns hung off
  // the corbels so the tower reads from the ground at dusk.
  const sigil = sigilTexture()
  for (const side of [-1, 1]) {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.9),
      new THREE.MeshLambertMaterial({ map: sigil, side: THREE.DoubleSide }),
    )
    banner.position.set(side * 1.7, DECK.y - 1.35, DECK.minZ - 0.06)
    banner.rotation.z = (random() - 0.5) * 0.06
    group.add(banner)
  }

  return { group, brazier, coals, finder }
}

/* ------------------------------------------------------------------ tower */

export function buildTower(): Tower {
  const m = materials()
  const group = new THREE.Group()

  group.add(buildBase(m))
  group.add(buildCage(m))
  group.add(buildDeck(m))
  const roof = buildRoof(m)
  group.add(roof.group)
  const fittings = buildFittings(m)
  group.add(fittings.group)

  group.position.set(TRUNK.x, 0, TRUNK.z)

  return {
    group,
    brazier: fittings.brazier,
    coals: fittings.coals,
    finder: fittings.finder,
    pennant: roof.pennant,
  }
}
