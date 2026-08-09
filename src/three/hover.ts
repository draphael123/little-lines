import { keyOf, sameCoord } from '../game/grid'
import { LEVELS, levelById } from '../game/levels'
import { extendCheck, occupiedTiles } from '../game/track'
import type { Coord, LevelDef, World } from '../game/types'
import type { GameState } from '../store/useGame'

export type HoverTone = 'good' | 'bad' | 'neutral'

export const resolveLevel = (id: string): LevelDef => levelById(id) ?? LEVELS[0]

/** Would clicking the hovered tile actually do something? Colours the outline. */
export function hoverToneFor(state: GameState, world: World, hovered: Coord | null): HoverTone {
  if (!hovered) return 'neutral'
  if (state.mode === 'puzzle') {
    if (state.puzzleRunning || state.delivered) return 'neutral'
    const level = resolveLevel(state.levelId)
    if (state.route.length === 0) return sameCoord(hovered, level.depot) ? 'good' : 'bad'
    if (sameCoord(state.route[state.route.length - 1], hovered)) return 'neutral'
    return extendCheck(world, state.route, hovered, { bridgeBudget: level.bridgeBudget }).ok
      ? 'good'
      : 'bad'
  }
  const free = state.free
  if (free.tool !== 'rail') return 'neutral'
  const active = free.lines.find((l) => l.id === free.activeLineId)
  if (!active) return occupiedTiles(free.lines).has(keyOf(hovered)) ? 'neutral' : 'good'
  if (sameCoord(active.tiles[active.tiles.length - 1], hovered)) return 'neutral'
  return extendCheck(world, active.tiles, hovered, {
    occupied: occupiedTiles(free.lines, active.id),
  }).ok
    ? 'good'
    : 'bad'
}
