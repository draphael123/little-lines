/**
 * Railway sound, synthesised in the browser.
 *
 * Every sound in Little Lines is generated at runtime from oscillators and
 * shaped noise — there are no sample files to download, nothing is fetched at
 * play time, and the whole engine is written for this project (see
 * AUDIO_CREDITS.md). If the Web Audio API is missing or the context refuses to
 * start, every call here quietly becomes a no-op and the game plays on.
 */

export type SfxName =
  | 'place'
  | 'erase'
  | 'whistle'
  | 'horn'
  | 'arrive'
  | 'deny'
  | 'tool'
  | 'terrain'

export interface AudioSettings {
  music: boolean
  sfx: boolean
  /** Master volume, 0..1. */
  volume: number
}

interface Engine {
  ctx: AudioContext
  master: GainNode
  musicBus: GainNode
  sfxBus: GainNode
  air: ConvolverNode
}

let engine: Engine | null = null
let settings: AudioSettings = { music: false, sfx: true, volume: 0.6 }
let musicTimer: number | null = null
let musicStep = 0
let failed = false

const AudioCtor = (): typeof AudioContext | null => {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? w.webkitAudioContext ?? null
}

export function audioAvailable(): boolean {
  return !failed && AudioCtor() !== null
}

/** Builds a short, soft impulse response so sounds sit in a room rather than a void. */
function makeAir(ctx: AudioContext): ConvolverNode {
  const seconds = 1.4
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.6)
      data[i] = (Math.random() * 2 - 1) * decay * 0.5
    }
  }
  const conv = ctx.createConvolver()
  conv.buffer = buffer
  return conv
}

/** Must be called from a user gesture the first time. */
export function initAudio(): boolean {
  if (engine) {
    if (engine.ctx.state === 'suspended') void engine.ctx.resume().catch(() => {})
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
    master.gain.value = settings.volume
    master.connect(ctx.destination)

    const air = makeAir(ctx)
    const airGain = ctx.createGain()
    airGain.gain.value = 0.24
    air.connect(airGain)
    airGain.connect(master)

    const musicBus = ctx.createGain()
    musicBus.gain.value = settings.music ? 0.5 : 0
    musicBus.connect(master)
    musicBus.connect(air)

    const sfxBus = ctx.createGain()
    sfxBus.gain.value = settings.sfx ? 1 : 0
    sfxBus.connect(master)
    sfxBus.connect(air)

    engine = { ctx, master, musicBus, sfxBus, air }
    if (settings.music) startMusic()
    return true
  } catch {
    failed = true
    return false
  }
}

export function applyAudioSettings(next: AudioSettings): void {
  settings = next
  if (!engine) {
    if (next.music || next.sfx) initAudio()
    if (!engine) return
  }
  const { ctx, master, musicBus, sfxBus } = engine
  const t = ctx.currentTime
  master.gain.setTargetAtTime(next.volume, t, 0.05)
  musicBus.gain.setTargetAtTime(next.music ? 0.5 : 0, t, 0.2)
  sfxBus.gain.setTargetAtTime(next.sfx ? 1 : 0, t, 0.05)
  if (next.music) startMusic()
  else stopMusic()
}

export function getAudioSettings(): AudioSettings {
  return settings
}

/* ------------------------------------------------------------------ voices */

function envelope(gain: GainNode, ctx: AudioContext, peak: number, attack: number, decay: number) {
  const t = ctx.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function tone(
  freq: number,
  opts: {
    type?: OscillatorType
    peak?: number
    attack?: number
    decay?: number
    delay?: number
    glideTo?: number
    bus?: 'sfx' | 'music'
    detune?: number
  } = {},
) {
  if (!engine) return
  const { ctx, sfxBus, musicBus } = engine
  const {
    type = 'sine',
    peak = 0.18,
    attack = 0.006,
    decay = 0.3,
    delay = 0,
    glideTo,
    bus = 'sfx',
    detune = 0,
  } = opts
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  osc.detune.value = detune
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + attack + decay)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay)
  osc.connect(gain)
  gain.connect(bus === 'sfx' ? sfxBus : musicBus)
  osc.start(start)
  osc.stop(start + attack + decay + 0.05)
}

function noise(opts: {
  duration?: number
  peak?: number
  filter?: number
  q?: number
  type?: BiquadFilterType
  delay?: number
}) {
  if (!engine) return
  const { ctx, sfxBus } = engine
  const { duration = 0.12, peak = 0.2, filter = 1400, q = 1, type = 'bandpass', delay = 0 } = opts
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const biquad = ctx.createBiquadFilter()
  biquad.type = type
  biquad.frequency.value = filter
  biquad.Q.value = q
  const gain = ctx.createGain()
  envelope(gain, ctx, peak, 0.004, duration)
  src.connect(biquad)
  biquad.connect(gain)
  gain.connect(sfxBus)
  src.start(ctx.currentTime + delay)
}

export function playSfx(name: SfxName): void {
  if (!settings.sfx) return
  if (!engine && !initAudio()) return
  if (!engine) return
  try {
    switch (name) {
      case 'place':
        noise({ duration: 0.07, peak: 0.16, filter: 2100, q: 1.6 })
        tone(196, { type: 'triangle', peak: 0.1, attack: 0.004, decay: 0.09 })
        break
      case 'erase':
        noise({ duration: 0.14, peak: 0.13, filter: 620, q: 0.7, type: 'lowpass' })
        tone(120, { type: 'sine', peak: 0.09, attack: 0.005, decay: 0.16 })
        break
      case 'tool':
        tone(880, { type: 'sine', peak: 0.055, attack: 0.002, decay: 0.05 })
        break
      case 'terrain':
        noise({ duration: 0.22, peak: 0.14, filter: 420, q: 0.6, type: 'lowpass' })
        break
      case 'whistle':
        tone(1180, { type: 'sine', peak: 0.11, attack: 0.03, decay: 0.5 })
        tone(1570, { type: 'sine', peak: 0.07, attack: 0.04, decay: 0.46, detune: 6 })
        tone(880, { type: 'sine', peak: 0.05, attack: 0.05, decay: 0.55, delay: 0.02 })
        break
      case 'horn':
        tone(196, { type: 'sawtooth', peak: 0.05, attack: 0.1, decay: 1.1 })
        tone(262, { type: 'sine', peak: 0.045, attack: 0.12, decay: 1.05, delay: 0.03 })
        break
      case 'arrive':
        tone(659.25, { type: 'sine', peak: 0.13, attack: 0.004, decay: 0.9 })
        tone(987.77, { type: 'sine', peak: 0.09, attack: 0.005, decay: 1.1, delay: 0.09 })
        tone(1318.5, { type: 'sine', peak: 0.05, attack: 0.006, decay: 1.3, delay: 0.19 })
        break
      case 'deny':
        tone(146.83, { type: 'triangle', peak: 0.09, attack: 0.004, decay: 0.17, glideTo: 110 })
        break
    }
  } catch {
    /* a failed sound must never interrupt play */
  }
}

/* ------------------------------------------------------------------- music */

// A slow pentatonic figure in D, the sort of thing a music box would manage.
const FIGURE = [293.66, 440.0, 587.33, 493.88, 392.0, 587.33, 440.0, 329.63]
const BASS = [146.83, 164.81, 130.81, 196.0]

function startMusic(): void {
  if (musicTimer !== null || !engine) return
  const beat = 1150
  const tick = () => {
    if (!engine || !settings.music) return
    const freq = FIGURE[musicStep % FIGURE.length]
    tone(freq, { type: 'triangle', peak: 0.075, attack: 0.06, decay: 1.5, bus: 'music' })
    tone(freq * 2, { type: 'sine', peak: 0.022, attack: 0.08, decay: 1.1, bus: 'music', delay: 0.04 })
    if (musicStep % 4 === 0) {
      tone(BASS[(musicStep / 4) % BASS.length], {
        type: 'sine',
        peak: 0.07,
        attack: 0.14,
        decay: 2.6,
        bus: 'music',
      })
    }
    musicStep++
  }
  tick()
  musicTimer = window.setInterval(tick, beat)
}

function stopMusic(): void {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer)
    musicTimer = null
  }
}

/** Test hook: drop the engine so a fresh one can be built. */
export function resetAudioForTests(): void {
  stopMusic()
  try {
    void engine?.ctx.close()
  } catch {
    /* ignore */
  }
  engine = null
  failed = false
  musicStep = 0
  settings = { music: false, sfx: true, volume: 0.6 }
}
