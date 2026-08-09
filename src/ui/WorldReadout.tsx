import { tileAt } from '../game/grid'
import type { World } from '../game/types'
import { useGame } from '../store/useGame'
import type { CameraPreset } from '../three/viewpoints'
import { Icon, type IconName } from './Icon'

const VIEWS: Array<{ id: CameraPreset; icon: IconName; label: string }> = [
  { id: 'west', icon: 'west', label: 'West viewpoint' },
  { id: 'home', icon: 'home', label: 'Home viewpoint' },
  { id: 'east', icon: 'east', label: 'East viewpoint' },
]

const ground = (kind: string, tunnel: boolean) => {
  if (kind === 'rock') return tunnel ? 'Rock, tunnelled' : 'Rock'
  if (kind === 'water') return 'Water'
  if (kind === 'forest') return 'Pines'
  return 'Grass'
}

/** The surveyor's instrument: what is under the pointer, and where to stand. */
export function WorldReadout({ world }: { world: World }) {
  const hovered = useGame((s) => s.hovered)
  const camera = useGame((s) => s.camera)
  const setCamera = useGame((s) => s.setCamera)
  const tile = hovered ? tileAt(world, hovered) : null

  return (
    <div className="readout">
      <div className="readout__tile pane">
        <span>
          Tile <b>{hovered ? `${hovered.x + 1}, ${hovered.z + 1}` : '—'}</b>
        </span>
        <span>
          Level <b>{tile ? tile.h : '—'}</b>
        </span>
        <span>
          <b>{tile ? ground(tile.kind, tile.tunnel) : '—'}</b>
        </span>
      </div>
      <div className="views pane" role="group" aria-label="Camera viewpoints">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={camera === v.id}
            aria-label={v.label}
            title={v.label}
            onClick={() => setCamera(v.id)}
          >
            <Icon name={v.icon} size={17} />
          </button>
        ))}
      </div>
    </div>
  )
}
