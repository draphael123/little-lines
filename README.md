# Little Lines

A cozy 3D railway route-building game on a surveyor's table. Eight hand-cut survey puzzles,
and a persistent free-build country that grows around whatever railway you give it.

Built with React 19, TypeScript, Three.js, React Three Fiber and Drei.

---

## The two halves

### Puzzle Post — eight surveys

Connect a depot to a named destination across carved miniature terrain. Rail may climb or fall
only one elevation level per length; bare rock blocks construction; rivers cost bridges from a
fixed timber budget; some surveys insist the line calls at named halts along the way.

Three stars at or under par, two within two lengths of par, one for arriving at all. Undo, redo
and a solver-backed hint are always available, and campaign progress is kept in the browser.

Every level's par is checked against a breadth-first solver in the test suite, so a survey can
never ship impossible or accidentally generous — see `src/game/campaign.test.ts`.

### Free Build — the line makes the country

**You never build a town.** The table starts with a few hamlets sitting on likely ground —
flat, sheltered, within sight of water. Each one grows only when:

1. a **station** stands within two tiles of it, **and**
2. that station shares a **network** with a station serving somewhere else.

A loop around a single hamlet carries nobody. Lines that touch anywhere form one network, so
junctions genuinely connect. Service thins out when a network has more stations than its trains
can work, and terrain matters: flat meadow near water thrives, high or rock-hemmed ground grows
slowly and caps out small — but nowhere is ever ruled out.

Money is light and there is no failure state. Track costs £12 a length, £70 over water, ground
works £15, a station £180, a tunnel £220; fares arrive continuously from the population you
actually carry. A thin account just means waiting for the traffic.

Time passes **only while the trains are running**, so the run/stop button is the play/pause of
the whole world. The largest country you have ever grown is remembered across worlds and opens
the wide table at 120 people and the grand table at 350.

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
| Click a tile | Lay track (puzzle) or use the current tool (free build) |
| Click the last tile again | Lift that length |
| Drag / scroll | Orbit and zoom the table |
| `1`–`8` | Free build tools |
| `[` `\` `]` | West, home and east viewpoints |
| `H` | Hint (puzzle mode) |
| `N` | Day / night |
| `R` | Run or hold |
| `Ctrl`/`Cmd` + `Z`, `+Shift` | Undo, redo |
| Arrow keys | Move between tiles in the keyboard survey grid |

---

## How it is put together

```
src/
  game/         pure rules — no renderer, no React
    types.ts        tiles, worlds, lines, levels
    grid.ts         coordinates and world construction
    track.ts        what rail may do between two tiles
    terrain.ts      elevation tools, grade protection, landscape growth
    economy.ts      settlement, networks, service, fares, milestones
    solver.ts       breadth-first route finding with bridges and required stops
    scoring.ts      par, stars, the dispatch stages
    levels.ts       the eight surveys, authored as row strings
    serialize.ts    compact world/line encoding for storage
    save.ts         defensive localStorage
  three/        the 3D table
    geometry.ts     all model-railway maths, testable without Three.js
    Terrain.tsx     instanced carved blocks with a shader-carved earth side
    TrackLines.tsx  sleepers, railheads, bridge decks and trestles
    Trains.tsx      shuttles, loops, station pauses
    ...
  ui/           the interface
  store/        one zustand store
```

Two deliberate architectural lines:

**The rules never import a renderer.** Everything in `src/game` and `src/three/geometry.ts` is
pure data in, pure data out. That is why the country keeps growing on a machine with no WebGL,
and why 182 tests can cover the whole simulation without a canvas.

**The 3D maths is separated from the 3D components.** `src/three/geometry.ts` computes rail
polylines, bridge deck interpolation, mesh buffers and train poses; the R3F components only
mount what it returns.

### Some details worth knowing

- **Carved blocks.** One `InstancedMesh` per elevation level, so a block standing three levels
  high gets a correctly proportioned bevel instead of a stretched one. A small shader patch
  paints the sides as bare earth while the top keeps its painted finish.
- **Bridges.** A water tile's rail height is interpolated between the banks either side of it,
  which is what makes the deck a deck. Trestles drop from it to the water.
- **Tunnels.** Boring drops the tile's rail height to the level of the ground it opens onto and
  records the rock's own height separately, so the mountain still stands over the line.
- **Gradient protection.** Terrain edits re-check every rail segment that touches the tile and
  refuse anything that would strand a line on an impossible grade. The landscape generator uses
  the same check, so "Grow a landscape" can never break an existing railway — there is a test
  that runs it across 25 seeds and asserts exactly that.
- **Reflective water.** All water tiles are merged into one surface built in the local XY plane
  so a single rotation lays it flat, which is what the reflector needs.

---

## Accessibility

- A **keyboard survey grid** sits under the canvas in the document at all times: the same
  survey as a grid of labelled buttons, with arrow-key navigation and the same rules, scoring
  and saved progress. It is not a fallback — it is always there.
- A **genuine WebGL fallback** replaces the canvas only when the browser cannot draw it, or if
  the context is lost. It never covers a working canvas, and a working canvas is never replaced
  by it.
- Dialogs are real modals with focus traps, Escape handling and restored focus. The Survey
  Office is a menu with proper `menuitemradio` / `menuitemcheckbox` semantics.
- A polite live region announces mode changes, hints, deliveries and milestones.
- Day and night are both designed rather than one being an inversion of the other.
- `prefers-reduced-motion` is respected.

---

## Testing

```bash
npm run test:run
```

182 tests across seven files:

| File | Covers |
| --- | --- |
| `game/campaign.test.ts` | Every level solvable, par honest, bridge budgets binding, terrain well formed |
| `game/economy.test.ts` | Growth rules, networks, service quality, site quality, fares, milestones, building placement |
| `game/track.test.ts` | Adjacency, gradient, rock, water, loops, lifting track |
| `game/terrain.test.ts` | Elevation tools, grade protection, tunnels, landscape growth over 25 seeds |
| `game/save.test.ts` | Malformed JSON, wrong shapes, quota failures, serialisation round trips |
| `three/geometry.test.ts` | Rail paths, bridge deck interpolation, smoothing, mesh buffers, train pitch, shuttling, loop circulation |
| `ui/app.test.tsx` | Rendering, the whole build→connect→deliver loop, dialogs, menus, keyboard grid, WebGL fallback, free-build economy |

---

## Audio

All sound is synthesised in the browser from oscillators and shaped noise — there are no sample
files and nothing is fetched. See [AUDIO_CREDITS.md](AUDIO_CREDITS.md) for the full breakdown,
licence and rationale. Audio is opt-in and every failure path is a silent no-op.

---

## Licence

MIT — see [LICENSE](LICENSE).
