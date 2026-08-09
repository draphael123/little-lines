/**
 * The overlay: everything that is text.
 *
 * Canvas text is a poor citizen — it cannot be selected, read out, or scaled
 * with the browser's own settings — so the readouts, the cards and the tool
 * buttons are real DOM over the top of the scene.
 */

import { SIGILS } from './seal.ts'
import type { SigilKind } from './seal.ts'
import { summarise } from './game.ts'
import type { Game } from './game.ts'

export interface Handlers {
  onTool: (tool: SigilKind | null) => void
  onLight: () => void
  onAdvance: () => void
  onRetry: () => void
  onBegin: () => void
}

export interface UI {
  update: (game: Game) => void
  say: (message: string) => void
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export function createUI(root: HTMLElement, handlers: Handlers): UI {
  const overlay = el('div', 'overlay')

  // ------------------------------------------------------------ readouts
  const head = el('header', 'head')
  const who = el('div', 'who')
  const whoName = el('h1', 'who-name')
  const whoEpithet = el('p', 'who-epithet')
  who.append(whoName, whoEpithet)

  const gauges = el('div', 'gauges')
  const chalkGauge = el('div', 'gauge')
  const chalkLabel = el('span', 'gauge-label', 'Chalk')
  const chalkTrack = el('div', 'track')
  const chalkFill = el('i', 'fill chalk')
  chalkTrack.append(chalkFill)
  const chalkValue = el('span', 'gauge-value')
  chalkGauge.append(chalkLabel, chalkTrack, chalkValue)

  const timeGauge = el('div', 'gauge')
  const timeLabel = el('span', 'gauge-label', 'Until dawn')
  const timeTrack = el('div', 'track')
  const timeFill = el('i', 'fill time')
  timeTrack.append(timeFill)
  const timeValue = el('span', 'gauge-value')
  timeGauge.append(timeLabel, timeTrack, timeValue)

  gauges.append(chalkGauge, timeGauge)
  head.append(who, gauges)

  // --------------------------------------------------------------- tools
  const dock = el('div', 'dock')
  const tools = el('div', 'tools')
  const toolButtons: { key: SigilKind | null; button: HTMLButtonElement; cost: HTMLElement }[] = []

  const makeTool = (key: SigilKind | null, name: string, hint: string, cost: number, num: string) => {
    const button = el('button', 'tool')
    button.type = 'button'
    const row = el('span', 'tool-row')
    row.append(el('kbd', undefined, num), el('span', 'tool-name', name))
    const costEl = el('span', 'tool-cost', cost ? `${cost}` : 'free')
    button.append(row, el('span', 'tool-hint', hint), costEl)
    button.addEventListener('click', () => handlers.onTool(key))
    tools.append(button)
    toolButtons.push({ key, button, cost: costEl })
  }

  makeTool(null, 'Chalk', 'Drag to draw. Only the band counts.', 0, '1')
  makeTool('ward', SIGILS.ward.name, SIGILS.ward.note, SIGILS.ward.cost, '2')
  makeTool('anchor', SIGILS.anchor.name, SIGILS.anchor.note, SIGILS.anchor.cost, '3')
  makeTool('silence', SIGILS.silence.name, SIGILS.silence.note, SIGILS.silence.cost, '4')

  const lightButton = el('button', 'primary')
  lightButton.type = 'button'
  lightButton.textContent = 'Light the circle'
  lightButton.addEventListener('click', handlers.onLight)

  const status = el('p', 'status')
  dock.append(tools, lightButton, status)

  // --------------------------------------------------------------- cards
  const scrim = el('div', 'scrim')
  const card = el('div', 'card')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  const cardKicker = el('p', 'card-kicker')
  const cardTitle = el('h2', 'card-title')
  const cardBody = el('p', 'card-body')
  const cardTell = el('p', 'card-tell')
  const cardActions = el('div', 'card-actions')
  const cardPrimary = el('button', 'primary')
  cardPrimary.type = 'button'
  const cardSecondary = el('button', 'ghost')
  cardSecondary.type = 'button'
  cardActions.append(cardPrimary, cardSecondary)
  card.append(cardKicker, cardTitle, cardBody, cardTell, cardActions)
  scrim.append(card)

  const live = el('p', 'sr-only')
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')

  overlay.append(head, dock, scrim, live)
  root.append(overlay)

  let cardShown = ''

  const showCard = (
    kicker: string,
    title: string,
    body: string,
    tell: string,
    primary: string,
    onPrimary: () => void,
    secondary?: string,
    onSecondary?: () => void,
  ) => {
    cardKicker.textContent = kicker
    cardTitle.textContent = title
    cardBody.textContent = body
    cardTell.textContent = tell
    cardTell.hidden = !tell
    cardPrimary.textContent = primary
    cardPrimary.onclick = onPrimary
    if (secondary && onSecondary) {
      cardSecondary.hidden = false
      cardSecondary.textContent = secondary
      cardSecondary.onclick = onSecondary
    } else {
      cardSecondary.hidden = true
    }
    scrim.classList.add('open')
    cardPrimary.focus()
  }

  const hideCard = () => scrim.classList.remove('open')

  const update = (game: Game) => {
    const { summon, phase } = game
    whoName.textContent = summon.name
    whoEpithet.textContent = summon.epithet
    head.hidden = phase === 'title'

    const chalkPct = Math.max(0, Math.min(1, game.chalk / game.chalkMax))
    chalkFill.style.width = `${chalkPct * 100}%`
    chalkValue.textContent = String(Math.round(game.chalk))
    chalkFill.classList.toggle('low', chalkPct < 0.18)

    const left = Math.max(0, summon.duration - game.t)
    timeGauge.hidden = phase !== 'bind'
    timeFill.style.width = `${Math.max(0, Math.min(1, game.t / summon.duration)) * 100}%`
    timeValue.textContent = `${Math.ceil(left)}s`

    dock.hidden = phase !== 'inscribe' && phase !== 'bind'
    lightButton.hidden = phase !== 'inscribe'
    for (const { key, button } of toolButtons) {
      button.classList.toggle('on', game.tool === key)
      button.disabled = key !== null && game.chalk < SIGILS[key].cost
    }

    if (phase === 'inscribe') {
      status.textContent = game.tool
        ? `Click on the circle to set the ${SIGILS[game.tool].name.toLowerCase()}.`
        : 'Draw the circle. Chalk only counts between the two dotted rings.'
    } else if (phase === 'bind') {
      status.textContent = game.failing
        ? 'It is through — get chalk on it.'
        : 'Redraw the arcs that are burning. Click a sigil to snuff it.'
    }

    const key = `${phase}:${game.round}`
    if (key === cardShown) return
    cardShown = key

    if (phase === 'title') {
      showCard(
        'The Binding',
        'Something is coming up',
        'You have a stick of chalk and a floor. Draw the circle before you light it, and hold whatever answers until dawn. It will find the thinnest place you leave.',
        '',
        'Take up the chalk',
        handlers.onBegin,
      )
      return
    }
    if (phase === 'brief') {
      showCard(
        `Summons ${game.round + 1} of 3`,
        `${summon.name} — ${summon.epithet}`,
        summon.brief,
        summon.tell,
        'Draw the circle',
        handlers.onAdvance,
      )
      return
    }
    if (phase === 'held' || phase === 'dawn' || phase === 'broken') {
      const s = summarise(game)
      const broken = phase === 'broken'
      showCard(
        broken ? 'The circle broke' : phase === 'dawn' ? 'Dawn' : 'It held',
        broken ? `${summon.name} is out` : `${summon.name} is bound`,
        s.verdict,
        broken
          ? ''
          : `Chalk left ${s.chalkPct}% · patched ${s.saves} · breaches ${s.breaches}`,
        broken ? 'Again' : phase === 'dawn' ? 'Begin again' : 'Next summons',
        broken ? handlers.onRetry : handlers.onAdvance,
        broken ? undefined : 'Redraw this one',
        broken ? undefined : handlers.onRetry,
      )
      return
    }
    hideCard()
  }

  return {
    update,
    say: (message: string) => {
      live.textContent = message
    },
  }
}
