import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// Each track: control points (x, elevation, z) for a closed Catmull-Rom loop,
// plus a visual theme applied by scene.js.
export const TRACKS = [
  {
    name: 'FUJI SPEEDWAY',
    tagline: 'Fast, flowing classic beneath the snow-capped mountain',
    theme: { sky: 0x63b1ff, grass: 0x3cb043, mountain: 0x7d8ca3, snow: true, horizon: 0xcfe8ff, prop: 'pine' },
    points: [
      [0, 0, 0], [140, 0, 0], [280, 0, -10], [380, 0, -60],
      [420, 2, -140], [380, 4, -220], [280, 5, -260], [180, 4, -230],
      [120, 3, -300], [160, 2, -390], [260, 1, -430], [360, 0, -470],
      [340, 0, -560], [230, 0, -590], [120, 1, -560], [60, 3, -480],
      [-60, 4, -440], [-140, 2, -340], [-160, 0, -200], [-120, 0, -80],
    ],
  },
  {
    name: 'DESERT RUN',
    tagline: 'Long straights and big sweepers through the dunes',
    theme: { sky: 0xf2a95c, grass: 0xd9b36c, mountain: 0x9c6248, snow: false, horizon: 0xffd9a8, prop: 'cactus', sunColor: 0xffc978, sunSize: 80 },
    points: [
      [0, 0, 0], [180, 0, 0], [360, 0, -20], [480, 0, -90],
      [520, 0, -200], [480, 0, -310], [360, 2, -380], [240, 4, -420],
      [140, 4, -520], [160, 2, -640], [280, 0, -700], [420, 0, -720],
      [460, 0, -820], [380, 0, -900], [240, 0, -910], [100, 0, -860],
      [0, 2, -760], [-80, 4, -640], [-140, 2, -480], [-160, 0, -320],
      [-120, 0, -160], [-60, 0, -40],
    ],
  },
  {
    name: 'SEASIDE SPRINT',
    tagline: 'Tight, twisty and unforgiving along the shore',
    theme: { sky: 0x6fd6ff, grass: 0x2fae7d, mountain: 0x5f7f9c, snow: false, horizon: 0xe0f6ff, prop: 'palm' },
    points: [
      [0, 0, 0], [120, 0, 0], [200, 0, -40], [220, 2, -120],
      [160, 3, -180], [80, 3, -160], [40, 1, -240], [100, 0, -320],
      [200, 0, -340], [260, 2, -420], [200, 4, -500], [80, 3, -520],
      [-20, 2, -460], [-60, 0, -360], [-140, 1, -320], [-180, 3, -220],
      [-140, 2, -100], [-80, 0, -30],
    ],
  },
];

export function createTrack(index = 0) {
  const def = TRACKS[index];
  const points = def.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
  const length = curve.getLength();
  return { curve, length, checkpoints: [0, length / 2], name: def.name, tagline: def.tagline, theme: def.theme, index };
}

// number of distinct corners (hysteresis so wiggle inside one corner counts once)
export function countTurns(track) {
  const step = 5;
  let count = 0;
  let inTurn = false;
  for (let s = 0; s < track.length; s += step) {
    const k = Math.abs(curvatureAt(track, s));
    if (!inTurn && k > 0.008) { inTurn = true; count++; }
    else if (inTurn && k < 0.005) inTurn = false;
  }
  return count;
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
