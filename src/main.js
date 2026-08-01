// TEMPORARY scene-verification boot (replaced by the game loop in Task 8)
import * as THREE from 'three';
import { createTrack, posAt } from './track.js';
import { createTraffic } from './traffic.js';
import { buildScene } from './scene.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const track = createTrack();
const { scene, updateRivals } = buildScene(track);
const traffic = createTraffic(track.length);
updateRivals(traffic);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 4000);

// On-demand debug views (rAF doesn't fire while the preview pane is hidden)
function ensureSize() {
  const w = innerWidth || 1280, h = innerHeight || 720;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.ensureSize = ensureSize;
window.debugGround = (s, x = 0) => {
  ensureSize();
  const p = posAt(track, s);
  camera.position.set(p.x + (x ? 0 : 0), p.y + 1.2, p.z);
  camera.lookAt(posAt(track, s + 30));
  renderer.render(scene, camera);
  return 'ok';
};
window.debugOrbit = (angle = 0.9) => {
  ensureSize();
  const cx = 130, cz = -280;
  camera.position.set(cx + Math.cos(angle) * 500, 260, cz + Math.sin(angle) * 500);
  camera.lookAt(cx, 0, cz);
  renderer.render(scene, camera);
  return 'ok';
};
window.debugOrbit();
window.trackLength = track.length;
