/**
 * What the country asks of you.
 *
 * A quest arrives already attached to a tile, and it is only ever about the
 * ground that tile already has — so the moment you put it down, the thing it is
 * asking about exists and is at least one tile big. Progress is never stored;
 * it is read off the board every time, which means a quest cannot drift out of
 * step with what is actually there.
 *
 * A quest can be missed, but not failed. If a wood finishes growing at five
 * tiles when it was asked for seven, it simply stops asking. Nothing is taken
 * away, and nothing you built stops working.
 */
import { groupAt, groupCanGrow, stationsJoinedTo, type Placed } from './board'
import type { HexKey } from './hex'
import { EDGE_LABEL, type QuestSpec } from './tiles'

export type QuestState = 'open' | 'done' | 'missed'

export interface Quest {
  id: number
  key: HexKey
  spec: QuestSpec
  state: QuestState
}

export interface Reward {
  tiles: number
  score: number
}

/**
 * Quests pay in score generously and in tiles sparingly. Score is the thing
 * you are playing for; tiles are only fuel, and a quest that refunds its own
 * size in fuel makes the stack grow faster than it is spent — measured, not
 * guessed at, in `balance.test.ts`.
 */
export function rewardFor(spec: QuestSpec): Reward {
  if (spec.kind === 'stations') return { tiles: 2 * spec.target, score: 120 * spec.target }
  return { tiles: Math.ceil(spec.target / 2), score: 40 * spec.target }
}

export function labelFor(spec: QuestSpec): string {
  if (spec.kind === 'stations') {
    return `Join this station to ${spec.target} more`
  }
  return `Grow this ${EDGE_LABEL[spec.ground]} to ${spec.target} tiles`
}

export interface Progress {
  progress: number
  target: number
  /** Whether what the quest counts could still get bigger. */
  canGrow: boolean
}

export function progressOf(tiles: Placed, quest: Quest): Progress {
  if (quest.spec.kind === 'stations') {
    return {
      progress: stationsJoinedTo(tiles, quest.key).length,
      target: quest.spec.target,
      // A station can always be joined to another one later; only the stack
      // running out ever closes this off.
      canGrow: true,
    }
  }

  const group = groupAt(tiles, quest.key, quest.spec.ground)
  return {
    progress: group.size,
    target: quest.spec.target,
    canGrow: groupCanGrow(tiles, group, quest.spec.ground),
  }
}

export interface Review {
  quests: Quest[]
  completed: Quest[]
  missed: Quest[]
  tilesWon: number
  scoreWon: number
}

/**
 * Settle every open quest against the board as it now stands. Called once after
 * each placement, because one tile can finish several at a time — that is the
 * moment the game is built around.
 */
export function reviewQuests(tiles: Placed, quests: ReadonlyArray<Quest>): Review {
  const next: Quest[] = []
  const completed: Quest[] = []
  const missed: Quest[] = []
  let tilesWon = 0
  let scoreWon = 0

  for (const quest of quests) {
    if (quest.state !== 'open') {
      next.push(quest)
      continue
    }

    const { progress, target, canGrow } = progressOf(tiles, quest)
    if (progress >= target) {
      const reward = rewardFor(quest.spec)
      tilesWon += reward.tiles
      scoreWon += reward.score
      const done: Quest = { ...quest, state: 'done' }
      completed.push(done)
      next.push(done)
      continue
    }

    if (!canGrow) {
      const gone: Quest = { ...quest, state: 'missed' }
      missed.push(gone)
      next.push(gone)
      continue
    }

    next.push(quest)
  }

  return { quests: next, completed, missed, tilesWon, scoreWon }
}

/** Open quests, nearest to finishing first — the order the HUD wants them in. */
export function openQuests(tiles: Placed, quests: ReadonlyArray<Quest>): Array<Quest & Progress> {
  return quests
    .filter((quest) => quest.state === 'open')
    .map((quest) => ({ ...quest, ...progressOf(tiles, quest) }))
    .sort((a, b) => b.progress / b.target - a.progress / a.target)
}
