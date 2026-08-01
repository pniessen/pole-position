# Pole Position — First-Person Arcade Racer: Design Spec

**Date:** 2026-07-31
**Status:** Approved by user

## Summary

A browser-based, first-person arcade racing game in the spirit of Pole Position:
true 3D rendering with Three.js, classic time-trial-with-traffic gameplay, one
polished track, procedural retro audio, and a persistent local leaderboard.

## Decisions (user-confirmed)

- **Rendering:** True 3D via Three.js (not pseudo-3D sprite scaling).
- **Gameplay:** Classic time trial + traffic — beat the clock, checkpoints
  extend time, dodge rival cars.
- **Scope:** Single track with full polish; procedural sound & music;
  high-score persistence. No multiple tracks in v1.
- **Camera:** First person (hood/cockpit view).

## Architecture

- **Stack:** Vite + vanilla JavaScript (ES modules) + Three.js. Vitest for
  unit tests of pure-logic modules. No UI framework. Static-site deployable.
- **Core principle:** The car is *not* free-roaming physics. Its pose is
  `(s, x)` — distance along a closed track spline plus lateral offset.
  All handling, AI, and collision logic operates in this 1.5D space; the 3D
  scene is a projection of it. This gives authentic arcade feel, trivial
  traffic AI, and testable pure math.

### Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `track.js` | Closed Catmull-Rom spline (~20 control points: long straight, S-curves, hairpin, gentle hill); sampling `(s, x) → world pos/heading`; curvature lookup; track length; checkpoint positions | Three.js math only |
| `handling.js` | Pure functions: accel/brake/drag integration, steering → lateral velocity, centrifugal push = f(speed, curvature), off-road drag when `|x| >` road half-width, crash state machine | none (pure) |
| `traffic.js` | Rival cars as `(s, x, speed)` records; advance along spline; lane changes to avoid each other; respawn logic to keep cars near player | `track.js` |
| `race.js` | Game state machine (attract → countdown → racing → crashed → finished/timeout), timer, checkpoint time extension, lap counting, scoring | `handling.js` |
| `scene.js` | Three.js scene: road ribbon mesh w/ rumble strips + centerline, terrain, billboards/signs, start gantry, checkpoint arches, sky + fog, rival car meshes, hood/dashboard model | `track.js` |
| `camera.js` | First-person camera at player pose; FOV widens with speed; steering tilt; off-road/top-speed shake | `track.js` |
| `hud.js` | DOM overlay: speed (km/h), timer, score, lap counter, "EXTENDED TIME" flash, title/attract and game-over/leaderboard screens | `race.js` state |
| `audio.js` | Procedural WebAudio: engine pitch ∝ speed, skid noise, crash explosion, checkpoint jingle, chiptune loop. Unlocks on first user gesture | race/handling state |
| `storage.js` | Top-10 leaderboard in localStorage; 3-initial entry; try/catch around all storage access | none |
| `main.js` | Bootstraps everything; fixed-timestep update loop + rAF render | all |

## Gameplay Rules

- Race starts with **75 s** on the clock after a 3-2-1 countdown.
- Passing a **checkpoint arch** adds time (tuned ~40 s) and flashes HUD/jingle.
- **4 laps** to finish; running out of time = game over wherever you are.
- **Score:** distance-based + speed bonus, arcade-style big numbers.
- **Collision with rival:** crash sequence (spin/flash, ~2 s), respawn at low
  speed at crash location. Time keeps running — crashes cost time, not lives.
- **Off-road:** heavy drag (top speed roughly halves), rumble shake, no crash.
- **Controls:** ↑/W accelerate, ↓/S brake, ←→/A D steer. Any key starts from
  attract screen (also unlocks audio).

## Traffic

6–8 rivals, each `(s, x, targetSpeed)` with speeds 60–85 % of player top
speed, fixed preferred lanes with gentle avoidance shifts between rivals.
When a rival falls > half a track behind the player (or too far ahead), it
respawns a few hundred meters ahead of the player so traffic stays present.
Rivals never crash into each other (they pass through after avoidance fails);
only player–rival collisions matter.

## Visual Style

Bright retro palette (saturated blues/greens/reds), low-poly meshes, fog on
the horizon, Mount-Fuji-style backdrop silhouette, red/white rumble strips,
dashed centerline, roadside billboards with fake retro ads. Hood + simple
dashboard visible in first person. Sun-lit, no dynamic shadows required
(performance + retro look).

## Error Handling

- localStorage wrapped in try/catch (private browsing) — leaderboard silently
  degrades to session-only.
- WebAudio context created/resumed on first keypress to satisfy autoplay
  policies; game runs fine muted if audio fails.
- rAF loop uses fixed-timestep accumulator with clamped frame delta so
  tab-switching doesn't cause physics explosions.

## Testing

- **Vitest unit tests** for pure modules: `handling.js` (speed integration,
  centrifugal math, off-road drag, crash state), `race.js` (timer, checkpoint
  extension, lap counting, scoring), `storage.js` (leaderboard insert/sort/
  truncate), `track.js` (closed-loop continuity, s-wrapping).
- **Manual playtesting** via browser preview for feel, visuals, audio.

## Out of Scope (v1)

Multiple tracks, AI position-based racing, gear shift (lo/hi), mobile touch
controls, gamepad support, online leaderboards, replays.
