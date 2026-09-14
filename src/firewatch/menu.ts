/**
 * The menus: the title card you arrive at, the pause screen behind Escape,
 * and the settings that both of them open.
 *
 * The markup lives in the page; this wires it up and owns which screen is
 * showing. It knows nothing about the scene — it hands changes back through
 * the hooks and lets the demo decide what they mean.
 */
import { DEFAULTS, loadSettings, saveSettings, type Settings } from './settings'

export type Screen = 'intro' | 'playing' | 'paused' | 'settings'

export interface MenuHooks {
  /** Leave the title card and start playing. */
  onBegin(): void
  /** Close the pause screen. */
  onResume(): void
  /** Back to the title card, with the world reset. */
  onQuit(): void
  /** Called on every change, and once at startup. */
  onSettings(settings: Settings): void
}

export interface Menu {
  readonly screen: Screen
  readonly settings: Settings
  show(screen: Screen): void
  /** True while anything other than the game is on screen. */
  open(): boolean
}

const byId = (id: string) => document.getElementById(id)

export function createMenu(hooks: MenuHooks): Menu {
  const settings = loadSettings()
  const screens: Record<Exclude<Screen, 'playing'>, HTMLElement | null> = {
    intro: byId('fw-intro'),
    paused: byId('fw-pause'),
    settings: byId('fw-settings'),
  }

  let screen: Screen = 'intro'
  // Where the settings screen came from, so Back goes where it should.
  let behind: Screen = 'intro'

  function show(next: Screen) {
    if (next === 'settings' && screen !== 'settings') behind = screen
    screen = next
    for (const [name, element] of Object.entries(screens)) {
      if (element) element.classList.toggle('is-on', name === next)
    }
    document.body.classList.toggle('fw-menu-open', next !== 'playing')
  }

  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings[key] = value
    saveSettings(settings)
    hooks.onSettings(settings)
  }

  /* ------------------------------------------------------------ controls */

  const slider = (id: string, key: 'sensitivity' | 'fov' | 'music' | 'ambience', show: (v: number) => string) => {
    const input = byId(id) as HTMLInputElement | null
    const readout = byId(`${id}-value`)
    if (!input) return
    input.value = String(settings[key])
    if (readout) readout.textContent = show(settings[key])
    input.addEventListener('input', () => {
      const value = Number(input.value)
      if (readout) readout.textContent = show(value)
      change(key, value)
    })
  }

  const toggle = (id: string, key: 'invertY' | 'bloom' | 'headBob') => {
    const button = byId(id) as HTMLButtonElement | null
    if (!button) return
    const paint = () => {
      button.setAttribute('aria-checked', String(settings[key]))
      button.textContent = settings[key] ? 'On' : 'Off'
    }
    paint()
    button.addEventListener('click', () => {
      change(key, !settings[key])
      paint()
    })
  }

  slider('fw-sensitivity', 'sensitivity', (v) => `${v.toFixed(2)}×`)
  slider('fw-fov', 'fov', (v) => `${Math.round(v)}°`)
  slider('fw-music', 'music', (v) => `${Math.round(v * 100)}%`)
  slider('fw-ambience', 'ambience', (v) => `${Math.round(v * 100)}%`)
  toggle('fw-invert', 'invertY')
  toggle('fw-bloom', 'bloom')
  toggle('fw-bob', 'headBob')

  const quality = byId('fw-quality')
  if (quality) {
    const paint = () => {
      quality.querySelectorAll('button').forEach((button) => {
        button.setAttribute('aria-checked', String(button.dataset.quality === settings.quality))
      })
    }
    quality.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        const chosen = button.dataset.quality
        if (chosen === 'low' || chosen === 'fair' || chosen === 'full') {
          change('quality', chosen)
          paint()
        }
      })
    })
    paint()
  }

  const reset = byId('fw-reset')
  reset?.addEventListener('click', () => {
    Object.assign(settings, DEFAULTS)
    saveSettings(settings)
    hooks.onSettings(settings)
    // Repaint every control from the defaults.
    const set = (id: string, key: keyof Settings, show?: (v: number) => string) => {
      const input = byId(id) as HTMLInputElement | null
      const readout = byId(`${id}-value`)
      if (input) input.value = String(settings[key])
      if (readout && show) readout.textContent = show(settings[key] as number)
    }
    set('fw-sensitivity', 'sensitivity', (v) => `${v.toFixed(2)}×`)
    set('fw-fov', 'fov', (v) => `${Math.round(v)}°`)
    set('fw-music', 'music', (v) => `${Math.round(v * 100)}%`)
    set('fw-ambience', 'ambience', (v) => `${Math.round(v * 100)}%`)
    ;(['fw-invert', 'fw-bloom', 'fw-bob'] as const).forEach((id, i) => {
      const button = byId(id)
      const key = (['invertY', 'bloom', 'headBob'] as const)[i]
      if (button) {
        button.setAttribute('aria-checked', String(settings[key]))
        button.textContent = settings[key] ? 'On' : 'Off'
      }
    })
    quality?.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.quality === settings.quality))
    })
  })

  byId('fw-begin')?.addEventListener('click', () => hooks.onBegin())
  byId('fw-resume')?.addEventListener('click', () => hooks.onResume())
  byId('fw-quit')?.addEventListener('click', () => hooks.onQuit())
  byId('fw-intro-settings')?.addEventListener('click', () => show('settings'))
  byId('fw-pause-settings')?.addEventListener('click', () => show('settings'))
  byId('fw-settings-back')?.addEventListener('click', () => {
    if (behind === 'playing') hooks.onResume()
    else show(behind)
  })

  hooks.onSettings(settings)
  show('intro')

  return {
    get screen() {
      return screen
    },
    settings,
    show,
    open: () => screen !== 'playing',
  }
}
