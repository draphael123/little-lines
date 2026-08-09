/**
 * A tile, drawn flat.
 *
 * The same hex the board draws in three dimensions, in SVG, so the player can
 * read what is in hand without hunting for it on the table. The mapping is
 * deliberately identical: corner `c` sits at sixty degrees times `c`, and SVG's
 * y runs the same way as the world's z under a camera looking down, so a tile
 * here is oriented exactly as it will land.
 */
import { cornersOfEdge } from '../lines/geometry'
import { GROUND_COLOUR, RAIL_IRON, SOIL, STATION_ROOF } from '../lines/look'
import { railEdges, type Tile } from '../lines/tiles'

const R = 34

const corner = (c: number) => {
  const angle = (Math.PI / 3) * c
  return { x: R * Math.cos(angle), y: R * Math.sin(angle) }
}

const edgeMid = (edge: number) => {
  const [a, b] = cornersOfEdge(edge)
  const ca = corner(a)
  const cb = corner(b)
  return { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 }
}

export function TileFace({
  tile,
  size = 76,
  turn = 0,
  label,
}: {
  tile: Tile | null
  size?: number
  /** Sixths of a turn, drawn as a rotation so the change reads as movement. */
  turn?: number
  label?: string
}) {
  if (!tile) {
    return (
      <svg viewBox="-40 -40 80 80" width={size} height={size} role="img" aria-label="No tile">
        <polygon
          points={[0, 1, 2, 3, 4, 5].map((c) => `${corner(c).x},${corner(c).y}`).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeDasharray="4 4"
        />
      </svg>
    )
  }

  const rails = railEdges(tile)

  return (
    <svg
      viewBox="-40 -40 80 80"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? 'The tile in hand'}
      style={{ transform: `rotate(${turn * 60}deg)`, transition: 'transform 140ms ease-out' }}
    >
      {tile.edges.map((kind, edge) => {
        const [a, b] = cornersOfEdge(edge)
        const ca = corner(a)
        const cb = corner(b)
        return (
          <polygon
            key={edge}
            points={`0,0 ${ca.x},${ca.y} ${cb.x},${cb.y}`}
            fill={GROUND_COLOUR[kind]}
            stroke={GROUND_COLOUR[kind]}
            strokeWidth={0.6}
          />
        )
      })}

      {rails.length === 2 ? (
        <path
          d={`M ${edgeMid(rails[0]).x} ${edgeMid(rails[0]).y} Q 0 0 ${edgeMid(rails[1]).x} ${edgeMid(rails[1]).y}`}
          fill="none"
          stroke={RAIL_IRON}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ) : (
        rails.map((edge) => (
          <line
            key={edge}
            x1={edgeMid(edge).x}
            y1={edgeMid(edge).y}
            x2={0}
            y2={0}
            stroke={RAIL_IRON}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ))
      )}

      {tile.station && <circle cx={0} cy={0} r={7} fill={STATION_ROOF} stroke="#f3ead6" strokeWidth={2} />}

      <polygon
        points={[0, 1, 2, 3, 4, 5].map((c) => `${corner(c).x},${corner(c).y}`).join(' ')}
        fill="none"
        stroke={SOIL}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {tile.quest && (
        <g transform={`translate(${R * 0.42}, ${-R * 0.52})`}>
          <line x1={0} y1={0} x2={0} y2={-13} stroke="#3b3630" strokeWidth={2} />
          <polygon points="0,-13 11,-9.5 0,-6" fill="#f0c14b" stroke="#3b3630" strokeWidth={1.2} />
        </g>
      )}
    </svg>
  )
}
