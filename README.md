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

---

# The Binding

A second game lives in this repository, at `/binding`. It shares the toolchain and nothing else:
no React, no Three.js, one 2D canvas.

A dark cellar, a stick of chalk, and something that wants out.

## The idea

You draw a containment circle freehand, and then you hold it. The wobble in your own hand is the
level design — a circle drawn quickly has thin arcs in it, and the thing you called up will find
them.

The seal is a **polar field**: one number per degree of arc. Drawing deposits into those buckets,
and every question the game asks ("how strong is this angle", "where is the weakest arc", "has it
broken") is a question about that one array. A stroke credits each bin **once**, with the best
radius it managed there, so scribbling back and forth over one arc is not a circle and a spoke
driven out from the centre is not worth a ring. Layers stack *across* strokes, which is what makes
a second ring worth its chalk.

Then you light it, and it starts pushing. It reads the circle, picks somewhere, and leans. Chalk
under load burns from cold cream up through ember to white, and the arc it is working thins out in
front of you. Get chalk back on it before it opens, or the night ends early.

## Three things it can want

| | Reads the circle | Pushes | Teaches |
| --- | --- | --- | --- |
| **The Ashling** | barely | one place | close the ring — a gap is a doorway |
| **Vetch** | almost perfectly | one place | it goes for the *apparent* weakest arc |
| **Morrow** | well | two places | wards barely bite; keep chalk back |

Cunning is modelled as **attention, not accuracy**: a sharp thing scans the whole circle and walks
to the true minimum, a dull one glances at six arcs and leans on the worst of those. Sampling alone
could not model it — a hundred random glances still miss a narrow weakness most of the time.

## Chalk is the only currency

Everything costs from one stick: the ring, the second ring, the sigils, and the repairs you make on
the night. Three sigils, all of which cost about a fifth of your budget:

- **Ward** — strengthens the arc it stands on.
- **Anchor** — its arc wears away far more slowly.
- **Silence** — hides that arc, so a weak place *looks* strong and it goes and works somewhere else.

Any of them can be snuffed mid-binding for one hard shove of strength across its arc.

Patching is deliberately **repair rather than construction**: chalk laid on a live circle restores
an arc towards what was inscribed there and only inches that ceiling up, capped. Without that rule
the right play is to keep every stick back and build the circle during the binding, and the
inscription stops being a decision.

## How it was tuned

The numbers came out of a headless harness that plays each summons against the seals a real player
might draw — one ring, two rings, ring plus wards, an open ring, an open ring with the gap silenced
— over forty seeds each, with a model of a human hand that has to *notice* (0.4s) and cannot redraw
instantly (0.75s).

That harness paid for itself. It found that Silence turns an open ring against the Ashling from 0%
held to 100%; that a cunning summons which always attacks the current weakest arc makes plain
Anchors *worse* than nothing, because it simply attacks the arcs you did not anchor; and that
patching dominated every other mechanic until it was capped at the inscribed ceiling.

Where it stands: passive play fails from the second summons on, so the binding phase is genuinely
required, and sigils are situational rather than a substitute for keeping chalk back.

## How it is put together

```
src/binding/
  seal.ts       the polar field: deposits, support, sigils, erosion
  summons.ts    what you called up, and how it picks somewhere to push
  game.ts       the night as a state machine
  render.ts     the room, drawn
  textures.ts   floor, grain and chalk dab, generated at load
  ui.ts         the overlay — everything that is text
  main.ts       canvas, pointer, clock
```

Same architectural line as Little Lines: **the rules never import a renderer**. `seal.ts`,
`summons.ts` and `game.ts` are pure data in, data out, which is why a whole binding can be played
out in a test in a few milliseconds.

Two details worth knowing:

- **A stroke is continuous, so a gap has to be a separate stroke.** Lifting the chalk and putting
  it down again is a new stroke; drawing an open ring as one stroke closes the gap with a chord.
  This caught the test fixtures before it caught a player.
- **The thing keeps leaning while it walks.** An early version let its bite fall to nothing in
  transit, and since a dull summons spends most of a night in transit, the circle was barely
  touched and — worse — nothing on screen showed where it was. Pressure you cannot see is pressure
  you cannot answer.

## Controls

| Input | Effect |
| --- | --- |
| Drag | Draw chalk. Only the band between the dotted rings counts |
| Click | Place the held sigil, or snuff one during the binding |
| `1`–`4` | Chalk, Ward, Anchor, Silence |
| `Esc` | Put the sigil down |
| `Space` | Light the circle |

---

## Licence

MIT — see [LICENSE](LICENSE).
