/**
 * The score and the ambience, synthesised in the browser.
 *
 * Nothing is fetched: the theme is played by oscillators through a shared
 * reverb, the way the railway's sound is, so the demo stays a single page
 * with no assets behind it. It is a slow modal piece in D — a pad, a low
 * pulse and a plucked motif — over wind, crickets, an owl and the brazier,
 * and it moves with you: the wind rises as you climb, the crickets stay on
 * the ground, the fire is only loud beside it.
 */

export interface AudioLevels {
  music: number
  ambience: number
}

interface Rig {
  ctx: AudioContext
  master: GainNode
  music: GainNode
  ambience: GainNode
  air: ConvolverNode
  wind: GainNode
  crickets: GainNode
  fire: GainNode
}

let rig: Rig | null = null
let failed = false
let beat = 0
let timer: number | null = null
let levels: AudioLevels = { music: 0.55, ambience: 0.7 }

const AudioCtor = (): typeof AudioContext | null => {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? w.webkitAudioContext ?? null
}

/** A soft impulse response, so nothing sounds like it is in a box. */
function makeAir(ctx: AudioContext): ConvolverNode {
  const seconds = 2.6
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.8)
      data[i] = (Math.random() * 2 - 1) * decay * 0.55
    }
  }
  const air = ctx.createConvolver()
  air.buffer = buffer
  return air
}

/** Pink-ish noise, which is what wind and crickets are both made of here. */
function noiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.2
  }
  return buffer
}

function loopingNoise(ctx: AudioContext, destination: AudioNode, filter: BiquadFilterNode): GainNode {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  source.loop = true
  const gain = ctx.createGain()
  gain.gain.value = 0
  source.connect(filter).connect(gain).connect(destination)
  source.start()
  return gain
}

/* ------------------------------------------------------------------ start */

/**
 * Audio can only begin inside a gesture, so this is called from the menu
 * rather than at load. Every failure is a silent no-op.
 */
export function startAudio(): boolean {
  if (rig) {
    void rig.ctx.resume()
    return true
  }
  if (failed) return false
  const Ctor = AudioCtor()
  if (!Ctor) {
    failed = true
    return false
  }

  try {
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)

    const air = makeAir(ctx)
    const airLevel = ctx.createGain()
    airLevel.gain.value = 0.32
    air.connect(airLevel).connect(master)

    const music = ctx.createGain()
    music.gain.value = levels.music
    music.connect(master)
    music.connect(air)

    const ambience = ctx.createGain()
    ambience.gain.value = levels.ambience
    ambience.connect(master)

    // Wind: two noise bands, one low and one hissing through needles.
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 420
    const wind = loopingNoise(ctx, ambience, low)
    wind.gain.value = 0.16

    const hiss = ctx.createBiquadFilter()
    hiss.type = 'bandpass'
    hiss.frequency.value = 2400
    hiss.Q.value = 0.7
    const needles = loopingNoise(ctx, ambience, hiss)
    needles.gain.value = 0.05

    // Crickets: a narrow band, pulsed, which is enough at this distance.
    const chirp = ctx.createBiquadFilter()
    chirp.type = 'bandpass'
    chirp.frequency.value = 4600
    chirp.Q.value = 12
    const crickets = loopingNoise(ctx, ambience, chirp)
    crickets.gain.value = 0.05

    // The brazier, which you only hear beside it.
    const crackle = ctx.createBiquadFilter()
    crackle.type = 'bandpass'
    crackle.frequency.value = 1100
    crackle.Q.value = 1.2
    const fire = loopingNoise(ctx, ambience, crackle)
    fire.gain.value = 0

    rig = { ctx, master, music, ambience, air, wind, crickets, fire }

    // A slow wander in the wind, so it never sits still.
    const gust = ctx.createOscillator()
    const gustDepth = ctx.createGain()
    gust.frequency.value = 0.07
    gustDepth.gain.value = 0.09
    gust.connect(gustDepth).connect(wind.gain)
    gust.start()

    void ctx.resume()
    play()
    return true
  } catch {
    failed = true
    return false
  }
}

/* ------------------------------------------------------------------ score */

// D dorian, which is the mode that always sounds like weather coming in.
const ROOTS = [146.83, 130.81, 174.61, 110.0]
const MOTIF = [587.33, 659.25, 783.99, 659.25, 523.25, 587.33]

function pad(ctx: AudioContext, destination: AudioNode, frequency: number, seconds: number) {
  const now = ctx.currentTime
  const voice = ctx.createGain()
  voice.gain.value = 0
  voice.connect(destination)

  for (const [ratio, level, detune] of [
    [1, 0.32, 0],
    [2, 0.16, 4],
    [3, 0.07, -6],
    [1.5, 0.1, 7],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = ratio === 1 ? 'sawtooth' : 'sine'
    osc.frequency.value = frequency * ratio
    osc.detune.value = detune
    const partial = ctx.createGain()
    partial.gain.value = level
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 900
    osc.connect(partial).connect(soften).connect(voice)
    osc.start(now)
    osc.stop(now + seconds + 1)
  }

  voice.gain.setValueAtTime(0, now)
  voice.gain.linearRampToValueAtTime(0.5, now + seconds * 0.35)
  voice.gain.setValueAtTime(0.5, now + seconds * 0.6)
  voice.gain.exponentialRampToValueAtTime(0.001, now + seconds + 0.9)
}

function pluck(ctx: AudioContext, destination: AudioNode, frequency: number, when: number) {
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = frequency
  const voice = ctx.createGain()
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.setValueAtTime(2600, when)
  tone.frequency.exponentialRampToValueAtTime(700, when + 1.6)
  osc.connect(voice).connect(tone).connect(destination)
  voice.gain.setValueAtTime(0.0001, when)
  voice.gain.exponentialRampToValueAtTime(0.22, when + 0.02)
  voice.gain.exponentialRampToValueAtTime(0.0001, when + 2.2)
  osc.start(when)
  osc.stop(when + 2.4)
}

/** One bar: a chord, sometimes a phrase over it. Called every eight seconds. */
function bar() {
  if (!rig) return
  const { ctx, music } = rig
  const root = ROOTS[beat % ROOTS.length]
  pad(ctx, music, root, 7.2)
  if (beat % 2 === 1) pad(ctx, music, root * 1.5, 6.4)

  // The motif comes in every other bar, and never quite the same way twice.
  if (beat % 2 === 0) {
    const now = ctx.currentTime
    const notes = 3 + Math.floor(Math.random() * 3)
    const offset = Math.floor(Math.random() * MOTIF.length)
    for (let i = 0; i < notes; i++) {
      pluck(ctx, music, MOTIF[(offset + i) % MOTIF.length] / 2, now + 0.6 + i * 1.15)
    }
  }
  beat++
}

function play() {
  if (!rig || timer !== null) return
  bar()
  timer = window.setInterval(bar, 8000)
}

/* ------------------------------------------------------------------ mixer */

export function setLevels(next: AudioLevels) {
  levels = next
  if (!rig) return
  rig.music.gain.value = next.music
  rig.ambience.gain.value = next.ambience
}

/** Quiet everything while a menu is open, without stopping the clock. */
export function duck(quiet: boolean) {
  if (!rig) return
  const now = rig.ctx.currentTime
  rig.master.gain.cancelScheduledValues(now)
  rig.master.gain.linearRampToValueAtTime(quiet ? 0.32 : 0.9, now + 0.35)
}

/**
 * Where you are changes what you hear: wind with height, crickets on the
 * ground, the fire only when you are beside it.
 */
export function listen(height: number, toBrazier: number) {
  if (!rig) return
  const up = Math.min(1, Math.max(0, (height - 2) / 16))
  rig.wind.gain.value = 0.13 + up * 0.3
  rig.crickets.gain.value = 0.075 * (1 - up * 0.75)
  rig.fire.gain.value = Math.max(0, 0.16 * (1 - toBrazier / 7))
}

/** For the pause menu: stop the world's sound without tearing the rig down. */
export function suspendAudio() {
  if (rig) void rig.ctx.suspend()
}

export function resumeAudio() {
  if (rig) void rig.ctx.resume()
}

export function audioRunning(): boolean {
  return rig !== null && rig.ctx.state === 'running'
}
