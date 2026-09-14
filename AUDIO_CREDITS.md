# Audio credits

Every sound in Little Lines is **original work, written for this project**, and it is
**generated in the browser at runtime** rather than loaded from a file. There are no
third-party samples, no downloads, and no network requests for audio at any point.

## What that means in practice

The whole sound design lives in [`src/audio/engine.ts`](src/audio/engine.ts). It is a small
Web Audio graph:

| Element | How it is made |
| --- | --- |
| Track placement | A 70 ms band-passed noise burst plus a short triangle-wave thud at G3 |
| Lifting track | A low-passed noise thud plus a 120 Hz sine |
| Tool selection | A single 880 Hz sine pip |
| Ground works | A low-passed noise rumble |
| Whistle | Three overlapping sines at 1180 / 1570 / 880 Hz with a slow attack |
| Distant horn | A sawtooth at 196 Hz under a sine at 262 Hz, both with long attack and decay |
| Station arrival | An arpeggiated E–B–E bell figure on sines |
| Refusal | A triangle wave gliding 147 Hz → 110 Hz |
| Background music | A slow pentatonic figure in D on triangle and sine voices, with a bass note every fourth beat |
| Room tone | A procedurally generated 1.4 s noise impulse response used as a convolution reverb |

## Licence

Because the audio is code rather than assets, it is covered by the same licence as the rest
of this repository (MIT — see [`LICENSE`](LICENSE)). You may reuse, modify and redistribute
`src/audio/engine.ts` under those terms.

- **Source:** this repository, `src/audio/engine.ts`
- **Author:** written for Little Lines
- **Licence:** MIT
- **Third-party audio assets:** none

## Why it was done this way

Three reasons, in order of importance:

1. **Provenance is verifiable.** Nothing in the audio path has an unclear licence, because
   nothing came from anywhere else.
2. **It always works offline.** The game is a static site with no runtime fetches; audio
   would have been the only exception.
3. **Nothing to ship.** The entire sound design adds a few kilobytes of JavaScript instead of
   a megabyte of samples.

## Graceful degradation

Audio is **opt-in**: music is off on first run, effects are on but the browser will not permit
an `AudioContext` until the first gesture, and the engine only starts one then. If
`AudioContext` is unavailable, if it refuses to start, or if any individual sound throws, every
call becomes a no-op and the game continues silently. The audio panel in the field guide says
so explicitly when it detects that no context is available. No code path in the game depends on
a sound having played.

## Fonts and images

For completeness, since they are the project's other media:

- **Typefaces:** none are bundled or fetched. The interface uses system font stacks
  (`Iowan Old Style / Palatino / Georgia / serif` for display, `Inter / Segoe UI / system-ui`
  for utility text).
- **Icons, favicon and social preview:** original vector work in `public/favicon.svg` and
  `scripts/make-images.mjs`, generated with [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js)
  (MPL-2.0, a development dependency only — it is not shipped to the browser).

---

## Fire Watch (the lookout demo)

The demo at `/firewatch.html` has its own score and ambience, in
`src/firewatch/audio.ts`, written to the same rule: **nothing is fetched and
there are no sample files.**

| Layer | How it is made |
| --- | --- |
| Theme | A slow piece in D dorian. Each bar is a pad of four detuned oscillators through a lowpass, with a second pad a fifth above it every other bar. |
| Motif | Three to five plucked triangle-wave notes from a six-note set, entering on alternate bars, starting at a different place in the set each time. |
| Wind | Two loops of pink noise, one lowpassed to a rumble and one bandpassed to a hiss through needles, with a 0.07 Hz oscillator moving the gain. |
| Crickets | Pink noise through a narrow 4.6 kHz bandpass. |
| Brazier | Pink noise through a 1.1 kHz bandpass, audible only within a few metres of it. |
| Air | A 2.6-second noise impulse response, shared by the music bus. |

The mix follows the player: wind rises with height, crickets fade as you climb
and the fire is only loud beside it. Music and ambience each have their own
level in the settings screen, and every failure path is a silent no-op.

