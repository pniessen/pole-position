import * as THREE from 'three';
import { createTrack, curvatureAt } from './track.js';
import { createCarState, stepCar, crashCar, isCrashed } from './handling.js';
import { createRace, startRace, updateRace } from './race.js';
import { createTraffic, updateTraffic, findCollision } from './traffic.js';
import { buildScene } from './scene.js';
import { createCamera, updateCamera } from './camera.js';
import { createHud, updateHud, showAttract, hideScreens, showGameOver, showInitialsEntry } from './hud.js';
import { loadScores, persistScores, submitScore, qualifies } from './storage.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);

const track = createTrack();
const { scene, updateRivals, hood } = buildScene(track);
const camera = createCamera();
camera.add(hood);
scene.add(camera);

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
showAttract(hud, scores);

const input = { throttle: 0, brake: 0, steer: 0 };
const keys = new Set();
function readInput() {
  input.throttle = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
  input.brake = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
  input.steer = (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0)
              + (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0);
}

addEventListener('keydown', (e) => {
  if (enteringInitials) return;
  keys.add(e.code);
  if (race.phase === 'attract') {
    startFromMenu();
  } else if ((race.phase === 'gameover' || race.phase === 'finished') && e.code === 'Enter') {
    resetGame();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));

function startFromMenu() {
  hideScreens(hud);
  race = startRace(race);
}

function resetGame() {
  car = createCarState();
  traffic = createTraffic(track.length);
  hideScreens(hud);
  race = startRace(createRace(track.length, track.checkpoints));
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
        if (hit) car = crashCar(car);
      }
    }
    race = updateRace(race, dt, prevS, car.s, car.speed);
    if (race.phase === 'gameover' || race.phase === 'finished') onRaceEnded();
  }
  updateRivals(traffic);
  updateCamera(camera, track, car, dt, input.steer);
  updateHud(hud, race, car, dt);
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
  step: (seconds) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) update(DT);
    renderer.render(scene, camera);
    return window.__game.getState();
  },
};
