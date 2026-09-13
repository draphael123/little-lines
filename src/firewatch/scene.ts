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
import {
  CLEARING,
  ROAD,
  SMOKE,
  TRUNK,
  bearingToPoint,
  distanceToRoad,
  groundAt,
  roadPoint,
  scatterWood,
} from './lookout'
import { buildTower } from './tower'
import { buildTown } from './town'

/* ---------------------------------------------------------------- palette */

export const PALETTE = {
  zenith: '#2b2f5c',
  midSky: '#8e4a63',
  horizon: '#eb9350',
  coolHorizon: '#6b4a76',
  sunGlow: '#ffd79a',
  fog: '#835650',
  ground: '#7f8451',
  groundWarm: '#94794e',
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

function buildGround(): THREE.Mesh {
  const size = 620
  const segments = 150
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

    // Bare earth shows through in the clearing, where the needles get walked off.
    const bare = Math.max(0, 1 - Math.hypot(x, z) / 22)
    shade.lerp(trail, bare * 0.35)

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
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
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
  const steps = 160
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = ROAD.from + ((ROAD.to - ROAD.from) * i) / steps
    const here = roadPoint(t)
    const ahead = roadPoint(t + 1)
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
 * One stylised conifer, a unit high and a unit across: three skirts over a
 * bare stem, which is as much tree as a silhouette at dusk ever needs.
 */
function coniferGeometry(): THREE.BufferGeometry {
  const tiers = [
    { y: 0.3, r: 0.5, h: 0.34 },
    { y: 0.52, r: 0.4, h: 0.3 },
    { y: 0.72, r: 0.27, h: 0.28 },
  ]
  const parts: THREE.BufferGeometry[] = tiers.map((tier) => {
    const cone = new THREE.ConeGeometry(tier.r, tier.h, 6)
    cone.translate(0, tier.y + tier.h / 2, 0)
    return cone
  })
  const stem = new THREE.CylinderGeometry(0.035, 0.055, 0.34, 5)
  stem.translate(0, 0.17, 0)
  parts.push(stem)
  return merge(parts)
}

function buildWood(): { group: THREE.Group; count: number } {
  const trees = scatterWood()
  const group = new THREE.Group()

  const canopy = new THREE.InstancedMesh(
    coniferGeometry(),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    trees.length,
  )

  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const needles = colour(PALETTE.needles)
  const olive = colour(PALETTE.needlesOlive)
  const tint = new THREE.Color()

  trees.forEach((tree, i) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.spin)

    position.set(tree.x, tree.y, tree.z)
    scale.set(tree.spread * 2, tree.height, tree.spread * 2)
    matrix.compose(position, quaternion, scale)
    canopy.setMatrixAt(i, matrix)
    tint.copy(needles).lerp(olive, tree.tint * 0.9)
    tint.multiplyScalar(0.82 + tree.tint * 0.35)
    canopy.setColorAt(i, tint)
  })

  canopy.instanceMatrix.needsUpdate = true
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true
  group.add(canopy)

  group.add(buildGrass())

  return { group, count: trees.length }
}

/* ------------------------------------------------------------------ grass */

/** One clump of blades, drawn once into a texture and cut out with alpha. */
function grassTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128)
    const blades = 11
    for (let i = 0; i < blades; i++) {
      const root = 12 + (i / blades) * 104 + Math.random() * 6
      const height = 52 + Math.random() * 66
      const lean = (Math.random() - 0.5) * 46
      const width = 3 + Math.random() * 3.4
      const green = 120 + Math.random() * 66
      ctx.fillStyle = `rgb(${Math.round(green * 0.62)}, ${Math.round(green)}, ${Math.round(green * 0.42)})`
      ctx.beginPath()
      ctx.moveTo(root - width / 2, 128)
      ctx.quadraticCurveTo(root - width * 0.2 + lean * 0.4, 128 - height * 0.6, root + lean, 128 - height)
      ctx.quadraticCurveTo(root + width * 0.8 + lean * 0.4, 128 - height * 0.6, root + width / 2, 128)
      ctx.closePath()
      ctx.fill()
      // A lighter edge down one side of each blade catches the last light.
      ctx.strokeStyle = `rgba(${Math.round(green * 0.9)}, ${Math.round(green * 1.25)}, ${Math.round(green * 0.6)}, 0.75)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(root, 128)
      ctx.quadraticCurveTo(root + lean * 0.4, 128 - height * 0.6, root + lean, 128 - height)
      ctx.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Three quads crossed through each other: a tuft from any angle. */
function tuftGeometry(): THREE.BufferGeometry {
  const quads: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const quad = new THREE.PlaneGeometry(1, 1)
    quad.translate(0, 0.5, 0)
    quad.rotateY((i / 3) * Math.PI)
    quads.push(quad)
  }
  return merge(quads)
}

/**
 * Grass, in the clearing and along the road where the light gets in. It is
 * alpha-cut rather than transparent, so it needs no sorting, and it leans in
 * the wind from the vertex shader rather than from the CPU.
 */
function buildGrass(): THREE.InstancedMesh {
  const material = new THREE.MeshLambertMaterial({
    map: grassTexture(),
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    flatShading: false,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 tuft = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float gust = sin(uTime * 1.3 + tuft.x * 0.21 + tuft.z * 0.17)
                  + sin(uTime * 2.7 + tuft.x * 0.09) * 0.35;
       transformed.x += gust * 0.22 * transformed.y;
       transformed.z += gust * 0.12 * transformed.y;`,
    )
  }

  const count = 9000
  const mesh = new THREE.InstancedMesh(tuftGeometry(), material, count)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const axis = new THREE.Vector3(0, 1, 0)
  const random = randoms(99)
  const blade = colour('#89995a')
  const dry = colour('#b4a565')
  const tint = new THREE.Color()

  let placed = 0
  let guard = 0
  while (placed < count && guard < count * 8) {
    guard++
    const angle = random() * Math.PI * 2
    const radius = 3 + Math.sqrt(random()) * 120
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    // Thickest in the clearing and on the verge, thin under closed canopy.
    const open = Math.max(0, 1 - Math.abs(radius - CLEARING) / 34)
    const verge = Math.max(0, 1 - Math.abs(distanceToRoad(x, z) - ROAD.halfWidth - 1.4) / 6)
    if (random() > 0.16 + open * 0.8 + verge * 0.85) continue
    if (distanceToRoad(x, z) < ROAD.halfWidth) continue

    quaternion.setFromAxisAngle(axis, random() * Math.PI)
    position.set(x, groundAt(x, z) - 0.05, z)
    const s = 0.5 + random() * 0.75
    scale.set(s, s * (0.8 + random() * 0.9), s)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(placed, matrix)
    tint.copy(blade).lerp(dry, random() * 0.8)
    mesh.setColorAt(placed, tint)
    placed++
  }
  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  return mesh
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
  for (let i = 0; i < 26; i++) {
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
  update(elapsed: number, dt: number): void
}

export function buildWorld(scene: THREE.Scene): World {
  scene.background = null
  scene.fog = new THREE.FogExp2(colour(PALETTE.fog).getHex(), 0.0042)

  scene.add(buildSky())
  scene.add(buildRidges())
  scene.add(buildGround())
  scene.add(buildRoad())
  scene.add(buildTrail())
  scene.add(buildWood().group)
  scene.add(buildHeroTree())

  const clearing = buildClearing()
  scene.add(clearing.group)

  const tower = buildTower()
  scene.add(tower.group)

  const town = buildTown()
  scene.add(town.group)

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

  return {
    finder: tower.finder,
    update(elapsed) {
      wind.value = elapsed

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
        const size = 26 + lean * 240
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
