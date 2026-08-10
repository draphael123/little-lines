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

/**
 * A soft radial sprite, drawn once and then blitted.
 *
 * Everything soft in this game — smoke, its dark core, a candle's pool of
 * light — was a `createRadialGradient` per blob per frame, which is an
 * allocation and a fill on every one. Baking each into a sprite and scaling it
 * turns fifty gradient builds a frame into fifty `drawImage` calls.
 */
export function makeBlob(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [at, colour] of stops) g.addColorStop(at, colour)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return c
}

/** The film grain, pre-tiled to cover a viewport in one blit. */
export function tileGrain(tile: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w + tile.width)
  c.height = Math.max(1, h + tile.height)
  const ctx = c.getContext('2d')
  if (!ctx) return c
  for (let x = 0; x < c.width; x += tile.width) {
    for (let y = 0; y < c.height; y += tile.height) ctx.drawImage(tile, x, y)
  }
  return c
}

/** The vignette, which only ever changes when the window does. */
export function makeVignette(w: number, h: number, cx: number, cy: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.28, cx, cy, Math.max(w, h) * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  return c
}
