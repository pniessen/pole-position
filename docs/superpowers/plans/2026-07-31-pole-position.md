# Pole Position First-Person Racer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser-based first-person arcade racer: Three.js 3D, time-trial-with-traffic gameplay, one polished track, procedural audio, localStorage leaderboard.

**Architecture:** Car pose is `(s, x)` — distance along a closed Catmull-Rom spline + lateral offset. All handling/AI/collision logic is pure math in this space; the 3D scene is a projection. Pure modules are unit-tested; 3D/audio verified by playtesting.

**Tech Stack:** Vite, vanilla JS (ES modules), Three.js, Vitest, WebAudio, localStorage.

## Global Constraints

- Units: meters, seconds, m/s internally. Display speed = `m/s × 3.6` km/h.
- Road half-width: **6 m**. Player top speed: **80 m/s** (288 km/h).
- Race: starts with **75 s**, checkpoint bonus **+40 s**, **4 laps** to finish.
- Coordinate/sign conventions: y-up; `x` lateral offset, **positive = right of travel direction**; signed curvature **positive = left turn**; `right = tangent × up`.
- Pure logic modules (`handling.js`, `race.js`, `storage.js`, `traffic.js`, `track.js`) must not touch DOM/WebAudio (`track.js` may import three.js math).
- No external asset files — all geometry procedural, textures via CanvasTexture, audio via WebAudio synthesis. No real brand names on billboards.
- Commit after every green test cycle.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.js` (none needed — defaults), `index.html`, `src/main.js`, `.gitignore`

**Interfaces:**
- Produces: dev environment where `npm run dev` serves the game and `npx vitest run` runs tests.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/pniessen/Documents/pole-position
npm init -y
npm install three
npm install -D vite vitest
```

Edit `package.json`: set `"type": "module"`, scripts `{"dev": "vite", "build": "vite build", "test": "vitest run"}`.

`.gitignore`:
```
node_modules
dist
```

`index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>POLE POSITION</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

`src/main.js` (placeholder, replaced in Task 8):
```js
console.log('pole position boot');
```

- [ ] **Step 2: Verify** — `npx vite build` succeeds.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "chore: scaffold vite + three + vitest project"`

---

### Task 2: Car handling (`src/handling.js`) — pure, TDD

**Files:**
- Create: `src/handling.js`
- Test: `test/handling.test.js`

**Interfaces:**
- Produces:
  - `CAR` const: `{ maxSpeed: 80, accel: 25, brakeDecel: 60, coastDecel: 8, offroadMax: 30, offroadDecel: 40, steerSpeed: 16, centrifugal: 0.18, crashDuration: 2 }`
  - `ROAD_HALF_WIDTH = 6`
  - `createCarState() → { s: 0, x: 0, speed: 0, crashTimer: 0 }`
  - `stepCar(car, input, curvature, trackLength, dt) → newCar` — `input = { throttle: 0|1, brake: 0|1, steer: -1..1 }`. Pure (returns new object).
  - `crashCar(car) → newCar` with `speed: 0, crashTimer: CAR.crashDuration`
  - `isCrashed(car) → boolean`
  - `isOffroad(car) → boolean` (`|x| > ROAD_HALF_WIDTH`)

- [ ] **Step 1: Write failing tests** — `test/handling.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CAR, ROAD_HALF_WIDTH, createCarState, stepCar, crashCar, isCrashed, isOffroad } from '../src/handling.js';

const IDLE = { throttle: 0, brake: 0, steer: 0 };
const GAS = { throttle: 1, brake: 0, steer: 0 };

describe('stepCar', () => {
  it('accelerates under throttle up to maxSpeed', () => {
    let car = createCarState();
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBeCloseTo(CAR.accel);
    for (let i = 0; i < 100; i++) car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBe(CAR.maxSpeed);
  });

  it('coasts down without input and never goes below 0', () => {
    let car = { ...createCarState(), speed: 10 };
    car = stepCar(car, IDLE, 0, 10000, 1);
    expect(car.speed).toBeCloseTo(10 - CAR.coastDecel);
    car = stepCar(car, IDLE, 0, 10000, 1);
    expect(car.speed).toBe(0);
  });

  it('brakes harder than coasting', () => {
    let car = { ...createCarState(), speed: 70 };
    const braked = stepCar(car, { throttle: 0, brake: 1, steer: 0 }, 0, 10000, 1);
    expect(braked.speed).toBeCloseTo(70 - CAR.brakeDecel);
  });

  it('advances s by speed*dt and wraps at trackLength', () => {
    let car = { ...createCarState(), s: 9990, speed: 20 };
    car = stepCar(car, IDLE, 0, 10000, 1);
    expect(car.s).toBeCloseTo(10 - CAR.coastDecel); // 9990+ (20-8)*... careful: s advances with NEW speed? use pre-decay speed
  });

  it('steering moves x, scaled by speed', () => {
    let car = { ...createCarState(), speed: CAR.maxSpeed };
    car = stepCar(car, { throttle: 1, brake: 0, steer: 1 }, 0, 10000, 0.5);
    expect(car.x).toBeGreaterThan(0);
    const slow = stepCar({ ...createCarState(), speed: 10 }, { throttle: 0, brake: 0, steer: 1 }, 0, 10000, 0.5);
    expect(slow.x).toBeLessThan(car.x);
    expect(slow.x).toBeGreaterThan(0);
  });

  it('left curve (positive curvature) pushes car right (+x)', () => {
    let car = { ...createCarState(), speed: 60 };
    car = stepCar(car, GAS, 0.02, 10000, 0.5);
    expect(car.x).toBeGreaterThan(0);
  });

  it('offroad clamps speed toward offroadMax', () => {
    let car = { ...createCarState(), x: ROAD_HALF_WIDTH + 2, speed: CAR.maxSpeed };
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBeCloseTo(CAR.maxSpeed - CAR.offroadDecel);
    expect(isOffroad(car)).toBe(true);
  });

  it('crash freezes controls until timer expires', () => {
    let car = crashCar({ ...createCarState(), speed: 80 });
    expect(car.speed).toBe(0);
    expect(isCrashed(car)).toBe(true);
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBe(0); // no throttle while crashed
    car = stepCar(car, GAS, 0, 10000, 1.5); // timer expires
    expect(isCrashed(car)).toBe(false);
  });
});
```

Fix the wrapping test to be exact once implementation semantics chosen: **spec: `s` advances using the post-update speed** — assert `car.s` equals `(9990 + newSpeed*dt) % 10000`.

- [ ] **Step 2: Run** — `npx vitest run test/handling.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** — `src/handling.js`:

```js
export const CAR = {
  maxSpeed: 80, accel: 25, brakeDecel: 60, coastDecel: 8,
  offroadMax: 30, offroadDecel: 40, steerSpeed: 16,
  centrifugal: 0.18, crashDuration: 2,
};
export const ROAD_HALF_WIDTH = 6;

export function createCarState() {
  return { s: 0, x: 0, speed: 0, crashTimer: 0 };
}

export function isCrashed(car) { return car.crashTimer > 0; }
export function isOffroad(car) { return Math.abs(car.x) > ROAD_HALF_WIDTH; }

export function crashCar(car) {
  return { ...car, speed: 0, crashTimer: CAR.crashDuration };
}

export function stepCar(car, input, curvature, trackLength, dt) {
  const next = { ...car };
  if (next.crashTimer > 0) {
    next.crashTimer = Math.max(0, next.crashTimer - dt);
    return next;
  }
  const offroad = isOffroad(next);
  // longitudinal
  if (input.brake) next.speed -= CAR.brakeDecel * dt;
  else if (input.throttle) next.speed += CAR.accel * dt;
  else next.speed -= CAR.coastDecel * dt;
  const cap = offroad && next.speed > CAR.offroadMax
    ? Math.max(CAR.offroadMax, next.speed - CAR.offroadDecel * dt + (input.throttle ? CAR.accel * dt : 0) * 0)
    : CAR.maxSpeed;
  // simpler: offroad applies extra decel then clamp
  if (offroad && next.speed > CAR.offroadMax) {
    next.speed = Math.max(CAR.offroadMax, car.speed - CAR.offroadDecel * dt);
  }
  next.speed = Math.min(CAR.maxSpeed, Math.max(0, next.speed));
  // lateral: steering scaled by speed fraction + centrifugal push (outward)
  const steerAmount = input.steer * CAR.steerSpeed * Math.min(1, next.speed / 30);
  const push = curvature * next.speed * next.speed * CAR.centrifugal;
  next.x += (steerAmount + push) * dt;
  next.x = Math.max(-ROAD_HALF_WIDTH * 2.5, Math.min(ROAD_HALF_WIDTH * 2.5, next.x));
  // advance
  next.s = (next.s + next.speed * dt) % trackLength;
  return next;
}
```

Note: resolve the offroad branch cleanly — when offroad and above `offroadMax`, override the longitudinal result with `max(offroadMax, prevSpeed − offroadDecel·dt)`. Delete the dead `cap` expression; tests define exact behavior.

- [ ] **Step 4: Run** — expect PASS. Adjust test literals only if they contradict the spec'd semantics above (not to hide bugs).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: arcade car handling model with offroad and crash states"`

---

### Task 3: Track (`src/track.js`) — spline + pose math, TDD

**Files:**
- Create: `src/track.js`
- Test: `test/track.test.js`

**Interfaces:**
- Consumes: three.js (`CatmullRomCurve3`, `Vector3`).
- Produces:
  - `createTrack() → { curve, length, checkpoints: [s0, s1] }` — closed loop, length ≈ 2–3 km, checkpoints at `0` and `length/2`.
  - `posAt(track, s) → Vector3`
  - `tangentAt(track, s) → Vector3` (normalized)
  - `curvatureAt(track, s) → number` (signed, XZ plane, + = left turn)
  - `worldPose(track, s, x) → { position: Vector3, tangent: Vector3, right: Vector3 }` — `right = tangent × up(0,1,0)` normalized; `position = posAt(s) + right·x`.

- [ ] **Step 1: Write failing tests** — `test/track.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createTrack, posAt, tangentAt, curvatureAt, worldPose } from '../src/track.js';

const track = createTrack();

describe('track', () => {
  it('is a closed loop: posAt(0) ≈ posAt(length)', () => {
    const a = posAt(track, 0), b = posAt(track, track.length);
    expect(a.distanceTo(b)).toBeLessThan(0.5);
  });

  it('wraps s beyond length and below 0', () => {
    const a = posAt(track, 100), b = posAt(track, track.length + 100);
    expect(a.distanceTo(b)).toBeLessThan(0.5);
    const c = posAt(track, -50), d = posAt(track, track.length - 50);
    expect(c.distanceTo(d)).toBeLessThan(0.5);
  });

  it('has a plausible length', () => {
    expect(track.length).toBeGreaterThan(1500);
    expect(track.length).toBeLessThan(4000);
  });

  it('checkpoints at 0 and half distance', () => {
    expect(track.checkpoints).toEqual([0, track.length / 2]);
  });

  it('right vector is horizontal-ish and perpendicular to tangent', () => {
    const { tangent, right } = worldPose(track, 300, 0);
    expect(Math.abs(tangent.dot(right))).toBeLessThan(0.05);
    expect(Math.abs(right.y)).toBeLessThan(0.05);
    expect(right.length()).toBeCloseTo(1, 1);
  });

  it('worldPose offsets laterally by x', () => {
    const a = worldPose(track, 500, 0).position;
    const b = worldPose(track, 500, 6).position;
    expect(a.distanceTo(b)).toBeCloseTo(6, 0);
  });

  it('curvature integrates to ±2π around the loop', () => {
    let total = 0;
    const step = 5;
    for (let s = 0; s < track.length; s += step) total += curvatureAt(track, s) * step;
    expect(Math.abs(Math.abs(total) - Math.PI * 2)).toBeLessThan(0.3);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — `src/track.js`:

```js
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// Layout (x, elevation, z): long start straight, sweeping S, hairpin, gentle hill.
const CONTROL_POINTS = [
  [0, 0, 0], [140, 0, 0], [280, 0, -10], [380, 0, -60],
  [420, 2, -140], [380, 4, -220], [280, 5, -260], [180, 4, -230],
  [120, 3, -300], [160, 2, -390], [260, 1, -430], [360, 0, -470],
  [340, 0, -560], [230, 0, -590], [120, 1, -560], [60, 3, -480],
  [-60, 4, -440], [-140, 2, -340], [-160, 0, -200], [-120, 0, -80],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

export function createTrack() {
  const curve = new THREE.CatmullRomCurve3(CONTROL_POINTS, true, 'catmullrom', 0.5);
  const length = curve.getLength();
  return { curve, length, checkpoints: [0, length / 2] };
}

function wrap(track, s) {
  const L = track.length;
  return ((s % L) + L) % L;
}

export function posAt(track, s) {
  return track.curve.getPointAt(wrap(track, s) / track.length);
}

export function tangentAt(track, s) {
  return track.curve.getTangentAt(wrap(track, s) / track.length).normalize();
}

export function curvatureAt(track, s) {
  const ds = 4;
  const t1 = tangentAt(track, s - ds), t2 = tangentAt(track, s + ds);
  const a1 = Math.atan2(-t1.z, t1.x), a2 = Math.atan2(-t2.z, t2.x);
  let da = a2 - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  return da / (2 * ds);
}

export function worldPose(track, s, x) {
  const position = posAt(track, s);
  const tangent = tangentAt(track, s);
  const right = new THREE.Vector3().crossVectors(tangent, UP).normalize();
  position.addScaledVector(right, x);
  return { position, tangent, right };
}
```

Note `getPointAt`/`getTangentAt` use arc-length parameterization (that's the point — uniform s). Sign check for curvature: with y-up and atan2(−z, x) as heading, increasing heading = counterclockwise from above = left turn = positive. If the integral test yields −2π, the loop runs clockwise — that's fine (test uses |total|).

- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: closed spline track with pose and curvature math"`

---

### Task 4: Race state machine (`src/race.js`) — TDD

**Files:**
- Create: `src/race.js`
- Test: `test/race.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `RACE = { startTime: 75, checkpointBonus: 40, totalLaps: 4, countdown: 3, scoreRate: 5 }`
  - `createRace(trackLength, checkpoints) → { phase: 'attract', timeLeft, lap: 1, score: 0, trackLength, checkpoints, countdown, justCheckpoint: false, justLap: false }`
  - `startRace(race) → race` with `phase: 'countdown'`, `countdown: RACE.countdown`
  - `updateRace(race, dt, prevS, newS, speed) → race` — pure. Phases: `'attract' | 'countdown' | 'racing' | 'gameover' | 'finished'`. `justCheckpoint`/`justLap` are single-update flags for HUD/audio.
  - `crossed(prevS, newS, target, trackLength) → boolean` — wrap-aware line crossing (exported for tests/traffic reuse).

- [ ] **Step 1: Write failing tests** — `test/race.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { RACE, createRace, startRace, updateRace, crossed } from '../src/race.js';

const L = 2000;
const CPS = [0, 1000];

function racing() {
  let r = startRace(createRace(L, CPS));
  r = updateRace(r, RACE.countdown + 0.01, 0, 0, 0); // burn countdown
  return r;
}

describe('crossed', () => {
  it('detects simple crossing', () => expect(crossed(990, 1010, 1000, L)).toBe(true));
  it('rejects non-crossing', () => expect(crossed(500, 700, 1000, L)).toBe(false));
  it('detects wrap-around crossing of 0', () => expect(crossed(1990, 15, 0, L)).toBe(true));
  it('ignores zero movement', () => expect(crossed(1000, 1000, 1000, L)).toBe(false));
});

describe('race flow', () => {
  it('countdown leads to racing', () => {
    let r = startRace(createRace(L, CPS));
    expect(r.phase).toBe('countdown');
    r = updateRace(r, 1, 0, 0, 0);
    expect(r.phase).toBe('countdown');
    r = updateRace(r, 2.1, 0, 0, 0);
    expect(r.phase).toBe('racing');
    expect(r.timeLeft).toBeCloseTo(RACE.startTime);
  });

  it('time runs out → gameover', () => {
    let r = racing();
    r = updateRace(r, RACE.startTime + 1, 100, 110, 10);
    expect(r.phase).toBe('gameover');
    expect(r.timeLeft).toBe(0);
  });

  it('checkpoint at mid-track grants bonus once', () => {
    let r = racing();
    const t0 = r.timeLeft;
    r = updateRace(r, 0.1, 990, 1010, 50);
    expect(r.timeLeft).toBeCloseTo(t0 + RACE.checkpointBonus - 0.1, 1);
    expect(r.justCheckpoint).toBe(true);
    const t1 = r.timeLeft;
    r = updateRace(r, 0.1, 1010, 1030, 50); // no re-trigger
    expect(r.timeLeft).toBeCloseTo(t1 - 0.1, 1);
    expect(r.justCheckpoint).toBe(false);
  });

  it('crossing start line increments lap and grants bonus', () => {
    let r = racing();
    r = updateRace(r, 0.1, 1990, 10, 50);
    expect(r.lap).toBe(2);
    expect(r.justLap).toBe(true);
  });

  it('completing final lap → finished', () => {
    let r = racing();
    for (let lap = 0; lap < RACE.totalLaps - 1; lap++) {
      r = updateRace(r, 0.1, 990, 1010, 50);
      r = updateRace(r, 0.1, 1990, 10, 50);
    }
    r = updateRace(r, 0.1, 990, 1010, 50);
    r = updateRace(r, 0.1, 1990, 10, 50);
    expect(r.phase).toBe('finished');
  });

  it('score accumulates with speed', () => {
    let r = racing();
    r = updateRace(r, 1, 100, 150, 50);
    expect(r.score).toBeCloseTo(50 * RACE.scoreRate);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — `src/race.js`:

```js
export const RACE = { startTime: 75, checkpointBonus: 40, totalLaps: 4, countdown: 3, scoreRate: 5 };

export function crossed(prevS, newS, target, trackLength) {
  if (prevS === newS) return false;
  const travel = ((newS - prevS) % trackLength + trackLength) % trackLength;
  if (travel > trackLength / 2) return false; // ignore huge/backward jumps
  const toTarget = ((target - prevS) % trackLength + trackLength) % trackLength;
  return toTarget > 0 ? toTarget <= travel : true; // target==prevS counts as ahead-by-0 → crossed
}

export function createRace(trackLength, checkpoints) {
  return {
    phase: 'attract', timeLeft: RACE.startTime, lap: 1, score: 0,
    trackLength, checkpoints, countdown: RACE.countdown,
    justCheckpoint: false, justLap: false,
  };
}

export function startRace(race) {
  return { ...race, phase: 'countdown', countdown: RACE.countdown };
}

export function updateRace(race, dt, prevS, newS, speed) {
  const r = { ...race, justCheckpoint: false, justLap: false };
  if (r.phase === 'countdown') {
    r.countdown -= dt;
    if (r.countdown <= 0) { r.phase = 'racing'; r.countdown = 0; }
    return r;
  }
  if (r.phase !== 'racing') return r;
  r.timeLeft -= dt;
  r.score += speed * RACE.scoreRate * dt;
  // mid-track checkpoint
  if (crossed(prevS, newS, r.checkpoints[1], r.trackLength)) {
    r.timeLeft += RACE.checkpointBonus;
    r.justCheckpoint = true;
  }
  // start/finish line
  if (crossed(prevS, newS, 0, r.trackLength)) {
    r.lap += 1;
    r.timeLeft += RACE.checkpointBonus;
    r.justLap = true;
    if (r.lap > RACE.totalLaps) { r.phase = 'finished'; r.lap = RACE.totalLaps; }
  }
  if (r.timeLeft <= 0) { r.timeLeft = 0; r.phase = 'gameover'; }
  return r;
}
```

Careful with `crossed(…, 0, …)` when `prevS = 0` at race start with no movement: `prevS === newS` guard handles the stationary case; the `toTarget > 0 ? … : true` branch means target exactly at prevS counts — verify the countdown-burn test (prevS=0,newS=0) doesn't award a lap (it can't: equal guard). But the first real movement from s=0 would count as crossing 0 — **fix:** treat `toTarget === 0` as NOT crossed (`return toTarget > 0 && toTarget <= travel;`). Update the tests accordingly (`crossed(1990, 15, 0, L)` still true since toTarget=10).

- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: race state machine with checkpoints, laps, timer, score"`

---

### Task 5: Leaderboard storage (`src/storage.js`) — TDD

**Files:**
- Create: `src/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Produces:
  - `submitScore(scores, initials, score) → newScores` — pure: insert `{initials, score}` (score rounded to int), sort desc, truncate to 10.
  - `qualifies(scores, score) → boolean` — true if board has <10 entries or score beats the lowest.
  - `loadScores() → scores` / `persistScores(scores)` — localStorage key `polePosition.scores`, try/catch, fall back to `[]`/no-op.

- [ ] **Step 1: Write failing tests** — `test/storage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { submitScore, qualifies } from '../src/storage.js';

describe('leaderboard', () => {
  it('inserts sorted descending', () => {
    let s = [];
    s = submitScore(s, 'AAA', 100);
    s = submitScore(s, 'BBB', 300);
    s = submitScore(s, 'CCC', 200);
    expect(s.map(e => e.initials)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('truncates to top 10 and rounds scores', () => {
    let s = [];
    for (let i = 0; i < 12; i++) s = submitScore(s, 'P' + i, i * 10 + 0.7);
    expect(s.length).toBe(10);
    expect(s[0].score).toBe(111);
    expect(s.at(-1).score).toBe(21);
  });

  it('qualifies when board not full or score beats lowest', () => {
    let s = [];
    expect(qualifies(s, 1)).toBe(true);
    for (let i = 0; i < 10; i++) s = submitScore(s, 'AAA', (i + 1) * 100);
    expect(qualifies(s, 50)).toBe(false);
    expect(qualifies(s, 150)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — `src/storage.js`:

```js
const KEY = 'polePosition.scores';
const MAX = 10;

export function submitScore(scores, initials, score) {
  return [...scores, { initials, score: Math.round(score) }]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX);
}

export function qualifies(scores, score) {
  return scores.length < MAX || score > scores[scores.length - 1].score;
}

export function loadScores() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function persistScores(scores) {
  try { localStorage.setItem(KEY, JSON.stringify(scores)); } catch { /* session-only */ }
}
```

- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: localStorage top-10 leaderboard"`

---

### Task 6: Traffic AI (`src/traffic.js`) — TDD

**Files:**
- Create: `src/traffic.js`
- Test: `test/traffic.test.js`

**Interfaces:**
- Consumes: nothing (pure; rng injectable).
- Produces:
  - `TRAFFIC = { count: 7, minSpeedFrac: 0.6, maxSpeedFrac: 0.85, laneAbs: 3.5, avoidGap: 25, respawnBehind: 0.5, respawnAheadMin: 200, respawnAheadMax: 500, collideDs: 4, collideDx: 2.4 }`
  - `createTraffic(trackLength, rng = Math.random) → cars` — `TRAFFIC.count` cars `{ s, x, lane, speed, colorIndex }`, spread around the loop, lanes alternating ±`laneAbs`/0, speeds in `[minSpeedFrac, maxSpeedFrac] × 80`.
  - `updateTraffic(cars, dt, playerS, trackLength, rng = Math.random) → cars` — advance `s`; ease `x` toward `lane`; if car ahead within `avoidGap` and similar lane, shift own lane sign; respawn when `respawnBehind × trackLength` behind player → place `respawnAheadMin..Max` ahead.
  - `findCollision(playerCar, cars, trackLength) → car | null` — circular ds < `collideDs` && |dx| < `collideDx`.

- [ ] **Step 1: Write failing tests** — `test/traffic.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TRAFFIC, createTraffic, updateTraffic, findCollision } from '../src/traffic.js';

const L = 2000;
const rng = () => 0.5;

describe('traffic', () => {
  it('creates count cars with valid lanes and speeds', () => {
    const cars = createTraffic(L, rng);
    expect(cars.length).toBe(TRAFFIC.count);
    for (const c of cars) {
      expect(Math.abs(c.lane)).toBeLessThanOrEqual(TRAFFIC.laneAbs);
      expect(c.speed).toBeGreaterThanOrEqual(80 * TRAFFIC.minSpeedFrac);
      expect(c.speed).toBeLessThanOrEqual(80 * TRAFFIC.maxSpeedFrac);
      expect(c.s).toBeGreaterThanOrEqual(0);
      expect(c.s).toBeLessThan(L);
    }
  });

  it('advances cars along the track with wrapping', () => {
    const cars = [{ s: 1990, x: 0, lane: 0, speed: 50, colorIndex: 0 }];
    updateTraffic(cars, 1, 0, L, rng);
    expect(cars[0].s).toBeCloseTo(40);
  });

  it('respawns cars that fall half a track behind the player', () => {
    const cars = [{ s: 0, x: 0, lane: 0, speed: 48, colorIndex: 0 }];
    updateTraffic(cars, 0.01, 1100, L, rng);
    const ahead = ((cars[0].s - 1100) % L + L) % L;
    expect(ahead).toBeGreaterThanOrEqual(TRAFFIC.respawnAheadMin);
    expect(ahead).toBeLessThanOrEqual(TRAFFIC.respawnAheadMax);
  });

  it('detects collision within thresholds only', () => {
    const player = { s: 100, x: 1 };
    const hit = [{ s: 102, x: 0.5, lane: 0, speed: 50, colorIndex: 0 }];
    const missLat = [{ s: 102, x: 4.5, lane: 0, speed: 50, colorIndex: 0 }];
    const missLong = [{ s: 120, x: 1, lane: 0, speed: 50, colorIndex: 0 }];
    expect(findCollision(player, hit, L)).toBe(hit[0]);
    expect(findCollision(player, missLat, L)).toBe(null);
    expect(findCollision(player, missLong, L)).toBe(null);
  });

  it('collision check wraps around start line', () => {
    const player = { s: 1999, x: 0 };
    const cars = [{ s: 1, x: 0, lane: 0, speed: 50, colorIndex: 0 }];
    expect(findCollision(player, cars, L)).toBe(cars[0]);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — `src/traffic.js`:

```js
export const TRAFFIC = {
  count: 7, minSpeedFrac: 0.6, maxSpeedFrac: 0.85, laneAbs: 3.5,
  avoidGap: 25, respawnBehind: 0.5, respawnAheadMin: 200, respawnAheadMax: 500,
  collideDs: 4, collideDx: 2.4,
};
const PLAYER_MAX = 80;
const LANES = [-3.5, 0, 3.5];

function circDist(from, to, L) { return ((to - from) % L + L) % L; }

export function createTraffic(trackLength, rng = Math.random) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i++) {
    const lane = LANES[i % LANES.length];
    const speed = PLAYER_MAX * (TRAFFIC.minSpeedFrac + rng() * (TRAFFIC.maxSpeedFrac - TRAFFIC.minSpeedFrac));
    const s = ((i + 1) / (TRAFFIC.count + 1)) * trackLength;
    cars.push({ s, x: lane, lane, speed, colorIndex: i });
  }
  return cars;
}

export function updateTraffic(cars, dt, playerS, trackLength, rng = Math.random) {
  for (const car of cars) {
    car.s = (car.s + car.speed * dt) % trackLength;
    // avoidance: nearest car ahead in a similar lane → change lane
    for (const other of cars) {
      if (other === car) continue;
      const gap = circDist(car.s, other.s, trackLength);
      if (gap > 0 && gap < TRAFFIC.avoidGap && Math.abs(other.lane - car.lane) < 1) {
        car.lane = car.lane === 0 ? (rng() < 0.5 ? -TRAFFIC.laneAbs : TRAFFIC.laneAbs) : 0;
        break;
      }
    }
    car.x += (car.lane - car.x) * Math.min(1, 2 * dt);
    // respawn if too far behind player
    const behind = circDist(car.s, playerS, trackLength);
    if (behind > 0 && behind < trackLength * TRAFFIC.respawnBehind === false) { /* noop */ }
    if (circDist(car.s, playerS, trackLength) < trackLength * (1 - TRAFFIC.respawnBehind) && circDist(car.s, playerS, trackLength) > 0) {
      // player is ahead of car by < half track → car is behind → check threshold
    }
    const playerAheadBy = circDist(car.s, playerS, trackLength);
    if (playerAheadBy > trackLength * TRAFFIC.respawnBehind) {
      // car is "ahead" by more than half → actually behind by wrap; leave it
    } else if (playerAheadBy > trackLength * TRAFFIC.respawnBehind * 0.999) { /* boundary */ }
  }
  // Respawn pass (clear rule): a car respawns when the player is ahead of it
  // by more than respawnBehind × trackLength, measured as circDist(car.s, playerS).
  for (const car of cars) {
    const gapBehindPlayer = circDist(car.s, playerS, trackLength);
    if (gapBehindPlayer > trackLength * TRAFFIC.respawnBehind) {
      car.s = (playerS + TRAFFIC.respawnAheadMin + rng() * (TRAFFIC.respawnAheadMax - TRAFFIC.respawnAheadMin)) % trackLength;
      car.lane = LANES[Math.floor(rng() * LANES.length)];
      car.x = car.lane;
    }
  }
  return cars;
}

export function findCollision(player, cars, trackLength) {
  for (const car of cars) {
    const d1 = circDist(player.s, car.s, trackLength);
    const ds = Math.min(d1, trackLength - d1);
    if (ds < TRAFFIC.collideDs && Math.abs(player.x - car.x) < TRAFFIC.collideDx) return car;
  }
  return cars.length ? null : null;
}
```

**Clean this up before committing:** delete the exploratory dead branches in the first loop (the avoidance + advance stay; respawn happens only in the second pass). `findCollision` last line is just `return null`. The respawn rule: `circDist(car.s, playerS, L) > L/2` means the shortest way from car forward to player exceeds half the track — i.e., the car is more than half a lap behind. That matches the test (car at 0, player at 1100, L=2000 → gap 1100 > 1000 → respawn).

- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: rival traffic with lanes, avoidance, respawn, collision"`

---

### Task 7: 3D scene (`src/scene.js`) — visual, browser-verified

**Files:**
- Create: `src/scene.js`

**Interfaces:**
- Consumes: `createTrack`, `worldPose`, `posAt` from `track.js`; `ROAD_HALF_WIDTH` from `handling.js`; `TRAFFIC` count/colors.
- Produces:
  - `buildScene(track) → { scene, rivalMeshes, updateRivals(cars), hood }`
    - `scene`: THREE.Scene with sky color+fog, terrain, road ribbon (rumble strips + centerline via vertex colors), billboards, mountains (incl. Fuji-style), start gantry, checkpoint arch, sun.
    - `rivalMeshes`: array of `THREE.Group` (one per traffic car, distinct bright colors).
    - `updateRivals(cars)`: positions each mesh at `worldPose(track, car.s, car.x)`, oriented along tangent.
    - `hood`: `THREE.Group` (red hood wedge + dashboard bar) to attach to camera.

- [ ] **Step 1: Implement** — `src/scene.js`. Key code:

```js
import * as THREE from 'three';
import { worldPose, posAt, tangentAt } from './track.js';
import { ROAD_HALF_WIDTH } from './handling.js';

const SKY = 0x63b1ff, GRASS = 0x3cb043, ROADCOL = new THREE.Color(0x555a5e);
const RUMBLE_A = new THREE.Color(0xe33f3f), RUMBLE_B = new THREE.Color(0xf2f2f2);
const LINE = new THREE.Color(0xf7f7e8);
export const RIVAL_COLORS = [0xff5533, 0xffcc22, 0x22ccff, 0xcc44ff, 0x44ff77, 0xff8844, 0x4488ff];

function buildRoad(track) {
  const step = 3, half = ROAD_HALF_WIDTH, rumble = half + 1.6;
  const n = Math.ceil(track.length / step);
  // 8 verts per ring: [-rumble, -half, -0.25, 0, 0, 0.25, half, rumble] lateral offsets
  const offs = [-rumble, -half, -0.25, 0.25, half, rumble];
  const positions = [], colors = [], indices = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * track.length;
    const seg = Math.floor(s / 12) % 2; // rumble/centerline alternation every 12 m
    for (let j = 0; j < offs.length; j++) {
      const { position } = worldPose(track, s, offs[j]);
      positions.push(position.x, position.y + 0.05, position.z);
      let c;
      const isRumble = j === 0 || j === offs.length - 1 ? true : false;
      const isCenter = j === 2 || j === 3;
      if (isRumble) c = seg ? RUMBLE_A : RUMBLE_B;
      else if (isCenter && seg) c = LINE;
      else c = ROADCOL;
      colors.push(c.r, c.g, c.b);
    }
  }
  const ringSize = offs.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < ringSize - 1; j++) {
      const a = i * ringSize + j, b = a + ringSize;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}
```

Also implement (all straightforward Three.js — MeshBasicMaterial or MeshLambertMaterial + one DirectionalLight + AmbientLight):
- **Terrain:** `CircleGeometry(2500)` rotated flat at y = −0.1, grass color.
- **Sky/fog:** `scene.background = new THREE.Color(SKY)`, `scene.fog = new THREE.Fog(SKY, 250, 900)`.
- **Mountains:** 5–6 large `ConeGeometry` at 600–900 m out from track center, gray-blue; one white-tipped (small white cone stacked on gray cone) as the Fuji nod.
- **Billboards:** ~12 boxes (6×3×0.4 m) placed at `worldPose(track, s_i, ±14)` for spread s values, each with a `CanvasTexture` front face: bold retro text on solid color — texts: `TURBO`, `SPEED UP`, `POLE POSITION`, `GRIP+`, `NITRO COLA`, `500 MPH RADIO`.
- **Start gantry:** two posts + crossbar box across the road at s=0 with checkered CanvasTexture ("START/FINISH" text).
- **Checkpoint arch:** same structure at `track.checkpoints[1]`, yellow, text "CHECKPOINT".
- **Rival car factory:** `Group` per car: body box (4.2×0.9×2 m, color from `RIVAL_COLORS[colorIndex % 7]`), cabin box (1.6×0.6×1.4, dark glass), 4 dark wheel boxes, rear wing. `updateRivals(cars)` sets `group.position.copy(pose.position)`, `group.position.y += 0.5`, and orients with `group.lookAt(position + tangent)`.
- **Hood:** flat red wedge (`BufferGeometry` triangle fan ~1.9 m wide, 1.2 m deep, sloping down away from camera) + dark dashboard box, positioned ~(0, −0.55, −1.2) relative to camera, returned so main.js can `camera.add(hood)`.

- [ ] **Step 2: Verify in browser** — temporary boot code in `main.js` rendering the scene from a fixed orbit/fly camera; check with browser preview + screenshot: road loop visible with rumble strips, centerline dashes, arches, billboards readable, rivals placed, no z-fighting at ground level.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: 3D scene - road ribbon, terrain, props, rival meshes, hood"`

---

### Task 8: Camera + main loop (`src/camera.js`, `src/main.js`) — playable core

**Files:**
- Create: `src/camera.js`
- Rewrite: `src/main.js`

**Interfaces:**
- Consumes: everything prior.
- Produces:
  - `createCamera() → PerspectiveCamera` (fov 68, near 0.1, far 2000)
  - `updateCamera(camera, track, car, dt)` — eye at `worldPose(track, car.s, car.x) + (0, 1.15, 0)`, looks at pose 14 m ahead (`worldPose(track, car.s + 14, car.x * 0.6)` + 1 m up); `camera.fov = 68 + 16 × (speed/maxSpeed)` (+ `updateProjectionMatrix` when changed > 0.1); roll `camera.rotation.z` toward `−steer × 0.045 − curvatureLean`; shake: when offroad or speed > 0.93·max, add small random jitter (±0.05 m) to eye; while crashed, spin the camera yaw (`crashTimer × 6` rad) for the spin-out effect.
  - `main.js` game loop: fixed timestep `1/60` accumulator (clamp frame delta to 0.1 s), input via keydown/keyup for ArrowKeys/WASD, wires handling + track + race + traffic + scene + camera, and phase logic:
    - `attract`: any key → `startRace` (+ audio unlock later).
    - `racing`: step car, update traffic, `findCollision` → `crashCar` (only when `!isCrashed`), `updateRace`.
    - `finished`/`gameover`: handled by HUD in Task 9; `Enter` restarts (fresh `createCarState`, `createTraffic`, `createRace`).

- [ ] **Step 1: Implement** `camera.js` per interface above.
- [ ] **Step 2: Implement** `main.js`:

```js
import * as THREE from 'three';
import { createTrack, curvatureAt } from './track.js';
import { createCarState, stepCar, crashCar, isCrashed, CAR } from './handling.js';
import { createRace, startRace, updateRace } from './race.js';
import { createTraffic, updateTraffic, findCollision } from './traffic.js';
import { buildScene } from './scene.js';
import { createCamera, updateCamera } from './camera.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const track = createTrack();
const { scene, updateRivals, hood } = buildScene(track);
const camera = createCamera();
camera.add(hood);
scene.add(camera);

let car = createCarState();
let race = createRace(track.length, track.checkpoints);
let traffic = createTraffic(track.length);

const input = { throttle: 0, brake: 0, steer: 0 };
const keys = new Set();
function readInput() {
  input.throttle = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
  input.brake = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
  input.steer = (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0)
              + (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0);
}
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (race.phase === 'attract') race = startRace(race);
  if ((race.phase === 'gameover' || race.phase === 'finished') && e.code === 'Enter') resetGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));

function resetGame() {
  car = createCarState();
  traffic = createTraffic(track.length);
  race = startRace(createRace(track.length, track.checkpoints));
}

const DT = 1 / 60;
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= DT) { update(DT); acc -= DT; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function update(dt) {
  readInput();
  if (race.phase === 'racing' || race.phase === 'countdown') {
    const prevS = car.s;
    const live = race.phase === 'racing';
    if (live) {
      car = stepCar(car, input, curvatureAt(track, car.s), track.length, dt);
      updateTraffic(traffic, dt, car.s, track.length);
      if (!isCrashed(car)) {
        const hit = findCollision(car, traffic, track.length);
        if (hit) car = crashCar(car);
      }
    }
    race = updateRace(race, dt, prevS, car.s, car.speed);
  }
  updateRivals(traffic);
  updateCamera(camera, track, car, dt, input.steer);
}

requestAnimationFrame(frame);
```

(Adjust `updateCamera` signature to accept steer; keep it consistent with camera.js.)

- [ ] **Step 3: Verify in browser** — drive the full track: steering/curve push feel right, offroad slows, crashing into a rival spins and halts, laps/checkpoints register (log `race` transitions to console temporarily), 60 fps.
- [ ] **Step 4: Run all tests** — `npx vitest run` still green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: first-person camera and playable game loop"`

---

### Task 9: HUD + screens (`src/hud.js`)

**Files:**
- Create: `src/hud.js`, `src/hud.css`
- Modify: `src/main.js` (wire HUD), `index.html` (link css or import in js)

**Interfaces:**
- Consumes: race state, car speed, `loadScores/submitScore/qualifies/persistScores`.
- Produces:
  - `createHud() → hud` — builds DOM overlay (absolute-positioned div over canvas).
  - `updateHud(hud, race, car)` — per-frame: speed `Math.round(speed*3.6)` km/h, `TIME` (whole seconds, flashes red < 10 s), `SCORE` (zero-padded 6 digits), `LAP n/4`; shows big `3/2/1/GO` during countdown; flashes `EXTENDED TIME!` for 1.5 s when `race.justCheckpoint || race.justLap`.
  - `showAttract(hud, scores)` — title "POLE POSITION", "PRESS ANY KEY", top-10 table.
  - `showGameOver(hud, race, qualified)` / `hideScreens(hud)`.
  - `showInitialsEntry(hud, onDone(initials))` — 3-letter entry: A–Z keys append, Backspace deletes, Enter confirms at 3 chars.
- Visual style: monospace/pixel font (`font-family: "Courier New", monospace; font-weight: bold`), yellow/white text with black text-shadow, uppercase, big sizes — arcade HUD look. No frameworks.

- [ ] **Step 1: Implement** `hud.js` + `hud.css` per interface. Screens are divs toggled with a `hidden` class.
- [ ] **Step 2: Wire in `main.js`:** attract on boot (`showAttract` with `loadScores()`); on race start `hideScreens`; on `gameover`/`finished` transition → if `qualifies(scores, race.score)` → `showInitialsEntry` → `submitScore` + `persistScores` → `showGameOver` with leaderboard; `Enter` restarts.
- [ ] **Step 3: Verify in browser** — full loop: attract → countdown → HUD live → run out clock → initials entry → leaderboard shows entry → restart. Reload page: score persisted.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: arcade HUD, attract/gameover screens, initials entry"`

---

### Task 10: Procedural audio (`src/audio.js`)

**Files:**
- Create: `src/audio.js`
- Modify: `src/main.js` (wire)

**Interfaces:**
- Produces:
  - `createAudio() → audio` — lazily builds `AudioContext` on `unlock()`.
  - `unlock(audio)` — create/resume context on first keydown; safe to call repeatedly; failures swallowed (game runs silent).
  - `updateEngine(audio, speed, maxSpeed)` — sawtooth osc through lowpass + gain; freq `55 + 190 × (speed/maxSpeed)` Hz with a slight LFO wobble; gain 0 when speed 0.
  - `playSkid(audio, on)` — looped white-noise buffer through bandpass (~900 Hz), gated on when `|steer| = 1 && speed > 0.7·max` or offroad.
  - `playCrash(audio)` — noise burst (0.8 s, decaying gain) + descending square osc (300→40 Hz).
  - `playJingle(audio)` — checkpoint arpeggio: square wave notes [660, 880, 1100, 1320] Hz, 90 ms each.
  - `startMusic(audio)/stopMusic(audio)` — 8-step square-wave bass loop (~112 BPM, notes [110, 110, 165, 110, 131, 110, 165, 196] Hz) scheduled with lookahead timer on the WebAudio clock, quiet (gain ~0.06).
- All nodes routed through a master gain (0.5). No audio files.

- [ ] **Step 1: Implement** `audio.js`.
- [ ] **Step 2: Wire in `main.js`:** `unlock` on first keydown; `updateEngine` each frame; skid condition from input+car state; `playCrash` on crash transition; `playJingle` on `justCheckpoint || justLap`; music starts on race start, stops on gameover/finished.
- [ ] **Step 3: Verify in browser** — engine pitch tracks speed, jingle at checkpoint, crash sound, music loops, no console errors before first keypress.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: procedural WebAudio engine, sfx, chiptune loop"`

---

### Task 11: Polish + tuning pass

**Files:**
- Modify: any (tuning constants, small effects)

**Interfaces:** none new.

- [ ] **Step 1: Playtest & tune** — drive 3 full games. Tune `CAR.centrifugal`, `steerSpeed`, `TRAFFIC` speeds, `RACE.checkpointBonus` so that: a clean lap is comfortably possible flat-out except hairpin (must brake), a crash costs roughly one checkpoint's margin, 4 laps is tight but beatable.
- [ ] **Step 2: Effects polish** — crash visual: camera spin (already) + red flash overlay div fading 0.4 s; "EXTENDED TIME" flash; speed lines/FOV verified; countdown "GO!" moment releases car.
- [ ] **Step 3: Performance check** — steady 60 fps; `renderer.info.render.triangles` reasonable (< 200 k).
- [ ] **Step 4: Run all tests** — `npx vitest run` green. `npx vite build` succeeds.
- [ ] **Step 5: Final commit** — `git add -A && git commit -m "polish: handling/traffic tuning, crash flash, perf check"`

---

## Self-Review Notes

- Spec coverage: rendering (T7/T8), gameplay rules (T4), traffic (T6), handling (T2), track (T3), HUD (T9), audio (T10), storage (T5), error handling (storage try/catch T5, audio failure T10, clamped timestep T8), testing (T2–T6 unit, browser verify T7–T11). ✔
- Types consistent: `car = {s, x, speed, crashTimer}`, traffic car `{s, x, lane, speed, colorIndex}`, race `{phase, timeLeft, lap, score, ...}` used uniformly. ✔
- Known intentional simplifications: rivals pass through each other after avoidance (spec), single checkpoint arch mid-lap + start line both grant bonus (spec's "checkpoints extend time").
