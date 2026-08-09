/**
 * One store for the whole game.
 *
 * The rules live in `lines/` and are pure; this is only the part that has to
 * remember things between renders — which run is in progress, what the pointer
 * is over, and the handful of preferences that outlive a run.
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import { applyAudioSettings, playSfx, type AudioSettings } from '../audio/engine'
import { openQuests, type Quest } from '../lines/quests'
import { bool, int, isRecord, num, readSave, writeSave } from '../lines/save'
import {
  isOver,
  narrate,
  newGame,
  peekNext,
  placeTile,
  turnHand,
  type Game,
} from '../lines/game'
import type { HexKey } from '../lines/hex'
import { rotate, type Tile } from '../lines/tiles'

export type Tone = 'good' | 'great' | 'plain' | 'bad'

export interface Flash {
  id: number
  text: string
  tone: Tone
}

interface Preferences {
  night: boolean
  audio: AudioSettings
  best: number
  runs: number
}

const DEFAULTS: Preferences = {
  night: false,
  audio: { music: false, sfx: true, volume: 0.6 },
  best: 0,
  runs: 0,
}

function revivePreferences(raw: unknown): Preferences | null {
  if (!isRecord(raw)) return null
  const audio = isRecord(raw.audio) ? raw.audio : {}
  return {
    night: bool(raw.night, DEFAULTS.night),
    audio: {
      music: bool(audio.music, DEFAULTS.audio.music),
      sfx: bool(audio.sfx, DEFAULTS.audio.sfx),
      volume: Math.min(1, Math.max(0, num(audio.volume, DEFAULTS.audio.volume))),
    },
    best: Math.max(0, int(raw.best, 0, 0, Number.MAX_SAFE_INTEGER)),
    runs: Math.max(0, int(raw.runs, 0, 0, Number.MAX_SAFE_INTEGER)),
  }
}

const stored = readSave('preferences', revivePreferences, DEFAULTS)

/** A run is seeded from the clock, so every new game is a new country. */
const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0

export interface GameStore extends Preferences {
  game: Game
  hovered: HexKey | null
  announcement: string
  flash: Flash | null
  showHelp: boolean
  seenHelp: boolean

  hover: (key: HexKey | null) => void
  turn: (by: number) => void
  place: (key: HexKey) => void
  restart: () => void
  setNight: (night: boolean) => void
  setAudio: (patch: Partial<AudioSettings>) => void
  setShowHelp: (open: boolean) => void
}

let flashId = 0

export const useGame = create<GameStore>((set, get) => ({
  ...stored,
  game: newGame(freshSeed()),
  hovered: null,
  announcement: 'A station, and a stack of tiles. Put one next to it.',
  flash: null,
  showHelp: stored.runs === 0,
  seenHelp: stored.runs > 0,

  hover: (key) => {
    if (get().hovered === key) return
    set({ hovered: key })
  },

  turn: (by) => {
    const { game } = get()
    if (isOver(game)) return
    playSfx('tool')
    set({ game: turnHand(game, by) })
  },

  place: (key) => {
    const { game, best, runs } = get()
    const result = placeTile(game, key)

    if (!result.placed) {
      playSfx('deny')
      set({
        announcement: narrate(result),
        flash: { id: (flashId += 1), text: narrate(result), tone: 'bad' },
      })
      return
    }

    if (result.completed.length > 0) playSfx('whistle')
    else if (result.perfect) playSfx('arrive')
    else if (result.snug) playSfx('arrive')
    else playSfx('place')

    const tone: Tone = result.perfect
      ? 'great'
      : result.completed.length > 0 || result.snug
        ? 'good'
        : (result.assessment?.broken ?? 0) > 0
          ? 'bad'
          : 'plain'

    const text = narrate(result)
    const patch: Partial<GameStore> = {
      game: result.game,
      announcement: text,
      flash: { id: (flashId += 1), text, tone },
    }

    if (result.over) {
      playSfx('horn')
      const score = result.game.score
      patch.best = Math.max(best, score)
      patch.runs = runs + 1
      writeSave('preferences', {
        night: get().night,
        audio: get().audio,
        best: patch.best,
        runs: patch.runs,
      })
    }

    set(patch)
  },

  restart: () => {
    set({
      game: newGame(freshSeed()),
      hovered: null,
      flash: null,
      announcement: 'A fresh country, and a fresh stack.',
    })
  },

  setNight: (night) => {
    set({ night })
    writeSave('preferences', { night, audio: get().audio, best: get().best, runs: get().runs })
  },

  setAudio: (patch) => {
    const audio = { ...get().audio, ...patch }
    applyAudioSettings(audio)
    set({ audio })
    writeSave('preferences', { night: get().night, audio, best: get().best, runs: get().runs })
  },

  setShowHelp: (open) => set({ showHelp: open, seenHelp: true }),
}))

applyAudioSettings(stored.audio)

/* ------------------------------------------------------------- selectors */

/**
 * Only ever select something already stored.
 *
 * A selector that builds a value — the next tile, the open quests — hands back
 * a new object every time it runs, and `useSyncExternalStore` reads that as the
 * store having changed again, on every check, forever. Anything derived is
 * computed in a hook with `useMemo` against the stored things it depends on.
 */
export const selectHeld = (state: GameStore): Tile | null => state.game.hand
export const selectOver = (state: GameStore): boolean => isOver(state.game)

export function useNextTile(): Tile | null {
  const game = useGame((s) => s.game)
  return useMemo(() => peekNext(game), [game])
}

export function useOpenQuests(): Array<Quest & { progress: number; target: number }> {
  const tiles = useGame((s) => s.game.tiles)
  const quests = useGame((s) => s.game.quests)
  return useMemo(() => openQuests(tiles, quests), [tiles, quests])
}

/** The tile in hand as it will land, memoised so the scene is not rebuilt per render. */
export function useHeldTile(): Tile | null {
  const hand = useGame(selectHeld)
  const rotation = useGame((s) => s.game.rotation)
  return useMemo(() => (hand ? rotate(hand, rotation) : null), [hand, rotation])
}
