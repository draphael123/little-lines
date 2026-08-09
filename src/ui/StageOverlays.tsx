import { tileAt } from '../game/grid'
import type { World } from '../game/types'
import { useGame } from '../store/useGame'
import type { CameraPreset } from '../three/viewpoints'

const VIEWPOINTS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'west', label: 'West' },
  { id: 'home', label: 'Home' },
  { id: 'east', label: 'East' },
]

const LEVEL_SWATCHES = ['#7f9263', '#738656', '#66794e', '#5b6d47', '#536440']

export function StageOverlays({ world }: { world: World }) {
  const camera = useGame((s) => s.camera)
  const setCamera = useGame((s) => s.setCamera)
  const hovered = useGame((s) => s.hovered)
  const tile = hovered ? tileAt(world, hovered) : null

  return (
    <div className="stage__overlay" aria-hidden={false}>
      <div className="stage__row">
        <div className="viewpoints" role="group" aria-label="Camera viewpoints">
          {VIEWPOINTS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={camera === v.id}
              onClick={() => setCamera(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="instrument">
          <dl>
            <dt>Tile</dt>
            <dd>{hovered ? `${hovered.x + 1} · ${hovered.z + 1}` : '—'}</dd>
            <dt>Elevation</dt>
            <dd>{tile ? `Level ${tile.h}` : '—'}</dd>
            <dt>Ground</dt>
            <dd style={{ fontSize: 12 }}>{tile ? groundLabel(tile.kind, tile.tunnel) : '—'}</dd>
          </dl>
        </div>
      </div>

      <div className="stage__row" style={{ alignItems: 'flex-end' }}>
        <div className="legend">
          <h3>Elevation</h3>
          <ul>
            {LEVEL_SWATCHES.map((colour, i) => (
              <li key={colour}>
                <i style={{ background: colour, height: 5 + i * 4 }} />
                {i}
              </li>
            ))}
          </ul>
        </div>
        <div className="legend" aria-hidden="true">
          <h3>Table</h3>
          <ul>
            <li>
              <i style={{ background: '#456279', height: 12 }} />
              Water
            </li>
            <li>
              <i style={{ background: '#8b8579', height: 12 }} />
              Rock
            </li>
            <li>
              <i style={{ background: '#a8853f', height: 12 }} />
              Halt
            </li>
            <li>
              <i style={{ background: '#a33224', height: 12 }} />
              Terminus
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function groundLabel(kind: string, tunnel: boolean) {
  if (kind === 'rock') return tunnel ? 'Rock, tunnelled' : 'Solid rock'
  if (kind === 'water') return 'Open water'
  if (kind === 'forest') return 'Pine stand'
  return 'Meadow'
}
