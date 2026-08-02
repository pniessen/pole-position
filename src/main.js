import * as THREE from 'three';
import { createTrack, curvatureAt, posAt, worldPose, countTurns, TRACKS } from './track.js';
import { createCarState, stepCar, crashCar, isCrashed, isOffroad, shiftGear, shiftAdvice, weatherSpec, CARS, GEARS } from './handling.js';
import { createRace, startRace, updateRace, startLightState } from './race.js';
import { createTraffic, updateTraffic, findCollision, draftFactor, createRacers, updateRacers, standings, RACERS } from './traffic.js';
import { buildScene, makeHood } from './scene.js';
import { makeCarModel } from './carmodels.js';
import { createCamera, updateCamera } from './camera.js';
import { createHud, updateHud, showAttract, showSelect, hideScreens, showGameOver, showInitialsEntry, setMinimapTrack, updateMinimap, setRainFx, updateRainFx } from './hud.js';
import { renderCarPhotos, renderTrackThumb } from './showroom.js';
import { initTouch } from './touch.js';
import { loadRecords, persistRecords, submitScore, qualifies, trackRecord, withTrackRecord } from './storage.js';
import { createLapRecorder, recordLap, finishLap, sampleGhost } from './ghost.js';
import { createEffects } from './effects.js';
import { createAudio, unlock, updateEngine, setSkid, playCrash, playJingle, startMusic, stopMusic, updateCrowd } from './audio.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);

let trackIndex = 0;
let track = createTrack(trackIndex);
let { scene, updateRivals, updateWorld, setStartLights } = buildScene(track);
let effects = createEffects(scene);
let carIndex = 0;
let carDef = CARS[carIndex];
let hood = makeHood(carDef.hood);
const camera = createCamera();
camera.add(hood);
scene.add(camera);

function disposeScene(oldScene) {
  oldScene.traverse((obj) => {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) { m.map?.dispose(); m.dispose(); }
  });
}

function setTrack(index) {
  trackIndex = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
  scene.remove(camera);
  ghostMesh = null; // owned by the old scene, disposed with it
  disposeScene(scene);
  track = createTrack(trackIndex);
  ({ scene, updateRivals, updateWorld, setStartLights } = buildScene(track));
  effects = createEffects(scene);
  scene.add(camera);
  car = createCarState();
  rivals = createTraffic(track.length);
  race = createRace(track.length, track.checkpoints);
  refreshMinimap();
}

function setCar(index) {
  carIndex = ((index % CARS.length) + CARS.length) % CARS.length;
  carDef = CARS[carIndex];
  camera.remove(hood);
  disposeScene(hood);
  hood = makeHood(carDef.hood);
  camera.add(hood);
}

// --- selection menu flow: title → mode → car → track → race ---

const MODES = [
  {
    id: 'time',
    name: 'TIME ATTACK',
    desc: 'Beat the clock through traffic — and chase your best-lap ghost',
    stats: [
      { label: 'RIVALS', value: 'SLOW TRAFFIC' },
      { label: 'GOAL', value: 'SURVIVE 4 LAPS' },
      { label: 'GHOST', value: 'YOUR BEST LAP' },
    ],
  },
  {
    id: 'race',
    name: 'GRAND PRIX',
    desc: 'A rolling duel with 7 racers — finish as high as you can',
    stats: [
      { label: 'RIVALS', value: '7 RACERS' },
      { label: 'GOAL', value: 'WIN IN 4 LAPS' },
      { label: 'BONUS', value: 'BY FINISH POSITION' },
    ],
  },
];
let modeIndex = 0;
const mode = () => MODES[modeIndex].id;

let menuScreen = 'title';
const carPhotos = renderCarPhotos(CARS);
const trackThumbs = [];

function openTitle() {
  menuScreen = 'title';
  showAttract(hud, trackRecord(records, track.name).scores, track.name);
}

function openModeSelect() {
  menuScreen = 'mode';
  const m = MODES[modeIndex];
  showSelect(hud, { title: 'CHOOSE YOUR RACE', image: null, name: m.name, desc: m.desc, stats: m.stats });
}

function openCarSelect() {
  menuScreen = 'car';
  const spec = carDef.spec;
  showSelect(hud, {
    title: 'CHOOSE YOUR CAR',
    image: carPhotos[carIndex],
    name: carDef.name,
    desc: carDef.desc,
    stats: [
      { label: 'TOP SPEED', frac: spec.maxSpeed / 90, value: `${Math.round(spec.maxSpeed * 3.6)} KM/H` },
      { label: 'ACCELERATION', frac: spec.accel / 35 },
      { label: 'HANDLING', frac: spec.steerSpeed / 20 },
      { label: 'OFFROAD GRIP', frac: spec.offroadMax / 50 },
    ],
  });
}

function openTrackSelect() {
  menuScreen = 'track';
  trackThumbs[trackIndex] ??= renderTrackThumb(track);
  const best = trackRecord(records, track.name).bestLap;
  showSelect(hud, {
    title: 'CHOOSE YOUR TRACK',
    image: trackThumbs[trackIndex],
    name: track.name,
    desc: track.tagline,
    stats: [
      { label: 'LENGTH', value: `${(track.length / 1000).toFixed(1)} KM` },
      { label: 'TURNS', value: String(countTurns(track)) },
      { label: 'BEST LAP', value: best ? `${best.toFixed(1)}s` : '—' },
    ],
  });
}

function menuKey(code) {
  const prev = code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW';
  const next = code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS';
  const confirm = code === 'Enter' || code === 'Space';
  if (menuScreen === 'title') {
    openModeSelect();
    return;
  }
  if (menuScreen === 'mode') {
    if (prev || next) { modeIndex = (modeIndex + 1) % MODES.length; openModeSelect(); }
    else if (confirm) openCarSelect();
    else if (code === 'Escape') openTitle();
    return;
  }
  if (menuScreen === 'car') {
    if (prev) { setCar(carIndex - 1); openCarSelect(); }
    else if (next) { setCar(carIndex + 1); openCarSelect(); }
    else if (confirm) openTrackSelect();
    else if (code === 'Escape') openModeSelect();
    return;
  }
  if (menuScreen === 'track') {
    if (prev) { setTrack(trackIndex - 1); openTrackSelect(); }
    else if (next) { setTrack(trackIndex + 1); openTrackSelect(); }
    else if (confirm) { menuScreen = null; startFromMenu(); }
    else if (code === 'Escape') openCarSelect();
  }
}

function refreshMinimap() {
  const samples = [];
  const step = track.length / 160;
  for (let i = 0; i < 160; i++) {
    const p = posAt(track, i * step);
    samples.push({ x: p.x, z: p.z });
  }
  setMinimapTrack(hud, samples);
}

function resize() {
  const w = innerWidth || 1280, h = innerHeight || 720;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let car = createCarState();
let race = createRace(track.length, track.checkpoints);
let rivals = createTraffic(track.length);
let finalPos = null;

// ghost state
let lapRecorder = createLapRecorder();
let activeGhost = null;
let ghostMesh = null;

const hud = createHud();
let records = loadRecords();
let enteringInitials = false;
refreshMinimap();

const audio = createAudio();

const input = { throttle: 0, brake: 0, steer: 0 };
const keys = new Set();
const touch = initTouch({
  onGearDelta: (d) => { if (race.phase === 'racing') car = shiftGear(car, car.gear + d); },
});
function readInput() {
  input.throttle = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
  input.brake = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
  input.steer = (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0)
              + (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0);
  if (touch.active) {
    // auto-throttle while racing; the brake pedal overrides it
    if (race.phase === 'racing' && !touch.brake) input.throttle = 1;
    if (touch.brake) { input.brake = 1; input.throttle = 0; }
    input.steer = Math.max(-1, Math.min(1, input.steer + touch.steer));
  }
}

addEventListener('keydown', (e) => {
  unlock(audio);
  if (enteringInitials) return;
  if (race.phase === 'attract') {
    menuKey(e.code);
    return;
  }
  keys.add(e.code);
  if (race.phase === 'racing' && /^Digit[1-4]$/.test(e.code)) {
    car = shiftGear(car, Number(e.code.slice(5)));
  }
  if ((race.phase === 'racing' || race.phase === 'countdown') && e.code === 'Escape') {
    quitToTitle();
    return;
  }
  if ((race.phase === 'gameover' || race.phase === 'finished') && e.code === 'Enter') {
    resetGame();
  } else if ((race.phase === 'gameover' || race.phase === 'finished') && e.code === 'Escape') {
    car = createCarState();
    rivals = createTraffic(track.length);
    race = createRace(track.length, track.checkpoints);
    openModeSelect();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('pointerdown', () => unlock(audio));

function buildGhostMesh() {
  if (ghostMesh) {
    scene.remove(ghostMesh);
    disposeScene(ghostMesh);
    ghostMesh = null;
  }
  if (!activeGhost) return;
  ghostMesh = makeCarModel(carDef.hood.style, 0xffffff);
  ghostMesh.traverse((obj) => {
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = 0.35;
      m.depthWrite = false;
    }
  });
  scene.add(ghostMesh);
}

function startFromMenu() {
  hideScreens(hud);
  finalPos = null;
  car = createCarState();
  rivals = mode() === 'race'
    ? createRacers(track.length, carDef.spec.maxSpeed)
    : createTraffic(track.length);
  race = startRace(createRace(track.length, track.checkpoints));
  lapRecorder = createLapRecorder();
  activeGhost = mode() === 'time' ? trackRecord(records, track.name).ghost : null;
  buildGhostMesh();
  startMusic(audio);
}

function quitToTitle() {
  stopMusic(audio);
  keys.clear();
  car = createCarState();
  rivals = createTraffic(track.length);
  race = createRace(track.length, track.checkpoints);
  openTitle();
}

function resetGame() {
  hideScreens(hud);
  startFromMenu();
}

function onRaceEnded() {
  let total = race.score;
  let title = null;
  if (mode() === 'race') {
    finalPos = standings(race.lap, car.s, rivals, track.length);
    if (race.phase === 'finished') {
      total += Math.max(0, (RACERS.count + 1 - finalPos)) * 1500;
      title = `FINISHED P${finalPos}!`;
    } else {
      title = `OUT OF TIME — P${finalPos}`;
    }
  }
  const rec = trackRecord(records, track.name);
  const done = (scores) => {
    records = withTrackRecord(records, track.name, { scores });
    persistRecords(records);
    enteringInitials = false;
    showGameOver(hud, race, scores, title, total);
  };
  if (qualifies(rec.scores, total)) {
    enteringInitials = true;
    showInitialsEntry(hud, (initials) => done(submitScore(rec.scores, initials, total)));
  } else {
    showGameOver(hud, race, rec.scores, title, total);
  }
}

function onLapCompleted() {
  // ghost bookkeeping: compare this lap to the stored best
  const lapTime = race.lastLapTime;
  const rec = trackRecord(records, track.name);
  if (lapTime > 5 && (rec.bestLap === null || lapTime < rec.bestLap)) {
    const ghost = finishLap(lapRecorder, lapTime);
    records = withTrackRecord(records, track.name, { bestLap: lapTime, ghost });
    persistRecords(records);
    if (mode() === 'time') {
      activeGhost = ghost;
      buildGhostMesh();
    }
  }
  lapRecorder = createLapRecorder();
}

const _ghostLook = new THREE.Vector3();
function updateGhost() {
  if (!ghostMesh || !activeGhost || race.phase !== 'racing') {
    if (ghostMesh) ghostMesh.visible = false;
    return;
  }
  const t = race.elapsed - race.lapStart;
  const g = sampleGhost(activeGhost, t);
  if (!g) { ghostMesh.visible = false; return; }
  ghostMesh.visible = true;
  const { position, tangent } = (() => {
    const pose = { position: posAt(track, g.s), tangent: null };
    const ahead = posAt(track, g.s + 2);
    pose.tangent = ahead.sub(pose.position).normalize();
    return pose;
  })();
  // lateral offset
  const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
  position.addScaledVector(right, g.x);
  position.y += 0.05;
  ghostMesh.position.copy(position);
  _ghostLook.copy(position).add(tangent);
  ghostMesh.lookAt(_ghostLook);
}

function update(dt) {
  readInput();
  let draft = 0;
  if (race.phase === 'racing' || race.phase === 'countdown') {
    const prevS = car.s;
    if (race.phase === 'racing') {
      draft = draftFactor(car, rivals, track.length);
      const base = weatherSpec(carDef.spec, track.theme.weather);
      const spec = draft > 0
        ? { ...base, accel: base.accel * (1 + 0.5 * draft), maxSpeed: base.maxSpeed * (1 + 0.06 * draft) }
        : base;
      car = stepCar(car, input, curvatureAt(track, car.s), track.length, dt, spec);
      if (mode() === 'race') {
        const progress = (race.lap - 1) * track.length + car.s;
        updateRacers(rivals, dt, progress, track.length);
      } else {
        updateTraffic(rivals, dt, car.s, track.length);
      }
      if (!isCrashed(car)) {
        const hit = findCollision(car, rivals, track.length);
        if (hit) {
          car = crashCar(car);
          playCrash(audio);
          const at = worldPose(track, car.s, car.x).position;
          for (let i = 0; i < 7; i++) effects.addSmoke(at, 1.2 + Math.random() * 1.2);
        }
      }
      // tire marks while sliding hard, off-line, or spinning out
      const sliding = (Math.abs(input.steer) > 0.85 && car.speed > 0.6 * carDef.spec.maxSpeed)
        || (isOffroad(car) && car.speed > 8)
        || (isCrashed(car) && car.crashTimer > carDef.spec.crashDuration - 0.5);
      if (sliding) {
        const rear = car.s - 1.4;
        for (const off of [-0.8, 0.8]) {
          const pose = worldPose(track, rear, car.x + off);
          effects.addSkid(pose.position, pose.tangent);
        }
        if (isCrashed(car) && Math.random() < 0.4) {
          effects.addSmoke(worldPose(track, car.s, car.x).position, 1);
        }
      }
      recordLap(lapRecorder, dt, car.s, car.x);
    }
    race = updateRace(race, dt, prevS, car.s, car.speed);
    if (race.justLap) onLapCompleted();
    if (race.justCheckpoint || race.justLap) playJingle(audio);
    if (race.phase === 'gameover' || race.phase === 'finished') {
      stopMusic(audio);
      onRaceEnded();
    }
  }
  document.body.classList.toggle('racing', race.phase === 'racing' || race.phase === 'countdown');
  updateRivals(rivals);
  updateGhost();
  updateWorld(dt);
  effects.update(dt);
  setStartLights(startLightState(race));
  updateCamera(camera, track, car, dt, input.steer, carDef.spec);
  const advice = race.phase === 'racing' && !isCrashed(car) ? shiftAdvice(car, carDef.spec) : null;
  touch.setHint?.(advice);
  const pos = mode() === 'race' && race.phase !== 'attract'
    ? (finalPos ?? standings(race.lap, car.s, rivals, track.length))
    : null;
  updateHud(hud, race, car, dt, advice, pos, draft);
  updateMinimap(hud, posAt(track, car.s), rivals.map((c) => posAt(track, c.s)));
  setRainFx(hud, track.theme.weather === 'rain' && (race.phase === 'racing' || race.phase === 'countdown'));
  updateRainFx(hud, dt);
  // engine revs climb within the current gear and drop on upshift
  updateEngine(audio, car.speed / GEARS[car.gear - 1].cap, carDef.spec.maxSpeed);
  const distToLine = Math.min(car.s, track.length - car.s);
  updateCrowd(audio, race.phase === 'racing' || race.phase === 'countdown' ? 1 - Math.min(1, distToLine / 130) : 0);
  setSkid(audio, (Math.abs(input.steer) > 0.9 && car.speed > 0.7 * carDef.spec.maxSpeed) || (isOffroad(car) && car.speed > 5));
}

openTitle();

const DT = 1 / 60;
let acc = 0;
let last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= DT) { update(DT); acc -= DT; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- headless test hooks (used for browser-pane verification where rAF
// doesn't fire; harmless in normal play) ---
window.__game = {
  getState: () => ({ phase: race.phase, s: car.s, x: car.x, speed: car.speed,
    lap: race.lap, timeLeft: race.timeLeft, score: race.score, crashed: isCrashed(car),
    mode: mode(), pos: mode() === 'race' ? standings(race.lap, car.s, rivals, track.length) : null }),
  press: (code) => { if (race.phase === 'attract') menuKey(code); else keys.add(code); },
  release: (code) => keys.delete(code),
  crash: () => { car = crashCar(car); playCrash(audio); },
  setTrack: (i) => { setTrack(i); openTrackSelect(); },
  trackName: () => track.name,
  setCar: (i) => { setCar(i); openCarSelect(); },
  carName: () => carDef.name,
  setMode: (i) => { modeIndex = i % MODES.length; openModeSelect(); },
  step: (seconds) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) update(DT);
    renderer.render(scene, camera);
    return window.__game.getState();
  },
};
