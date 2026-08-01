import * as THREE from 'three';
import { createTrack, curvatureAt, posAt, TRACKS } from './track.js';
import { createCarState, stepCar, crashCar, isCrashed, isOffroad, CAR } from './handling.js';
import { createRace, startRace, updateRace } from './race.js';
import { createTraffic, updateTraffic, findCollision } from './traffic.js';
import { buildScene } from './scene.js';
import { createCamera, updateCamera } from './camera.js';
import { createHud, updateHud, showAttract, hideScreens, showGameOver, showInitialsEntry, setMinimapTrack, updateMinimap } from './hud.js';
import { loadScores, persistScores, submitScore, qualifies } from './storage.js';
import { createAudio, unlock, updateEngine, setSkid, playCrash, playJingle, startMusic, stopMusic } from './audio.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);

let trackIndex = 0;
let track = createTrack(trackIndex);
let { scene, updateRivals, hood } = buildScene(track);
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
  camera.remove(hood);
  disposeScene(scene);
  disposeScene(hood);
  track = createTrack(trackIndex);
  ({ scene, updateRivals, hood } = buildScene(track));
  camera.add(hood);
  scene.add(camera);
  car = createCarState();
  traffic = createTraffic(track.length);
  race = createRace(track.length, track.checkpoints);
  refreshMinimap();
  showAttract(hud, scores, track.name);
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
showAttract(hud, scores, track.name);

const audio = createAudio();

const input = { throttle: 0, brake: 0, steer: 0 };
const keys = new Set();
function readInput() {
  input.throttle = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
  input.brake = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
  input.steer = (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0)
              + (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0);
}

addEventListener('keydown', (e) => {
  unlock(audio);
  if (enteringInitials) return;
  if (race.phase === 'attract') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { setTrack(trackIndex - 1); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { setTrack(trackIndex + 1); return; }
    keys.add(e.code);
    startFromMenu();
    return;
  }
  keys.add(e.code);
  if ((race.phase === 'gameover' || race.phase === 'finished') && e.code === 'Enter') {
    resetGame();
  } else if ((race.phase === 'gameover' || race.phase === 'finished') && e.code === 'Escape') {
    car = createCarState();
    traffic = createTraffic(track.length);
    race = createRace(track.length, track.checkpoints);
    showAttract(hud, scores, track.name);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));

function startFromMenu() {
  hideScreens(hud);
  race = startRace(race);
  startMusic(audio);
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
      car = stepCar(car, input, curvatureAt(track, car.s), track.length, dt);
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
  updateRivals(traffic);
  updateCamera(camera, track, car, dt, input.steer);
  updateHud(hud, race, car, dt);
  updateMinimap(hud, posAt(track, car.s), traffic.map((c) => posAt(track, c.s)));
  updateEngine(audio, car.speed, CAR.maxSpeed);
  setSkid(audio, (Math.abs(input.steer) === 1 && car.speed > 0.7 * CAR.maxSpeed) || (isOffroad(car) && car.speed > 5));
}

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
  press: (code) => { keys.add(code); if (race.phase === 'attract') startFromMenu(); },
  release: (code) => keys.delete(code),
  crash: () => { car = crashCar(car); playCrash(audio); },
  setTrack: (i) => setTrack(i),
  trackName: () => track.name,
  step: (seconds) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) update(DT);
    renderer.render(scene, camera);
    return window.__game.getState();
  },
};
