# Little Lines

A cozy tile-laying game about railways. You draw hexagonal tiles from a finite stack and put them
next to each other; where two tiles meet, the ground on both sides of the border either agrees or
it does not. Railway is ground like any other, so a line only carries on where the tile beside it
also shows a line.

There is no timer and no way to lose. You run out of tiles, and placing well earns you more.

Built with React 19, TypeScript, Three.js and React Three Fiber.

---

## The idea

The game it is modelled on gives a tile one verb: *match my edges*. You can judge a placement with
your eyes, at the moment you make it, against the six tiles touching it.

Little Lines keeps that — the finite stack, the soft constraints, the absence of any fail state —
and makes the tile's second verb **carry a railway**. Rail is not a special case bolted onto the
edge-matching rule; it is one of the six kinds of ground an edge can be, so joining two railways is
the same event, scored by the same line of code, as joining two woods. It is worth more, because
that is what the game is about.

What that buys is a second thing to think about on every placement. A tile can fit its neighbours
beautifully and still leave your main line stopping dead in a field, or join up the railway at the
cost of a seam through the middle of a wood.

### The one number the whole game turns on

The stack is the only clock, so how many tiles a placement hands back decides everything. It took
measuring rather than reasoning to get right.

Paying a tile back for matching whatever neighbours you happen to have makes the stack bottomless:
a player who always takes the best-scoring placement simply never runs out, and two of the five
test seeds filled the entire region instead of ending. So a tile comes back only for a fit that
pleases **three or more** neighbours at once, two for a hole filled all six ways, and quests pay
generously in score but sparingly in tiles.

Measured again afterwards: a run lasts 44 to 133 placements from a stack of 42, and playing well
roughly doubles it. `lines/balance.test.ts` plays the game on every CI run to keep that honest.

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

## Playing

| Input | Effect |
| --- | --- |
| Move the pointer | The tile in hand floats over the hex it would land on |
| Click | Place it |
| `Q` / `E` | Turn the tile a sixth of a turn |
| Drag | Move about the country |
| Right-drag | Turn the view |
| Scroll | Come closer |
| `N` | Day or night |
| `?` | How to play |
| `R` | Another country, once a run has ended |

A bar under each border of the floating tile marks where it would agree with what is already there;
a red one marks a railway about to stop dead.

---

## How it is put together

```
src/
  lines/        the game — rules first, then the picture
    hex.ts            axial coordinates, packed into integer keys
    tiles.ts          what a tile is: six edges, and whether a station stands on it
    rng.ts            a deterministic generator carried inside the game state
    deck.ts           the stack: tile archetypes, and the quests they arrive with
    board.ts          placement, edge matching, groups, the rail network, scoring
    quests.ts         what the country asks for, and whether the board has answered
    game.ts           a run, as a pure function of the run before it
    geometry.ts       the whole board as a handful of merged buffers
    look.ts           colours, light, and the dimensions everything is drawn at
    BoardScene.tsx    the scene, the ghost tile and the pointer
    BoardStage.tsx    the canvas, and the two ways it can fail
  store/        one zustand store
  ui/           the HUD, the flat tile face, the dialogs
  audio/        procedural sound
```

Two deliberate architectural lines:

**The rules never import a renderer.** Everything the game does — drawing tiles, matching edges,
growing groups, joining the railway, settling quests, scoring — is data in, data out. That is why a
whole run can be played in a test without a canvas, and why the balance numbers above are
measurable at all.

**The geometry is separated from the components.** `geometry.ts` turns the board into buffers and
`BoardScene.tsx` only mounts what it returns.

### Some details worth knowing

- **A tile's rail is a set of edges, not a catalogue of pieces.** Every rail edge runs to the middle
  of the tile and meets every other one there, so a through line, a curve, a junction and a stub all
  fall out of one field. Two rail edges are drawn as a single curve through the centre so a turn is
  a turn rather than a kink; three or more get a spoke each, because a junction really does have a
  kink in it and the crossing hides it.
- **The tile face is a fan of six wedges that blend at the corners.** Each corner takes the average
  of the two edges meeting there. A matched border disappears; a mismatched one shows a seam you can
  see from across the board without reading anything.
- **Tiles are generated from archetypes, never edge by edge.** A tile assembled one random edge at a
  time is confetti, and a board of confetti matches nothing, which reads to the player as the game
  cheating. Grounds are laid down in contiguous runs instead.
- **Only the flanks you can see are built.** A tile surrounded on all six sides contributes no side
  walls, which is most of the geometry on a full board.
- **Winding is checked by a test, not by eye.** A face wound the wrong way is culled rather than
  drawn inside out, so the board renders as nothing but its own sides and every other check still
  passes. The vertex normals are all `+y` and so cannot catch it; `geometry.test.ts` measures the
  triangles instead. This is not hypothetical — it happened.
- **Nothing derived is ever selected out of the store.** A selector that builds a value hands back a
  new object each time it runs, and `useSyncExternalStore` reads that as the store having changed
  again, forever. Derived values are computed in hooks with `useMemo`.
- **A hidden tab never gets a frame.** React Three Fiber waits on a rAF-driven measurement of its
  container before it mounts the scene at all, so a board opened in a background tab is not paused —
  it is never built. `lines/frames.ts` shims rAF onto a timer and nudges a measurement.

---

## Accessibility

- A **genuine WebGL fallback** replaces the canvas only when the browser cannot draw it. It never
  covers a working canvas.
- An error boundary around the scene reports what failed instead of silently unmounting, which
  otherwise looks exactly like a working renderer drawing nothing.
- The tile in hand is drawn flat in the HUD as well as in the world, and described in words.
- Dialogs are real modals with focus traps, Escape handling and restored focus.
- A polite live region announces what each placement did.
- Day and night are both designed rather than one being an inversion of the other.
- `prefers-reduced-motion` is respected.

---

## Testing

```bash
npm run test:run
```

| File | Covers |
| --- | --- |
| `lines/board.test.ts` | Placement, edge matching, scoring, groups, the rail network |
| `lines/game.test.ts` | A run end to end: the stack, rotation, quests, what the game says |
| `lines/balance.test.ts` | That a run ends, outlasts its opening stack, and rewards playing well |
| `lines/geometry.test.ts` | Edge and corner arithmetic, hex picking, and which way the faces point |

The balance tests play the game rather than assert about it, with two players: one who always takes
the highest-scoring placement, and one who puts every tile in the first hole it fits. The bounds are
wide on purpose — they exist to catch a run that collapses in ten tiles or never ends, not to freeze
today's tuning.

---

## Audio

All sound is synthesised in the browser from oscillators and shaped noise — there are no sample
files and nothing is fetched. See [AUDIO_CREDITS.md](AUDIO_CREDITS.md) for the full breakdown,
licence and rationale. Audio is opt-in and every failure path is a silent no-op.

---

## Licence

MIT — see [LICENSE](LICENSE).
