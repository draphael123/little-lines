/**
 * The stack you draw from.
 *
 * Tiles are generated rather than authored, but not at random: a tile drawn one
 * edge at a time is confetti, and a board of confetti never matches anything,
 * which reads to the player as the game cheating. So every tile is built from
 * an archetype — a plain field, two grounds meeting along an arc, a through
 * line, a junction, a station — and the grounds inside it are laid down in
 * contiguous runs. The result is a tile that looks like somewhere.
 *
 * Roughly half the stack carries rail. Much less and the network never gets
 * going; much more and the countryside disappears under track.
 */
import { chanceOf, nextInt, pickWeighted, type Roll } from './rng'
import { GROUNDS, type EdgeKind, type Ground, type QuestSpec, type Tile } from './tiles'

type Archetype = 'plain' | 'split' | 'line' | 'junction' | 'station' | 'halt'

const ARCHETYPES: ReadonlyArray<Archetype> = ['plain', 'split', 'line', 'junction', 'station', 'halt']
const ARCHETYPE_WEIGHTS: ReadonlyArray<number> = [16, 24, 27, 8, 15, 6]

const GROUND_WEIGHTS: ReadonlyArray<number> = [30, 26, 20, 10, 14]

/** What a station is likely to have around it. Stations stand near people. */
const STATION_GROUNDS: ReadonlyArray<Ground> = ['town', 'meadow', 'crop']
const STATION_GROUND_WEIGHTS: ReadonlyArray<number> = [46, 34, 20]

const QUEST_CHANCE = 0.18

function pickGround(state: number): Roll<Ground> {
  return pickWeighted(state, GROUNDS, GROUND_WEIGHTS)
}

/**
 * Fill every edge that is not rail, using one ground for most of the tile and
 * sometimes a second along a contiguous arc. Runs rather than speckle: two
 * neighbouring tiles can only match along one border, so a tile whose grounds
 * alternate is a tile that can never be placed well.
 */
function fillGrounds(state: number, edges: EdgeKind[], preferStation: boolean): number {
  let cursor = state

  const primaryRoll = preferStation
    ? pickWeighted(cursor, STATION_GROUNDS, STATION_GROUND_WEIGHTS)
    : pickGround(cursor)
  cursor = primaryRoll.state
  const primary = primaryRoll.value

  for (let i = 0; i < 6; i += 1) if (edges[i] !== 'rail') edges[i] = primary

  const second = chanceOf(cursor, 0.55)
  cursor = second.state
  if (!second.value) return cursor

  const secondaryRoll = pickGround(cursor)
  cursor = secondaryRoll.state
  if (secondaryRoll.value === primary) return cursor

  const startRoll = nextInt(cursor, 6)
  cursor = startRoll.state
  const lengthRoll = nextInt(cursor, 3)
  cursor = lengthRoll.state

  const run = lengthRoll.value + 1
  for (let step = 0; step < run; step += 1) {
    const index = (startRoll.value + step) % 6
    if (edges[index] !== 'rail') edges[index] = secondaryRoll.value
  }
  return cursor
}

/** Rail leaves a tile at two edges that are not next to each other. */
function layThroughLine(state: number, edges: EdgeKind[]): number {
  const first = nextInt(state, 6)
  let cursor = first.state
  const spread = nextInt(cursor, 3)
  cursor = spread.state

  edges[first.value] = 'rail'
  edges[(first.value + spread.value + 2) % 6] = 'rail'
  return cursor
}

function layJunction(state: number, edges: EdgeKind[]): number {
  const first = nextInt(state, 6)
  edges[first.value] = 'rail'
  edges[(first.value + 2) % 6] = 'rail'
  edges[(first.value + 4) % 6] = 'rail'
  return first.state
}

function layStub(state: number, edges: EdgeKind[]): number {
  const first = nextInt(state, 6)
  edges[first.value] = 'rail'
  return first.state
}

/* ------------------------------------------------------------------ quests */

function questFor(state: number, tile: Tile): Roll<QuestSpec | undefined> {
  const asked = chanceOf(state, QUEST_CHANCE)
  let cursor = asked.state
  if (!asked.value) return { value: undefined, state: cursor }

  if (tile.station) {
    const target = nextInt(cursor, 3)
    cursor = target.state
    return { value: { kind: 'stations', target: target.value + 2 }, state: cursor }
  }

  // Only ever ask about ground the tile actually has, so the group a quest
  // counts is never empty at the moment it is created.
  const present = [...new Set(tile.edges.filter((edge) => edge !== 'rail'))] as Ground[]
  if (present.length === 0) return { value: undefined, state: cursor }

  const chosen = nextInt(cursor, present.length)
  cursor = chosen.state
  const target = nextInt(cursor, 6)
  cursor = target.state

  return {
    value: { kind: 'group', ground: present[chosen.value], target: target.value + 5 },
    state: cursor,
  }
}

/* ------------------------------------------------------------------- tiles */

export function drawTile(state: number): Roll<Tile> {
  const archetypeRoll = pickWeighted(state, ARCHETYPES, ARCHETYPE_WEIGHTS)
  let cursor = archetypeRoll.state
  const edges: EdgeKind[] = new Array<EdgeKind>(6).fill('meadow')

  let station = false
  switch (archetypeRoll.value) {
    case 'plain':
      break
    case 'split':
      break
    case 'line':
      cursor = layThroughLine(cursor, edges)
      break
    case 'junction':
      cursor = layJunction(cursor, edges)
      break
    case 'halt':
      cursor = layStub(cursor, edges)
      break
    case 'station': {
      const double = chanceOf(cursor, 0.7)
      cursor = double.state
      cursor = double.value ? layThroughLine(cursor, edges) : layStub(cursor, edges)
      station = true
      break
    }
  }

  // A plain tile is one ground all the way round; everything else may have two.
  if (archetypeRoll.value === 'plain') {
    const only = pickGround(cursor)
    cursor = only.state
    for (let i = 0; i < 6; i += 1) edges[i] = only.value
  } else {
    cursor = fillGrounds(cursor, edges, station)
  }

  const tile: Tile = { edges, station }
  const quest = questFor(cursor, tile)
  cursor = quest.state

  return { value: quest.value ? { ...tile, quest: quest.value } : tile, state: cursor }
}

/**
 * The tile the board opens with: a station on a through line, so the very first
 * quest about joining stations has somewhere to start from, and so the player's
 * first placement has rail to answer.
 */
export function openingTile(): Tile {
  return {
    edges: ['rail', 'town', 'meadow', 'rail', 'meadow', 'town'],
    station: true,
  }
}

/** How many tiles a run begins with. */
export const OPENING_STACK = 42
