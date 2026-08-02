# Audio overhaul: intelligible announcer + living engine

Date: 2026-08-02

## Problem

Two complaints from play:

1. **The "Prepare to qualify / Prepare to race" announcer is unintelligible.** The
   phrases are rendered with macOS `say -v Fred -r 145` at 8 kHz, crushed to 4-bit
   at load, then played through a 1.1 kHz bandpass with `Q = 0.55`. Each of those
   three stages removes consonant energy; stacked, the words are mush.
2. **The engine is drony and monotone.** A single 512-sample loop played back at a
   quantized playbackRate through fixed formant filters. At steady speed the
   output is a mathematically perfect, unchanging tone — fatiguing within seconds.

## Decision on authenticity

The existing audio is a deliberate reproduction of the 1982 Namco cabinet
(4-bit crush, 6-bit pitch register, 8 volume levels, fixed formants). The user has
chosen to **modernize freely**: drop the cabinet constraints where they cause the
problems above. The WSG-voiced jingles, countdown beeps, menu chiptune, and crash
stack are unaffected and stay retro — the change is scoped to the announcer voice
and the engine layers.

## Part 1 — Announcer voice

### Asset regeneration

Re-render both phrases with a higher-quality voice at full bandwidth:

```
say -v Daniel -r 160 -o voice-qualify.aiff "Prepare to qualify!"
afconvert -f WAVE -d LEI16@22050 -c 1 voice-qualify.aiff public/voice-qualify.wav
```

`Daniel` (en_GB) replaces `Fred`. It is a high-quality Apple voice and reads as a
British motorsport commentator, which suits the game. 22.05 kHz replaces 8 kHz so
sibilants and stops survive. `-r 160` is close to natural pace.

The regeneration commands live in a committed script, `tools/make-voices.sh`, so the
phrases can be reproduced without archaeology. CLAUDE.md points at the script rather
than repeating the commands.

### Playback chain

- **Remove the 4-bit crush for voices.** `loadVoices` no longer calls `crushTo4Bit`.
  (`crushTo4Bit` stays exported and tested — the engine wavetable still uses it.)
- **Replace the narrow bandpass** with a wide PA-horn band: highpass ~250 Hz →
  lowpass ~5 kHz. This keeps the "through a speaker on a pole" colouration without
  eating the consonant band (2–5 kHz) the way `bandpass@1100, Q=0.55` did.
- **Add one slapback echo**: a single delayed copy at ~150 ms, ~28% level, fed
  through the same band. Reads as a large open venue; one repeat only, so it never
  smears the words.
- Gain drops from 2.4 to ~1.3, since the wide band no longer costs level.

## Part 2 — Engine

Replace the single fixed-formant loop with a small layered stack. Everything stays
procedural; no new audio assets.

### Firing-pulse core

A longer loop buffer (~1.5 s) modelling discrete cylinder firing pulses rather than
one perfect wave cycle. Each pulse is a short decaying exponential burst; the pulse
train carries small deterministic per-pulse timing and amplitude jitter, which is
what stops the loop from reading as a loop.

Three copies of that buffer play at once, detuned a few cents apart (and started at
different loop offsets). The beating between them produces the thick, uneven growl
of a multi-cylinder engine — the single largest improvement over the current tone.

### Continuous pitch

Drop the 64-step pitch quantizer and the 8-level volume quantizer *for the player
engine*. Pitch and gain follow RPM smoothly. Per-car `enginePitch` from `CARS` is
preserved so the F1 still screams and the RAV4 still lugs. (`quantizePitch` /
`quantizeLevel` remain exported and tested; the rival voice and any other caller are
unaffected.)

### Load-responsive timbre

`updateEngine` gains a `throttle` argument (0..1, already tracked as `input.throttle`
in main.js). A lowpass on the engine bus opens with both RPM and throttle:
on-throttle is bright and hard, lift-off goes dark and soft. This makes the engine
respond to *what the player does*, not merely how fast they are going — the main
cure for monotony.

**Overrun burble**: when the throttle is released above a threshold RPM, schedule a
short series of randomised low-frequency pops (decaying noise bursts) — the
off-throttle crackle of a race engine. Triggered on the throttle-release edge, rate
and intensity scaled by the RPM at release.

### Wind / road layer

Filtered noise whose gain rises with the square of speed, bandpassed and mixed under
the engine. At cruise it masks residual periodicity and sells speed directly.

### Breathing

A slow bounded random walk applied to pitch (±~0.5%) and gain (±~4%), updated a few
times a second. Guarantees that even a perfectly held speed never sits on a frozen
tone.

### Upshift dip

A brief RPM/gain dip when the gear number increases, so shifting is audible as an
event rather than a silent discontinuity in the pitch curve.

### Rivals

The rival voice reuses the new pulse buffer as a single layer through its existing
single bandpass. Proximity gain, stereo pan, and the `RIVAL` tuning constants are
unchanged — only the source timbre improves.

## Architecture

House style is preserved: pure math with tests in `src/audio-math.js`, thin untested
WebAudio node graph in `src/audio.js`.

New pure functions in `audio-math.js`, each unit-tested:

| Function | Responsibility |
|---|---|
| `firingPulseSamples(length, opts, rand)` | Generate the pulse-train loop buffer. Takes an injected RNG so tests are deterministic. |
| `ENGINE_LAYERS` | Detune ratios + relative gains for the three stacked layers. |
| `engineCutoff(frac, throttle)` | Lowpass cutoff (Hz) from RPM fraction and throttle. |
| `windGain(speed, maxSpeed)` | Speed-squared wind level. |
| `flutterStep(state, rand)` | One bounded random-walk step → `{ pitch, gain }` multipliers. |
| `burbleBursts(frac, rand)` | Timing/level list for overrun pops; empty below the RPM threshold. |
| `enginePitchSmooth(frac, basePitch)` | Continuous (non-quantized) playbackRate. |

`audio.js` changes: `buildEngine` builds the three-layer stack plus wind noise and
the load lowpass; `updateEngine(audio, speed, gear, spec, basePitch, throttle)` drives
pitch/gain/cutoff/flutter and fires burbles and the upshift dip.

`main.js` change is one line — pass `input.throttle` into `updateEngine`.

## Testing and verification

- Vitest tests for every new pure function, written first (TDD). The existing 172
  tests must stay green; tests asserting quantizer behaviour stay valid because the
  quantizers remain exported and unchanged.
- Headless check via `window.__game` in the browser pane: drive the car, confirm no
  console errors and that the audio graph builds.
- Final judgement is by ear. Tuning constants (`ENGINE_LAYERS` detune, wind level,
  burble intensity, flutter depth) are named exports so they can be adjusted quickly
  after a listen.

## Out of scope

Jingles, countdown beeps, crash stack, menu chiptune, crowd noise, skid noise — all
unchanged.
