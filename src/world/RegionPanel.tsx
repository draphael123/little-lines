import { Icon } from '../ui/Icon'
import { components, totalLength, type RailNetwork } from './rail'

interface RegionPanelProps {
  network: RailNetwork
  laying: boolean
  status: { text: string; ok: boolean }
  onLaying: (laying: boolean) => void
  onClear: () => void
}

/** Controls for the continuous region while the rest of it is being built. */
export function RegionPanel({ network, laying, status, onLaying, onClear }: RegionPanelProps) {
  const miles = totalLength(network) / 1000
  const railways = components(network).length

  return (
    <aside className="side pane" aria-label="The region">
      <div className="side__head">
        <h2>The region</h2>
      </div>
      <div className="side__body">
        <div className="grid2">
          <div className="metric">
            <b>
              {miles.toFixed(2)} <small>km</small>
            </b>
            <span>Line laid</span>
          </div>
          <div className="metric">
            <b>{railways}</b>
            <span>{railways === 1 ? 'Railway' : 'Separate railways'}</span>
          </div>
          <div className="metric">
            <b>{network.edges.length}</b>
            <span>Sections</span>
          </div>
          <div className="metric">
            <b>{Object.keys(network.nodes).length}</b>
            <span>Junctions</span>
          </div>
        </div>

        <div className="status" data-tone={status.ok ? 'good' : 'warn'}>
          <b>{status.text}</b>
        </div>

        <div className="chips" role="group" aria-label="Region tools">
          <button
            type="button"
            className="chip"
            aria-pressed={laying}
            onClick={() => onLaying(true)}
          >
            <Icon name="rail" size={15} /> Lay rail
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={!laying}
            onClick={() => onLaying(false)}
          >
            <Icon name="home" size={15} /> Look around
          </button>
        </div>

        <p className="lede">
          <strong>Drag across the country</strong> to lay a line. It leaves a junction along the
          direction the track was already running, cuts through the high ground and is carried over
          the low, and refuses any gradient a locomotive could not work. Drop an end near existing
          track and it joins on.
        </p>
        <p className="lede">
          In <strong>Look around</strong>, drag to travel and the wheel to zoom. Right-drag turns
          the view in either mode, and W A S D always pans.
        </p>

        <div className="chips">
          <button type="button" className="btn" onClick={onClear}>
            Lift every line
          </button>
        </div>

        <p className="lede" style={{ color: 'var(--text-faint)' }}>
          Stations, towns that sprawl into cities, and trains are going in next. The tile game is
          still on the other two tabs until they land.
        </p>
      </div>
    </aside>
  )
}
