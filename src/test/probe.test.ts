import { describe, expect, it } from 'vitest'
import { RESOLUTION, SPACING, generateRegion } from '../world/heightfield'

/**
 * The river carve is the one part of generation that can produce something
 * unmistakably wrong — a slot canyon through a hillside, or a pit with the sea
 * showing through it. Neither shows up in a height histogram, so measure the
 * thing that actually distinguishes them: how far a point sits below the land
 * immediately around it.
 */
describe('the land', () => {
  const field = generateRegion({ seed: 1 })
  const h = (i: number, j: number) => field.heights[j * RESOLUTION + i]

  it('has no pits or canyons', () => {
    // A canyon is ground that sits well below the land on BOTH sides of some
    // axis. Measuring against the lowest neighbour instead would miss it
    // entirely, because a valley floor's lowest neighbour is the valley floor.
    const AXES = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]
    // Measured over a fixed 48 m, not a fixed number of samples, so changing
    // the lattice resolution does not silently change what is being asserted.
    const reach = Math.max(1, Math.round(48 / SPACING))
    let worst = 0
    for (let j = reach; j < RESOLUTION - reach; j++) {
      for (let i = reach; i < RESOLUTION - reach; i++) {
        const here = h(i, j)
        for (const [di, dj] of AXES) {
          const across = Math.min(
            h(i + di * reach, j + dj * reach),
            h(i - di * reach, j - dj * reach),
          )
          worst = Math.max(worst, across - here)
        }
      }
    }
    // A hilly region has a few genuinely steep faces and that is wanted; the
    // measured worst is around 53 m and only three samples in a quarter of a
    // million exceed 48 m. What this guards against is the failure mode that
    // preceded it — a river boring a slot two hundred metres deep through a
    // hillside, which showed as a hole with the sea visible at the bottom.
    expect(worst).toBeLessThan(70)
  })

  it('runs its rivers out to the sea rather than into a hole', () => {
    // every below-sea cell should be able to reach the region edge without
    // climbing, or it is a landlocked hole with water sitting in it
    const wet: number[] = []
    for (let k = 0; k < field.heights.length; k++) {
      if (field.heights[k] <= field.seaLevel) wet.push(k)
    }
    const reachable = new Set<number>()
    const queue: number[] = []
    for (const k of wet) {
      const i = k % RESOLUTION
      const j = (k / RESOLUTION) | 0
      if (i === 0 || j === 0 || i === RESOLUTION - 1 || j === RESOLUTION - 1) {
        reachable.add(k)
        queue.push(k)
      }
    }
    while (queue.length) {
      const k = queue.pop() as number
      const i = k % RESOLUTION
      const j = (k / RESOLUTION) | 0
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= RESOLUTION || nj >= RESOLUTION) continue
        const nk = nj * RESOLUTION + ni
        if (reachable.has(nk) || field.heights[nk] > field.seaLevel) continue
        reachable.add(nk)
        queue.push(nk)
      }
    }
    const stranded = wet.length - reachable.size
    // a few puddles are fine; a crater full of sea is not
    expect(stranded / Math.max(1, wet.length)).toBeLessThan(0.15)
  })
})
