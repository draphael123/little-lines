/**
 * The sword in your left hand, and how it moves.
 *
 * The blade is parented to the camera, so everything here is in view space:
 * a handful of poses and the easing between them, read off the fighter's
 * stance. No decisions are made here — `combat.ts` owns those.
 */
import * as THREE from 'three'
import { DODGE, HEAVY, LIGHT, type Fighter, through } from './combat'

const colour = (hex: string) => new THREE.Color(hex)

export interface Sword {
  group: THREE.Group
  pose(fighter: Fighter, elapsed: number, walking: number, dt: number): void
}

interface Pose {
  x: number
  y: number
  z: number
  pitch: number
  yaw: number
  roll: number
}

const REST: Pose = { x: -0.33, y: -0.27, z: -0.58, pitch: 0.24, yaw: 0.6, roll: -0.72 }
const GUARD: Pose = { x: -0.12, y: -0.06, z: -0.5, pitch: -0.05, yaw: 0.95, roll: -1.4 }

const mix = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
const ease = (t: number) => t * t * (3 - 2 * t)

function blend(from: Pose, to: Pose, t: number): Pose {
  return {
    x: mix(from.x, to.x, t),
    y: mix(from.y, to.y, t),
    z: mix(from.z, to.z, t),
    pitch: mix(from.pitch, to.pitch, t),
    yaw: mix(from.yaw, to.yaw, t),
    roll: mix(from.roll, to.roll, t),
  }
}

/* --------------------------------------------------------------- geometry */

export function buildSword(): Sword {
  const group = new THREE.Group()
  // A sword held half a metre from the eye in a sixty-degree view fills the
  // screen. Viewmodels are always smaller than life; this one is about half.
  group.scale.setScalar(0.5)

  const steel = new THREE.MeshPhongMaterial({
    color: colour('#b9c0c8'),
    specular: colour('#ffd9a8'),
    shininess: 90,
    flatShading: true,
  })
  const brass = new THREE.MeshPhongMaterial({
    color: colour('#b08a3c'),
    specular: colour('#ffe0a0'),
    shininess: 70,
    flatShading: true,
  })
  const leather = new THREE.MeshLambertMaterial({ color: colour('#4a3326'), flatShading: true })
  const glove = new THREE.MeshLambertMaterial({ color: colour('#6b543c'), flatShading: true })
  const mail = new THREE.MeshPhongMaterial({
    color: colour('#6c6f76'),
    specular: colour('#cfd6dd'),
    shininess: 40,
    flatShading: true,
  })

  // A four-sided taper is a diamond cross-section blade for eight triangles.
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.94, 4), steel)
  blade.scale.set(1, 1, 0.3)
  blade.position.y = 0.62
  group.add(blade)

  const ricasso = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.016), steel)
  ricasso.position.y = 0.19
  group.add(ricasso)

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.032, 0.05), brass)
  guard.position.y = 0.15
  group.add(guard)
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.026), brass)
    tip.position.set(side * 0.13, 0.15, 0)
    group.add(tip)
  }

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.17, 7), leather)
  grip.position.y = 0.06
  group.add(grip)
  for (let i = 0; i < 4; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.004, 4, 8), leather)
    wrap.rotation.x = Math.PI / 2
    wrap.position.y = 0.015 + i * 0.04
    group.add(wrap)
  }

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.036), brass)
  pommel.position.y = -0.035
  group.add(pommel)

  // The hand that is holding it, which is most of what sells a viewmodel.
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, 0.095), glove)
  fist.position.set(0, 0.055, 0.005)
  group.add(fist)
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.085), glove)
    finger.position.set(0.03, 0.095 - i * 0.028, 0.01)
    finger.rotation.z = -0.12
    group.add(finger)
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.03), glove)
  thumb.position.set(-0.028, 0.08, 0.03)
  thumb.rotation.z = 0.5
  group.add(thumb)

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.055, 0.1, 8), mail)
  cuff.position.set(0.005, -0.03, 0.035)
  cuff.rotation.x = -0.5
  group.add(cuff)
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.28, 8), leather)
  forearm.position.set(0.01, -0.15, 0.12)
  forearm.rotation.x = -0.55
  group.add(forearm)

  group.traverse((part) => {
    part.frustumCulled = false
    part.renderOrder = 2
  })

  /* ------------------------------------------------------------ the poses */

  const current: Pose = { ...REST }

  function pose(fighter: Fighter, elapsed: number, walking: number, dt: number) {
    const t = through(fighter)
    let wanted: Pose = REST
    let snap = 12 // How fast the blade gets where it is going.

    if (fighter.stance === 'block') {
      wanted = GUARD
      snap = 22
    } else if (fighter.stance === 'light') {
      // Up and back, then a fast diagonal cut across to the low right.
      const total = LIGHT.windUp + LIGHT.open + LIGHT.recover
      const wind = LIGHT.windUp / total
      const cut = (LIGHT.windUp + LIGHT.open) / total
      if (t < wind) {
        wanted = blend(REST, { x: -0.4, y: 0.02, z: -0.48, pitch: -0.45, yaw: 0.15, roll: 0.45 }, ease(t / wind))
      } else if (t < cut) {
        wanted = blend(
          { x: -0.4, y: 0.02, z: -0.48, pitch: -0.45, yaw: 0.15, roll: 0.45 },
          { x: 0.24, y: -0.22, z: -0.52, pitch: 0.5, yaw: 0.85, roll: -1.5 },
          ease((t - wind) / (cut - wind)),
        )
        snap = 40
      } else {
        wanted = blend(
          { x: 0.24, y: -0.22, z: -0.52, pitch: 0.5, yaw: 0.85, roll: -1.5 },
          REST,
          ease((t - cut) / (1 - cut)),
        )
      }
    } else if (fighter.stance === 'heavy') {
      // Over the shoulder, held, then down through the middle.
      const total = HEAVY.windUp + HEAVY.open + HEAVY.recover
      const wind = HEAVY.windUp / total
      const cut = (HEAVY.windUp + HEAVY.open) / total
      if (t < wind) {
        wanted = blend(REST, { x: -0.46, y: 0.08, z: -0.38, pitch: -1.05, yaw: -0.2, roll: 0.8 }, ease(t / wind))
      } else if (t < cut) {
        wanted = blend(
          { x: -0.46, y: 0.08, z: -0.38, pitch: -1.05, yaw: -0.2, roll: 0.8 },
          { x: 0.02, y: -0.3, z: -0.6, pitch: 1.0, yaw: 0.25, roll: -0.35 },
          ease((t - wind) / (cut - wind)),
        )
        snap = 46
      } else {
        wanted = blend(
          { x: 0.02, y: -0.3, z: -0.6, pitch: 1.0, yaw: 0.25, roll: -0.35 },
          REST,
          ease((t - cut) / (1 - cut)),
        )
      }
    } else if (fighter.stance === 'dodge') {
      const roll = Math.sin(Math.PI * (fighter.since / DODGE.seconds))
      wanted = blend(REST, { x: -0.38, y: -0.44, z: -0.4, pitch: 0.8, yaw: 0.2, roll: 0.3 }, roll)
      snap = 26
    } else if (fighter.stance === 'stagger') {
      const shake = Math.sin(fighter.since * 40) * 0.06 * (1 - t)
      wanted = { x: REST.x - 0.1 + shake, y: REST.y - 0.16, z: REST.z + 0.06, pitch: 0.9, yaw: 0.1, roll: 0.4 }
      snap = 16
    }

    // Breathing, and the swing of a walk, so the blade is never quite still.
    const breath = Math.sin(elapsed * 1.3) * 0.006
    const sway = Math.sin(elapsed * 6.2) * 0.012 * walking
    const bob = Math.abs(Math.cos(elapsed * 6.2)) * 0.014 * walking

    const k = Math.min(1, dt * snap)
    current.x = mix(current.x, wanted.x, k)
    current.y = mix(current.y, wanted.y, k)
    current.z = mix(current.z, wanted.z, k)
    current.pitch = mix(current.pitch, wanted.pitch, k)
    current.yaw = mix(current.yaw, wanted.yaw, k)
    current.roll = mix(current.roll, wanted.roll, k)

    group.position.set(current.x + sway, current.y + breath - bob, current.z)
    group.rotation.set(current.pitch, current.yaw, current.roll)
  }

  return { group, pose }
}
