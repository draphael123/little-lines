/**
 * The town in the valley, four hundred metres out and only ever seen from
 * the top of the tower.
 *
 * At that distance the fog would swallow anything drawn normally, so the
 * town ignores the fog and carries its haze in flat colour instead: a
 * silhouette a shade darker than the ridge behind it, with lit windows and
 * a few chimneys going. It is scenery, and it is built like scenery.
 */
import * as THREE from 'three'
import { randoms } from './noise'
import { TOWN, bearingToPoint } from './lookout'

const colour = (hex: string) => new THREE.Color(hex)

const TOWN_PALETTE = {
  hill: '#54404c',
  wall: '#4a3746',
  house: '#413044',
  roof: '#33253a',
  keep: '#463447',
  window: '#ffcd86',
  smoke: '#c9a9a0',
}

export interface Town {
  group: THREE.Group
  update(elapsed: number): void
}

function flat(hex: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: colour(hex), fog: false })
}

function smokeTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31)
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function buildTown(): Town {
  const group = new THREE.Group()
  const at = bearingToPoint(TOWN.bearing, TOWN.distance)
  group.position.set(at.x, -4, at.z)
  // Face the town's gate back towards the tower.
  group.rotation.y = Math.atan2(-at.x, -at.z)
  group.scale.setScalar(1.55)

  const random = randoms(77)
  const materials = {
    hill: flat(TOWN_PALETTE.hill),
    wall: flat(TOWN_PALETTE.wall),
    house: flat(TOWN_PALETTE.house),
    roof: flat(TOWN_PALETTE.roof),
    keep: flat(TOWN_PALETTE.keep),
    window: flat(TOWN_PALETTE.window),
  }

  // The ground it stands on, since the forest floor stops long before here.
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(78, 96, 12, 24), materials.hill)
  hill.position.y = 0
  group.add(hill)

  const windows: THREE.Mesh[] = []
  const litWindow = (x: number, y: number, z: number, w = 0.95, h = 1.25) => {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), materials.window)
    pane.position.set(x, y, z)
    windows.push(pane)
    group.add(pane)
  }

  // Houses, crowded along streets that run back from the gate.
  for (let row = 0; row < 7; row++) {
    for (let i = 0; i < 9; i++) {
      if (random() < 0.18) continue
      const x = -34 + i * 8.2 + (random() - 0.5) * 2.4
      const z = 30 - row * 9 + (random() - 0.5) * 2.6
      if (Math.hypot(x, z) > 46) continue
      const w = 5 + random() * 3.5
      const d = 5 + random() * 3.5
      const h = 5 + random() * 4.5
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.house)
      body.position.set(x, 6 + h / 2, z)
      body.rotation.y = (random() - 0.5) * 0.3
      group.add(body)

      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 3.4 + random() * 2, 4), materials.roof)
      roof.position.set(x, 6 + h + 1.8, z)
      roof.rotation.y = body.rotation.y + Math.PI / 4
      group.add(roof)

      if (random() < 0.85) litWindow(x + (random() - 0.5) * 2, 6 + h * 0.55, z + d / 2 + 0.06)
    }
  }

  // The wall, with round towers on it, open where the road comes in.
  const segments = 26
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    if (Math.abs(angle - Math.PI / 2) < 0.22) continue
    const radius = 52
    const wall = new THREE.Mesh(new THREE.BoxGeometry(13.4, 11, 3), materials.wall)
    wall.position.set(Math.sin(angle) * radius, 10, Math.cos(angle) * radius)
    wall.rotation.y = angle
    group.add(wall)
    if (i % 5 === 0) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4, 17, 9), materials.wall)
      tower.position.set(Math.sin(angle) * radius, 13, Math.cos(angle) * radius)
      group.add(tower)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(4.4, 5.4, 9), materials.roof)
      cap.position.set(Math.sin(angle) * radius, 24, Math.cos(angle) * radius)
      group.add(cap)
    }
  }

  // The keep, on the high side, and the cathedral beside it.
  const keep = new THREE.Mesh(new THREE.BoxGeometry(15, 30, 15), materials.keep)
  keep.position.set(-14, 21, -26)
  group.add(keep)
  for (const [cx, cz] of [
    [-7.5, -7.5],
    [7.5, -7.5],
    [-7.5, 7.5],
    [7.5, 7.5],
  ]) {
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 36, 8), materials.keep)
    turret.position.set(-14 + cx, 24, -26 + cz)
    group.add(turret)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6.5, 8), materials.roof)
    cap.position.set(-14 + cx, 45, -26 + cz)
    group.add(cap)
  }
  litWindow(-14, 30, -18.6, 1.1, 1.7)
  litWindow(-18, 24, -18.6, 0.9, 1.4)

  const nave = new THREE.Mesh(new THREE.BoxGeometry(11, 16, 26), materials.house)
  nave.position.set(16, 14, -14)
  group.add(nave)
  const naveRoof = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 27), materials.roof)
  naveRoof.position.set(16, 23.5, -14)
  group.add(naveRoof)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.4, 26, 6), materials.roof)
  spire.position.set(16, 36, -3)
  group.add(spire)
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(8, 18, 8), materials.house)
  belfry.position.set(16, 15, -3)
  group.add(belfry)
  litWindow(16, 20, 1.1, 1.2, 2.2)

  // Chimney smoke: three slow columns, which is what makes it look inhabited.
  const puffMap = smokeTexture()
  const columns: THREE.Sprite[][] = []
  for (let c = 0; c < 3; c++) {
    const base = { x: -20 + c * 18 + random() * 6, z: 4 - c * 12 }
    const column: THREE.Sprite[] = []
    for (let i = 0; i < 7; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: puffMap,
          color: colour(TOWN_PALETTE.smoke),
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          fog: false,
        }),
      )
      sprite.position.set(base.x, 16, base.z)
      column.push(sprite)
      group.add(sprite)
    }
    columns.push(column)
  }

  return {
    group,
    update(elapsed) {
      columns.forEach((column, c) => {
        column.forEach((puff, i) => {
          const t = (elapsed * 0.03 + i / column.length + c * 0.11) % 1
          const base = puff.userData.base ?? (puff.userData.base = puff.position.clone())
          puff.position.set(base.x + t * 26, 14 + t * 40, base.z + t * 6)
          const size = 5 + t * 26
          puff.scale.set(size, size, 1)
          ;(puff.material as THREE.SpriteMaterial).opacity = 0.42 * Math.sin(Math.PI * t)
        })
      })
      // A window or two goes out, and comes back.
      windows.forEach((pane, i) => {
        const flicker = Math.sin(elapsed * 0.7 + i * 2.3) > 0.985 ? 0 : 1
        pane.visible = flicker === 1
        pane.lookAt(0, pane.position.y, 400)
      })
    },
  }
}
