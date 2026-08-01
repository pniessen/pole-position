import * as THREE from 'three';
import { createTrack, curvatureAt, posAt, countTurns, TRACKS } from './track.js';
import { createCarState, stepCar, crashCar, isCrashed, isOffroad, shiftGear, CARS, GEARS } from './handling.js';
import { createRace, startRace, updateRace, startLightState } from './race.js';
import { createTraffic, updateTraffic, findCollision } from './traffic.js';
import { buildScene, makeHood } from './scene.js';
import { createCamera, updateCamera } from './camera.js';
import { createHud, updateHud, showAttract, showSelect, hideScreens, showGameOver, showInitialsEntry, setMinimapTrack, updateMinimap } from './hud.js';
import { renderCarPhotos, renderTrackThumb } from './showroom.js';
import { initTouch } from './touch.js';
import { loadScores, persistScores, submitScore, qualifies } from './storage.js';
import { createAudio, unlock, updateEngine, setSkid, playCrash, playJingle, startMusic, stopMusic, updateCrowd } from './audio.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);

let trackIndex = 0;
let track = createTrack(trackIndex);
let { scene, updateRivals, updateWorld, setStartLights } = buildScene(track);
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
  disposeScene(scene);
  track = createTrack(trackIndex);
  ({ scene, updateRivals, updateWorld, setStartLights } = buildScene(track));
  scene.add(camera);
  car = createCarState();
  traffic = createTraffic(track.length);
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

// --- selection menu flow: title → car showroom → track select → race ---

let menuScreen = 'title';
const carPhotos = renderCarPhotos(CARS);
const trackThumbs = [];

function openTitle() {
  menuScreen = 'title';
  showAttract(hud, scores);
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
  showSelect(hud, {
    title: 'CHOOSE YOUR TRACK',
    image: trackThumbs[trackIndex],
    name: track.name,
    desc: track.tagline,
    stats: [
      { label: 'LENGTH', value: `${(track.length / 1000).toFixed(1)} KM` },
      { label: 'TURNS', value: String(countTurns(track)) },
      { label: 'LAPS', value: '4' },
    ],
  });
}

function menuKey(code) {
  const prev = code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW';
  const next = code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS';
  const confirm = code === 'Enter' || code === 'Space';
  if (menuScreen === 'title') {
    openCarSelect();
    return;
  }
  if (menuScreen === 'car') {
    if (prev) { setCar(carIndex - 1); openCarSelect(); }
    else if (next) { setCar(carIndex + 1); openCarSelect(); }
    else if (confirm) openTrackSelect();
    else if (code === 'Escape') openTitle();
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
let traffic = createTraffic(track.length);

const hud = createHud();
let scores = loadScores();
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
    traffic = createTraffic(track.length);
    race = createRace(track.length, track.checkpoints);
    openCarSelect();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('pointerdown', () => unlock(audio));

function startFromMenu() {
  hideScreens(hud);
  race = startRace(race);
  startMusic(audio);
}

function quitToTitle() {
  stopMusic(audio);
  keys.clear();
  car = createCarState();
  traffic = createTraffic(track.length);
  race = createRace(track.length, track.checkpoints);
  openTitle();
}

function resetGame() {
  car = createCarState();
  traffic = createTraffic(track.length);
  hideScreens(hud);
  race = startRace(createRace(track.length, track.checkpoints));
  startMusic(audio);
}

function onRaceEnded() {
  if (qualifies(scores, race.score)) {
    enteringInitials = true;
    showInitialsEntry(hud, (initials) => {
      scores = submitScore(scores, initials, race.score);
      persistScores(scores);
      enteringInitials = false;
      showGameOver(hud, race, scores);
    });
  } else {
    showGameOver(hud, race, scores);
  }
}

function update(dt) {
  readInput();
  if (race.phase === 'racing' || race.phase === 'countdown') {
    const prevS = car.s;
    if (race.phase === 'racing') {
      car = stepCar(car, input, curvatureAt(track, car.s), track.length, dt, carDef.spec);
      updateTraffic(traffic, dt, car.s, track.length);
      if (!isCrashed(car)) {
        const hit = findCollision(car, traffic, track.length);
        if (hit) {
          car = crashCar(car);
          playCrash(audio);
        }
      }
    }
    race = updateRace(race, dt, prevS, car.s, car.speed);
    if (race.justCheckpoint || race.justLap) playJingle(audio);
    if (race.phase === 'gameover' || race.phase === 'finished') {
      stopMusic(audio);
      onRaceEnded();
    }
  }
  document.body.classList.toggle('racing', race.phase === 'racing' || race.phase === 'countdown');
  updateRivals(traffic);
  updateWorld(dt);
  setStartLights(startLightState(race));
  updateCamera(camera, track, car, dt, input.steer, carDef.spec);
  updateHud(hud, race, car, dt);
  updateMinimap(hud, posAt(track, car.s), traffic.map((c) => posAt(track, c.s)));
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
    lap: race.lap, timeLeft: race.timeLeft, score: race.score, crashed: isCrashed(car) }),
  press: (code) => { if (race.phase === 'attract') menuKey(code); else keys.add(code); },
  release: (code) => keys.delete(code),
  crash: () => { car = crashCar(car); playCrash(audio); },
  setTrack: (i) => { setTrack(i); openTrackSelect(); },
  trackName: () => track.name,
  setCar: (i) => { setCar(i); openCarSelect(); },
  carName: () => carDef.name,
  step: (seconds) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) update(DT);
    renderer.render(scene, camera);
    return window.__game.getState();
  },
};
