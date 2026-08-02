# Pole Position — project guide for Claude Code

First-person arcade racer in the spirit of 1982 Pole Position. Vanilla JS + Three.js,
built with Vite, tested with Vitest. Live at **https://pniessen.github.io/pole-position/**
(GitHub Pages, auto-deployed from `main`).

## Commands

```bash
npm run dev      # vite dev server (reads PORT env; strictPort false)
npm test         # vitest — 188 tests, all pure-logic modules; must stay green
npm run build    # production build incl. PWA service worker
```

Deployment: pushing to `main` triggers `.github/workflows/deploy.yml`
(npm ci → npm test → `DEPLOY_BASE=/pole-position/` build → deploy-pages).
Verify with `gh run watch` / `gh run list`. Never skip the test gate.

## Core architecture: the (s, x) pose

**A car's pose is `(s, x)`: distance along a closed Catmull-Rom spline + signed
lateral offset.** All handling, AI, collision, drafting, ghost replay, and lap
logic is pure math over that space — unit-tested, no Three.js. The 3D scene is
just a projection of (s, x) poses via `worldPose(track, s, x)`. Keep it that way:
new gameplay logic goes in a pure module with tests first, rendering second.

## Module map

| File | Responsibility |
|---|---|
| `src/main.js` | Composition root: menu flow (title → mode → car → track → race), game loop, wiring. Not unit-tested. |
| `src/track.js` | `TRACKS` (11 tracks), `createTrack`, `radialLoop()`, spline sampling, `worldPose`, `posAt`, curvature |
| `src/handling.js` | `CAR` base spec, `CARS` roster (6 cars), `GEARS` 4-speed, `stepCar`, `shiftGear`, `shiftAdvice`, `weatherSpec` (rain grip), `ROAD_HALF_WIDTH = 7.5` |
| `src/race.js` | Race state machine: countdown → racing → gameover/finished; checkpoints, lap timing, `startLightState` |
| `src/traffic.js` | Time-Attack traffic (respawning) + Grand Prix `RACERS` (7, real laps, rubber-banded, never respawn), `standings`, `draftFactor` (slipstream), `findCollision` |
| `src/ghost.js` | Best-lap recorder/sampler (0.1 s cadence, linear interp) |
| `src/storage.js` | Per-track records in localStorage (`polePosition.records.v1`): top-10 scores, best lap, ghost |
| `src/audio-math.js` | Pure audio math: firing-pulse wavetable, RPM/pitch/gain mapping, load cutoff, wind, flutter, burble, rival voice, countdown tones. Every tuning knob is a named export |
| `src/audio.js` | WebAudio node graph (thin, untested). See "Audio" below |
| `src/scene.js` | `buildScene`, road/terrain geometry, `atmosphere(theme)` (sunset/night/rain/mist), rival car meshes, hoods |
| `src/scenery.js` | Sky dome, clouds, birds, blimp (+ THE DAD SHOW banner), start-light gantry, grandstands (waving flags, camera flashes), `makeEnvironment` per theme (forest/urban/stadium/hills/plains/coast), props |
| `src/effects.js` | Pooled skid-mark decals (150) + smoke sprites (26) |
| `src/hud.js` | DOM HUD, menus, minimap, rain overlay, initials entry, game-over screens |
| `src/touch.js` | Mobile: analog steer bar, brake, gear ▲▼, exit ✕, tap→synthetic-keydown menu reuse, `?touch=1` forces touch mode on desktop |
| `src/carmodels.js` | Refined extruded-profile car models (sedan/wagon/roadster/suv/open-wheel) used on track, in showroom, and for the ghost |
| `src/showroom.js` | Offscreen renders: car photos + track thumbnails for selectors (calls `forceContextLoss` — see gotchas) |

Tests live in `test/*.test.js`, one per pure module. TDD is the house style:
failing test → minimal code → green → commit.

## Track invariants (tests enforce these)

- Layouts must **not self-intersect** and must keep **min curve radius > 11 m**
  (road half-width 7.5 + curb). `test/track.test.js` checks every track.
- Splines use **CENTRIPETAL** Catmull-Rom (`new THREE.CatmullRomCurve3(pts, true, 'centripetal')`).
  Uniform parameterization overshoots into cusps at loop seams. Tight closing
  corners need multi-point circular arcs — see Monaco's hairpin point run.
- `radialLoop(radii, elevations, cx, cz)` builds guaranteed-simple loops (used by Laguna Seca).
- Curbs ridge up 0.22 m at the road edges so bends stay visible edge-on across
  flat terrain (fixes the "gap in the track" illusion).

## Audio

The engine and announcer were originally faithful reproductions of the 1982 cabinet
(4-bit crush, 64 pitch steps, fixed formants). That made the announcer unintelligible
and the engine a drone, so both were modernized — see
`docs/superpowers/specs/2026-08-02-audio-overhaul-design.md`. The jingles, countdown,
crash stack and menu chiptune are still deliberately retro.

- **Engine**: three detuned copies (`ENGINE_LAYERS`) of a 1.5 s **firing-pulse loop**
  (`firingPulseSamples` — decaying cylinder bursts on a 4-pulse uneven-firing `bank`
  pattern, with per-pulse timing/amplitude `jitter`; the jitter is what stops it
  sounding looped, and the detune beating is what makes it sound like an engine).
  Base firing rate ≈ 171 Hz; `playbackRate` sweeps it continuously from RPM
  (`rpmFrac` = speed within current gear's band). **No quantizers** — stair-stepped
  pitch was a large part of the drone.
- **Load response** is the main anti-monotony lever: `updateEngine` takes `throttle`,
  and `engineCutoff(frac, throttle)` opens a lowpass with revs *and* right foot, so
  on-throttle is bright and hard while the overrun goes dark and quiet
  (`OFF_THROTTLE_GAIN`).
- Also layered in: `windGain` (speed², under the engine), `flutterStep` (bounded
  random walk on pitch/gain so a held speed never freezes), `burbleBursts`
  (off-throttle crackle, fired on the throttle-release edge above `BURBLE.minFrac`),
  and `SHIFT_DIP` (brief duck on upshift, on its own gain node so it doesn't fight
  the per-frame gain updates).
- Per-car `enginePitch` in `CARS` (F1 1.3 highest → RAV4 0.8 lowest).
- **Rival voice**: one shared voice for the nearest car using a single layer of the
  same pulse loop, proximity gain (curved, `RIVAL.closeCurve`), stereo-panned by
  lateral offset. Volume knobs: `* 0.34` in `updateRivalEngine` and
  `RIVAL.closeCurve` in audio-math.js.
- **Crash**: impact noise burst → lowpassed rumble → highpassed sizzle.
- **Announcer**: "Prepare to qualify!" / "Prepare to race!" — regenerate with
  **`tools/make-voices.sh`** (macOS `say -v Daniel`, 22.05 kHz). Played through a wide
  PA-horn band (250 Hz–5 kHz) plus one slapback repeat — the `VOICE` constants in
  audio.js. Do NOT reintroduce the narrow bandpass or the 4-bit crush; stacking those
  on 8 kHz Fred is exactly what made the words unintelligible.
- **Countdown**: WSG boop per red lamp, held higher beep on green — edge-triggered
  in main.js on `startLightState` changes (`prevLight`).
- **No music during the race** (authentic): chiptune loop is menu/attract only.
  Jingles/fanfare use a WSG-style `PeriodicWave` (`WSG_HARMONICS`).
- Audio unlocks on first user gesture (`unlockAudio()` in main.js — also kicks
  off voice fetch/decode). All node-graph code fails silent via try/catch — which
  means a broken graph is *invisible*; verify by rendering it through an
  `OfflineAudioContext` in the browser pane rather than trusting a clean console.

## Headless testing & dev tooling

- **The Claude browser pane doesn't fire rAF while hidden.** Use the
  `window.__game` hooks in main.js to drive the game from `javascript_tool`:
  `getState / press / release / crash / setTrack / setCar / setMode / step(dt)`.
- `?touch=1` URL param forces touch mode for desktop testing of mobile UI.
- Dev-only vite middleware `/dev-screenshot`: POST a canvas dataURL →
  `docs/media/screenshot.png`, or `?name=foo.png` (sanitized) → `public/foo.png`.
  Used for README screenshots, PWA icons, and one-off visual verification
  (e.g. rendering the blimp offscreen to check the banner).

## Gotchas learned the hard way

- **Vertex colors bleed** on indexed geometry — the road is non-indexed
  BufferGeometry with flat per-face colors.
- **Fog hides distant backdrops** — horizon mountains/skyline use `fog: false` materials.
- **WebGL context exhaustion**: showroom's offscreen renderer must call
  `renderer.forceContextLoss()` on dispose.
- **Touch menus**: `#hud` has `pointer-events: none`; `body.touch .screen` re-enables.
  Selector cards must NOT choose on tap — explicit prev/next/confirm buttons only
  (users need to browse). `setPointerCapture` throws on synthetic pointers — try/catch.
- **`race.elapsed`** exists because keying "GO!" to `timeLeft` made the banner
  reappear when checkpoint bonuses raised the clock.
- **Asset URLs** must use `import.meta.env.BASE_URL` prefix (GitHub Pages serves
  under `/pole-position/`).
- **PWA precache**: `vite.config.js` workbox `globPatterns` must list every asset
  type (currently `js,css,html,png,wav`).
- **macOS " 2" duplicate files** have appeared in the repo before — check
  `git status` for `* 2.js` strays before committing.
- Commit as the user (no explicit git identity is configured; the default
  autogenerated identity is what they've been using).

## Feature history (chronological)

1. Core game: (s,x) engine, 3 themed tracks, traffic, checkpoints, HUD, minimap,
   leaderboard, procedural audio, THE DAD SHOW billboards, wide road.
2. Car roster: E60 M5, E85 Z4M, E46 325xi wagon (AWD, better offroad), Classic F1
   (fastest), Lotus Elise, grey RAV4 (SUV, tall eye height) — per-car handling,
   hood models, showroom photos.
3. 8 famous circuits added (Nordschleife, Spa, Monza, Monaco, Indianapolis,
   Daytona, Laguna Seca, COTA) with per-track environments; track-validation
   test suite; centripetal-spline fix for loop-seam cusps.
4. Mobile: touch controls (analog steer bar, auto-throttle, gear buttons, exit),
   tap-driven menus, PWA-friendly viewport.
5. 4-speed gearbox (keys 1–4 / touch ▲▼) with shift-advice prompts.
6. Feature pack: per-track records, best-lap ghost car (translucent replay),
   slipstream/drafting (green speed glow), Grand Prix mode (7 racers, standings,
   position bonus), weather/time-of-day (Spa rain = less grip, Daytona night,
   Monza sunset, Nordschleife mist), skid marks + smoke, crowd flags + camera
   flashes, PWA install (manifest + service worker + generated icons).
7. Audio-authenticity overhaul (researched the real 1982 hardware first, then
   implemented — see "Audio" above); rival volume boost; countdown beeps;
   Fred-voiced announcer; blimp banner.
8. Audio listenability pass, reversing part of (7) where authenticity hurt: the
   layered firing-pulse engine with throttle-dependent timbre, wind, flutter,
   burble and shift dip, and a full-bandwidth Daniel-voiced announcer through a
   wide PA band. Quantizers and the 4-bit crush were deleted, not just bypassed.

## Working conventions

- User is Peter Niessen (github.com/pniessen). Repo is public.
- Ship flow: branch or direct commit → `npm test` green → push to `main` →
  `gh run watch` until the Pages deploy succeeds → report the live URL.
- New gameplay logic: pure module + Vitest tests first; keep main.js thin.
- Verify visual/gameplay changes headlessly via `window.__game` + browser pane
  before pushing.
