/**
 * The land, as one mesh.
 *
 * The survey is still a grid underneath — track legality, catchments and the
 * solver all depend on it — but nothing about that should be visible in the
 * ground. Tiles at the same height share a continuous surface with no seam
 * between them; a terrace edge only appears where the height actually changes,
 * and it gets a chamfer and a wall. The result reads as carved, stepped land
 * rather than as a tray of separate blocks.
 */
import { blockLevel, idx, inBounds } from '../game/grid'
import type { Tile, World } from '../game/types'
import { TILE, surfaceY } from './geometry'
import { GROUND, groundColour } from './palette'

/** How far the top of a terrace is cut back before the wall drops away. */
export const CHAMFER = 0.11
/** Riverbeds sit below the water line so the water reads as depth. */
export const RIVER_DEPTH = 0.26
/** The seabed. Every wall at the edge of the survey runs down to exactly this,
 *  so the coastline is a continuous cliff rather than a row of floating slabs. */
export const SEABED_Y = -1.7

export interface TerrainMesh {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  /** Tile index for each triangle, so a raycast hit can name a tile. */
  tileByTriangle: Int32Array
  triangles: number
}

type Vec = [number, number, number]

/** Top surface height of a tile in world units — riverbeds are sunk. */
export function tileTopY(tile: Tile): number {
  const y = surfaceY(blockLevel(tile))
  return tile.kind === 'water' ? y - RIVER_DEPTH : y
}

class Builder {
  positions: number[] = []
  normals: number[] = []
  colors: number[] = []
  tiles: number[] = []

  tri(a: Vec, b: Vec, c: Vec, colour: [number, number, number], tile: number) {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2])
      this.normals.push(nx, ny, nz)
      this.colors.push(colour[0], colour[1], colour[2])
    }
    this.tiles.push(tile)
  }

  quad(a: Vec, b: Vec, c: Vec, d: Vec, colour: [number, number, number], tile: number) {
    this.tri(a, b, c, colour, tile)
    this.tri(a, c, d, colour, tile)
  }

  /** A wall shaded darker towards its foot, so depth reads without a texture. */
  gradientQuad(
    topLeft: Vec,
    topRight: Vec,
    footRight: Vec,
    footLeft: Vec,
    top: [number, number, number],
    bottom: [number, number, number],
    tile: number,
  ) {
    // Split the wall in two so it gets a gradient from a flat-shaded material.
    const mid: [number, number, number] = [
      (top[0] + bottom[0]) / 2,
      (top[1] + bottom[1]) / 2,
      (top[2] + bottom[2]) / 2,
    ]
    const midLeft: Vec = [
      (topLeft[0] + footLeft[0]) / 2,
      (topLeft[1] + footLeft[1]) / 2,
      (topLeft[2] + footLeft[2]) / 2,
    ]
    const midRight: Vec = [
      (topRight[0] + footRight[0]) / 2,
      (topRight[1] + footRight[1]) / 2,
      (topRight[2] + footRight[2]) / 2,
    ]
    this.quad(topLeft, topRight, midRight, midLeft, mid, tile)
    this.quad(midLeft, midRight, footRight, footLeft, bottom, tile)
  }
}

const EDGES: Array<{ dx: number; dz: number }> = [
  { dx: 0, dz: -1 }, // north
  { dx: 1, dz: 0 }, // east
  { dx: 0, dz: 1 }, // south
  { dx: -1, dz: 0 }, // west
]

export function buildTerrainMesh(world: World): TerrainMesh {
  const b = new Builder()
  const half = TILE / 2
  const originX = -((world.w - 1) / 2) * TILE
  const originZ = -((world.h - 1) / 2) * TILE

  const topOf = (x: number, z: number): number | null => {
    if (!inBounds(world, { x, z })) return null
    return tileTopY(world.tiles[idx(world.w, x, z)])
  }

  for (let z = 0; z < world.h; z++) {
    for (let x = 0; x < world.w; x++) {
      const index = idx(world.w, x, z)
      const tile = world.tiles[index]
      const cx = originX + x * TILE
      const cz = originZ + z * TILE
      const y = tileTopY(tile)

      // How far each edge is cut back: only where the ground actually steps down.
      const drop = EDGES.map(({ dx, dz }) => {
        const nt = topOf(x + dx, z + dz)
        const neighbourY = nt === null ? SEABED_Y : nt
        return neighbourY < y - 1e-6 ? neighbourY : null
      })
      const [north, east, south, west] = drop
      const inNorth = north !== null ? CHAMFER : 0
      const inEast = east !== null ? CHAMFER : 0
      const inSouth = south !== null ? CHAMFER : 0
      const inWest = west !== null ? CHAMFER : 0

      const top = groundColour(tile, x, z)
      const cliff = groundColour(tile, x, z, 'cliff')
      const foot = GROUND.cliffFoot

      // ---- the flat top, inset wherever a terrace begins
      const nw: Vec = [cx - half + inWest, y, cz - half + inNorth]
      const ne: Vec = [cx + half - inEast, y, cz - half + inNorth]
      const se: Vec = [cx + half - inEast, y, cz + half - inSouth]
      const sw: Vec = [cx - half + inWest, y, cz + half - inSouth]
      b.quad(nw, ne, se, sw, top, index)

      // ---- each stepped edge: a chamfer, then a wall down to the neighbour
      const edge = (
        aTop: Vec,
        bTop: Vec,
        aOut: Vec,
        bOut: Vec,
        neighbourY: number,
      ) => {
        const aLip: Vec = [aOut[0], y - CHAMFER, aOut[2]]
        const bLip: Vec = [bOut[0], y - CHAMFER, bOut[2]]
        b.quad(aTop, bTop, bLip, aLip, mix(top, cliff, 0.45), index)
        if (neighbourY < y - CHAMFER - 1e-6) {
          const aFoot: Vec = [aOut[0], neighbourY, aOut[2]]
          const bFoot: Vec = [bOut[0], neighbourY, bOut[2]]
          b.gradientQuad(aLip, bLip, bFoot, aFoot, cliff, foot, index)
        }
      }

      if (north !== null) {
        edge(
          [cx - half + inWest, y, cz - half + CHAMFER],
          [cx + half - inEast, y, cz - half + CHAMFER],
          [cx - half + inWest, y, cz - half],
          [cx + half - inEast, y, cz - half],
          north,
        )
      }
      if (south !== null) {
        edge(
          [cx + half - inEast, y, cz + half - CHAMFER],
          [cx - half + inWest, y, cz + half - CHAMFER],
          [cx + half - inEast, y, cz + half],
          [cx - half + inWest, y, cz + half],
          south,
        )
      }
      if (east !== null) {
        edge(
          [cx + half - CHAMFER, y, cz + half - inSouth],
          [cx + half - CHAMFER, y, cz - half + inNorth],
          [cx + half, y, cz + half - inSouth],
          [cx + half, y, cz - half + inNorth],
          east,
        )
      }
      if (west !== null) {
        edge(
          [cx - half + CHAMFER, y, cz - half + inNorth],
          [cx - half + CHAMFER, y, cz + half - inSouth],
          [cx - half, y, cz - half + inNorth],
          [cx - half, y, cz + half - inSouth],
          west,
        )
      }

      // ---- fill the notch where two stepped edges meet at a corner
      const corner = (
        aDrop: number | null,
        bDrop: number | null,
        sx: number,
        sz: number,
      ) => {
        if (aDrop === null || bDrop === null) return
        const inner: Vec = [cx + sx * (half - CHAMFER), y, cz + sz * (half - CHAMFER)]
        const alongX: Vec = [cx + sx * half, y - CHAMFER, cz + sz * (half - CHAMFER)]
        const alongZ: Vec = [cx + sx * (half - CHAMFER), y - CHAMFER, cz + sz * half]
        const outer: Vec = [cx + sx * half, y - CHAMFER, cz + sz * half]
        const shade = mix(top, cliff, 0.45)
        if (sx * sz > 0) {
          b.tri(inner, alongX, outer, shade, index)
          b.tri(inner, outer, alongZ, shade, index)
        } else {
          b.tri(inner, outer, alongX, shade, index)
          b.tri(inner, alongZ, outer, shade, index)
        }
        const low = Math.min(aDrop, bDrop)
        if (low < y - CHAMFER - 1e-6) {
          const footX: Vec = [alongX[0], low, alongX[2]]
          const footZ: Vec = [alongZ[0], low, alongZ[2]]
          const footO: Vec = [outer[0], low, outer[2]]
          if (sx * sz > 0) {
            b.quad(alongX, outer, footO, footX, foot, index)
            b.quad(outer, alongZ, footZ, footO, foot, index)
          } else {
            b.quad(outer, alongX, footX, footO, foot, index)
            b.quad(alongZ, outer, footO, footZ, foot, index)
          }
        }
      }
      corner(north, east, 1, -1)
      corner(east, south, 1, 1)
      corner(south, west, -1, 1)
      corner(west, north, -1, -1)
    }
  }

  return {
    positions: new Float32Array(b.positions),
    normals: new Float32Array(b.normals),
    colors: new Float32Array(b.colors),
    tileByTriangle: Int32Array.from(b.tiles),
    triangles: b.tiles.length,
  }
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
