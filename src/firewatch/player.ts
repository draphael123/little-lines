/**
 * Walking, looking, and the ladder.
 *
 * The camera is the whole body: there is no avatar to animate, so the only
 * things that have to feel right are the weight of the walk, the sway of the
 * climb, and never being able to stand somewhere you should not.
 */
import * as THREE from 'three'
import {
  ARRIVAL,
  DECK,
  EYE,
  LADDER_STAND,
  advanceClimb,
  atLadderFoot,
  atLadderHead,
  clampToDeck,
  clampToGround,
  climbPose,
  groundAt,
  type Climb,
  type Stance,
} from './lookout'

const WALK = 3.2
const RUN = 5.8
const TURN = 0.0022

const START = { x: 1.2, z: 30, yaw: 0, pitch: -0.02 }

export class Player {
  readonly camera: THREE.PerspectiveCamera
  private climb: Climb = { stance: 'ground', t: 0 }
  private yaw = START.yaw
  private pitch = START.pitch
  private yawAtGrab = 0
  private readonly keys = new Set<string>()
  private readonly position = new THREE.Vector3(START.x, 0, START.z)
  private readonly velocity = new THREE.Vector3()
  private bob = 0

  /** Set from the settings screen. */
  sensitivity = 1
  invertY = false
  headBob = true

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.camera.rotation.order = 'YXZ'
    this.position.y = groundAt(this.position.x, this.position.z)
    this.apply(this.position.y + EYE)
  }

  /* -------------------------------------------------------------- input */

  /** Let go of every key — on blur, or when the pointer is released. */
  relax() {
    this.keys.clear()
  }

  look(dx: number, dy: number) {
    if (this.moving()) return
    const turn = TURN * this.sensitivity
    this.yaw -= dx * turn
    const vertical = this.invertY ? -dy : dy
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - vertical * turn))
  }

  /** Back to the trailhead, as if you had just walked up from the road. */
  reset() {
    this.climb = { stance: 'ground', t: 0 }
    this.keys.clear()
    this.velocity.set(0, 0, 0)
    this.yaw = START.yaw
    this.pitch = START.pitch
    this.bob = 0
    this.position.set(START.x, groundAt(START.x, START.z), START.z)
    this.apply(this.position.y + EYE)
  }

  press(code: string) {
    this.keys.add(code)
  }

  release(code: string) {
    this.keys.delete(code)
  }

  /* ------------------------------------------------------------- state */

  get stance(): Stance {
    return this.climb.stance
  }

  /** True while the ladder has hold of you and input is ignored. */
  moving(): boolean {
    return this.climb.stance === 'climbing' || this.climb.stance === 'descending'
  }

  /** The compass bearing the camera is facing, in radians of yaw. */
  get facing(): number {
    return this.yaw
  }

  /** What pressing the interact key would do here, if anything. */
  get offer(): 'climb' | 'descend' | null {
    if (this.climb.stance === 'ground') {
      return atLadderFoot(this.position.x, this.position.z) ? 'climb' : null
    }
    if (this.climb.stance === 'deck') {
      return atLadderHead(this.position.x, this.position.z) ? 'descend' : null
    }
    return null
  }

  /** Take hold of the ladder, or let go of it. Returns what happened. */
  interact(): 'climb' | 'descend' | null {
    const offer = this.offer
    if (offer === 'climb') {
      this.yawAtGrab = this.yaw
      this.climb = { stance: 'climbing', t: 0 }
    } else if (offer === 'descend') {
      this.yawAtGrab = this.yaw
      this.climb = { stance: 'descending', t: 1 }
    }
    return offer
  }

  /* -------------------------------------------------------------- frame */

  update(dt: number) {
    if (this.moving()) {
      this.climb = advanceClimb(this.climb, dt)
      const footing = groundAt(LADDER_STAND.x, LADDER_STAND.z)
      const pose = climbPose(this.climb.t, footing, this.yawAtGrab)
      this.position.set(pose.x, pose.y - EYE, pose.z)
      this.yaw = pose.yaw
      this.pitch += (-0.06 - this.pitch) * Math.min(1, dt * 2.2)
      this.apply(pose.y)
      if (this.climb.stance === 'ground') {
        // Standing at the foot again, facing back out into the wood.
        this.position.set(LADDER_STAND.x, footing, LADDER_STAND.z + 0.4)
      }
      if (this.climb.stance === 'deck') {
        this.position.set(ARRIVAL.x, DECK.y, ARRIVAL.z)
      }
      return
    }

    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0)
    const strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0)

    const onDeck = this.climb.stance === 'deck'
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const speed = onDeck ? 1.5 : running ? RUN : WALK

    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const wishX = (-sin * forward + cos * strafe) * speed
    const wishZ = (-cos * forward - sin * strafe) * speed

    // A little weight in getting going and in stopping again.
    const ease = Math.min(1, dt * 9)
    this.velocity.x += (wishX - this.velocity.x) * ease
    this.velocity.z += (wishZ - this.velocity.z) * ease

    const next = clampTo(
      onDeck,
      this.position.x + this.velocity.x * dt,
      this.position.z + this.velocity.z * dt,
    )
    this.position.x = next.x
    this.position.z = next.z

    const travelling = Math.hypot(this.velocity.x, this.velocity.z)
    this.bob += dt * travelling * (onDeck ? 1.6 : 2.1)
    const sway = this.headBob ? Math.sin(this.bob) * Math.min(0.055, travelling * 0.012) : 0

    const footing = onDeck ? DECK.y : groundAt(this.position.x, this.position.z)
    this.position.y = footing
    this.apply(footing + EYE + sway)
  }

  private apply(eyeHeight: number) {
    this.camera.position.set(this.position.x, eyeHeight, this.position.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }
}

function clampTo(onDeck: boolean, x: number, z: number) {
  return onDeck ? clampToDeck(x, z) : clampToGround(x, z)
}
