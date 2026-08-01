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
