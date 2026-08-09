/**
 * Generates the social-preview image and PWA icons from vector sources.
 *
 *   node scripts/make-images.mjs
 *
 * Output (committed to the repo so the build never depends on this script):
 *   public/og.png                1200x630 social preview
 *   public/og.svg                vector source for the above
 *   public/icon-192.png          PWA icon
 *   public/icon-512.png          PWA icon
 *   public/icon-maskable-512.png PWA maskable icon
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')

/* ---------------------------------------------------------------- palette */
const C = {
  paper: '#efe5d2',
  paperDeep: '#e3d6bd',
  ink: '#2b2823',
  timber: '#6b4a2f',
  timberDark: '#4a3220',
  timberLight: '#8a6a44',
  brass: '#b08d4f',
  moss: '#6f8259',
  mossLow: '#7d8f61',
  mossHigh: '#5c6f49',
  rock: '#8b8579',
  rockDark: '#6d685e',
  slate: '#4a6a84',
  slateDeep: '#37536a',
  signal: '#a33224',
  cream: '#f6efe1',
}

/* ------------------------------------------------------- isometric helper */
const W = 62 // half-width of a tile rhombus
const H = 34 // half-depth of a tile rhombus
const LIFT = 26 // pixels per elevation level
const BASE = 54 // block skirt depth

const OX = 600
const OY = 196

const px = (x, z, h) => OX + (x - z) * W
const py = (x, z, h) => OY + (x + z) * H - h * LIFT

const pts = (list) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')

/* ------------------------------------------------------------ the diorama */
// 9 x 6 survey. `k` = kind, `h` = elevation.
const KIND = [
  '..^^.....',
  '..^^~....',
  '....~~...',
  '.....~~..',
  '.f....~~.',
  '.......~.',
]
const HEIGHT = [
  '112210000',
  '112200000',
  '011100000',
  '001110000',
  '011221000',
  '001110000',
]

const COLS = KIND[0].length
const ROWS = KIND.length

const topColor = (kind, h) => {
  if (kind === '~') return C.slate
  if (kind === '^') return h >= 2 ? C.rockDark : C.rock
  if (h >= 2) return C.mossHigh
  if (h === 1) return C.moss
  return C.mossLow
}

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

// The line the little train runs on, as grid coordinates.
const ROUTE = [
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [3, 3],
  [4, 3],
  [4, 2],
  [5, 2],
  [6, 2],
  [6, 1],
  [7, 1],
  [8, 1],
]

const TREES = [
  [1, 4],
  [0, 3],
  [7, 4],
  [8, 3],
  [2, 5],
  [6, 5],
]

function diorama() {
  const out = []
  const cells = []
  for (let z = 0; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      cells.push({ x, z, k: KIND[z][x], h: Number(HEIGHT[z][x]) })
    }
  }
  cells.sort((a, b) => a.x + a.z - (b.x + b.z))

  for (const { x, z, k, h } of cells) {
    const cx = px(x, z, h)
    const cy = py(x, z, h)
    const sink = k === '~' ? 10 : 0
    const top = topColor(k, h)
    const skirt = BASE + h * LIFT
    const y = cy + sink

    out.push(
      `<polygon points="${pts([
        [cx, y - H],
        [cx + W, y],
        [cx, y + H],
        [cx - W, y],
      ])}" fill="${top}"/>`,
    )
    out.push(
      `<polygon points="${pts([
        [cx - W, y],
        [cx, y + H],
        [cx, y + H + skirt],
        [cx - W, y + skirt],
      ])}" fill="${shade(k === '~' ? C.slateDeep : C.timber, 0.86)}"/>`,
    )
    out.push(
      `<polygon points="${pts([
        [cx, y + H],
        [cx + W, y],
        [cx + W, y + skirt],
        [cx, y + H + skirt],
      ])}" fill="${shade(k === '~' ? C.slateDeep : C.timber, 0.66)}"/>`,
    )
    out.push(
      `<polyline points="${pts([
        [cx - W, y],
        [cx, y - H],
        [cx + W, y],
      ])}" fill="none" stroke="rgba(255,248,232,.22)" stroke-width="2"/>`,
    )
  }

  // ---- rails
  const rail = ROUTE.map(([x, z]) => {
    const h = Number(HEIGHT[z][x])
    return [px(x, z, h), py(x, z, h) - 3]
  })
  out.push(
    `<polyline points="${pts(rail)}" fill="none" stroke="${shade(C.timberDark, 1)}" stroke-width="15" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>`,
  )
  for (let i = 0; i < rail.length - 1; i++) {
    const [ax, ay] = rail[i]
    const [bx, by] = rail[i + 1]
    for (let s = 0; s < 4; s++) {
      const t = (s + 0.5) / 4
      const mx = ax + (bx - ax) * t
      const my = ay + (by - ay) * t
      out.push(
        `<rect x="${(mx - 11).toFixed(1)}" y="${(my - 2.6).toFixed(1)}" width="22" height="5.2" rx="1.6" fill="${C.timberLight}" transform="rotate(${((Math.atan2(by - ay, bx - ax) * 180) / Math.PI).toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})"/>`,
      )
    }
  }
  out.push(
    `<polyline points="${pts(rail.map(([a, b]) => [a, b - 3.4]))}" fill="none" stroke="#cdc6b8" stroke-width="2.4" stroke-linejoin="round"/>`,
  )
  out.push(
    `<polyline points="${pts(rail.map(([a, b]) => [a, b + 3.4]))}" fill="none" stroke="#9a9284" stroke-width="2.4" stroke-linejoin="round"/>`,
  )

  // ---- trees
  for (const [x, z] of TREES) {
    const h = Number(HEIGHT[z][x])
    const cx = px(x, z, h)
    const cy = py(x, z, h)
    out.push(`<rect x="${cx - 3}" y="${cy - 14}" width="6" height="18" fill="${C.timberDark}"/>`)
    out.push(
      `<polygon points="${pts([
        [cx, cy - 62],
        [cx + 20, cy - 12],
        [cx - 20, cy - 12],
      ])}" fill="${C.mossHigh}"/>`,
    )
    out.push(
      `<polygon points="${pts([
        [cx, cy - 62],
        [cx + 20, cy - 12],
        [cx, cy - 18],
      ])}" fill="${shade(C.mossHigh, 0.78)}"/>`,
    )
  }

  // ---- little locomotive, three quarters along the line
  const [lx, ly] = rail[7]
  out.push(`<g transform="translate(${lx.toFixed(1)} ${(ly - 6).toFixed(1)})">
    <rect x="-34" y="-20" width="34" height="20" rx="3" fill="${C.signal}"/>
    <rect x="-2" y="-30" width="24" height="30" rx="3" fill="${shade(C.signal, 0.82)}"/>
    <rect x="-30" y="-34" width="9" height="14" rx="2" fill="${C.ink}"/>
    <circle cx="-26" cy="4" r="6" fill="${C.ink}"/>
    <circle cx="-8" cy="4" r="6" fill="${C.ink}"/>
    <circle cx="10" cy="4" r="6" fill="${C.ink}"/>
    <circle cx="-26" cy="-38" r="9" fill="rgba(255,255,255,.5)"/>
    <circle cx="-18" cy="-52" r="12" fill="rgba(255,255,255,.36)"/>
    <circle cx="-6" cy="-64" r="15" fill="rgba(255,255,255,.22)"/>
  </g>`)

  return out.join('\n')
}

/* ------------------------------------------------------------------- page */
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.cream}"/>
      <stop offset="1" stop-color="${C.paperDeep}"/>
    </linearGradient>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M30 0 H0 V30" fill="none" stroke="rgba(43,40,35,.07)" stroke-width="1"/>
    </pattern>
    <radialGradient id="vig" cx="50%" cy="42%" r="72%">
      <stop offset="0.55" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(58,44,28,.24)"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#sky)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>

  <g>${diorama()}</g>

  <rect width="1200" height="630" fill="url(#vig)"/>

  <!-- timber frame -->
  <rect x="0" y="0" width="1200" height="630" fill="none" stroke="${C.timber}" stroke-width="36"/>
  <rect x="18" y="18" width="1164" height="594" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="2"/>
  <rect x="36" y="36" width="1128" height="558" fill="none" stroke="${C.brass}" stroke-width="2"/>
  <g fill="${C.brass}">
    <circle cx="18" cy="18" r="8"/><circle cx="1182" cy="18" r="8"/>
    <circle cx="18" cy="612" r="8"/><circle cx="1182" cy="612" r="8"/>
  </g>

  <!-- title plate -->
  <g transform="translate(78 428)">
    <rect x="-26" y="-62" width="656" height="136" rx="3" fill="rgba(246,239,225,.94)" stroke="${C.brass}" stroke-width="2"/>
    <text x="0" y="0" font-family="Georgia, 'Times New Roman', serif" font-size="76" fill="${C.ink}" letter-spacing="-1">Little Lines</text>
    <rect x="0" y="18" width="132" height="3" fill="${C.signal}"/>
    <text x="0" y="51" font-family="Georgia, 'Times New Roman', serif" font-size="18.5" fill="#5b5346" letter-spacing="2.6">A COZY TILE GAME · LAY THE LINE, MATCH THE LAND</text>
  </g>
</svg>
`

/* -------------------------------------------------------------- rasterise */
function render(svg, width) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontDirs: ['C:/Windows/Fonts', '/usr/share/fonts'], loadSystemFonts: true, defaultFontFamily: 'Georgia' },
  })
  return r.render().asPng()
}

writeFileSync(join(pub, 'og.svg'), og)
writeFileSync(join(pub, 'og.png'), render(og, 1200))

const favicon = readFileSync(join(pub, 'favicon.svg'), 'utf8')
writeFileSync(join(pub, 'icon-192.png'), render(favicon, 192))
writeFileSync(join(pub, 'icon-512.png'), render(favicon, 512))

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${C.timber}"/>
  <g transform="translate(8 8) scale(0.75)">${favicon.replace(/<\/?svg[^>]*>/g, '')}</g>
</svg>`
writeFileSync(join(pub, 'icon-maskable-512.png'), render(maskable, 512))

console.log('wrote og.png, og.svg, icon-192.png, icon-512.png, icon-maskable-512.png')
