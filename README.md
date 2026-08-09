# Little Lines

A cozy railway builder over four kilometres of open country. You never build a house, a shop or
a street — you build the railway and the things that serve it, and the country arranges itself
around what you have built.

Built with React 19, TypeScript, Three.js, React Three Fiber and Drei.

---

## The idea

The region is one continuous landscape: hills, river valleys and a coast, four kilometres square
at metre scale. Scattered across it are a dozen hamlets, sitting where people would actually
settle — in a hollow, out of the wind, within reach of water. Left alone they stay hamlets
forever.

A place grows only when:

1. a **station** stands within reach of it, **and**
2. that station shares a **network** with a station serving somewhere else.

A line that reaches nowhere else carries nobody. Lines that touch anywhere form one network, so
junctions genuinely connect. Service thins out when a network has more stations than its trains
can work, and the ground still matters: a sheltered valley floor near water grows well, exposed
high ground grows slowly and caps out small.

Everything you eventually see — the streets, the terraces, the tall buildings in the middle of a
city — appeared because a railway made the place worth living in. Take the station away and the
place empties again.

Time passes **only while the trains are running**, so run/hold is the play/pause of the world.

## Building a railway

Rail is a graph of nodes and curves, not a grid. You drag a line across the country and it is
laid as a cubic Bézier that keeps its tangent through a junction, so lines meet smoothly.

The vertical profile is solved rather than draped: the line is smoothed and then clamped to a
ruling gradient of **4%**, sweeping forwards and backwards until it converges. Free ends are
allowed to settle into a cutting or up onto an embankment; only a junction pins a height, because
a junction has to meet the line already there. Anything that still cannot be worked at 4% is
refused with the reason. Where the profile runs clear of the ground the line is carried on a
viaduct, and viaduct costs more per metre.

`Q` / `E` — or the raise and lower tools — lift the whole line off the ground before you commit
it, which is how you get across a valley or under a shoulder of hill.

---

## Running it

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5801 |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint over the whole project |
| `npm run test` | Vitest in watch mode |
| `npm run test:run` | Vitest once |
| `npm run verify` | Lint, test and build — what CI would run |
| `npm run images` | Regenerate the favicon, PWA icons and social preview |

---

## Controls

| Input | Effect |
| --- | --- |
| Drag | Lay a line (rail tool), or travel over the country (look tool) |
| Right-drag / `Shift`-drag | Turn the view |
| Scroll | Zoom |
| `W` `A` `S` `D` / arrows | Travel |
| `1`–`6` | Look, rail, raise, lower, build, clear |
| `Q` / `E` | Lower or raise the line about to be laid |
| `Space` | Run or hold the trains |
| `F` | Follow a train |
| `C` | Ride in the cab |
| `N` | Day / night |

---

## How it is put together

```
src/
  world/        the region — rules, geometry and the scene
    heightfield.ts    the land: noise, coast, river carving, sampling, siting
    terrainSurface.ts one indexed mesh with vertex colours by height and slope
    rail.ts           the rail graph: Béziers, junctions, the gradient solver
    trackMesh.ts      ballast, sleepers, railheads, viaduct piers
    towns.ts          who is served, who grows, fares and upkeep
    townLayout.ts     streets and the buildings that line them
    buildings.ts      what you can build, what it costs, what it unlocks
    trainRun.ts       running a train along a path and reporting its pose
    scatter.ts        woodland
    RegionScene.tsx   the scene, the tools and the three cameras
    ...
  store/        one zustand store
  ui/           the HUD, the tutorial and the field guide
  audio/        procedural sound
```

Two deliberate architectural lines:

**The rules never import a renderer.** Everything the country does — settlement, service,
growth, fares, gradients, river carving — is pure data in, pure data out. That is why the
simulation can be exercised without a canvas, and why the whole test suite runs headless.

**The geometry is separated from the components.** `trackMesh.ts`, `townLayout.ts`,
`terrainSurface.ts` and `trainRun.ts` compute buffers and poses; the R3F components only mount
what they return.

### Some details worth knowing

- **Rivers are routed on a blurred copy of the land.** A strict downhill walk stalls in the
  first local minimum and leaves a pit on a hillside with the sea showing through it. Routing on
  a blurred field removes almost all of those, and a standing pull towards the coast covers the
  rest. The cut is capped, because a bed forced to keep falling will bore a slot canyon through
  any ridge in its way.
- **The land runs out before the map does.** Without a falloff at every border the mesh simply
  stops and the region reads as a slab standing in the sea.
- **Colour bands are keyed to the region's own height range**, not to fixed metres, so retuning
  the relief moves the tree line with it instead of turning everything into moorland.
- **The lighting is deliberately dim.** ACES tone mapping desaturates anything much above 1.0;
  at the intensities that looked right without it, the entire landscape washed out to cream.
- **A hidden tab never gets a frame.** React Three Fiber waits on a rAF-driven measurement of
  its container before it mounts the scene at all, so a map opened in a background tab is not
  paused — it is never built. `world/frames.ts` shims rAF onto a timer and nudges a measurement,
  reliably on the visibilitychange when the tab is first looked at, and best-effort by polling
  before then (background timer throttling makes the earlier path unreliable in a production
  build).

---

## Accessibility

- A **genuine WebGL fallback** replaces the canvas only when the browser cannot draw it, or if
  the context is lost. It never covers a working canvas.
- An error boundary around the scene reports what failed instead of silently unmounting, which
  otherwise looks exactly like a working renderer drawing nothing.
- Dialogs are real modals with focus traps, Escape handling and restored focus. The menu uses
  proper `menuitemradio` / `menuitemcheckbox` semantics.
- A polite live region announces what the country is doing.
- Day and night are both designed rather than one being an inversion of the other.
- `prefers-reduced-motion` is respected.

---

## Testing

```bash
npm run test:run
```

| File | Covers |
| --- | --- |
| `world/heightfield.test.ts` | Generation, sampling, slope, siting, the drawable surface |
| `world/rail.test.ts` | The gradient solver, laying, junctions, components, runnable paths |
| `world/towns.test.ts` | Service rules, networks, growth, decline, fares, upkeep, unlocks |
| `test/probe.test.ts` | That the land has no pits or slot canyons and the rivers reach the sea |

The terrain tests are worth a word. Tests about the *shape of the rail graph* run on gentle
country, on purpose: junctions pin both ends of a line, so on real hills a thousand-metre run
between two fixed points is often legitimately too steep, and coupling graph tests to terrain
tuning would make every hill adjustment break something unrelated.

---

## Audio

All sound is synthesised in the browser from oscillators and shaped noise — there are no sample
files and nothing is fetched. See [AUDIO_CREDITS.md](AUDIO_CREDITS.md) for the full breakdown,
licence and rationale. Audio is opt-in and every failure path is a silent no-op.

---

## Licence

MIT — see [LICENSE](LICENSE).
