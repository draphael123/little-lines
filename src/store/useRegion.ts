import { create } from 'zustand'
import { applyAudioSettings, playSfx, type AudioSettings, type SfxName } from '../audio/engine'
import { bool, discard, int, isRecord, num, oneOf, readSave, str, writeSave } from '../world/save'
import {
  BUILDINGS,
  MONTH_SECONDS,
  STARTING_FUNDS,
  buildingById,
  isStation,
  lineCost,
  type BuildingId,
  type Structure,
} from '../world/buildings'
import { generateRegion, heightAt } from '../world/heightfield'
import {
  addEdge,
  adjustEdge,
  emptyNetwork,
  nearestEdge,
  removeEdge,
  totalLength,
  type LayResult,
  type RailNetwork,
} from '../world/rail'
import type { RegionTool, ViewMode } from '../world/RegionScene'
import type { SpeedName } from '../world/trainRun'
import {
  MAX_TRAINS,
  seedSettlements,
  survey,
  tick,
  totalPopulation,
  trainCapacity,
  upkeepTotal,
  type Settlement,
  type TownReport,
} from '../world/towns'

const SAVE = 'region'
const SAVE_SETTINGS = 'settings'
const SEED = 1

export interface Status {
  text: string
  ok: boolean
}

export interface RegionState {
  seed: number
  network: RailNetwork
  structures: Structure[]
  settlements: Settlement[]
  balance: number
  passengers: number
  months: number

  tool: RegionTool
  building: BuildingId
  view: ViewMode
  lift: number
  trains: number
  speed: SpeedName
  running: boolean
  night: boolean

  status: Status
  announcement: string
  hovered: { x: number; z: number } | null
  audio: AudioSettings
  showTutorial: boolean
  tutorialDone: boolean
  showGuide: boolean

  setTool: (tool: RegionTool) => void
  setBuilding: (id: BuildingId) => void
  setView: (view: ViewMode) => void
  setLift: (metres: number) => void
  setTrains: (n: number) => void
  setSpeed: (speed: SpeedName) => void
  setRunning: (running: boolean) => void
  setNight: (night: boolean) => void
  setHovered: (p: { x: number; z: number } | null) => void
  setStatus: (text: string, ok?: boolean) => void
  announce: (text: string) => void
  setAudio: (patch: Partial<AudioSettings>) => void
  openTutorial: () => void
  closeTutorial: () => void
  setGuide: (open: boolean) => void

  lay: (result: LayResult) => void
  adjust: (edgeId: string, delta: number) => void
  place: (x: number, z: number, y: number) => void
  demolish: (x: number, z: number) => void
  advance: (dt: number) => void
  reset: () => void
}

const field = generateRegion({ seed: SEED })

const freshSettlements = () => seedSettlements(field, 11)

let seq = 0
const nextId = () => `b${(seq++).toString(36)}${Date.now().toString(36).slice(-4)}`

interface Saved {
  balance: number
  passengers: number
  months: number
  structures: Structure[]
  settlements: Settlement[]
  trains: number
  speed: SpeedName
  night: boolean
}

function load(): Saved | null {
  return readSave<Saved | null>(
    SAVE,
    (raw) => {
      if (!isRecord(raw)) return null
      const structures: Structure[] = []
      for (const item of Array.isArray(raw.structures) ? raw.structures : []) {
        if (!isRecord(item)) continue
        const kind = str(item.kind, '') as BuildingId
        if (!BUILDINGS.some((b) => b.id === kind)) continue
        structures.push({
          id: str(item.id, nextId()),
          kind,
          x: num(item.x, 0),
          z: num(item.z, 0),
          y: num(item.y, 0),
        })
      }
      const settlements: Settlement[] = []
      for (const item of Array.isArray(raw.settlements) ? raw.settlements : []) {
        if (!isRecord(item)) continue
        const population = Math.max(0, num(item.population, 10))
        settlements.push({
          id: str(item.id, 's'),
          x: num(item.x, 0),
          z: num(item.z, 0),
          name: str(item.name, 'Halt'),
          population,
          peak: Math.max(population, num(item.peak, population)),
          wasServed: bool(item.wasServed, false),
        })
      }
      return {
        balance: Math.max(0, num(raw.balance, STARTING_FUNDS)),
        passengers: Math.max(0, num(raw.passengers, 0)),
        months: Math.max(0, num(raw.months, 0)),
        structures,
        settlements: settlements.length > 0 ? settlements : freshSettlements(),
        trains: int(raw.trains, 1, 1, MAX_TRAINS),
        speed: oneOf(raw.speed, ['slow', 'normal', 'fast'] as const, 'normal'),
        night: bool(raw.night, false),
      }
    },
    null,
  )
}

const loadSettings = () =>
  readSave<AudioSettings & { tutorialDone: boolean }>(
    SAVE_SETTINGS,
    (raw) => {
      if (!isRecord(raw)) return null
      const audio = isRecord(raw.audio) ? raw.audio : {}
      return {
        music: bool(audio.music, false),
        sfx: bool(audio.sfx, true),
        volume: Math.max(0, Math.min(1, num(audio.volume, 0.6))),
        tutorialDone: bool(raw.tutorialDone, false),
      }
    },
    { music: false, sfx: true, volume: 0.6, tutorialDone: false },
  )

const saved = load()
const settings = loadSettings()

let timer: ReturnType<typeof setTimeout> | null = null
function persistSoon(fn: () => void) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    fn()
  }, 450)
}

export const useRegion = create<RegionState>()((set, get) => {
  const persist = () =>
    persistSoon(() => {
      const s = get()
      writeSave(SAVE, {
        balance: Math.round(s.balance),
        passengers: Math.round(s.passengers),
        months: Math.round(s.months),
        structures: s.structures,
        settlements: s.settlements,
        trains: s.trains,
        speed: s.speed,
        night: s.night,
      })
    })
  const persistSettings = () =>
    persistSoon(() => {
      const s = get()
      writeSave(SAVE_SETTINGS, { audio: s.audio, tutorialDone: s.tutorialDone })
    })

  const sfx = (name: SfxName) => {
    if (get().audio.sfx) playSfx(name)
  }
  const afford = (cost: number, what: string) => {
    if (get().balance >= cost) return true
    sfx('deny')
    get().setStatus(`${what} costs £${cost.toLocaleString()}; the account holds £${Math.floor(get().balance).toLocaleString()}.`, false)
    return false
  }

  return {
    seed: SEED,
    network: emptyNetwork(),
    structures: saved?.structures ?? [],
    settlements: saved?.settlements ?? freshSettlements(),
    balance: saved?.balance ?? STARTING_FUNDS,
    passengers: saved?.passengers ?? 0,
    months: saved?.months ?? 0,

    tool: 'rail',
    building: 'station',
    view: 'free',
    lift: 0,
    trains: saved?.trains ?? 1,
    speed: saved?.speed ?? 'normal',
    running: true,
    night: saved?.night ?? false,

    status: { text: 'Drag across the country to lay your first line.', ok: true },
    announcement: '',
    hovered: null,
    audio: { music: settings.music, sfx: settings.sfx, volume: settings.volume },
    showTutorial: !settings.tutorialDone,
    tutorialDone: settings.tutorialDone,
    showGuide: false,

    setTool: (tool) => {
      set({ tool })
      sfx('tool')
      get().setStatus(TOOL_HINT[tool], true)
    },
    setBuilding: (building) => {
      set({ building, tool: 'build' })
      sfx('tool')
      get().setStatus(`${buildingById(building).name} selected. Click where it should stand.`, true)
    },
    setView: (view) => {
      set({ view })
      get().announce(
        view === 'free' ? 'Free camera' : view === 'follow' ? 'Following the train' : 'Riding in the cab',
      )
    },
    setLift: (metres) => set({ lift: Math.max(-60, Math.min(60, metres)) }),
    setTrains: (n) => {
      const ceiling = trainCapacity(get().structures)
      set({ trains: Math.max(1, Math.min(ceiling, Math.round(n))) })
      persist()
    },
    setSpeed: (speed) => {
      set({ speed })
      persist()
    },
    setRunning: (running) => {
      set({ running })
      sfx(running ? 'whistle' : 'horn')
    },
    setNight: (night) => {
      set({ night })
      persist()
    },
    setHovered: (hovered) => set({ hovered }),
    setStatus: (text, ok = true) => set({ status: { text, ok } }),
    announce: (announcement) => set({ announcement }),
    setAudio: (patch) => {
      const audio = { ...get().audio, ...patch }
      set({ audio })
      applyAudioSettings(audio)
      persistSettings()
    },
    openTutorial: () => set({ showTutorial: true }),
    closeTutorial: () => {
      set({ showTutorial: false, tutorialDone: true })
      persistSettings()
    },
    setGuide: (showGuide) => set({ showGuide }),

    lay: (result) => {
      if (!result.ok || !result.edge) return
      const cost = lineCost(result.edge.length, result.edge.bridged)
      if (!afford(cost, 'That length of line')) return
      set({ network: addEdge(get().network, result), balance: get().balance - cost })
      sfx('place')
      get().setStatus(
        `${Math.round(result.edge.length)} m of line laid for £${cost.toLocaleString()}.`,
        true,
      )
    },

    adjust: (edgeId, delta) => {
      const result = adjustEdge(field, get().network, edgeId, delta)
      if (!result.ok) {
        sfx('deny')
        get().setStatus(result.reason ?? 'That line will not move.', false)
        return
      }
      const edge = result.network.edges.find((e) => e.id === edgeId)!
      set({ network: result.network })
      sfx('terrain')
      get().setStatus(
        edge.lift === 0
          ? 'Line back on the ground.'
          : `Line carried ${edge.lift > 0 ? edge.lift + ' m above' : -edge.lift + ' m below'} the ground.`,
        true,
      )
    },

    place: (x, z, y) => {
      const def = buildingById(get().building)
      const population = totalPopulation(get().settlements)
      if (population < def.unlockAt) {
        sfx('deny')
        get().setStatus(`${def.name} opens once the region reaches ${def.unlockAt} people.`, false)
        return
      }
      if (def.onRail && !nearestEdge(get().network, x, z, 60)) {
        sfx('deny')
        get().setStatus(`${def.name} has to stand beside the line.`, false)
        return
      }
      if (!afford(def.cost, def.name)) return
      const structure: Structure = { id: nextId(), kind: def.id, x, z, y }
      set({ structures: [...get().structures, structure], balance: get().balance - def.cost })
      sfx('place')
      const near = get().settlements.filter(
        (s) => Math.hypot(s.x - x, s.z - z) <= def.range,
      )
      get().setStatus(
        near.length > 0
          ? `${def.name} open, serving ${near.map((s) => s.name).join(' and ')}.`
          : `${def.name} built. Nothing within ${def.range} m of it yet.`,
        near.length > 0,
      )
      persist()
    },

    demolish: (x, z) => {
      const hitStructure = get()
        .structures.map((s) => ({ s, d: Math.hypot(s.x - x, s.z - z) }))
        .filter((h) => h.d < 40)
        .sort((a, b) => a.d - b.d)[0]
      if (hitStructure) {
        set({
          structures: get().structures.filter((s) => s.id !== hitStructure.s.id),
          balance: get().balance + buildingById(hitStructure.s.kind).cost * 0.4,
        })
        sfx('erase')
        get().setStatus(`${buildingById(hitStructure.s.kind).name} cleared.`, true)
        persist()
        return
      }
      const hitEdge = nearestEdge(get().network, x, z, 50)
      if (hitEdge) {
        set({
          network: removeEdge(get().network, hitEdge.edge.id),
          balance: get().balance + lineCost(hitEdge.edge.length, hitEdge.edge.bridged) * 0.3,
        })
        sfx('erase')
        get().setStatus('Line lifted.', true)
        return
      }
      sfx('deny')
      get().setStatus('Nothing there to clear.', false)
    },

    advance: (dt) => {
      const s = get()
      if (!s.running) return
      const scale = s.speed === 'slow' ? 0.6 : s.speed === 'fast' ? 2.2 : 1
      const step = dt * scale
      const result = tick(field, s.network, s.structures, s.settlements, s.trains, step)
      const spend = (upkeepTotal(s.structures) / MONTH_SECONDS) * step
      set({
        settlements: result.settlements,
        balance: Math.max(0, s.balance + result.income - spend),
        passengers: s.passengers + result.passengers,
        months: s.months + step / MONTH_SECONDS,
        trains: Math.min(s.trains, trainCapacity(s.structures)),
      })
      persist()
    },

    reset: () => {
      discard(SAVE)
      set({
        network: emptyNetwork(),
        structures: [],
        settlements: freshSettlements(),
        balance: STARTING_FUNDS,
        passengers: 0,
        months: 0,
        status: { text: 'A fresh country. Drag to lay your first line.', ok: true },
      })
    },
  }
})

export const TOOL_HINT: Record<RegionTool, string> = {
  look: 'Drag to travel over the country, wheel to zoom, right-drag to turn.',
  rail: 'Drag from one place to another to lay a line. Drop an end near existing track to make a junction.',
  raise: 'Click a line to carry it four metres higher. Keep clicking for an embankment or a viaduct.',
  lower: 'Click a line to drop it four metres. Keep clicking to sink it into a cutting.',
  build: 'Click where the building should stand. Everything but the water tower needs to be beside the line.',
  demolish: 'Click a building or a length of line to clear it. You get some of the money back.',
}

/* -------------------------------------------------------------- selectors */

export const regionField = field
/**
 * Derived views of the region. Anything returning a fresh array or object must
 * NOT be passed straight to `useRegion(...)` — zustand compares by identity, so
 * a new reference every read re-renders forever. Compute those in a `useMemo`
 * keyed on the scalars they depend on instead.
 */
export const selectReports = (s: RegionState): TownReport[] =>
  survey(field, s.network, s.structures, s.settlements, s.trains)
export const selectPopulation = (s: RegionState) => Math.round(totalPopulation(s.settlements))
export const selectUpkeep = (s: RegionState) => upkeepTotal(s.structures)
export const selectMiles = (s: RegionState) => totalLength(s.network) / 1000
export const selectCapacity = (s: RegionState) => trainCapacity(s.structures)
export const selectStations = (s: RegionState) => s.structures.filter((b) => isStation(b.kind)).length
export const groundAt = (x: number, z: number) => heightAt(field, x, z)
