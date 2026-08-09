import { create } from 'zustand'
import { applyAudioSettings, playSfx, type AudioSettings, type SfxName } from '../audio/engine'
import { MONTH_SECONDS, buildingById, isBuilding, unlockedBuildings } from '../game/buildings'
import {
  COSTS,
  MAX_TRAINS,
  placedBuildings,
  trainCapacity,
  MILESTONES,
  SIZE_UNLOCKS,
  STARTING_FUNDS,
  seedSettlements,
  surveyCountry,
  tickCountry,
  totalPopulation,
  type Settlement,
} from '../game/economy'
import { WORLD_SIZES, createWorld, keyOf, sameCoord, tileAt, withTile, worldFromRows } from '../game/grid'
import { LEVELS, levelById } from '../game/levels'
import { reportRoute, type RouteReport, type Stars } from '../game/scoring'
import { bool, discard, int, isRecord, num, oneOf, readSave, str, writeSave } from '../game/save'
import {
  deserializeLines,
  deserializeRoute,
  deserializeWorld,
  serializeLines,
  serializeRoute,
  serializeWorld,
} from '../game/serialize'
import { hintFor } from '../game/solver'
import {
  adjustHeight,
  boreTunnel,
  canPlaceFeature,
  fillTunnel,
  growLandscape,
  seedSandbox,
  setKind,
} from '../game/terrain'
import {
  extendCheck,
  lineContaining,
  occupiedTiles,
  removeTileFromLine,
  routeIsClosed,
} from '../game/track'
import type {
  BuildingId,
  Coord,
  FreeTool,
  LevelDef,
  RailLine,
  Speed,
  World,
  WorldSize,
} from '../game/types'
import type { CameraPreset } from '../three/viewpoints'

export type Mode = 'puzzle' | 'free'
export type StatusTone = 'info' | 'good' | 'warn'

export interface Status {
  text: string
  tone: StatusTone
}

export interface LevelProgress {
  stars: Stars
  bestTiles: number
}

interface FreeSnapshot {
  world: World
  lines: RailLine[]
  settlements: Settlement[]
  balance: number
  activeLineId: string | null
}

const worldCache = new Map<string, World>()
export function worldForLevel(level: LevelDef): World {
  const cached = worldCache.get(level.id)
  if (cached) return cached
  const built = worldFromRows(level.kinds, level.heights)
  worldCache.set(level.id, built)
  return built
}

const SAVE_PROGRESS = 'progress'
const SAVE_SETTINGS = 'settings'
const SAVE_SANDBOX = 'sandbox'
const SAVE_PUZZLE = 'puzzle'
const SAVE_CAREER = 'career'

const TOOLS: FreeTool[] = ['rail', 'erase', 'raise', 'lower', 'tunnel', 'tree', 'water', 'build']
const SPEEDS: Speed[] = ['slow', 'normal', 'fast']
const SIZES: WorldSize[] = ['small', 'wide', 'grand']

export interface ToolInfo {
  id: FreeTool
  key: string
  name: string
  hint: string
  cost: number
}

export const TOOL_INFO: ToolInfo[] = [
  {
    id: 'rail',
    key: '1',
    name: 'Lay rail',
    cost: COSTS.rail,
    hint: 'Click a tile to begin a line, then each neighbouring tile in turn. Rail may rise or fall one level per length. Click the last tile again to lift it and take the money back.',
  },
  {
    id: 'erase',
    key: '2',
    name: 'Lift track',
    cost: 0,
    hint: 'Removes rail, a station or a stand of pines. Lifting rail from the middle of a line leaves two working stubs.',
  },
  {
    id: 'raise',
    key: '3',
    name: 'Raise ground',
    cost: COSTS.terrain,
    hint: 'Lifts a tile one level. The tool refuses any lift that would leave existing rail on an impossible gradient.',
  },
  {
    id: 'lower',
    key: '4',
    name: 'Lower ground',
    cost: COSTS.terrain,
    hint: 'Drops a tile one level, down to table height. Same gradient protection as raising.',
  },
  {
    id: 'tunnel',
    key: '5',
    name: 'Bore tunnel',
    cost: COSTS.tunnel,
    hint: 'Cuts through a rock tile at the level of the surrounding ground, with the mountain still standing above. Expensive, and worth it.',
  },
  {
    id: 'tree',
    key: '6',
    name: 'Plant pines',
    cost: COSTS.tree,
    hint: 'Adds a stand of pines. Nothing is planted on rail, rock or water.',
  },
  {
    id: 'water',
    key: '7',
    name: 'Flood water',
    cost: COSTS.water,
    hint: 'Turns a tile to river. Track crossing water gets a bridge deck and trestles automatically, and water in sight helps a settlement thrive.',
  },
  {
    id: 'build',
    key: '8',
    name: 'Place building',
    cost: 0,
    hint: 'Pick a building from the palette, then click a tile carrying rail. Stations gather passengers; every other building works only once the rail can reach it too.',
  },
]

export const toolInfo = (id: FreeTool) => TOOL_INFO.find((t) => t.id === id) ?? TOOL_INFO[0]

/** Surveys the player has actually delivered, which is what earns buildings. */
const completedLevels = (progress: Record<string, LevelProgress>) =>
  new Set(Object.entries(progress).filter(([, p]) => p.stars > 0).map(([id]) => id))

let lineSeq = 0
const nextLineId = () => `line-${Date.now().toString(36)}-${(lineSeq++).toString(36)}`

/* ------------------------------------------------------------ saved shapes */

function loadProgress(): Record<string, LevelProgress> {
  return readSave<Record<string, LevelProgress>>(
    SAVE_PROGRESS,
    (raw) => {
      if (!isRecord(raw)) return null
      const out: Record<string, LevelProgress> = {}
      for (const level of LEVELS) {
        const entry = raw[level.id]
        if (!isRecord(entry)) continue
        out[level.id] = {
          stars: int(entry.stars, 0, 0, 3) as Stars,
          bestTiles: int(entry.bestTiles, 0, 0, 9999),
        }
      }
      return out
    },
    {},
  )
}

interface SavedSettings {
  night: boolean
  audio: AudioSettings
  tutorialDone: boolean
}

function loadSettings(): SavedSettings {
  return readSave<SavedSettings>(
    SAVE_SETTINGS,
    (raw) => {
      if (!isRecord(raw)) return null
      const audio = isRecord(raw.audio) ? raw.audio : {}
      return {
        night: bool(raw.night, false),
        tutorialDone: bool(raw.tutorialDone, false),
        audio: {
          music: bool(audio.music, false),
          sfx: bool(audio.sfx, true),
          volume: Math.max(0, Math.min(1, num(audio.volume, 0.6))),
        },
      }
    },
    { night: false, tutorialDone: false, audio: { music: false, sfx: true, volume: 0.6 } },
  )
}

export interface Career {
  /** Largest country ever grown, which is what unlocks the bigger tables. */
  bestPopulation: number
}

const loadCareer = (): Career =>
  readSave<Career>(
    SAVE_CAREER,
    (raw) => (isRecord(raw) ? { bestPopulation: int(raw.bestPopulation, 0, 0, 1_000_000) } : null),
    { bestPopulation: 0 },
  )

interface FreeState {
  size: WorldSize
  world: World
  lines: RailLine[]
  settlements: Settlement[]
  activeLineId: string | null
  tool: FreeTool
  /** Which building the place tool will put down. */
  building: BuildingId
  trains: number
  speed: Speed
  running: boolean
  balance: number
  passengers: number
}

function freshSandbox(size: WorldSize, seed = 11): FreeState {
  const { w, h } = WORLD_SIZES[size]
  const world = seedSandbox(w, h, seed)
  const hamlets = size === 'small' ? 6 : size === 'wide' ? 9 : 12
  return {
    size,
    world,
    lines: [],
    settlements: seedSettlements(world, hamlets, seed),
    activeLineId: null,
    tool: 'rail',
    building: 'station',
    trains: 1,
    speed: 'normal',
    running: true,
    balance: STARTING_FUNDS,
    passengers: 0,
  }
}

function deserializeSettlements(raw: unknown, world: World): Settlement[] {
  if (!Array.isArray(raw)) return []
  const out: Settlement[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const x = int(item.x, -1, 0, world.w - 1)
    const z = int(item.z, -1, 0, world.h - 1)
    if (!Number.isInteger(x) || !Number.isInteger(z)) continue
    const population = Math.max(0, num(item.population, 8))
    out.push({
      id: str(item.id, `s-${x}-${z}`),
      x,
      z,
      name: str(item.name, 'Halt'),
      population,
      peak: Math.max(population, num(item.peak, population)),
      wasServed: bool(item.wasServed, false),
    })
  }
  return out
}

function loadSandbox(): FreeState {
  return readSave<FreeState>(
    SAVE_SANDBOX,
    (raw) => {
      if (!isRecord(raw)) return null
      const world = deserializeWorld(raw.world)
      if (!world) return null
      const size = oneOf(raw.size, SIZES, 'small')
      const expected = WORLD_SIZES[size]
      if (world.w !== expected.w || world.h !== expected.h) return null
      return {
        size,
        world,
        lines: deserializeLines(raw.lines, world),
        settlements: deserializeSettlements(raw.settlements, world),
        activeLineId: null,
        tool: oneOf(raw.tool, TOOLS, 'rail'),
        building: isBuilding(raw.building) ? raw.building : 'station',
        trains: int(raw.trains, 1, 1, MAX_TRAINS),
        speed: oneOf(raw.speed, SPEEDS, 'normal'),
        running: bool(raw.running, true),
        balance: Math.max(0, num(raw.balance, STARTING_FUNDS)),
        passengers: Math.max(0, num(raw.passengers, 0)),
      }
    },
    freshSandbox('small'),
  )
}

interface SavedPuzzle {
  levelId: string
  route: Coord[]
}

function loadPuzzle(): SavedPuzzle {
  return readSave<SavedPuzzle>(
    SAVE_PUZZLE,
    (raw) => {
      if (!isRecord(raw)) return null
      const levelId = str(raw.levelId, LEVELS[0].id)
      const level = levelById(levelId)
      if (!level) return null
      return { levelId, route: deserializeRoute(raw.route, worldForLevel(level)) }
    },
    { levelId: LEVELS[0].id, route: [] },
  )
}

/* ----------------------------------------------------------------- persist */

const timers = new Map<string, ReturnType<typeof setTimeout>>()
function schedulePersist(key: string, fn: () => void) {
  const existing = timers.get(key)
  if (existing) clearTimeout(existing)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      fn()
    }, 400),
  )
}

/* ------------------------------------------------------------------- store */

export interface GameState {
  mode: Mode
  night: boolean
  camera: CameraPreset
  cameraNonce: number
  hovered: Coord | null
  status: Status
  announcement: string
  audio: AudioSettings
  tutorialDone: boolean
  showTutorial: boolean
  showFieldGuide: boolean
  showLevels: boolean

  levelId: string
  route: Coord[]
  past: Coord[][]
  future: Coord[][]
  delivered: boolean
  puzzleRunning: boolean
  hint: Coord | null
  progress: Record<string, LevelProgress>

  free: FreeState
  freePast: FreeSnapshot[]
  freeFuture: FreeSnapshot[]
  career: Career
  /** Buildings the campaign has earned, by id. */
  unlocked: BuildingId[]
  /** Milestone reached this session and not yet dismissed. */
  milestone: string | null

  setMode: (mode: Mode) => void
  setNight: (night: boolean) => void
  setCamera: (preset: CameraPreset) => void
  setHovered: (c: Coord | null) => void
  setStatus: (text: string, tone?: StatusTone) => void
  announce: (text: string) => void
  setAudio: (patch: Partial<AudioSettings>) => void
  openTutorial: () => void
  closeTutorial: (markDone?: boolean) => void
  setFieldGuide: (open: boolean) => void
  setLevelPicker: (open: boolean) => void
  dismissMilestone: () => void

  selectLevel: (id: string) => void
  nextLevel: () => void
  tapPuzzleTile: (c: Coord) => void
  undo: () => void
  redo: () => void
  clearRoute: () => void
  askHint: () => void
  toggleRun: () => void
  completeDelivery: () => void

  setTool: (tool: FreeTool) => void
  setBuilding: (id: BuildingId) => void
  tapFreeTile: (c: Coord) => void
  setFreeSize: (size: WorldSize) => void
  setTrains: (n: number) => void
  setSpeed: (speed: Speed) => void
  grow: () => void
  clearSandbox: () => void
  startNewLine: () => void
  advanceCountry: (dt: number) => void
  resetEverything: () => void
}

const initialSettings = loadSettings()
const initialPuzzle = loadPuzzle()

export const useGame = create<GameState>()((set, get) => {
  const persistProgress = () => schedulePersist(SAVE_PROGRESS, () => writeSave(SAVE_PROGRESS, get().progress))
  const persistCareer = () => schedulePersist(SAVE_CAREER, () => writeSave(SAVE_CAREER, get().career))
  const persistSettings = () =>
    schedulePersist(SAVE_SETTINGS, () => {
      const s = get()
      writeSave(SAVE_SETTINGS, { night: s.night, audio: s.audio, tutorialDone: s.tutorialDone })
    })
  const persistSandbox = () =>
    schedulePersist(SAVE_SANDBOX, () => {
      const f = get().free
      writeSave(SAVE_SANDBOX, {
        size: f.size,
        world: serializeWorld(f.world),
        lines: serializeLines(f.lines),
        settlements: f.settlements,
        tool: f.tool,
        building: f.building,
        trains: f.trains,
        speed: f.speed,
        running: f.running,
        balance: Math.round(f.balance),
        passengers: Math.round(f.passengers),
      })
    })
  const persistPuzzle = () =>
    schedulePersist(SAVE_PUZZLE, () => {
      const s = get()
      writeSave(SAVE_PUZZLE, { levelId: s.levelId, route: serializeRoute(s.route) })
    })

  const sfx = (name: SfxName) => {
    if (get().audio.sfx) playSfx(name)
  }

  const snapshot = (free: FreeState): FreeSnapshot => ({
    world: free.world,
    lines: free.lines,
    settlements: free.settlements,
    balance: free.balance,
    activeLineId: free.activeLineId,
  })

  const pushFree = (patch: Partial<FreeState>, snap = true) => {
    const { free, freePast } = get()
    set({
      free: { ...free, ...patch },
      freePast: snap ? [...freePast, snapshot(free)].slice(-40) : freePast,
      freeFuture: [],
    })
    persistSandbox()
  }

  /** Charge for an action; refuses politely when the account will not stand it. */
  const afford = (cost: number): boolean => {
    if (cost <= 0) return true
    const free = get().free
    if (free.balance < cost) {
      sfx('deny')
      get().setStatus(
        `That costs £${cost} and the account holds £${Math.floor(free.balance)}. Let the traffic build up first.`,
        'warn',
      )
      return false
    }
    return true
  }

  return {
    mode: 'puzzle',
    night: initialSettings.night,
    camera: 'home',
    cameraNonce: 0,
    hovered: null,
    status: { text: 'Welcome to the survey office.', tone: 'info' },
    announcement: '',
    audio: initialSettings.audio,
    tutorialDone: initialSettings.tutorialDone,
    showTutorial: !initialSettings.tutorialDone,
    showFieldGuide: false,
    showLevels: false,

    levelId: initialPuzzle.levelId,
    route: initialPuzzle.route,
    past: [],
    future: [],
    delivered: false,
    puzzleRunning: false,
    hint: null,
    progress: loadProgress(),

    free: loadSandbox(),
    freePast: [],
    freeFuture: [],
    career: loadCareer(),
    unlocked: unlockedBuildings(completedLevels(loadProgress())).map((b) => b.id),
    milestone: null,

    /* ------------------------------------------------------------ shared */
    setMode: (mode) => {
      set({
        mode,
        hovered: null,
        hint: null,
        status:
          mode === 'puzzle'
            ? { text: 'Puzzle Post. Connect the depot to the destination.', tone: 'info' }
            : { text: 'Free Build. Lay a line and the country will follow it.', tone: 'info' },
      })
      get().announce(mode === 'puzzle' ? 'Puzzle Post opened' : 'Free Build opened')
    },

    setNight: (night) => {
      set({ night })
      persistSettings()
      get().announce(night ? 'Night lighting' : 'Daylight')
    },

    setCamera: (preset) => set((s) => ({ camera: preset, cameraNonce: s.cameraNonce + 1 })),
    setHovered: (c) => set({ hovered: c }),
    setStatus: (text, tone = 'info') => set({ status: { text, tone } }),
    announce: (text) => set({ announcement: text }),

    setAudio: (patch) => {
      const audio = { ...get().audio, ...patch }
      set({ audio })
      applyAudioSettings(audio)
      persistSettings()
    },

    openTutorial: () => set({ showTutorial: true }),
    closeTutorial: (markDone = true) => {
      set({ showTutorial: false, tutorialDone: markDone || get().tutorialDone })
      persistSettings()
    },
    setFieldGuide: (open) => set({ showFieldGuide: open }),
    setLevelPicker: (open) => set({ showLevels: open }),
    dismissMilestone: () => set({ milestone: null }),

    /* ------------------------------------------------------------ puzzle */
    selectLevel: (id) => {
      const level = levelById(id)
      if (!level) return
      set({
        levelId: id,
        route: [],
        past: [],
        future: [],
        delivered: false,
        puzzleRunning: false,
        hint: null,
        showLevels: false,
        mode: 'puzzle',
        status: { text: `${level.name}. Begin at the ${level.depotName} depot.`, tone: 'info' },
      })
      persistPuzzle()
      get().announce(`${level.name} opened`)
    },

    nextLevel: () => {
      const current = levelById(get().levelId)
      const next = LEVELS[(current?.index ?? 0) + 1]
      if (next) get().selectLevel(next.id)
      else get().setStatus('Every survey is complete. The board sends its compliments.', 'good')
    },

    tapPuzzleTile: (c) => {
      const state = get()
      if (state.puzzleRunning || state.delivered) return
      const level = levelById(state.levelId)!
      const world = worldForLevel(level)
      const route = state.route

      if (route.length > 0 && sameCoord(route[route.length - 1], c)) {
        set({
          route: route.slice(0, -1),
          past: [...state.past, route].slice(-200),
          future: [],
          hint: null,
        })
        sfx('erase')
        get().setStatus('Track lifted.', 'info')
        persistPuzzle()
        return
      }

      if (route.length === 0 && !sameCoord(c, level.depot)) {
        sfx('deny')
        get().setStatus(`Every line starts at the ${level.depotName} depot.`, 'warn')
        return
      }

      const check = extendCheck(world, route, c, { bridgeBudget: level.bridgeBudget })
      if (!check.ok) {
        sfx('deny')
        get().setStatus(check.reason ?? 'That length of track cannot be laid.', 'warn')
        return
      }

      const nextRoute = [...route, c]
      set({ route: nextRoute, past: [...state.past, route].slice(-200), future: [], hint: null })
      sfx('place')
      const report = reportRoute(world, level, nextRoute)
      get().setStatus(
        report.complete
          ? `The line reaches ${level.destinationName}. Ready to run.`
          : `${report.trackTiles} lengths laid — par is ${level.par}.`,
        report.complete ? 'good' : 'info',
      )
      if (report.complete) get().announce(`Route complete in ${report.trackTiles} lengths`)
      persistPuzzle()
    },

    undo: () => {
      const { mode } = get()
      if (mode === 'free') {
        const { freePast, free, freeFuture } = get()
        if (freePast.length === 0) {
          get().setStatus('Nothing left to undo.', 'info')
          return
        }
        const prev = freePast[freePast.length - 1]
        set({
          free: { ...free, ...prev },
          freePast: freePast.slice(0, -1),
          freeFuture: [...freeFuture, snapshot(free)].slice(-40),
        })
        persistSandbox()
        get().setStatus('Undone.', 'info')
        return
      }
      const { past, route, future } = get()
      if (past.length === 0) {
        get().setStatus('Nothing left to undo.', 'info')
        return
      }
      set({
        route: past[past.length - 1],
        past: past.slice(0, -1),
        future: [...future, route].slice(-200),
        hint: null,
        delivered: false,
        puzzleRunning: false,
      })
      persistPuzzle()
      get().setStatus('Undone.', 'info')
    },

    redo: () => {
      const { mode } = get()
      if (mode === 'free') {
        const { freeFuture, free, freePast } = get()
        if (freeFuture.length === 0) {
          get().setStatus('Nothing to redo.', 'info')
          return
        }
        const next = freeFuture[freeFuture.length - 1]
        set({
          free: { ...free, ...next },
          freeFuture: freeFuture.slice(0, -1),
          freePast: [...freePast, snapshot(free)].slice(-40),
        })
        persistSandbox()
        get().setStatus('Redone.', 'info')
        return
      }
      const { future, route, past } = get()
      if (future.length === 0) {
        get().setStatus('Nothing to redo.', 'info')
        return
      }
      set({
        route: future[future.length - 1],
        future: future.slice(0, -1),
        past: [...past, route].slice(-200),
        hint: null,
      })
      persistPuzzle()
      get().setStatus('Redone.', 'info')
    },

    clearRoute: () => {
      const { route, past } = get()
      if (route.length === 0) return
      set({
        route: [],
        past: [...past, route].slice(-200),
        future: [],
        delivered: false,
        puzzleRunning: false,
        hint: null,
      })
      sfx('erase')
      persistPuzzle()
      get().setStatus('The survey is cleared.', 'info')
    },

    askHint: () => {
      const state = get()
      const level = levelById(state.levelId)!
      const hint = hintFor(worldForLevel(level), level, state.route)
      set({ hint: hint.next })
      sfx('tool')
      get().setStatus(hint.message, hint.next ? 'info' : 'warn')
      get().announce(hint.next ? `Hint: tile ${hint.next.x + 1}, ${hint.next.z + 1}` : hint.message)
    },

    toggleRun: () => {
      const state = get()
      if (state.mode === 'free') {
        const running = !state.free.running
        set({ free: { ...state.free, running } })
        sfx(running ? 'whistle' : 'horn')
        persistSandbox()
        get().setStatus(
          running ? 'Lines are live and the country is growing.' : 'All trains held. Time stands still.',
          running ? 'good' : 'info',
        )
        return
      }
      const level = levelById(state.levelId)!
      const report = reportRoute(worldForLevel(level), level, state.route)
      if (state.puzzleRunning) {
        set({ puzzleRunning: false })
        sfx('horn')
        get().setStatus('The engine is held at the depot.', 'info')
        return
      }
      if (!report.complete) {
        sfx('deny')
        get().setStatus(incompleteReason(report, level), 'warn')
        return
      }
      set({ puzzleRunning: true, delivered: false, hint: null })
      sfx('whistle')
      get().setStatus(`Away to ${level.destinationName}.`, 'good')
      get().announce('The train departs')
    },

    completeDelivery: () => {
      const state = get()
      if (state.delivered) return
      const level = levelById(state.levelId)!
      const report = reportRoute(worldForLevel(level), level, state.route)
      const previous = state.progress[level.id]
      const progress = {
        ...state.progress,
        [level.id]: {
          stars: Math.max(previous?.stars ?? 0, report.stars) as Stars,
          bestTiles: previous?.bestTiles
            ? Math.min(previous.bestTiles, report.trackTiles)
            : report.trackTiles,
        },
      }
      const earned = unlockedBuildings(completedLevels(progress))
      const fresh = earned.filter((b) => !state.unlocked.includes(b.id))
      set({ delivered: true, puzzleRunning: false, progress, unlocked: earned.map((b) => b.id) })
      persistProgress()
      if (fresh.length > 0) get().announce(fresh.map((b) => b.name).join(' and ') + ' unlocked')
      sfx('arrive')
      get().setStatus(
        `Arrived at ${level.destinationName} — ${report.stars} star${report.stars === 1 ? '' : 's'}.`,
        'good',
      )
      get().announce(`Delivery complete. ${report.stars} of 3 stars.`)
    },

    /* -------------------------------------------------------------- free */
    setTool: (tool) => {
      set({ free: { ...get().free, tool } })
      sfx('tool')
      get().setStatus(`${toolInfo(tool).name} selected.`, 'info')
      get().announce(`${toolInfo(tool).name} selected`)
      persistSandbox()
    },

    setBuilding: (id) => {
      set({ free: { ...get().free, building: id, tool: 'build' } })
      sfx('tool')
      get().setStatus(buildingById(id).name + ' selected.', 'info')
      get().announce(buildingById(id).name + ' selected')
      persistSandbox()
    },

    tapFreeTile: (c) => {
      const state = get()
      const free = state.free
      const tile = tileAt(free.world, c)
      if (!tile) return

      switch (free.tool) {
        case 'rail': {
          const active = free.lines.find((l) => l.id === free.activeLineId)
          if (active) {
            const head = active.tiles[active.tiles.length - 1]
            if (sameCoord(head, c)) {
              const trimmed = active.tiles.slice(0, -1)
              const refund = tile.kind === 'water' ? COSTS.bridge : COSTS.rail
              const lines =
                trimmed.length >= 1
                  ? free.lines.map((l) => (l.id === active.id ? { ...l, tiles: trimmed } : l))
                  : free.lines.filter((l) => l.id !== active.id)
              pushFree({
                lines,
                activeLineId: trimmed.length >= 1 ? active.id : null,
                balance: free.balance + refund,
              })
              sfx('erase')
              get().setStatus(`Track lifted. £${refund} back in the account.`, 'info')
              return
            }
            const check = extendCheck(free.world, active.tiles, c, {
              occupied: occupiedTiles(free.lines, active.id),
            })
            if (check.ok) {
              const cost = tile.kind === 'water' ? COSTS.bridge : COSTS.rail
              if (!afford(cost)) return
              const lines = free.lines.map((l) =>
                l.id === active.id ? { ...l, tiles: [...l.tiles, c] } : l,
              )
              pushFree({ lines, balance: free.balance - cost })
              sfx('place')
              const closed = routeIsClosed([...active.tiles, c])
              get().setStatus(
                closed
                  ? 'The loop is closed — trains will circulate.'
                  : `${active.tiles.length + 1} lengths on this line.`,
                closed ? 'good' : 'info',
              )
              return
            }
            if (occupiedTiles(free.lines).has(keyOf(c))) {
              const existing = lineContaining(free.lines, c)
              if (existing && existing.id !== active.id) {
                set({ free: { ...free, activeLineId: existing.id } })
                get().setStatus('Working line changed. Extend it from its last tile.', 'info')
                return
              }
              sfx('deny')
              get().setStatus(check.reason ?? 'Rail already runs here.', 'warn')
              return
            }
            sfx('deny')
            get().setStatus(check.reason ?? 'That length of track cannot be laid.', 'warn')
            return
          }
          if (occupiedTiles(free.lines).has(keyOf(c))) {
            const existing = lineContaining(free.lines, c)
            if (existing) {
              set({ free: { ...free, activeLineId: existing.id } })
              get().setStatus('Line selected. Extend it from its last tile.', 'info')
              return
            }
          }
          if (tile.kind === 'rock' && !tile.tunnel) {
            sfx('deny')
            get().setStatus('Solid rock. Bore a tunnel or go around.', 'warn')
            return
          }
          const startCost = tile.kind === 'water' ? COSTS.bridge : COSTS.rail
          if (!afford(startCost)) return
          const id = nextLineId()
          pushFree({
            lines: [...free.lines, { id, tiles: [c] }],
            activeLineId: id,
            balance: free.balance - startCost,
          })
          sfx('place')
          get().setStatus('New line begun. Click a neighbouring tile to continue.', 'info')
          return
        }

        case 'erase': {
          const line = lineContaining(free.lines, c)
          if (line) {
            const replacements = removeTileFromLine(line, c)
            const lines = free.lines.flatMap((l) => (l.id === line.id ? replacements : [l]))
            pushFree({
              world: isBuilding(tile.feature) ? withTile(free.world, c, { feature: null }) : free.world,
              lines,
              activeLineId: replacements[0]?.id ?? null,
              balance: free.balance + COSTS.rail,
            })
            sfx('erase')
            get().setStatus('Track lifted.', 'info')
            return
          }
          if (tile.feature) {
            pushFree({ world: withTile(free.world, c, { feature: null }) })
            sfx('erase')
            get().setStatus(
              isBuilding(tile.feature) ? buildingById(tile.feature).name + ' closed.' : 'Cleared.',
              'info',
            )
            return
          }
          sfx('deny')
          get().setStatus('Nothing to lift here.', 'warn')
          return
        }

        case 'raise':
        case 'lower': {
          if (!afford(COSTS.terrain)) return
          const delta = free.tool === 'raise' ? 1 : -1
          const edit = adjustHeight(free.world, free.lines, c, delta)
          if (!edit.check.ok) {
            sfx('deny')
            get().setStatus(edit.check.reason ?? 'The ground will not move.', 'warn')
            return
          }
          pushFree({ world: edit.world, balance: free.balance - COSTS.terrain })
          sfx('terrain')
          get().setStatus(
            `Ground at ${c.x + 1}, ${c.z + 1} is now level ${tileAt(edit.world, c)!.h}.`,
            'info',
          )
          return
        }

        case 'tunnel': {
          if (tile.kind === 'rock' && tile.tunnel) {
            const filled = fillTunnel(free.world, free.lines, c)
            if (!filled.check.ok) {
              sfx('deny')
              get().setStatus(filled.check.reason ?? 'The tunnel stays.', 'warn')
              return
            }
            pushFree({ world: filled.world })
            sfx('terrain')
            get().setStatus('Tunnel filled in.', 'info')
            return
          }
          if (!afford(COSTS.tunnel)) return
          const bored = boreTunnel(free.world, c)
          if (!bored.check.ok) {
            sfx('deny')
            get().setStatus(bored.check.reason ?? 'No tunnel here.', 'warn')
            return
          }
          pushFree({ world: bored.world, balance: free.balance - COSTS.tunnel })
          sfx('terrain')
          get().setStatus('Tunnel bored. Rail may pass beneath the rock.', 'good')
          return
        }

        case 'tree': {
          const check = canPlaceFeature(free.world, free.lines, c, 'tree')
          if (!check.ok) {
            sfx('deny')
            get().setStatus(check.reason ?? 'Nothing takes root here.', 'warn')
            return
          }
          if (!afford(COSTS.tree)) return
          pushFree({
            world: withTile(free.world, c, { kind: 'forest', feature: 'tree' }),
            balance: free.balance - COSTS.tree,
          })
          sfx('place')
          get().setStatus('Pines planted.', 'info')
          return
        }

        case 'water': {
          if (tile.kind === 'water') {
            pushFree({ world: withTile(free.world, c, { kind: 'meadow' }) })
            sfx('terrain')
            get().setStatus('Water drained.', 'info')
            return
          }
          if (!afford(COSTS.water)) return
          const edit = setKind(free.world, free.lines, c, 'water')
          if (!edit.check.ok) {
            sfx('deny')
            get().setStatus(edit.check.reason ?? 'The water will not sit there.', 'warn')
            return
          }
          pushFree({ world: edit.world, balance: free.balance - COSTS.water })
          sfx('terrain')
          get().setStatus(
            occupiedTiles(free.lines).has(keyOf(c))
              ? 'Water laid — the trestles go in automatically.'
              : 'Water laid. Somewhere in sight of it will grow well.',
            'good',
          )
          return
        }

        case 'build': {
          const def = buildingById(free.building)
          if (isBuilding(tile.feature)) {
            const standing = buildingById(tile.feature)
            pushFree({ world: withTile(free.world, c, { feature: null }) })
            sfx('erase')
            get().setStatus(standing.name + ' closed.', 'info')
            return
          }
          if (!get().unlocked.includes(def.id)) {
            sfx('deny')
            get().setStatus(def.name + ' has not been unlocked yet.', 'warn')
            return
          }
          if (def.onRail && !occupiedTiles(free.lines).has(keyOf(c))) {
            sfx('deny')
            get().setStatus(def.name + ' has to stand on a tile carrying rail.', 'warn')
            return
          }
          if (tile.kind === 'water' || tile.kind === 'rock') {
            sfx('deny')
            get().setStatus('Nothing is built on water or bare rock.', 'warn')
            return
          }
          if (!afford(def.cost)) return
          pushFree({
            world: withTile(free.world, c, { feature: def.id }),
            balance: free.balance - def.cost,
          })
          sfx('place')
          const nearby = free.settlements.filter(
            (s) => Math.abs(s.x - c.x) + Math.abs(s.z - c.z) <= def.range,
          )
          get().setStatus(
            nearby.length > 0
              ? def.name + ' open, serving ' + nearby.map((s) => s.name).join(' and ') + '.'
              : def.name + ' built. Nothing within reach of it yet.',
            nearby.length > 0 ? 'good' : 'info',
          )
          return
        }
      }
    },

    setFreeSize: (size) => {
      const unlockedAt = SIZE_UNLOCKS[size]
      if (get().career.bestPopulation < unlockedAt) {
        sfx('deny')
        get().setStatus(
          `The ${WORLD_SIZES[size].label.toLowerCase()} table opens once a country of ${unlockedAt} has been grown.`,
          'warn',
        )
        return
      }
      set({ free: freshSandbox(size, 11 + SIZES.indexOf(size) * 7), freePast: [], freeFuture: [] })
      persistSandbox()
      get().setStatus(`A ${WORLD_SIZES[size].label.toLowerCase()} table is laid out.`, 'good')
      get().announce(`${WORLD_SIZES[size].label} world created`)
    },

    setTrains: (n) => {
      const ceiling = trainCapacity(get().free.world)
      const trains = Math.max(1, Math.min(ceiling, Math.round(n)))
      set({ free: { ...get().free, trains } })
      persistSandbox()
      get().setStatus(`${trains} train${trains === 1 ? '' : 's'} in service.`, 'info')
    },

    setSpeed: (speed) => {
      set({ free: { ...get().free, speed } })
      persistSandbox()
      get().setStatus(`Running ${speed}.`, 'info')
    },

    grow: () => {
      const free = get().free
      const seed = Math.floor(Math.random() * 1_000_000)
      const world = growLandscape(free.world, free.lines, { seed })
      const settlements = seedSettlements(world, 1, seed, free.settlements)
      pushFree({ world, settlements })
      sfx('terrain')
      get().setStatus(
        settlements.length > free.settlements.length
          ? 'A river finds its way, the ridges settle, and a new hamlet appears.'
          : 'A river finds its way and the ridges settle.',
        'good',
      )
      get().announce('Landscape grown')
    },

    clearSandbox: () => {
      const free = get().free
      const { w, h } = WORLD_SIZES[free.size]
      pushFree({
        world: createWorld(w, h),
        lines: [],
        settlements: [],
        activeLineId: null,
        balance: STARTING_FUNDS,
        passengers: 0,
      })
      get().setStatus('The table is bare again. Grow a landscape to begin.', 'info')
      get().announce('World cleared')
    },

    startNewLine: () => {
      set({ free: { ...get().free, activeLineId: null } })
      get().setStatus('Click any clear tile to begin a new line.', 'info')
    },

    advanceCountry: (dt) => {
      const state = get()
      const free = state.free
      if (!free.running || free.settlements.length === 0) return
      const speedScale = free.speed === 'slow' ? 0.6 : free.speed === 'fast' ? 1.8 : 1
      const result = tickCountry(free.world, free.lines, free.settlements, free.trains, dt * speedScale)

      const population = Math.round(result.population)
      const career = state.career
      let milestone = state.milestone
      if (population > career.bestPopulation) {
        const crossed = MILESTONES.find(
          (m) => career.bestPopulation < m.population && population >= m.population,
        )
        if (crossed) {
          milestone = crossed.title
          playSfx('arrive')
        }
        set({ career: { bestPopulation: population } })
        persistCareer()
      }

      // Upkeep is charged continuously rather than in monthly lumps, so the
      // balance moves smoothly and a network that stops earning starts to bite.
      const monthly = placedBuildings(free.world).reduce((n, b) => n + b.def.upkeep, 0)
      const spend = (monthly / MONTH_SECONDS) * dt * speedScale
      set({
        free: {
          ...free,
          settlements: result.settlements,
          balance: Math.max(0, free.balance + result.income - spend),
          passengers: free.passengers + result.passengers,
          trains: Math.min(free.trains, trainCapacity(free.world)),
        },
        milestone,
      })
      persistSandbox()
    },

    resetEverything: () => {
      for (const key of [SAVE_PROGRESS, SAVE_SANDBOX, SAVE_PUZZLE, SAVE_SETTINGS, SAVE_CAREER]) {
        discard(key)
      }
      set({
        progress: {},
        levelId: LEVELS[0].id,
        route: [],
        past: [],
        future: [],
        delivered: false,
        puzzleRunning: false,
        hint: null,
        free: freshSandbox('small'),
        freePast: [],
        freeFuture: [],
        career: { bestPopulation: 0 },
        unlocked: unlockedBuildings(new Set()).map((b) => b.id),
        milestone: null,
        tutorialDone: false,
        showTutorial: true,
        mode: 'puzzle',
        status: { text: 'Everything is back to the first survey.', tone: 'info' },
      })
      get().announce('Progress reset')
    },
  }
})

function incompleteReason(report: RouteReport, level: LevelDef): string {
  if (!report.startsAtDepot) return `The line must start at the ${level.depotName} depot.`
  if (report.overBudget) return 'Too many bridges for the timber budget.'
  const missing = report.stopsRequired - report.stopsServed
  if (missing > 0) return `${missing} required stop${missing === 1 ? '' : 's'} still unserved.`
  return `The line does not yet reach ${level.destinationName}.`
}

/* -------------------------------------------------------------- selectors */

export const selectLevel = (s: GameState) => levelById(s.levelId) ?? LEVELS[0]
export const selectReport = (s: GameState) =>
  reportRoute(worldForLevel(selectLevel(s)), selectLevel(s), s.route)
export const selectStarsTotal = (s: GameState) =>
  LEVELS.reduce((n, l) => n + (s.progress[l.id]?.stars ?? 0), 0)
export const selectCountry = (s: GameState) =>
  surveyCountry(s.free.world, s.free.lines, s.free.settlements, s.free.trains)
export const selectPopulation = (s: GameState) => Math.round(totalPopulation(s.free.settlements))
export const selectTrainCapacity = (s: GameState) => trainCapacity(s.free.world)
export const selectUpkeep = (s: GameState) =>
  placedBuildings(s.free.world).reduce((n, b) => n + b.def.upkeep, 0)
export const sizeUnlocked = (s: GameState, size: WorldSize) =>
  s.career.bestPopulation >= SIZE_UNLOCKS[size]
