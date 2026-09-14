/**
 * The training post in the clearing: a shield on one end of a crossbar and a
 * sandbag on the other.
 *
 * It is here so the sword has something to mean. Hit the shield and the bar
 * spins; the bag comes round behind it, and if you are still standing there
 * when it arrives you get it across the shoulders. Block it and it costs you
 * stamina, roll and it misses.
 */
import * as THREE from 'three'
import { takeHit, type Fighter } from './combat'
import { LANDMARKS, groundAt } from './lookout'

const colour = (hex: string) => new THREE.Color(hex)

export interface Quintain {
  group: THREE.Group
  /** Where the shield is now, in world space. */
  shield: THREE.Vector3
  /** The blade connected: set it spinning. */
  strike(damage: number): void
  update(dt: number, watcher: THREE.Vector3, fighter: Fighter): 'missed' | 'blocked' | 'hurt' | null
}

export function buildQuintain(): Quintain {
  const at = LANDMARKS.quintain
  const ground = groundAt(at.x, at.z)
  const group = new THREE.Group()
  group.position.set(at.x, ground, at.z)

  const timber = new THREE.MeshLambertMaterial({ color: colour('#6b4f36'), flatShading: true })
  const board = new THREE.MeshLambertMaterial({ color: colour('#8a6a47'), flatShading: true })
  const iron = new THREE.MeshLambertMaterial({ color: colour('#3c3936'), flatShading: true })
  const sack = new THREE.MeshLambertMaterial({ color: colour('#7b6a4a'), flatShading: true })
  const stone = new THREE.MeshLambertMaterial({ color: colour('#7a7468'), flatShading: true })

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.3, 8), timber)
  post.position.y = 1.15
  group.add(post)

  const random = [0.3, 1.1, 2.2, 3.5, 4.7, 5.6]
  random.forEach((angle, i) => {
    const size = 0.22 + (i % 3) * 0.08
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), stone)
    rock.position.set(Math.cos(angle) * 0.6, size * 0.35, Math.sin(angle) * 0.6)
    rock.rotation.set(angle, angle * 2, angle * 0.5)
    group.add(rock)
  })

  // Everything that turns hangs off this.
  const arm = new THREE.Group()
  arm.position.y = 2.32
  // At rest the shield faces the clearing, so it is presented to whoever
  // walks up from the tower rather than turned away from them.
  arm.rotation.y = 2.4
  group.add(arm)

  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.14), timber)
  arm.add(bar)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 8), iron)
  arm.add(collar)

  const shieldFace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.62), board)
  shieldFace.position.set(1.28, -0.16, 0)
  arm.add(shieldFace)
  for (const y of [-0.36, 0.04]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.64), iron)
    band.position.set(1.28, y, 0)
    arm.add(band)
  }
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), iron)
  boss.position.set(1.35, -0.16, 0)
  arm.add(boss)

  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 5), timber)
  rope.position.set(-1.2, -0.23, 0)
  arm.add(rope)
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.34, 3, 8), sack)
  bag.position.set(-1.2, -0.63, 0)
  arm.add(bag)
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 10), iron)
  tie.rotation.x = Math.PI / 2
  tie.position.set(-1.2, -0.44, 0)
  arm.add(tie)

  const shield = new THREE.Vector3()
  const bagAt = new THREE.Vector3()
  let spin = 0
  let sinceSwipe = 9

  return {
    group,
    shield,
    strike(damage: number) {
      // A heavy blow sends it round properly; a light one just shoves it.
      spin = Math.min(7.5, spin + damage * 0.1)
    },
    update(dt, watcher, fighter) {
      arm.rotation.y += spin * dt
      // Wooden bearings, packed with grease, on a cold evening.
      spin *= Math.max(0, 1 - dt * 0.85)
      if (Math.abs(spin) < 0.05) spin = 0

      shieldFace.getWorldPosition(shield)
      bag.getWorldPosition(bagAt)
      sinceSwipe += dt

      if (spin > 1.2 && sinceSwipe > 1.1) {
        const reach = bagAt.distanceTo(watcher)
        if (reach < 1.5) {
          sinceSwipe = 0
          const force = Math.min(1, spin / 4)
          return takeHit(fighter, 6 + 16 * force)
        }
      }
      return null
    },
  }
}
