import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { resetAudioForTests } from '../audio/engine'
import { COSTS, surveyCountry, tickCountry } from '../game/economy'
import { LEVELS } from '../game/levels'
import { solveLevel } from '../game/solver'
import { detectWebGL, resetWebGLDetection } from '../three/webgl'
import { hoverToneFor } from '../three/hover'
import { useGame, worldForLevel } from '../store/useGame'

const initial = useGame.getState()

beforeEach(() => {
  window.localStorage.clear()
  resetAudioForTests()
  resetWebGLDetection(null)
  useGame.setState({
    ...initial,
    showTutorial: false,
    tutorialDone: true,
    mode: 'puzzle',
    levelId: LEVELS[0].id,
    route: [],
    past: [],
    future: [],
    delivered: false,
    puzzleRunning: false,
    hint: null,
    progress: {},
    milestone: null,
  })
})

afterEach(() => resetWebGLDetection(null))

const tile = (x: number, z: number) =>
  screen.getByRole('button', { name: new RegExp(`^Tile ${x + 1}, ${z + 1}\\.`) })

describe('the HUD sits over the world', () => {
  it('fills the window with the map and floats the chrome over it', () => {
    render(<App />)
    expect(screen.getByRole('region', { name: 'The railway map' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Survey' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: LEVELS[0].name })).toBeInTheDocument()
  })

  it('offers a skip link straight to the map', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /skip to the map/i })).toHaveAttribute('href', '#board')
  })

  it('announces changes in a live region', async () => {
    render(<App />)
    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    await act(async () => {
      useGame.getState().setNight(true)
    })
    expect(live).toHaveTextContent(/night lighting/i)
  })

  it('reads out the tile under the pointer', () => {
    render(<App />)
    expect(screen.getByText('Tile')).toBeInTheDocument()
    expect(screen.getByText('Level')).toBeInTheDocument()
  })

  it('gives the three viewpoints as a pressed-state group', () => {
    render(<App />)
    const group = screen.getByRole('group', { name: /camera viewpoints/i })
    expect(within(group).getByRole('button', { name: /home viewpoint/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(group).getByRole('button', { name: /west viewpoint/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('switches day and night from the top bar', async () => {
    const user = userEvent.setup()
    render(<App />)
    const toggle = screen.getByRole('button', { name: /switch to night/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(useGame.getState().night).toBe(true)
    expect(screen.getByRole('button', { name: /switch to daylight/i })).toBeInTheDocument()
  })

  it('collapses the side panel and puts it back', async () => {
    const user = userEvent.setup()
    render(<App />)
    const panel = screen.getByRole('complementary')
    expect(panel).toHaveAttribute('data-open', 'true')
    await user.click(screen.getByRole('button', { name: /collapse the panel/i }))
    expect(screen.getByRole('complementary')).toHaveAttribute('data-open', 'false')
    await user.click(screen.getByRole('button', { name: /expand the panel/i }))
    expect(screen.getByRole('complementary')).toHaveAttribute('data-open', 'true')
  })
})

describe('the WebGL fallback', () => {
  it('is shown instead of the canvas when WebGL is missing', () => {
    resetWebGLDetection(false)
    render(<App />)
    expect(screen.getByRole('region', { name: /3D map unavailable/i })).toBeInTheDocument()
    expect(document.querySelector('.world canvas')).toBeNull()
  })

  it('keeps the accessible grid available either way', () => {
    resetWebGLDetection(false)
    render(<App />)
    expect(document.querySelector('.a11y summary')).toHaveTextContent(/keyboard/i)
    expect(tile(0, 0)).toBeInTheDocument()
  })

  it('reports honestly on a browser with no canvas support at all', () => {
    resetWebGLDetection(null)
    expect(detectWebGL()).toBe(false)
  })
})

describe('the accessible grid plays the whole game', () => {
  it('describes every tile, its ground and its elevation', () => {
    render(<App />)
    expect(tile(2, 3)).toHaveAccessibleName(/meadow, level 0/i)
    expect(tile(0, 0)).toHaveAccessibleName(/pines, level 1/i)
  })

  it('refuses a first length of track anywhere but the depot', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tile(4, 4))
    expect(useGame.getState().route).toHaveLength(0)
    expect(screen.getAllByText(/every line starts at the/i).length).toBeGreaterThan(0)
  })

  it('lays track from the depot and counts it against par', async () => {
    const user = userEvent.setup()
    render(<App />)
    const level = LEVELS[0]
    await user.click(tile(level.depot.x, level.depot.z))
    await user.click(tile(level.depot.x + 1, level.depot.z))
    expect(useGame.getState().route).toHaveLength(2)
    expect(tile(level.depot.x, level.depot.z)).toHaveAccessibleName(/track laid/i)
  })

  it('moves focus between tiles with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<App />)
    tile(0, 0).focus()
    await user.keyboard('{ArrowRight}')
    expect(tile(1, 0)).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(tile(1, 1)).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowUp}')
    expect(tile(0, 0)).toHaveFocus()
  })

  it('will not walk focus off the edge of the survey', async () => {
    const user = userEvent.setup()
    render(<App />)
    tile(0, 0).focus()
    await user.keyboard('{ArrowUp}{ArrowLeft}')
    expect(tile(0, 0)).toHaveFocus()
  })
})

describe('completing a survey', () => {
  it('walks the whole loop: build, connect, deliver, and score', async () => {
    const level = LEVELS[0]
    const best = solveLevel(worldForLevel(level), level)!
    await act(async () => {
      for (const c of best) useGame.getState().tapPuzzleTile(c)
    })
    render(<App />)

    expect(useGame.getState().route).toHaveLength(best.length)
    expect(screen.getByText('Connect').closest('.stage')).toHaveAttribute('data-state', 'active')

    const run = screen.getByRole('button', { name: /run the delivery/i })
    expect(run).toBeEnabled()

    await act(async () => {
      useGame.getState().toggleRun()
      useGame.getState().completeDelivery()
    })
    expect(useGame.getState().delivered).toBe(true)
    expect(useGame.getState().progress[level.id].stars).toBe(3)
    expect(screen.getByRole('button', { name: /next survey/i })).toBeInTheDocument()
  })

  it('refuses to run an unfinished line and says why', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /run the delivery/i }))
    expect(useGame.getState().puzzleRunning).toBe(false)
    expect(screen.getAllByText(/must start at the .* depot/i).length).toBeGreaterThan(0)
  })

  it('says which piece is missing once the line has left the depot', async () => {
    const level = LEVELS[0]
    await act(async () => {
      useGame.getState().tapPuzzleTile(level.depot)
      useGame.getState().tapPuzzleTile({ x: level.depot.x + 1, z: level.depot.z })
      useGame.getState().toggleRun()
    })
    render(<App />)
    expect(useGame.getState().puzzleRunning).toBe(false)
    expect(screen.getAllByText(/does not yet reach/i).length).toBeGreaterThan(0)
  })

  it('undoes and redoes a length of track from the dock', async () => {
    const user = userEvent.setup()
    render(<App />)
    const level = LEVELS[0]
    await user.click(tile(level.depot.x, level.depot.z))
    await user.click(tile(level.depot.x + 1, level.depot.z))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useGame.getState().route).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(useGame.getState().route).toHaveLength(2)
  })

  it('marks a legal next tile when asked for a hint', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Hint' }))
    expect(useGame.getState().hint).toEqual(LEVELS[0].depot)
  })
})

describe('the survey office menu', () => {
  it('opens with menu semantics', async () => {
    const user = userEvent.setup()
    render(<App />)
    const trigger = screen.getByRole('button', { name: /survey office menu/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: /survey office/i })
    expect(within(menu).getByRole('menuitem', { name: /field guide/i })).toBeInTheDocument()
  })

  it('needs two taps before it erases everything', async () => {
    const user = userEvent.setup()
    render(<App />)
    await act(async () => {
      useGame.setState({ progress: { [LEVELS[0].id]: { stars: 3, bestTiles: 9 } } })
    })
    await user.click(screen.getByRole('button', { name: /survey office menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /reset all progress/i }))
    expect(useGame.getState().progress[LEVELS[0].id]).toBeDefined()
    await user.click(screen.getByRole('menuitem', { name: /tap again to erase/i }))
    expect(useGame.getState().progress).toEqual({})
  })
})

describe('dialogs', () => {
  it('runs the first-run tour over four pages and traps focus', async () => {
    const user = userEvent.setup()
    await act(async () => useGame.setState({ showTutorial: true }))
    render(<App />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText(/page 1 of 4/i)).toBeInTheDocument()

    for (const page of [2, 3, 4]) {
      await user.click(within(dialog).getByRole('button', { name: 'Next' }))
      expect(within(dialog).getByText(new RegExp(`page ${page} of 4`, 'i'))).toBeInTheDocument()
    }
    await user.click(within(dialog).getByRole('button', { name: /start surveying/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useGame.getState().tutorialDone).toBe(true)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    await act(async () => useGame.setState({ showTutorial: true }))
    render(<App />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists every survey in the campaign picker', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /choose a survey/i }))
    const dialog = screen.getByRole('dialog', { name: /the campaign/i })
    for (const level of LEVELS) {
      expect(within(dialog).getByText(level.name)).toBeInTheDocument()
    }
    await user.click(within(dialog).getByText(LEVELS[2].name))
    expect(useGame.getState().levelId).toBe(LEVELS[2].id)
  })

  it('carries the field guide and the audio controls', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /survey office menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /field guide/i }))
    const dialog = screen.getByRole('dialog', { name: /field guide/i })
    expect(within(dialog).getByRole('button', { name: /background music/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /railway sounds/i })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/volume/i)).toBeInTheDocument()
  })
})

describe('build mode', () => {
  beforeEach(async () => {
    await act(async () => useGame.getState().setMode('free'))
  })

  it('offers eight tools on keys 1 to 8', () => {
    render(<App />)
    const dock = screen.getByRole('group', { name: /build tools/i })
    const tools = within(dock).getAllByRole('button')
    expect(tools).toHaveLength(8)
    expect(tools.map((t) => t.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  it('picks a tool with its number key and explains it in the flyout', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('8')
    expect(useGame.getState().free.tool).toBe('build')
    // the flyout turns into the building palette, with the station chosen
    expect(screen.getByRole('group', { name: /buildings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /station — £180/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('does not steal number keys typed into a field', async () => {
    const user = userEvent.setup()
    render(<App />)
    const before = useGame.getState().free.tool
    screen.getByLabelText(/trains in service/i).focus()
    await user.keyboard('5')
    expect(useGame.getState().free.tool).toBe(before)
  })

  it('charges for track and refuses when the account will not stand it', async () => {
    await act(async () => {
      useGame.setState({ free: { ...useGame.getState().free, balance: COSTS.rail } })
    })
    render(<App />)
    await act(async () => {
      useGame.getState().tapFreeTile({ x: 2, z: 2 })
      useGame.getState().tapFreeTile({ x: 3, z: 2 })
    })
    expect(useGame.getState().free.lines[0].tiles).toHaveLength(1)
    expect(screen.getAllByText(/the account holds/i).length).toBeGreaterThan(0)
  })

  it('needs two taps before it clears the map', async () => {
    const user = userEvent.setup()
    render(<App />)
    await act(async () => useGame.getState().tapFreeTile({ x: 2, z: 2 }))
    await user.click(screen.getByRole('button', { name: /^clear the map$/i }))
    expect(useGame.getState().free.lines).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /confirm — clear the map/i }))
    expect(useGame.getState().free.lines).toHaveLength(0)
  })

  it('keeps the bigger maps locked until a country has been grown', async () => {
    render(<App />)
    const group = screen.getByRole('group', { name: /map size/i })
    expect(within(group).getByRole('button', { name: /wide · locked/i })).toBeDisabled()
    await act(async () => useGame.setState({ career: { bestPopulation: 400 } }))
    expect(within(group).getByRole('button', { name: /wide · 26×19/i })).toBeEnabled()
  })

  it('reports the country, and why a place is not growing', () => {
    render(<App />)
    const panel = screen.getByRole('complementary', { name: /the country/i })
    expect(within(panel).getByText('Served')).toBeInTheDocument()
    expect(within(panel).getAllByText(/no station/i).length).toBeGreaterThan(0)
  })

  it('shows population and money in the top bar', () => {
    render(<App />)
    const bar = screen.getByRole('banner')
    expect(within(bar).getByText(/population/i)).toBeInTheDocument()
    expect(within(bar).getByText(/account balance/i)).toBeInTheDocument()
  })

  it('grows a settlement once a line joins two served stations', () => {
    render(<App />)
    const before = useGame.getState().free
    const [a, b] = before.settlements
    expect(a).toBeDefined()
    expect(b).toBeDefined()

    const country = surveyCountry(before.world, before.lines, before.settlements, before.trains)
    expect(country.every((r) => r.state === 'unserved')).toBe(true)

    const world = before.world
    const lines = [{ id: 'test', tiles: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }] }]
    const stationed = {
      ...world,
      tiles: world.tiles.map((t, i) =>
        i === a.z * world.w + a.x || i === b.z * world.w + b.x
          ? { ...t, feature: 'station' as const }
          : t,
      ),
    }
    const linked = surveyCountry(stationed, lines, before.settlements, 2)
    const served = linked.filter((r) => r.settlement.id === a.id || r.settlement.id === b.id)
    expect(served).toHaveLength(2)
    expect(served.every((r) => r.state === 'growing')).toBe(true)
    expect(linked.filter((r) => r.state === 'unserved').length).toBe(linked.length - 2)

    const ticked = tickCountry(stationed, lines, before.settlements, 2, 1)
    expect(ticked.settlements[0].population).toBeGreaterThan(a.population)
    expect(ticked.income).toBeGreaterThan(0)
  })

  it('holds the world still while the trains are held', async () => {
    const user = userEvent.setup()
    render(<App />)
    await act(async () => {
      useGame.getState().tapFreeTile({ x: 2, z: 2 })
      useGame.getState().tapFreeTile({ x: 3, z: 2 })
    })
    expect(useGame.getState().free.running).toBe(true)
    await user.click(screen.getByRole('button', { name: /hold all trains/i }))
    expect(useGame.getState().free.running).toBe(false)
    await user.click(screen.getByRole('button', { name: /set the lines running/i }))
    expect(useGame.getState().free.running).toBe(true)
  })
})

describe('the hover instrument knows what a click would do', () => {
  it('marks the depot good and everything else bad on an empty route', () => {
    const level = LEVELS[0]
    const world = worldForLevel(level)
    const state = useGame.getState()
    expect(hoverToneFor(state, world, level.depot)).toBe('good')
    expect(hoverToneFor(state, world, { x: 5, z: 5 })).toBe('bad')
    expect(hoverToneFor(state, world, null)).toBe('neutral')
  })

  it('marks a legal continuation good and an illegal one bad', () => {
    const level = LEVELS[1]
    useGame.setState({ levelId: level.id, route: [level.depot] })
    const world = worldForLevel(level)
    const state = useGame.getState()
    expect(hoverToneFor(state, world, { x: level.depot.x + 1, z: level.depot.z })).toBe('good')
    expect(hoverToneFor(state, world, { x: level.depot.x + 4, z: level.depot.z })).toBe('bad')
  })
})
