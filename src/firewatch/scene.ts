/**
 * The world, built once at load.
 *
 * Nothing here is fetched. The sky is a shader, the ridges are noise turned
 * into silhouettes, the wood is two instanced meshes, and the treehouse is
 * about forty boxes and cylinders. Everything that moves afterwards — the
 * smoke, the lantern, the motes — is returned in `update`.
 */
import * as THREE from 'three'
import { fbm, randoms } from './noise'
import type { Tree } from './lookout'
import {
  CLEARING,
  ROAD,
  SMOKE,
  TRUNK,
  bearingToPoint,
  distanceToRoad,
  groundAt,
  inPond,
  onTrail,
  roadPoint,
  scatterWood,
} from './lookout'
import { buildProps } from './props'
import { buildTower } from './tower'
import { buildTown } from './town'
import { buildWildlife } from './wildlife'

/* ---------------------------------------------------------------- palette */

export const PALETTE = {
  zenith: '#2b2f5c',
  midSky: '#8e4a63',
  horizon: '#eb9350',
  coolHorizon: '#6b4a76',
  sunGlow: '#ffd79a',
  fog: '#835650',
  ground: '#98a16a',
  groundWarm: '#b0a071',
  trail: '#a98d68',
  bark: '#4e392b',
  needles: '#3f6150',
  needlesOlive: '#5f7442',
  plank: '#7a5a40',
  plankPale: '#a07a58',
  shingle: '#5c4a3a',
  lantern: '#ffb257',
  smoke: '#e7d2bd',
}

/** Low, and behind you when you are looking at the smoke. */
export const SUN_BEARING = 292
const SUN_ELEVATION = 5.5

export function sunDirection(): THREE.Vector3 {
  const flat = bearingToPoint(SUN_BEARING, 1)
  const y = Math.tan((SUN_ELEVATION * Math.PI) / 180)
  return new THREE.Vector3(flat.x, y, flat.z).normalize()
}

const colour = (hex: string) => new THREE.Color(hex)

/** One clock, shared by everything that sways. */
const wind = { value: 0 }

/** Where the player's eye is, so the undergrowth can get out of the way. */
const eye = { value: new THREE.Vector3(0, 2, 40) }

/* -------------------------------------------------------------------- sky */

function buildSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: colour(PALETTE.zenith) },
      uMid: { value: colour(PALETTE.midSky) },
      uHorizon: { value: colour(PALETTE.horizon) },
      uCool: { value: colour(PALETTE.coolHorizon) },
      uSun: { value: colour(PALETTE.sunGlow) },
      uSunDir: { value: sunDirection() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith, uMid, uHorizon, uCool, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        // Only the sun's own quarter of the sky burns; behind you it is dusk.
        float towards = dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z)));
        vec3 low = mix(uCool, uHorizon, smoothstep(-0.55, 0.95, towards));
        vec3 col = mix(low, uMid, smoothstep(0.47, 0.60, h));
        col = mix(col, uZenith, smoothstep(0.55, 0.95, h));
        float sun = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSun * pow(sun, 900.0) * 1.6;
        col += uSun * pow(sun, 12.0) * 0.30;
        col += uSun * pow(sun, 2.5) * 0.10;
        col += low * pow(max(0.0, 1.0 - abs(d.y) * 2.6), 4.0) * 0.18;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 40, 24), material)
  sky.renderOrder = -10
  sky.frustumCulled = false
  return sky
}

/* ----------------------------------------------------------------- ridges */

/**
 * Four rings of hills standing around the wood, each one hazier than the one
 * inside it. They ignore the fog and carry their haze in the colour instead,
 * which is the only way distance reads at this scale.
 */
function buildRidges(): THREE.Group {
  const group = new THREE.Group()
  const layers = [
    { radius: 520, height: 58, tint: '#6d4a4c', roughness: 1.0 },
    { radius: 820, height: 118, tint: '#84544d', roughness: 0.9 },
    { radius: 1220, height: 186, tint: '#a2634e', roughness: 0.8 },
    { radius: 1700, height: 268, tint: '#c2784f', roughness: 0.7 },
    { radius: 2200, height: 352, tint: '#d78d55', roughness: 0.6 },
  ]

  layers.forEach((layer, index) => {
    const segments = 260
    const positions = new Float32Array((segments + 1) * 2 * 3)
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      const cx = Math.cos(angle)
      const cz = Math.sin(angle)
      // Sampling noise on the circle itself keeps the ridge line seamless.
      const broad = fbm(cx * 2.1 + index * 9, cz * 2.1 - index * 4, 4, 31 + index * 13)
      const trees = fbm(cx * 26, cz * 26, 2, 71 + index) * 0.06 * layer.roughness
      const h = layer.height * (0.45 + broad * 0.55 + trees)
      const o = i * 6
      positions[o] = cx * layer.radius
      positions[o + 1] = h
      positions[o + 2] = cz * layer.radius
      positions[o + 3] = cx * layer.radius
      positions[o + 4] = -220
      positions[o + 5] = cz * layer.radius
    }

    const indices: number[] = []
    for (let i = 0; i < segments; i++) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(indices)

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: colour(layer.tint), side: THREE.DoubleSide, fog: false }),
    )
    mesh.renderOrder = -5 + index
    mesh.frustumCulled = false
    group.add(mesh)
  })

  return group
}

/* ----------------------------------------------------------------- ground */

/**
 * The forest floor itself. A hundred thousand little meshes will never carpet
 * four hundred metres of ground, so the litter is a tiled texture and the
 * planting sits on top of it.
 */
function litterTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  const size = 512
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    // Base: dry needle brown, mottled rather than flat.
    ctx.fillStyle = '#a2966d'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 12 + Math.random() * 60
      ctx.fillStyle =
        Math.random() > 0.5
          ? `rgba(150, 133, 92, ${0.12 + Math.random() * 0.2})`
          : `rgba(196, 184, 138, ${0.1 + Math.random() * 0.18})`
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Moss, in ragged patches rather than round blobs.
    for (let i = 0; i < 90; i++) {
      const cx = Math.random() * size
      const cy = Math.random() * size
      const green = 104 + Math.random() * 62
      ctx.fillStyle = `rgba(${Math.round(green * 0.52)}, ${Math.round(green)}, ${Math.round(green * 0.44)}, 0.5)`
      ctx.beginPath()
      const lobes = 9
      for (let l = 0; l <= lobes; l++) {
        const a = (l / lobes) * Math.PI * 2
        const r = (10 + Math.random() * 26) * (0.7 + Math.sin(a * 3 + i) * 0.3)
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r * 0.8
        if (l === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
    }

    // Needles: thousands of them, short and lying every which way.
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const angle = Math.random() * Math.PI
      const length = 4 + Math.random() * 12
      const shade = 60 + Math.random() * 90
      const rust = Math.random() * 0.4
      ctx.strokeStyle = `rgba(${Math.round(shade * (1 + rust))}, ${Math.round(shade * 0.78)}, ${Math.round(shade * 0.44)}, ${0.35 + Math.random() * 0.45})`
      ctx.lineWidth = 0.8 + Math.random() * 0.9
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
      ctx.stroke()
    }

    // Twigs, pebbles and the odd fallen leaf, for something to find at your feet.
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const kind = Math.random()
      if (kind < 0.4) {
        ctx.strokeStyle = 'rgba(78, 60, 42, 0.75)'
        ctx.lineWidth = 1.4 + Math.random() * 1.8
        const angle = Math.random() * Math.PI
        const length = 10 + Math.random() * 26
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
        ctx.stroke()
      } else if (kind < 0.72) {
        const grey = 128 + Math.random() * 70
        ctx.fillStyle = `rgba(${grey}, ${Math.round(grey * 0.97)}, ${Math.round(grey * 0.86)}, 0.85)`
        ctx.beginPath()
        ctx.ellipse(x, y, 2 + Math.random() * 4, 1.6 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = `rgba(${150 + Math.random() * 60}, ${90 + Math.random() * 50}, 48, 0.7)`
        ctx.beginPath()
        ctx.ellipse(x, y, 3 + Math.random() * 4, 2 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Two and a half metres a tile: close enough to see needles, far enough
  // that the tiling never announces itself.
  texture.repeat.set(250, 250)
  texture.anisotropy = 8
  return texture
}

function buildGround(): THREE.Mesh {
  const size = 760
  const segments = 176
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position as THREE.BufferAttribute
  const colours = new Float32Array(position.count * 3)
  const moss = colour(PALETTE.ground)
  const warm = colour(PALETTE.groundWarm)
  const trail = colour(PALETTE.trail)
  const shade = new THREE.Color()

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    position.setY(i, groundAt(x, z))
    const patch = fbm(x * 0.08, z * 0.08, 2, 3) * 0.5 + 0.5
    shade.copy(moss).lerp(warm, patch * 0.5)

    // Bare earth shows through right under the tower, where it gets walked off.
    const bare = Math.max(0, 1 - Math.hypot(x, z) / 15)
    shade.lerp(trail, bare * 0.22)

    // It darkens away from the clearing, where the canopy closes over.
    const closed = Math.min(1, Math.hypot(x, z) / 130)
    shade.multiplyScalar(1 - closed * 0.18)
    colours[i * 3] = shade.r
    colours[i * 3 + 1] = shade.g
    colours[i * 3 + 2] = shade.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geometry.computeVertexNormals()

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: litterTexture(),
      flatShading: true,
    }),
  )
  mesh.receiveShadow = false
  return mesh
}


function trailTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#b59a74'
    ctx.fillRect(0, 0, 64, 256)
    // Trodden earth: blotches, then a fade to nothing at both edges.
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 64
      const y = Math.random() * 256
      ctx.fillStyle = `rgba(${90 + Math.random() * 70}, ${76 + Math.random() * 60}, ${54 + Math.random() * 40}, 0.5)`
      ctx.beginPath()
      ctx.ellipse(x, y, 2 + Math.random() * 7, 1 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    const fade = ctx.getImageData(0, 0, 64, 256)
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 64; x++) {
        const edge = Math.min(x, 63 - x) / 22
        const soft = Math.min(1, edge) ** 1.6
        const wobble = 0.75 + Math.sin(y * 0.12 + x * 0.02) * 0.25
        fade.data[(y * 64 + x) * 4 + 3] = Math.round(255 * Math.min(1, soft * wobble))
      }
    }
    ctx.putImageData(fade, 0, 0)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 7)
  return texture
}

/** The path in from the south, worn by whoever walks up here every evening. */
function buildTrail(): THREE.Mesh {
  const steps = 60
  const from = 96
  const to = CLEARING - 7
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const z = from + (to - from) * t
    // A path that wanders a little, because nobody walks in a straight line.
    const centre = Math.sin(z * 0.06) * 1.6
    const half = 1.7 + Math.sin(z * 0.13) * 0.35
    for (const side of [-1, 1]) {
      const x = centre + side * half
      positions.push(x, groundAt(x, z) + 0.06, z)
      uvs.push(side > 0 ? 1 : 0, t)
    }
    if (i < steps) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      map: trailTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
}


function roadTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#9d8a6a'
    ctx.fillRect(0, 0, 96, 256)
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 96
      const y = Math.random() * 256
      const grey = 110 + Math.random() * 80
      ctx.fillStyle = `rgba(${grey}, ${grey * 0.92}, ${grey * 0.74}, 0.45)`
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3)
    }
    // Two ruts, worn in by cart wheels.
    for (const centre of [30, 66]) {
      ctx.fillStyle = 'rgba(86, 70, 52, 0.5)'
      for (let y = 0; y < 256; y += 2) {
        const wobble = Math.sin(y * 0.05 + centre) * 2.5
        ctx.fillRect(centre + wobble - 5, y, 10, 2)
      }
    }
    const fade = ctx.getImageData(0, 0, 96, 256)
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 96; x++) {
        const edge = Math.min(x, 95 - x) / 16
        const soft = Math.min(1, edge) ** 1.4
        const wobble = 0.72 + Math.sin(y * 0.09 + x * 0.03) * 0.28
        fade.data[(y * 96 + x) * 4 + 3] = Math.round(255 * Math.min(1, soft * wobble))
      }
    }
    ctx.putImageData(fade, 0, 0)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 26)
  return texture
}

/** The wagon road along the foot of the wood, running west towards the town. */
function buildRoad(): THREE.Mesh {
  const steps = 220
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const here = roadPoint(t)
    const ahead = roadPoint(Math.min(1, t + 1 / steps))
    const dx = ahead.x - here.x
    const dz = ahead.z - here.z
    const length = Math.hypot(dx, dz) || 1
    const nx = -dz / length
    const nz = dx / length
    for (const side of [-1, 1]) {
      const x = here.x + nx * side * ROAD.halfWidth
      const z = here.z + nz * side * ROAD.halfWidth
      positions.push(x, groundAt(x, z) + 0.07, z)
      uvs.push(side > 0 ? 1 : 0, i / steps)
    }
    if (i < steps) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      map: roadTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
}

/* ------------------------------------------------------------------- wood */

/* ----------------------------------------------------------------- species */

/**
 * Everything is drawn in one pass per kind of thing, so the parts of a tree
 * have to become a single geometry first. Three's merge helper lives in the
 * examples rather than the library, and this is all of it that is needed.
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const loose = parts.map((part) => (part.index ? part.toNonIndexed() : part))
  const total = loose.reduce((sum, part) => sum + part.attributes.position.count, 0)
  const positions = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)
  const uvs = new Float32Array(total * 2)
  const textured = loose.every((part) => part.attributes.uv)
  let offset = 0
  for (const part of loose) {
    const position = part.attributes.position as THREE.BufferAttribute
    const normal = part.attributes.normal as THREE.BufferAttribute
    positions.set(position.array as Float32Array, offset * 3)
    normals.set(normal.array as Float32Array, offset * 3)
    if (textured) uvs.set((part.attributes.uv as THREE.BufferAttribute).array as Float32Array, offset * 2)
    offset += position.count
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  if (textured) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  return geometry
}

/**
 * A fir: broad skirts over a bare stem, a unit high and a unit across. The
 * silhouette does nearly all the work at dusk, so the species differ in
 * outline rather than in detail.
 */
function firGeometry(): THREE.BufferGeometry {
  const tiers = [
    { y: 0.28, r: 0.5, h: 0.36 },
    { y: 0.5, r: 0.41, h: 0.32 },
    { y: 0.71, r: 0.28, h: 0.3 },
  ]
  const parts: THREE.BufferGeometry[] = tiers.map((tier) => {
    const cone = new THREE.ConeGeometry(tier.r, tier.h, 6)
    cone.translate(0, tier.y + tier.h / 2, 0)
    return cone
  })
  const stem = new THREE.CylinderGeometry(0.035, 0.055, 0.32, 5)
  stem.translate(0, 0.16, 0)
  parts.push(stem)
  return merge(parts)
}

/** A spruce: narrower, taller, five tight tiers nearly to the ground. */
function spruceGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const t = i / 5
    const cone = new THREE.ConeGeometry(0.36 - t * 0.22, 0.3 - t * 0.08, 6)
    cone.translate(0, 0.18 + t * 0.68 + (0.3 - t * 0.08) / 2, 0)
    parts.push(cone)
  }
  const stem = new THREE.CylinderGeometry(0.028, 0.045, 0.24, 5)
  stem.translate(0, 0.12, 0)
  parts.push(stem)
  return merge(parts)
}

/** A pine: a long clean bole with the crown all at the top. */
function pineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const stem = new THREE.CylinderGeometry(0.038, 0.07, 0.72, 6)
  stem.translate(0, 0.36, 0)
  parts.push(stem)
  const crowns: Array<[number, number, number, number, number]> = [
    [0, 0.78, 0, 0.34, 0.26],
    [-0.14, 0.86, 0.08, 0.24, 0.2],
    [0.15, 0.88, -0.06, 0.22, 0.18],
  ]
  crowns.forEach(([x, y, z, r, h]) => {
    const cap = new THREE.ConeGeometry(r, h, 6)
    cap.translate(x, y + h / 2, z)
    parts.push(cap)
  })
  return merge(parts)
}

/**
 * A broadleaf: a tapering trunk that forks, with the crown built from a
 * handful of small masses rather than one big one — a single blob at this
 * scale reads as a boulder in a tree's place.
 */
function broadleafGeometry(slim: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const boleTop = slim ? 0.62 : 0.44
  const bole = new THREE.CylinderGeometry(slim ? 0.028 : 0.045, slim ? 0.05 : 0.085, boleTop, 7)
  bole.translate(0, boleTop / 2, 0)
  parts.push(bole)

  const forks = slim ? 2 : 3
  for (let i = 0; i < forks; i++) {
    const angle = (i / forks) * Math.PI * 2 + 0.4
    const limb = new THREE.CylinderGeometry(0.02, 0.035, 0.3, 5)
    limb.rotateZ(Math.cos(angle) * 0.6)
    limb.rotateX(Math.sin(angle) * 0.6)
    limb.translate(Math.cos(angle) * 0.07, boleTop + 0.1, Math.sin(angle) * 0.07)
    parts.push(limb)
  }

  const masses = slim
    ? [
        [0, 0.82, 0, 0.16],
        [-0.09, 0.9, 0.05, 0.12],
        [0.08, 0.93, -0.04, 0.11],
        [0.02, 1.0, 0.03, 0.09],
      ]
    : [
        [0, 0.66, 0, 0.24],
        [-0.2, 0.72, 0.12, 0.18],
        [0.21, 0.7, -0.1, 0.19],
        [0.05, 0.84, 0.16, 0.16],
        [-0.11, 0.86, -0.14, 0.15],
        [0.02, 0.94, 0, 0.13],
      ]
  masses.forEach(([x, y, z, r]) => {
    const mass = new THREE.IcosahedronGeometry(r, 0)
    mass.scale(1.15, 0.85, 1.15)
    mass.rotateY(x * 9 + z * 5)
    mass.translate(x, y, z)
    parts.push(mass)
  })
  return merge(parts)
}

function buildWood(): { group: THREE.Group; understory: THREE.Group; count: number } {
  const trees = scatterWood()
  const group = new THREE.Group()

  // Four species, chosen by the tree's own tint so the same seed always gives
  // the same wood: firs and spruces make up the body of it, pines stand over
  // them, and the broadleaves and birches break up the skyline.
  const kinds = [
    {
      of: (t: Tree) => t.tint < 0.34,
      geometry: firGeometry(),
      tall: 1,
      wide: 2.0,
      // Fir: blue-green through to a tired olive.
      coats: ['#2e4b3d', '#39584180', '#42664a', '#54703f', '#2a4438'],
    },
    {
      of: (t: Tree) => t.tint < 0.62,
      geometry: spruceGeometry(),
      tall: 1.18,
      wide: 1.55,
      coats: ['#24403a', '#2f4d3f', '#3a5a44', '#45613c', '#1f3833'],
    },
    {
      of: (t: Tree) => t.tint < 0.75,
      geometry: pineGeometry(),
      tall: 1.25,
      wide: 1.8,
      coats: ['#3c5540', '#4a6640', '#5b7040', '#6a7a44'],
    },
    {
      of: (t: Tree) => t.tint < 0.9,
      geometry: broadleafGeometry(false),
      tall: 0.72,
      wide: 2.1,
      // Broadleaf: half of them have turned, which is most of the colour in
      // the wood at this time of year.
      coats: ['#6d8a3c', '#89903a', '#b08a33', '#a8632c', '#8f5a30', '#5f7c38'],
    },
    {
      of: () => true,
      geometry: broadleafGeometry(true),
      tall: 0.95,
      wide: 1.35,
      coats: ['#9aa84e', '#c2a94a', '#d2b455', '#b8903c', '#87984a'],
    },
  ]

  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const axis = new THREE.Vector3(0, 1, 0)
  const tint = new THREE.Color()

  kinds.forEach((kind, index) => {
    const mine = trees.filter(
      (tree) => kind.of(tree) && !kinds.slice(0, index).some((earlier) => earlier.of(tree)),
    )
    if (mine.length === 0) return

    const mesh = new THREE.InstancedMesh(
      kind.geometry,
      new THREE.MeshLambertMaterial({ flatShading: true }),
      mine.length,
    )
    const coats = kind.coats.map((hex) => colour(hex.slice(0, 7)))

    mine.forEach((tree, i) => {
      quaternion.setFromAxisAngle(axis, tree.spin)
      position.set(tree.x, tree.y, tree.z)
      const width = tree.spread * kind.wide
      scale.set(width, tree.height * kind.tall, width)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
      // Two sources of variation: a slow noise across the map, so a stand of
      // trees shares a colour the way a real one does, and the tree's own
      // place in its species' range on top of that.
      const stand = fbm(tree.x * 0.018, tree.z * 0.018, 2, index * 31 + 3) * 0.5 + 0.5
      const pick = Math.min(coats.length - 1, Math.floor((stand * 0.7 + tree.tint * 0.3) * coats.length))
      tint.copy(coats[pick]).lerp(coats[(pick + 1) % coats.length], (tree.spin % 1) * 0.45)
      tint.multiplyScalar(0.82 + stand * 0.3)
      mesh.setColorAt(i, tint)
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    group.add(mesh)
  })

  const understory = buildUnderstory()
  group.add(understory)

  return { group, understory, count: trees.length }
}

/* ------------------------------------------------------------- understory */

/**
 * A clump of blades drawn once into a texture and cut out with alpha. Two of
 * them: one tall and thin for the tufts you wade through, one short and wide
 * for the mat underneath. Everything else about the floor is instanced on top
 * of those two.
 */
function grassTexture(tall: boolean, kind: number): THREE.Texture {
  // Four believable kinds: fresh green, olive, sun-bleached straw, and the
  // rust that comes in wherever the ground is poor.
  const hues: Array<[number, number, number]> = [
    [0.62, 1.0, 0.42],
    [0.78, 0.94, 0.36],
    [0.94, 0.88, 0.46],
    [1.0, 0.72, 0.36],
  ]
  const [redward, greenward, blueward] = hues[kind % hues.length]

  const canvas = document.createElement('canvas')
  const size = 256
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, size, size)
    // Flat facets, like everything else in the wood: each blade is two or
    // three straight-sided shapes in one tone, not a painted gradient.
    const blades = tall ? 9 : 13
    for (let i = 0; i < blades; i++) {
      const root = 14 + (i / blades) * (size - 28) + Math.random() * 12
      const height = (tall ? 0.56 : 0.3) * size + Math.random() * size * (tall ? 0.4 : 0.26)
      const lean = (Math.random() - 0.5) * (tall ? 70 : 96)
      const width = (tall ? 11 : 13) + Math.random() * 9
      const value = 108 + Math.random() * 76
      const level = 0.78 + Math.random() * 0.34
      const flat = (shade: number) =>
        `rgb(${Math.round(value * redward * shade)}, ${Math.round(value * greenward * shade)}, ${Math.round(value * blueward * shade)})`

      // The blade: a straight taper with one kink, drawn as two facets so the
      // lit side and the shaded side read separately.
      const midY = size - height * 0.55
      const midX = root + lean * 0.45
      const tipX = root + lean
      const tipY = size - height
      ctx.fillStyle = flat(level)
      ctx.beginPath()
      ctx.moveTo(root - width / 2, size)
      ctx.lineTo(midX - width * 0.28, midY)
      ctx.lineTo(tipX, tipY)
      ctx.lineTo(midX + width * 0.1, midY)
      ctx.lineTo(root, size)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = flat(level * 0.72)
      ctx.beginPath()
      ctx.moveTo(root, size)
      ctx.lineTo(midX + width * 0.1, midY)
      ctx.lineTo(tipX, tipY)
      ctx.lineTo(midX + width * 0.42, midY)
      ctx.lineTo(root + width / 2, size)
      ctx.closePath()
      ctx.fill()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A fern frond: a spine with filled leaflets down both sides. */
function fernTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256)
    for (let f = 0; f < 3; f++) {
      const baseX = 46 + f * 82 + Math.random() * 12
      const height = 180 + Math.random() * 56
      const bend = (Math.random() - 0.5) * 56
      const value = 118 + Math.random() * 54
      const leaflets = 9
      for (let i = 1; i <= leaflets; i++) {
        const t = i / leaflets
        const x = baseX + bend * t * t
        const y = 256 - height * t
        const span = 40 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 7
        const drop = 13 * (1 - t * 0.4)
        for (const side of [-1, 1]) {
          // A leaflet is a flat triangle, which is the same language the
          // trees are drawn in.
          ctx.fillStyle = `rgb(${Math.round(value * (0.44 + t * 0.14))}, ${Math.round(value * (0.82 + t * 0.24) * (side > 0 ? 1 : 0.8))}, ${Math.round(value * 0.4)})`
          ctx.beginPath()
          ctx.moveTo(x, y + drop * 0.3)
          ctx.lineTo(x + side * span, y - drop * 0.2)
          ctx.lineTo(x, y - drop)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.strokeStyle = `rgb(${Math.round(value * 0.46)}, ${Math.round(value * 0.74)}, ${Math.round(value * 0.36)})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(baseX, 256)
      ctx.quadraticCurveTo(baseX + bend * 0.4, 256 - height * 0.6, baseX + bend, 256 - height)
      ctx.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Crossed quads: a tuft that holds up from any angle. */
function tuftGeometry(blades: number): THREE.BufferGeometry {
  const quads: THREE.BufferGeometry[] = []
  for (let i = 0; i < blades; i++) {
    const quad = new THREE.PlaneGeometry(1, 1)
    quad.translate(0, 0.5, 0)
    quad.rotateY((i / blades) * Math.PI)
    quads.push(quad)
  }
  return merge(quads)
}

/** Everything that sways does it off one clock, from the same few lines. */
function windy(material: THREE.Material, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind
    shader.uniforms.uEye = eye
    shader.vertexShader = `uniform float uTime;\nuniform vec3 uEye;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 tuft = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float gust = sin(uTime * 1.3 + tuft.x * 0.21 + tuft.z * 0.17)
                  + sin(uTime * 2.7 + tuft.x * 0.09) * 0.35;
       transformed.x += gust * ${strength.toFixed(2)} * transformed.y;
       transformed.z += gust * ${(strength * 0.55).toFixed(2)} * transformed.y;
       // Anything you are standing on lies down, so a clump never becomes a
       // green wall across the screen.
       float trodden = smoothstep(0.25, 1.15, distance(tuft.xz, uEye.xz));
       transformed *= mix(0.18, 1.0, trodden);`,
    )
  }
}

interface Clump {
  x: number
  z: number
  /** 0 out under closed canopy, 1 in the open. */
  light: number
}

/**
 * Where the floor plants go. Growth is clumped rather than sprinkled: a few
 * thousand patches, each with a handful of plants in it, which is the
 * difference between a lawn and a wood.
 */
function clumps(count: number, reach: number, seed: number, everywhere = false): Clump[] {
  const random = randoms(seed)
  const out: Clump[] = []
  let guard = 0
  while (out.length < count && guard < count * 12) {
    guard++
    const angle = random() * Math.PI * 2
    const radius = 2 + Math.sqrt(random()) * reach
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (inPond(x, z)) continue
    if (onTrail(x, z)) continue
    if (distanceToRoad(x, z) < ROAD.halfWidth + 0.3) continue

    // Thickest in the clearing and along the verge, where the light gets in.
    const open = Math.max(0, 1 - Math.abs(radius - CLEARING - 6) / 46)
    const verge = Math.max(0, 1 - Math.abs(distanceToRoad(x, z) - ROAD.halfWidth - 2) / 7)
    const patchy = fbm(x * 0.05, z * 0.05, 3, 17) * 0.5 + 0.5
    const light = Math.min(1, open * 0.75 + verge * 0.8 + patchy * 0.55)
    // The mat of low stuff grows under closed canopy too; the tall grass and
    // the ferns are choosier, and thin out where the light does.
    if (!everywhere && random() > 0.35 + light * 0.65) continue
    out.push({ x, z, light })
  }
  return out
}

/**
 * The floor of the wood: deep grass you walk through, a mat of shorter stuff
 * under it, ferns in the shade, saplings coming up and deadfall lying about.
 *
 * Everything here is planted into buckets forty metres square rather than one
 * mesh per kind. One mesh covering the whole wood can never be culled — every
 * blade behind you is still transformed each frame — and at this density that
 * is most of the frame's work thrown away.
 */
const CELL = 40

interface Planting {
  x: number
  z: number
  height: number
  width: number
  spin: number
  tint: THREE.Color
}

function bucketOf(
  buckets: Map<string, Planting[]>,
  layer: string,
  kind: number,
  x: number,
  z: number,
): Planting[] {
  const key = `${layer}:${kind}:${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = []
    buckets.set(key, bucket)
  }
  return bucket
}

function plantInto(
  group: THREE.Group,
  buckets: Map<string, Planting[]>,
  layer: string,
  geometry: (kind: number) => THREE.BufferGeometry,
  material: (kind: number) => THREE.Material,
  lift = -0.06,
) {
  const matrix = new THREE.Matrix4()
  const spin = new THREE.Quaternion()
  const axis = new THREE.Vector3(0, 1, 0)
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()

  for (const [key, plants] of buckets) {
    if (!key.startsWith(`${layer}:`) || plants.length === 0) continue
    const kind = Number(key.split(':')[1])
    const mesh = new THREE.InstancedMesh(geometry(kind), material(kind), plants.length)
    plants.forEach((plant, i) => {
      spin.setFromAxisAngle(axis, plant.spin)
      position.set(plant.x, groundAt(plant.x, plant.z) + lift, plant.z)
      scale.set(plant.width, plant.height, plant.width)
      matrix.compose(position, spin, scale)
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, plant.tint)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    group.add(mesh)
  }
}

function buildUnderstory(): THREE.Group {
  const group = new THREE.Group()
  const random = randoms(1201)
  const buckets = new Map<string, Planting[]>()
  const tint = new THREE.Color()

  const sow = (
    layer: string,
    kind: number,
    clump: Clump,
    spread: number,
    height: number,
    colours: [THREE.Color, THREE.Color],
  ) => {
    const x = clump.x + (random() - 0.5) * spread
    const z = clump.z + (random() - 0.5) * spread
    tint.copy(colours[0]).lerp(colours[1], random())
    bucketOf(buckets, layer, kind, x, z).push({
      x,
      z,
      height,
      width: height * (0.7 + random() * 0.5),
      spin: random() * Math.PI,
      tint: tint.clone(),
    })
  }

  // Deep grass, in four kinds. A stand keeps to one kind, so the meadow reads
  // as patches of different growth rather than one mown colour.
  const deepTints: Array<[THREE.Color, THREE.Color]> = [
    [colour('#9cb25c'), colour('#7f9a4c')],
    [colour('#a8b061'), colour('#8d9a4e')],
    [colour('#c6b46c'), colour('#b0a05c')],
    [colour('#b9945a'), colour('#9d8a4e')],
  ]
  // Weighted towards green: dry grass is the exception, not the rule.
  const weighted = [0, 0, 0, 1, 1, 0, 2, 1, 0, 3]
  clumps(2000, 104, 77).forEach((clump, index) => {
    const roll = fbm(clump.x * 0.03, clump.z * 0.03, 2, 61) * 0.5 + 0.5
    const kind = weighted[Math.min(9, Math.floor(roll * 9.4 + (index % 3) * 0.2))]
    const many = 6 + Math.round(random() * 10 * (0.4 + clump.light))
    for (let i = 0; i < many; i++) {
      sow('deep', kind, clump, 2.6, 0.55 + random() * 0.95 * (0.5 + clump.light), deepTints[kind])
    }
  })

  // The mat underneath, which is what stops the ground reading as bare dirt.
  const matTints: [THREE.Color, THREE.Color] = [colour('#79934a'), colour('#98a257')]
  for (const clump of clumps(4600, 112, 211, true)) {
    const many = 6 + Math.round(random() * 5)
    for (let i = 0; i < many; i++) {
      sow('mat', 0, clump, 3.2, 0.22 + random() * 0.3, matTints)
    }
  }

  // Ferns prefer the shade, so they fill in where the grass thins.
  const fernTints: [THREE.Color, THREE.Color] = [colour('#6d8c47'), colour('#4e7038')]
  for (const clump of clumps(1100, 104, 313)) {
    const many = 3 + Math.round(random() * 6 * (1.3 - clump.light))
    for (let i = 0; i < many; i++) {
      sow('fern', 0, clump, 2.2, 0.7 + random() * 0.8, fernTints)
    }
  }

  // Saplings: the wood coming back wherever it is let.
  const saplingTints: [THREE.Color, THREE.Color] = [colour('#3f6150'), colour('#5f7442')]
  for (const clump of clumps(650, 112, 409)) {
    // Not in the clearing: the ground around the tower is kept open.
    if (Math.hypot(clump.x, clump.z) < CLEARING + 9) continue
    const many = 1 + Math.round(random() * 2)
    for (let i = 0; i < many; i++) {
      sow('sapling', 0, clump, 4, 1.1 + random() * 2.4, saplingTints)
    }
  }

  const deepMaterials = [0, 1, 2, 3].map((kind) => {
    const material = new THREE.MeshLambertMaterial({
      map: grassTexture(true, kind),
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    })
    windy(material, 0.24)
    return material
  })
  const matMaterial = new THREE.MeshLambertMaterial({
    map: grassTexture(false, 1),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  })
  windy(matMaterial, 0.1)
  const fernMaterial = new THREE.MeshLambertMaterial({
    map: fernTexture(),
    alphaTest: 0.35,
    side: THREE.DoubleSide,
  })
  windy(fernMaterial, 0.12)
  const saplingMaterial = new THREE.MeshLambertMaterial({ flatShading: true })

  const tuft3 = tuftGeometry(3)
  const tuft2 = tuftGeometry(2)
  const fir = firGeometry()
  plantInto(group, buckets, 'mat', () => tuft2, () => matMaterial)
  plantInto(group, buckets, 'deep', () => tuft2, (kind) => deepMaterials[kind])
  plantInto(group, buckets, 'fern', () => tuft3, () => fernMaterial)
  plantInto(group, buckets, 'sapling', () => fir, () => saplingMaterial, 0)

  // Deadfall, which is the other thing a wood has that a plantation does not.
  const fallenCount = 150
  const trunk = new THREE.CylinderGeometry(0.26, 0.34, 1, 7)
  trunk.rotateZ(Math.PI / 2)
  const fallen = new THREE.InstancedMesh(
    trunk,
    new THREE.MeshLambertMaterial({ color: colour('#4b3b2c'), flatShading: true }),
    fallenCount,
  )
  const matrix = new THREE.Matrix4()
  const spin = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  let fallenPlaced = 0
  while (fallenPlaced < fallenCount) {
    const angle = random() * Math.PI * 2
    const radius = 14 + random() * 110
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (inPond(x, z, 2) || onTrail(x, z) || distanceToRoad(x, z) < ROAD.clear) continue
    euler.set((random() - 0.5) * 0.25, random() * Math.PI * 2, (random() - 0.5) * 0.2)
    spin.setFromEuler(euler)
    position.set(x, groundAt(x, z) + 0.26, z)
    const length = 3 + random() * 6
    scale.set(length, 0.75 + random() * 0.5, 0.75 + random() * 0.5)
    matrix.compose(position, spin, scale)
    fallen.setMatrixAt(fallenPlaced, matrix)
    fallenPlaced++
  }
  fallen.instanceMatrix.needsUpdate = true
  fallen.computeBoundingSphere()
  group.add(fallen)

  return group
}

/* ------------------------------------------------------------- the big fir */

function buildHeroTree(): THREE.Group {
  const group = new THREE.Group()
  const bark = new THREE.MeshLambertMaterial({ color: colour(PALETTE.bark), flatShading: true })

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(TRUNK.top, TRUNK.base, TRUNK.height, 11, 4),
    bark,
  )
  trunk.position.set(TRUNK.x, TRUNK.height / 2, TRUNK.z)
  group.add(trunk)

  // Roots, so the trunk meets the litter rather than stopping at it.
  const random = randoms(4)
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + random() * 0.4
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.6, 5), bark)
    root.position.set(Math.cos(angle) * TRUNK.base * 0.9, 0.5, Math.sin(angle) * TRUNK.base * 0.9)
    root.rotation.set(Math.PI / 2.1, 0, -angle + Math.PI / 2)
    group.add(root)
  }

  // Branches over the deck, and the canopy above them.
  const canopyMaterial = new THREE.MeshLambertMaterial({
    color: colour('#2b4034'),
    flatShading: true,
  })
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2 + 0.3
    const length = 3.4 + random() * 2.4
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, length, 5), bark)
    const y = 23.0 + i * 1.15
    branch.position.set((Math.cos(angle) * length) / 2.6, y, (Math.sin(angle) * length) / 2.6)
    branch.rotation.z = Math.cos(angle) * -0.9
    branch.rotation.x = Math.sin(angle) * 0.9
    group.add(branch)
  }
  const tiers = [
    { y: 23.5, r: 7.2, h: 6.0 },
    { y: 27.2, r: 5.8, h: 5.4 },
    { y: 30.6, r: 4.4, h: 5.0 },
    { y: 33.6, r: 2.9, h: 4.6 },
  ]
  tiers.forEach((tier) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(tier.r, tier.h, 9), canopyMaterial)
    cone.position.set(TRUNK.x, tier.y + tier.h / 2, TRUNK.z)
    group.add(cone)
  })

  return group
}

/* -------------------------------------------------------------- clearing */

export interface Clearing {
  group: THREE.Group
  embers: THREE.PointLight
}

/**
 * What is lying about under the tree: deadfall, stones, a stacked cord of
 * firewood and a ring somebody has had a fire in. None of it does anything.
 * All of it is the difference between a clearing and a flat circle.
 */
function buildClearing(): Clearing {
  const group = new THREE.Group()
  const bark = new THREE.MeshLambertMaterial({ color: colour(PALETTE.bark), flatShading: true })
  const stone = new THREE.MeshLambertMaterial({ color: colour('#7b7264'), flatShading: true })
  const random = randoms(31)

  const clear = (x: number, z: number) => Math.abs(x) > 4 || z < CLEARING - 4 || z > 64

  for (let i = 0; i < 7; i++) {
    const angle = random() * Math.PI * 2
    const radius = 7 + random() * 26
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (!clear(x, z)) continue
    const length = 3 + random() * 4
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, length, 7), bark)
    log.rotation.set(Math.PI / 2, random() * Math.PI, random() * 0.3 - 0.15)
    log.position.set(x, groundAt(x, z) + 0.3, z)
    group.add(log)
  }

  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2
    const radius = 5 + random() * 30
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (!clear(x, z)) continue
    const size = 0.25 + random() * 0.6
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), stone)
    rock.rotation.set(random() * 3, random() * 3, random() * 3)
    rock.scale.y = 0.6 + random() * 0.4
    rock.position.set(x, groundAt(x, z) + size * 0.3, z)
    group.add(rock)
  }

  // A cord of firewood stacked against the tree, for the stove up top.
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      const billet = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 6), bark)
      billet.rotation.z = Math.PI / 2
      billet.position.set(-2.9 + (row % 2) * 0.1, 0.16 + row * 0.28, -1.6 + i * 0.3)
      group.add(billet)
    }
  }

  // The fire ring, still warm.
  const ringAt = { x: 6.2, z: 7.4 }
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2
    const size = 0.2 + random() * 0.16
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), stone)
    rock.position.set(
      ringAt.x + Math.cos(angle) * 1.05,
      groundAt(ringAt.x, ringAt.z) + size * 0.5,
      ringAt.z + Math.sin(angle) * 1.05,
    )
    rock.rotation.set(random() * 3, random() * 3, random() * 3)
    group.add(rock)
  }
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + 0.4
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 5), bark)
    stick.position.set(ringAt.x + Math.cos(angle) * 0.3, groundAt(ringAt.x, ringAt.z) + 0.28, ringAt.z + Math.sin(angle) * 0.3)
    stick.rotation.set(Math.PI / 2.4, angle, 0)
    group.add(stick)
  }
  const embers = new THREE.PointLight(colour('#ff7a3a'), 6, 9, 2)
  embers.position.set(ringAt.x, groundAt(ringAt.x, ringAt.z) + 0.3, ringAt.z)
  group.add(embers)

  return { group, embers }
}

/* ------------------------------------------------------------------ smoke */

function puffTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface Column {
  group: THREE.Group
  puffs: THREE.Sprite[]
}

/** The reason you are up the tree: a column of white smoke on the far ridge. */
function buildSmoke(): Column {
  const group = new THREE.Group()
  const at = bearingToPoint(SMOKE.bearing, SMOKE.distance)
  group.position.set(at.x, 84, at.z)

  const material = new THREE.SpriteMaterial({
    map: puffTexture(),
    color: colour(PALETTE.smoke),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    fog: false,
  })

  const puffs: THREE.Sprite[] = []
  for (let i = 0; i < 36; i++) {
    const sprite = new THREE.Sprite(material.clone())
    puffs.push(sprite)
    group.add(sprite)
  }
  return { group, puffs }
}

/* ------------------------------------------------------------------ motes */

function buildMotes(): THREE.Points {
  const count = 420
  const positions = new Float32Array(count * 3)
  const random = randoms(55)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 120
    positions[i * 3 + 1] = random() * 16 + 0.4
    positions[i * 3 + 2] = (random() - 0.5) * 120
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: colour('#ffcf94'),
    size: 0.085,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return points
}

/* ------------------------------------------------------------------ world */

export interface World {
  finder: THREE.Group
  /** How far from the player the undergrowth is drawn, in metres. */
  setFoliageRange(metres: number): void
  update(elapsed: number, dt: number, watcher: THREE.Vector3): void
}

export function buildWorld(scene: THREE.Scene): World {
  scene.background = null
  scene.fog = new THREE.FogExp2(colour(PALETTE.fog).getHex(), 0.0042)

  scene.add(buildSky())
  scene.add(buildRidges())
  scene.add(buildGround())
  scene.add(buildRoad())
  scene.add(buildTrail())
  const wood = buildWood()
  scene.add(wood.group)
  scene.add(buildHeroTree())

  const clearing = buildClearing()
  scene.add(clearing.group)

  const tower = buildTower()
  scene.add(tower.group)

  const town = buildTown()
  scene.add(town.group)

  const props = buildProps()
  scene.add(props.group)

  const wildlife = buildWildlife(wind)
  scene.add(wildlife.group)

  const smoke = buildSmoke()
  scene.add(smoke.group)

  const motes = buildMotes()
  scene.add(motes)

  const sun = new THREE.DirectionalLight(colour('#ffb070'), 2.4)
  sun.position.copy(sunDirection().multiplyScalar(200))
  scene.add(sun)
  // The sky is the main light down here: the sun is nearly on the horizon and
  // barely touches the floor of a wood at all.
  scene.add(new THREE.HemisphereLight(colour('#98868c'), colour('#6a6042'), 1.5))
  scene.add(new THREE.AmbientLight(colour('#7a6258'), 0.55))

  const motePositions = motes.geometry.attributes.position as THREE.BufferAttribute
  const moteBase = Float32Array.from(motePositions.array)

  // The understory is bucketed by cell, so it can be dropped by distance when
  // the picture setting asks for less of it.
  let foliageRange = Infinity
  const planted: Array<{ mesh: THREE.Object3D; at: THREE.Vector3 }> = []
  wood.understory.children.forEach((mesh) => {
    const sphere = (mesh as THREE.Mesh).geometry?.boundingSphere
    const at = new THREE.Vector3()
    if (mesh instanceof THREE.InstancedMesh) {
      mesh.computeBoundingSphere()
      at.copy(mesh.boundingSphere?.center ?? sphere?.center ?? at)
    }
    planted.push({ mesh, at })
  })

  return {
    finder: tower.finder,
    setFoliageRange(metres) {
      foliageRange = metres
      planted.forEach(({ mesh }) => {
        mesh.visible = true
      })
    },
    update(elapsed, dt, watcher) {
      wind.value = elapsed
      eye.value.copy(watcher)

      if (foliageRange !== Infinity) {
        // A cell is forty metres across, so its own size is allowed for.
        const reach = foliageRange + 30
        planted.forEach(({ mesh, at }) => {
          mesh.visible = Math.hypot(at.x - watcher.x, at.z - watcher.z) < reach
        })
      }
      props.update(elapsed)
      wildlife.update(elapsed, dt, watcher)

      // The brazier breathes rather than blinks.
      const flicker = 1 + Math.sin(elapsed * 9.3) * 0.06 + Math.sin(elapsed * 21.7) * 0.04
      tower.brazier.intensity = 30 * flicker
      tower.coals.scale.set(flicker, 0.4 * flicker, flicker)
      clearing.embers.intensity = 5 + Math.sin(elapsed * 2.1) * 1.4 + Math.sin(elapsed * 5.7) * 0.8

      // The pennant never quite settles.
      tower.pennant.rotation.y = Math.sin(elapsed * 1.1) * 0.22 + 0.2
      tower.pennant.rotation.z = Math.sin(elapsed * 2.3) * 0.06

      town.update(elapsed)

      // The column leans east with the wind and slowly boils upwards.
      smoke.puffs.forEach((puff, i) => {
        const t = (elapsed * 0.035 + i / smoke.puffs.length) % 1
        const lean = t * t
        puff.position.set(lean * 150 + Math.sin(t * 7 + i) * 9, t * 330, Math.cos(t * 5 + i) * 12)
        const size = 16 + lean * 165
        puff.scale.set(size, size, 1)
        // Thin where it leaves the trees, thinning again as it spreads out.
        ;(puff.material as THREE.SpriteMaterial).opacity = 0.72 * Math.min(1, Math.sin(Math.PI * Math.min(1, t * 1.35)) * 1.5)
      })

      for (let i = 0; i < motePositions.count; i++) {
        const drift = Math.sin(elapsed * 0.3 + i) * 0.5
        motePositions.setX(i, moteBase[i * 3] + drift)
        motePositions.setY(i, moteBase[i * 3 + 1] + Math.sin(elapsed * 0.5 + i * 1.7) * 0.35)
      }
      motePositions.needsUpdate = true
    },
  }
}
