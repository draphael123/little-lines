import { useRef } from 'react'
import { idx, keyOf } from '../game/grid'
import { occupiedTiles } from '../game/track'
import type { Coord, RailLine, World } from '../game/types'

interface AccessibleGridProps {
  world: World
  lines: RailLine[]
  onPick: (c: Coord) => void
  onFocusTile: (c: Coord | null) => void
  label: string
}

/**
 * The survey as a real, focusable grid of buttons. It sits under the canvas in
 * the document so the game is playable with a keyboard or a screen reader even
 * though the headline experience is the 3D table.
 */
export function AccessibleGrid({
  world,
  lines,
  onPick,
  onFocusTile,
  label,
}: AccessibleGridProps) {
  const table = useRef<HTMLTableElement>(null)
  const rail = occupiedTiles(lines)

  const move = (from: Coord, dx: number, dz: number) => {
    const x = Math.max(0, Math.min(world.w - 1, from.x + dx))
    const z = Math.max(0, Math.min(world.h - 1, from.z + dz))
    const next = table.current?.querySelector<HTMLButtonElement>(`[data-tile="${x},${z}"]`)
    next?.focus()
  }

  return (
    <details className="a11y-board">
      <summary>Keyboard survey grid</summary>
      <p className="card__sub" style={{ margin: '4px 0 8px' }}>
        Arrow keys move between tiles; Enter or Space works the current tool on the focused tile.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="board-grid" ref={table}>
          <caption className="sr-only">{label}</caption>
          <tbody>
            {Array.from({ length: world.h }, (_, z) => (
              <tr key={z}>
                {Array.from({ length: world.w }, (_, x) => {
                  const tile = world.tiles[idx(world.w, x, z)]
                  const hasRail = rail.has(keyOf({ x, z }))
                  return (
                    <td key={x}>
                      <button
                        type="button"
                        data-tile={`${x},${z}`}
                        data-kind={tile.kind}
                        data-rail={hasRail}
                        onFocus={() => onFocusTile({ x, z })}
                        onBlur={() => onFocusTile(null)}
                        onClick={() => onPick({ x, z })}
                        onKeyDown={(e) => {
                          const map: Record<string, [number, number]> = {
                            ArrowLeft: [-1, 0],
                            ArrowRight: [1, 0],
                            ArrowUp: [0, -1],
                            ArrowDown: [0, 1],
                          }
                          const delta = map[e.key]
                          if (!delta) return
                          e.preventDefault()
                          move({ x, z }, delta[0], delta[1])
                        }}
                        aria-label={`Tile ${x + 1}, ${z + 1}. ${describe(tile.kind, tile.tunnel)}, level ${tile.h}.${hasRail ? ' Track laid.' : ''}`}
                      >
                        <span aria-hidden="true">{glyph(tile.kind, tile.tunnel, hasRail)}</span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function describe(kind: string, tunnel: boolean) {
  if (kind === 'rock') return tunnel ? 'rock with a tunnel' : 'solid rock'
  if (kind === 'water') return 'water'
  if (kind === 'forest') return 'pines'
  return 'meadow'
}

function glyph(kind: string, tunnel: boolean, rail: boolean) {
  if (rail) return '='
  if (kind === 'rock') return tunnel ? 'o' : '^'
  if (kind === 'water') return '~'
  if (kind === 'forest') return 'Y'
  return '·'
}
