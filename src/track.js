import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// Wavy-radius loop around a center: single-valued r(θ) can never
// self-intersect, so corner character comes from radius swings and
// elevation from the parallel elevation list.
function radialLoop(radii, elevations, cx = 0, cz = 0) {
  const n = radii.length;
  return radii.map((r, i) => {
    const theta = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(theta), elevations[i], cz + r * Math.sin(theta)];
  });
}

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
    theme: { sky: 0x6fd6ff, grass: 0x2fae7d, mountain: 0x5f7f9c, snow: false, horizon: 0xe0f6ff, prop: 'palm', environment: 'coast' },
    points: [
      [0, 0, 0], [120, 0, 0], [200, 0, -40], [220, 2, -120],
      [160, 3, -180], [80, 3, -160], [40, 1, -240], [100, 0, -320],
      [200, 0, -340], [260, 2, -420], [200, 4, -500], [80, 3, -520],
      [-20, 2, -460], [-60, 0, -360], [-140, 1, -320], [-180, 3, -220],
      [-140, 2, -100], [-80, 0, -30],
    ],
  },
  // ---- famous circuits, arcade-scale renditions ----
  {
    name: 'NORDSCHLEIFE',
    tagline: 'The Green Hell — endless corners through the Eifel forest',
    theme: { sky: 0x7fb8e8, grass: 0x2e7d32, mountain: 0x5c7266, snow: false, horizon: 0xdae8dc, prop: 'pine', environment: 'forest' },
    points: [
      [0, 6, 0], [150, 7, -10], [260, 9, -40], [310, 10, -110],
      [260, 11, -180], [330, 12, -250], [430, 13, -300], [540, 12, -260],
      [620, 10, -320], [590, 8, -420], [480, 4, -490], [380, 2, -560],
      [300, 3, -640], [220, 5, -700], [120, 7, -680], [40, 8, -740],
      [-60, 9, -700], [-140, 10, -620], [-220, 10, -680], [-300, 8, -600],
      [-370, 4, -500], [-340, 4, -390], [-260, 7, -320], [-220, 10, -200],
      [-260, 13, -100], [-180, 15, -40], [-90, 14, -100], [-40, 12, -30],
      [-20, 9, 30],
    ],
  },
  {
    name: 'SPA-FRANCORCHAMPS',
    tagline: 'Eau Rouge flat out — if you dare',
    theme: { sky: 0x8cb8d8, grass: 0x3a8f3f, mountain: 0x66788a, snow: false, horizon: 0xe2eaf0, prop: 'pine', environment: 'forest' },
    points: [
      [0, 9, 0], [150, 9, -3], [205, 8, 40], [175, 8, 105],
      [60, 4, 130], [-60, 1, 165], [-95, 3, 95], [-130, 6, 20],
      [-260, 8, -60], [-420, 10, -140], [-560, 10, -230], [-540, 9, -330],
      [-430, 7, -390], [-290, 5, -380], [-150, 3, -330], [-30, 2, -260],
      [80, 3, -190], [140, 5, -110], [110, 7, -40],
    ],
  },
  {
    name: 'MONZA',
    tagline: 'The Temple of Speed — chicanes and flat-out straights',
    theme: { sky: 0x74baff, grass: 0x4aa54a, mountain: 0x8795a8, snow: false, horizon: 0xdcecff, prop: 'pine', environment: 'park' },
    points: [
      [0, 0, 0], [260, 0, 0], [500, 0, 0], [545, 0, -2],
      [575, 0, -18], [605, 0, -6], [700, 0, -30], [800, 0, -120],
      [815, 0, -190], [790, 0, -228], [812, 0, -300], [780, 0, -380],
      [640, 1, -415], [460, 1, -440], [220, 1, -460], [125, 0, -432],
      [82, 0, -470], [20, 0, -452], [-120, 0, -420], [-215, 0, -350],
      [-235, 0, -220], [-195, 0, -100], [-90, 0, -18],
    ],
  },
  {
    name: 'MONACO',
    tagline: 'Threading the needle through the streets of Monte Carlo',
    scale: 1.2,
    theme: { sky: 0x6fc4ff, grass: 0x8f959e, mountain: 0x9aa5b5, snow: false, horizon: 0xe8f2fa, prop: 'palm', environment: 'urban' },
    points: [
      // uphill north to Casino, hairpin, then the harbor-front return south
      [0, 2, 0], [110, 3, -5], [180, 5, 15], [215, 8, 60],
      [195, 9, 120], [130, 9, 150], [80, 7, 110], [45, 6, 150],
      [25, 5, 190], [70, 4, 215], [150, 3, 195], [220, 2, 150],
      [250, 2, 90], [300, 2, 30], [370, 1, -30], [395, 1, -105],
      [340, 1, -150], [280, 1, -118], [225, 1, -152], [150, 1, -128],
      [100, 2, -92], [45, 1, -45],
    ],
  },
  {
    name: 'INDIANAPOLIS',
    tagline: 'The Brickyard — four left turns at full throttle',
    theme: { sky: 0x74baff, grass: 0x4aa54a, mountain: 0x8795a8, snow: false, horizon: 0xdcecff, prop: 'pine', environment: 'stadium' },
    points: [
      [0, 0, 0], [250, 0, 0], [550, 0, 0], [780, 0, -15],
      [840, 0, -90], [845, 0, -190], [790, 0, -260], [560, 0, -278],
      [280, 0, -280], [60, 0, -272], [-40, 0, -200], [-45, 0, -95],
    ],
  },
  {
    name: 'DAYTONA',
    tagline: 'High-banked superspeedway — draft or be drafted',
    theme: { sky: 0x63b1ff, grass: 0x3cb043, mountain: 0x8795a8, snow: false, horizon: 0xd8ecff, prop: 'palm', environment: 'stadium' },
    points: [
      [0, 0, 0], [200, 0, 25], [420, 0, 32], [640, 0, 20],
      [810, 0, -40], [880, 0, -150], [855, 0, -255], [745, 0, -330],
      [560, 0, -365], [300, 0, -368], [90, 0, -350], [-65, 0, -285],
      [-115, 0, -170], [-80, 0, -60],
    ],
  },
  {
    name: 'LAGUNA SECA',
    tagline: 'Hold your breath — down the Corkscrew',
    scale: 1.4,
    theme: { sky: 0x7cc4f2, grass: 0xc4a95e, mountain: 0xa8905e, snow: false, horizon: 0xf2e8d0, prop: 'pine', environment: 'hills' },
    // wavy radial loop: tight radius pinches for the hairpins, and the
    // 14→9→6 elevation plunge is the Corkscrew
    points: radialLoop(
      [205, 215, 170, 128, 152, 195, 235, 248, 238, 218, 205, 185, 165, 152, 168, 188],
      [4, 4, 5, 6, 7, 9, 11, 13, 14, 12, 8, 5, 3, 2, 2, 3],
      0, -210
    ),
  },
  {
    name: 'COTA',
    tagline: 'Austin heat — the uphill charge into Turn 1',
    theme: { sky: 0x74baff, grass: 0x46a04b, mountain: 0x97a2b2, snow: false, horizon: 0xe4f0ff, prop: 'cactus', environment: 'plains' },
    points: [
      [0, 0, 0], [140, 4, 0], [215, 10, 10], [240, 11, 60],
      [200, 10, 115], [100, 6, 150], [20, 4, 120], [-60, 3, 160],
      [-140, 2, 130], [-210, 2, 170], [-260, 1, 100], [-280, 0, -60],
      [-285, 0, -220], [-260, 0, -290], [-200, 0, -310], [-120, 0, -290],
      [-60, 1, -330], [10, 1, -300], [90, 1, -260], [130, 1, -180],
      [120, 0, -90], [80, 0, -30],
    ],
  },
];

export function createTrack(index = 0) {
  const def = TRACKS[index];
  const k = def.scale ?? 1;
  const points = def.points.map(([x, y, z]) => new THREE.Vector3(x * k, y, z * k));
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
