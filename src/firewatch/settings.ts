/**
 * What the player has chosen, and where it is kept.
 *
 * Settings are plain data with a strict reader: anything missing or out of
 * range falls back to the default rather than being trusted, because the only
 * store is localStorage and anything can be in there.
 */

export type Quality = 'low' | 'fair' | 'full'

export interface Settings {
  /** Multiplier on mouse movement, 0.3 to 2.5. */
  sensitivity: number
  invertY: boolean
  /** Vertical field of view in degrees. */
  fov: number
  bloom: boolean
  headBob: boolean
  quality: Quality
  music: number
  ambience: number
}

export const DEFAULTS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: 64,
  bloom: true,
  headBob: true,
  quality: 'full',
  music: 0.55,
  ambience: 0.7,
}

const KEY = 'firewatch.settings.v1'

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

const number = (value: unknown, low: number, high: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, low, high) : fallback

const flag = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

/** How much of the wood is planted, and how hard the renderer works. */
export const QUALITY: Record<Quality, { pixelRatio: number; foliage: number; bloom: boolean }> = {
  low: { pixelRatio: 1, foliage: 45, bloom: false },
  fair: { pixelRatio: 1.5, foliage: 80, bloom: true },
  full: { pixelRatio: 2, foliage: 400, bloom: true },
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const saved = JSON.parse(raw) as Partial<Settings>
    const quality = saved.quality
    return {
      sensitivity: number(saved.sensitivity, 0.3, 2.5, DEFAULTS.sensitivity),
      invertY: flag(saved.invertY, DEFAULTS.invertY),
      fov: number(saved.fov, 50, 100, DEFAULTS.fov),
      bloom: flag(saved.bloom, DEFAULTS.bloom),
      headBob: flag(saved.headBob, DEFAULTS.headBob),
      quality: quality === 'low' || quality === 'fair' || quality === 'full' ? quality : DEFAULTS.quality,
      music: number(saved.music, 0, 1, DEFAULTS.music),
      ambience: number(saved.ambience, 0, 1, DEFAULTS.ambience),
    }
  } catch {
    // A private window, or storage turned off. The defaults are fine.
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Nothing to be done, and nothing worth telling the player about.
  }
}
