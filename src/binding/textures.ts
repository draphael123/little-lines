/**
 * Everything the room is made of, generated once at load.
 *
 * There are no image files. The floor, the grain and the soft dab the chalk is
 * stamped with are all drawn into offscreen canvases at startup and then only
 * ever blitted, which keeps the per-frame cost to compositing.
 */

function noiseCanvas(size: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const img = ctx.createImageData(size, size)
  let s = seed >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let i = 0; i < size * size; i++) {
    const v = rand() * 255
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * A cellar floor: cold stone, mottled at several scales, with joints scored
 * into it. The mottling is small noise canvases drawn up large with smoothing
 * on, which is a cheap stand-in for octaves of value noise.
 */
export function makeFloor(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return c

  ctx.fillStyle = '#100d0c'
  ctx.fillRect(0, 0, size, size)

  ctx.globalCompositeOperation = 'overlay'
  ctx.imageSmoothingEnabled = true
  for (const [scale, alpha, seed] of [
    [6, 0.5, 12345],
    [16, 0.34, 777],
    [48, 0.2, 4242],
    [160, 0.12, 99],
  ] as const) {
    ctx.globalAlpha = alpha
    ctx.drawImage(noiseCanvas(scale, seed), 0, 0, size, size)
  }

  // Flagstones, scored rather than drawn — the joint is a dark line with a
  // faint highlight on its lower edge, which is what reads as depth.
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  const cell = size / 7
  for (let i = 1; i < 7; i++) {
    const offset = ((i % 2) * cell) / 2
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = size / 400
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(size, i * cell)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(120,104,86,0.03)'
    ctx.beginPath()
    ctx.moveTo(0, i * cell + ctx.lineWidth)
    ctx.lineTo(size, i * cell + ctx.lineWidth)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.26)'
    ctx.beginPath()
    ctx.moveTo(i * cell + offset, 0)
    ctx.lineTo(i * cell + offset, size)
    ctx.stroke()
  }

  return c
}

/** Film grain, laid over everything at low alpha and jittered each frame. */
export function makeGrain(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const img = ctx.createImageData(size, size)
  let s = 20260809
  for (let i = 0; i < size * size; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    const v = (s / 4294967296) * 255
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 26
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** A soft round dab, stamped along a stroke to make chalk look like chalk. */
export function makeDab(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // Bite a little texture out of it, so an edge is never perfectly smooth.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.globalAlpha = 0.5
  ctx.drawImage(noiseCanvas(12, 5150), 0, 0, size, size)
  return c
}
