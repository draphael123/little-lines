/**
 * Persistence. Everything here assumes localStorage is hostile: it may be
 * unavailable, full, or hold something written by an older build. A bad read
 * must never take the game down, so every path falls back to a sane default.
 */

export const STORAGE_PREFIX = 'little-lines'
export const SAVE_VERSION = 1

export const storageKey = (name: string) => `${STORAGE_PREFIX}:v${SAVE_VERSION}:${name}`

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage
    const probe = `${STORAGE_PREFIX}:probe`
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

export function readSave<T>(name: string, revive: (raw: unknown) => T | null, fallback: T): T {
  const store = storage()
  if (!store) return fallback
  let raw: string | null = null
  try {
    raw = store.getItem(storageKey(name))
  } catch {
    return fallback
  }
  if (raw === null) return fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    discard(name)
    return fallback
  }
  try {
    const revived = revive(parsed)
    return revived ?? fallback
  } catch {
    discard(name)
    return fallback
  }
}

export function writeSave(name: string, value: unknown): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(storageKey(name), JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded or a private-mode stub. The session keeps playing.
    return false
  }
}

export function discard(name: string): void {
  try {
    storage()?.removeItem(storageKey(name))
  } catch {
    /* nothing sensible to do */
  }
}

/* ------------------------------------------------------------- validators */

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

export const int = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = num(v, fallback)
  return Math.max(min, Math.min(max, Math.round(n)))
}

export const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback

export const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
