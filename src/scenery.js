// Sky, weather, wildlife, and trackside spectacle: everything decorative
// enough that scene.js just composes it. All geometry procedural.
import * as THREE from 'three';
import { worldPose, posAt } from './track.js';
import { ROAD_HALF_WIDTH } from './handling.js';

// deterministic pseudo-random in [0,1) so rebuilds look identical
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// --- sky ---

export function makeSkyDome(atmo) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const top = new THREE.Color(atmo.sky).offsetHSL(0, 0.05, -0.12);
  const mid = new THREE.Color(atmo.sky);
  const horizon = new THREE.Color(atmo.horizon ?? 0xdceeff);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#' + top.getHexString());
  grad.addColorStop(0.55, '#' + mid.getHexString());
  grad.addColorStop(0.78, '#' + horizon.getHexString());
  grad.addColorStop(1, '#' + horizon.getHexString());
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  if (atmo.stars) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) {
      const x = hash(i * 3.3) * 128, y = hash(i * 7.7) * 140;
      ctx.globalAlpha = 0.4 + hash(i) * 0.6;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2800, 24, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  const group = new THREE.Group();
  group.add(dome);
  if (atmo.sunVisible !== false) {
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(atmo.sunSize ?? 55, 24),
      new THREE.MeshBasicMaterial({ color: atmo.sunColor ?? 0xfff6d8, fog: false })
    );
    const sunPos = atmo.sunPos ?? [900, 620, -1500];
    sun.position.set(...sunPos);
    sun.lookAt(0, 0, 0);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry((atmo.sunSize ?? 55) * 1.8, 24),
      new THREE.MeshBasicMaterial({ color: atmo.sunColor ?? 0xfff6d8, fog: false, transparent: true, opacity: 0.25 })
    );
    halo.position.copy(sun.position).multiplyScalar(1.001);
    halo.lookAt(0, 0, 0);
    group.add(sun, halo);
  }
  return group;
}

// --- clouds ---

export function makeClouds(count = 10, color = 0xffffff) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.92 });
  const puffGeo = new THREE.SphereGeometry(1, 7, 5);
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(hash(i) * 3);
    const size = 18 + hash(i + 40) * 26;
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, mat);
      puff.position.set((p - puffs / 2) * size * 0.7, hash(i * 7 + p) * size * 0.18, (hash(i * 13 + p) - 0.5) * size * 0.5);
      puff.scale.set(size * (0.7 + hash(p + i) * 0.5), size * 0.32, size * 0.55);
      cloud.add(puff);
    }
    cloud.position.set((hash(i + 3) - 0.5) * 2800, 150 + hash(i + 9) * 160, (hash(i + 5) - 0.5) * 2800);
    cloud.userData.speed = 4 + hash(i + 11) * 5;
    group.add(cloud);
    clouds.push(cloud);
  }
  group.userData.update = (dt) => {
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 1600) cloud.position.x = -1600;
    }
  };
  return group;
}

// --- flying things ---

export function makeBirds() {
  const flock = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1c2126, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const bird = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(2.4, 0.7);
    const left = new THREE.Mesh(wingGeo, mat);
    left.position.x = -1.1;
    const right = new THREE.Mesh(wingGeo, mat);
    right.position.x = 1.1;
    bird.add(left, right);
    bird.position.set((hash(i) - 0.5) * 40, (hash(i + 2) - 0.5) * 12, (hash(i + 4) - 0.5) * 40);
    bird.userData = { left, right, phase: hash(i + 6) * Math.PI * 2 };
    flock.add(bird);
    birds.push(bird);
  }
  flock.position.set(130, 85, -280);
  let t = 0;
  flock.userData.update = (dt) => {
    t += dt;
    flock.rotation.y += dt * 0.10;
    for (const bird of birds) {
      const flap = Math.sin(t * 9 + bird.userData.phase) * 0.55;
      bird.userData.left.rotation.y = flap;
      bird.userData.right.rotation.y = -flap;
    }
  };
  return flock;
}

export function makeBlimp() {
  const blimp = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8e8f0 })
  );
  body.scale.set(14, 5.5, 5.5);
  const stripe = new THREE.Mesh(
    new THREE.SphereGeometry(1.001, 16, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16),
    new THREE.MeshLambertMaterial({ color: 0xd92222 })
  );
  stripe.scale.copy(body.scale);
  const finMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc9 });
  const finV = new THREE.Mesh(new THREE.BoxGeometry(4.5, 5, 0.3), finMat);
  finV.position.set(-12, 0, 0);
  const finH = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 5), finMat);
  finH.position.set(-12, 0, 0);
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 1.6), new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
  gondola.position.set(1, -5.6, 0);
  blimp.add(body, stripe, finV, finH, gondola);
  let angle = 0;
  const CX = 130, CZ = -280, R = 750, H = 200;
  blimp.userData.update = (dt) => {
    angle += dt * 0.016;
    const x = CX + Math.cos(angle) * R, z = CZ + Math.sin(angle) * R;
    const nx = CX + Math.cos(angle + 0.01) * R, nz = CZ + Math.sin(angle + 0.01) * R;
    blimp.position.set(x, H, z);
    blimp.lookAt(nx, H, nz);
    blimp.rotateY(Math.PI / 2); // body's long axis is x
  };
  blimp.userData.update(0);
  return blimp;
}

// --- start light gantry ---

const LAMP_RED_ON = 0xff2a2a, LAMP_RED_OFF = 0x3d0e0e;
const LAMP_GREEN_ON = 0x35ff5a, LAMP_GREEN_OFF = 0x0e3d16;

export function makeStartLights(track) {
  const group = new THREE.Group();
  const structMat = new THREE.MeshLambertMaterial({ color: 0x2a2e36 });
  const half = ROAD_HALF_WIDTH + 2.6;
  const postGeo = new THREE.BoxGeometry(0.5, 8, 0.5);
  const left = new THREE.Mesh(postGeo, structMat);
  left.position.set(-half, 4, 0);
  const right = new THREE.Mesh(postGeo, structMat);
  right.position.set(half, 4, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 0.7, 0.7), structMat);
  bar.position.y = 7.8;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x14161a }));
  housing.position.y = 6.6;
  group.add(left, right, bar, housing);

  const lamps = [];
  const lampGeo = new THREE.CircleGeometry(0.42, 16);
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i < 3 ? LAMP_RED_OFF : LAMP_GREEN_OFF });
    const lamp = new THREE.Mesh(lampGeo, mat);
    lamp.position.set(-1.65 + i * 1.1, 6.6, 0.28);
    group.add(lamp);
    lamps.push(mat);
  }

  // stand ~25 m past the line, lamps facing back toward the grid
  const { position, tangent } = worldPose(track, 25, 0);
  group.position.copy(position);
  group.lookAt(position.clone().sub(new THREE.Vector3(tangent.x, 0, tangent.z)));

  group.userData.setState = (state) => {
    for (let i = 0; i < 3; i++) lamps[i].color.setHex(state !== 'off' && state !== 'go' && i < state ? LAMP_RED_ON : LAMP_RED_OFF);
    lamps[3].color.setHex(state === 'go' ? LAMP_GREEN_ON : LAMP_GREEN_OFF);
  };
  return group;
}

// --- grandstands ---

function crowdTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20242e';
  ctx.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `hsl(${Math.floor(hash(seed + i) * 360)}, ${45 + hash(seed + i * 3) * 40}%, ${40 + hash(seed + i * 7) * 35}%)`;
    ctx.fillRect(Math.floor(hash(i + seed * 13) * 128), Math.floor(hash(i * 3 + seed) * 64), 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

const FLAG_COLORS = [0xff5533, 0xffd21f, 0x22ccff, 0x35ff6a, 0xffffff];

function makeStandUnit(seed) {
  const unit = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0x4a5160 });
  // stepped tiers
  for (let tier = 0; tier < 4; tier++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(14, 1.1, 2.2), frame);
    step.position.set(0, 0.55 + tier * 1.1, -tier * 2.0);
    unit.add(step);
  }
  // crowd plane slanted over the tiers
  const crowd = new THREE.Mesh(
    new THREE.PlaneGeometry(13.6, 8.6),
    new THREE.MeshBasicMaterial({ map: crowdTexture(seed) })
  );
  crowd.position.set(0, 2.9, -2.9);
  crowd.rotation.x = -Math.PI * 0.155;
  unit.add(crowd);
  // roof on poles
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.3, 9), new THREE.MeshLambertMaterial({ color: 0xd8dbe4 }));
  roof.position.set(0, 6.4, -3.4);
  roof.rotation.x = Math.PI * 0.04;
  const poleGeo = new THREE.BoxGeometry(0.25, 6.4, 0.25);
  for (const px of [-6.8, 6.8]) {
    const pole = new THREE.Mesh(poleGeo, frame);
    pole.position.set(px, 3.2, -6.8);
    unit.add(pole);
  }
  unit.add(roof);

  // crowd life: waving flags on the roofline + camera flashes in the seats
  const flags = [];
  for (const fx of [-5.5, 5.5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), frame);
    pole.position.set(fx, 7.3, -1.2);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.7),
      new THREE.MeshBasicMaterial({
        color: FLAG_COLORS[Math.floor(hash(seed + fx) * FLAG_COLORS.length)],
        side: THREE.DoubleSide,
      })
    );
    flag.position.set(fx + 0.62, 7.75, -1.2);
    flag.userData.phase = hash(seed * 3 + fx) * Math.PI * 2;
    flag.userData.px = fx;
    unit.add(pole, flag);
    flags.push(flag);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
  );
  flash.position.set(0, 3.2, -2.6);
  flash.rotation.x = -Math.PI * 0.155;
  unit.add(flash);

  let t = hash(seed) * 10;
  let flashLife = 0;
  unit.userData.update = (dt) => {
    t += dt;
    for (const flag of flags) {
      const wave = Math.sin(t * 3.2 + flag.userData.phase);
      flag.rotation.y = wave * 0.55;
      flag.position.x = flag.userData.px + 0.62 * Math.cos(wave * 0.55);
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flash.material.opacity = Math.max(0, flashLife * 8);
    } else if (hash(seed + Math.floor(t * 2)) < 0.045) {
      flashLife = 0.1;
      flash.position.x = (hash(seed + t) - 0.5) * 12;
      flash.position.y = 2.2 + hash(seed * 7 + t) * 2.4;
    }
  };
  return unit;
}

// solid base under a stand whose ground level sits above the flat terrain
function addPlinth(unit, elev) {
  if (elev < 0.5) return;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(14.6, elev + 0.4, 9.6),
    new THREE.MeshLambertMaterial({ color: 0x3a3f4a })
  );
  plinth.position.set(0, -(elev + 0.4) / 2, -2.8);
  unit.add(plinth);
}

export function makeGrandstands(track) {
  const group = new THREE.Group();
  const offset = ROAD_HALF_WIDTH + 1.6 + 7;
  let seed = 1;
  for (const s of [-64, -42, -20, 22, 44, 66]) {
    for (const side of [-1, 1]) {
      const unit = makeStandUnit(seed++);
      const { position } = worldPose(track, s, side * offset);
      unit.position.copy(position);
      addPlinth(unit, position.y);
      const roadPoint = worldPose(track, s, 0).position;
      roadPoint.y = position.y;
      unit.lookAt(roadPoint);
      group.add(unit);
    }
  }
  return group;
}

// --- theme props (trees / cacti / palms) ---

function makePine() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
  trunk.position.y = 0.8;
  const matA = new THREE.MeshLambertMaterial({ color: 0x1e6b33 });
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.6, 8), matA);
  c1.position.y = 2.6;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.0, 8), matA);
  c2.position.y = 4.1;
  g.add(trunk, c1, c2);
  return g;
}

function makeCactus() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3f8f3f });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3.2, 8), mat);
  body.position.y = 1.6;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 6), mat);
  armL.position.set(-0.7, 1.9, 0);
  armL.rotation.z = Math.PI / 4;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 6), mat);
  armR.position.set(0.65, 2.4, 0);
  armR.rotation.z = -Math.PI / 4;
  g.add(body, armL, armR);
  return g;
}

function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 4.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
  trunk.position.y = 2.1;
  trunk.rotation.z = 0.12;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), leafMat);
    leaf.position.set(0.5, 4.3, 0);
    leaf.rotation.set(0.35 * Math.sin(i * 2.4), (i / 6) * Math.PI * 2, -0.5);
    g.add(leaf);
  }
  return g;
}

const PROP_BUILDERS = { pine: makePine, cactus: makeCactus, palm: makePalm };

// --- per-track surroundings ---

function makeMountain(x, z, radius, height, color, snowCap = false, rounded = false) {
  // fog: false — backdrop shapes beyond the fog act as a flat horizon.
  const group = new THREE.Group();
  const geo = rounded
    ? new THREE.SphereGeometry(radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    : new THREE.ConeGeometry(radius, height, 7);
  const shape = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false }));
  if (rounded) shape.scale.y = height / radius;
  else shape.position.y = height / 2;
  group.add(shape);
  if (snowCap && !rounded) {
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.35, height * 0.32, 7),
      new THREE.MeshBasicMaterial({ color: 0xf4f7fa, fog: false })
    );
    cap.position.y = height - (height * 0.32) / 2 + 0.5;
    group.add(cap);
  }
  group.position.set(x, 0, z);
  return group;
}

const BACKDROP_SPOTS = [
  [900, -1200, 350, 260], [400, -1500, 260, 140], [-800, -1000, 300, 150],
  [1200, -300, 280, 120], [-900, 300, 320, 170], [300, 900, 300, 130],
];

function backdropRing(theme, { rounded = false, heightScale = 1, first = {} } = {}) {
  const group = new THREE.Group();
  const base = new THREE.Color(theme.mountain);
  const shades = [
    theme.mountain,
    base.clone().offsetHSL(0, 0, 0.05).getHex(),
    base.clone().offsetHSL(0, 0, -0.05).getHex(),
  ];
  BACKDROP_SPOTS.forEach(([x, z, r, h], i) => {
    group.add(makeMountain(x, z, r, h * heightScale, shades[i % 3],
      i === 0 && (first.snow ?? theme.snow), rounded));
  });
  return group;
}

function makeTreeRing(track, type, count, minOff, maxOff) {
  const group = new THREE.Group();
  const build = PROP_BUILDERS[type] ?? makePine;
  for (let i = 0; i < count; i++) {
    const s = (i / count) * track.length;
    if (s < 100 || s > track.length - 100) continue;
    const side = (i % 2 ? 1 : -1) * (minOff + hash(i + 500) * (maxOff - minOff));
    const prop = build();
    const { position } = worldPose(track, s, side);
    prop.position.copy(position);
    prop.position.y = 0;
    prop.rotation.y = hash(i + 520) * Math.PI * 2;
    const sc = 1.1 + hash(i + 540) * 1.1;
    prop.scale.set(sc, sc, sc);
    group.add(prop);
  }
  return group;
}

function windowTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3c4250';
  ctx.fillRect(0, 0, 64, 128);
  for (let r = 2; r < 30; r++) {
    for (let c = 1; c < 7; c++) {
      ctx.fillStyle = hash(seed + r * 7 + c) > 0.45 ? '#ffe9a8' : '#232833';
      ctx.fillRect(c * 9, r * 4, 6, 2.6);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBuildings(track) {
  const group = new THREE.Group();
  const facadeColors = [0xd8cfc0, 0xc9b8a8, 0xbfc4cf, 0xd4c4ae, 0xb8aa9a];
  const step = 34;
  let i = 0;
  for (let s = 100; s < track.length - 100; s += step) {
    for (const side of [-1, 1]) {
      i++;
      if (hash(i * 3.1) < 0.25) continue; // gaps between blocks
      const offset = side * (ROAD_HALF_WIDTH + 14 + hash(i) * 22);
      const w = 16 + hash(i + 1) * 14;
      const h = 14 + hash(i + 2) * 26;
      const d = 12 + hash(i + 3) * 10;
      const mats = [];
      const facade = new THREE.MeshLambertMaterial({ color: facadeColors[i % facadeColors.length] });
      const windows = new THREE.MeshBasicMaterial({ map: windowTexture(i) });
      // window the two long faces, plain the rest
      for (let f = 0; f < 6; f++) mats.push(f === 4 || f === 5 ? windows : facade);
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      const { position, tangent } = worldPose(track, s, offset);
      box.position.copy(position);
      box.position.y = h / 2 - 0.2; // grounded on the flat terrain, not the road slope
      box.lookAt(position.clone().add(new THREE.Vector3(tangent.x, 0, tangent.z)));
      group.add(box);
    }
  }
  return group;
}

function makeWater(track) {
  // a broad sea disc placed beyond the track's eastern extent
  let maxX = -Infinity, cz = 0, n = 60;
  for (let i = 0; i < n; i++) {
    const p = posAt(track, (i / n) * track.length);
    maxX = Math.max(maxX, p.x);
    cz += p.z / n;
  }
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(650, 48),
    new THREE.MeshBasicMaterial({ color: 0x2a7fc9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(maxX + 690, -0.05, cz);
  return water;
}

function makeStadiumRing(track) {
  const group = new THREE.Group();
  const offset = ROAD_HALF_WIDTH + 2 + 9;
  let seed = 40;
  for (let s = 90; s < track.length - 90; s += 130) {
    for (const side of [-1, 1]) {
      if (hash(seed * 1.7) < 0.2) { seed++; continue; }
      const unit = makeStandUnit(seed++);
      const { position } = worldPose(track, s, side * offset);
      unit.position.copy(position);
      addPlinth(unit, position.y);
      const roadPoint = worldPose(track, s, 0).position;
      roadPoint.y = position.y;
      unit.lookAt(roadPoint);
      group.add(unit);
    }
  }
  return group;
}

function makeObservationTower(track) {
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3.2, 58, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8e8ee })
  );
  shaft.position.y = 29;
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 5.5, 6, 10),
    new THREE.MeshLambertMaterial({ color: 0xd42020 })
  );
  pod.position.y = 58;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(7.4, 7.4, 1, 10),
    new THREE.MeshLambertMaterial({ color: 0xf0f0f4 })
  );
  cap.position.y = 61.5;
  tower.add(shaft, pod, cap);
  const { position } = worldPose(track, 170, 40);
  tower.position.copy(position);
  return tower;
}

// Composes the world beyond the rumble strips to match the track's character.
export function makeEnvironment(track, theme) {
  const group = new THREE.Group();
  switch (theme.environment) {
    case 'forest':
      group.add(backdropRing(theme, { rounded: true, heightScale: 0.7 }));
      group.add(makeTreeRing(track, theme.prop, 110, 18, 85));
      break;
    case 'park':
      group.add(backdropRing(theme, { rounded: true, heightScale: 0.45 }));
      group.add(makeTreeRing(track, theme.prop, 48, 20, 70));
      break;
    case 'urban':
      group.add(makeBuildings(track));
      group.add(makeWater(track));
      break;
    case 'stadium':
      group.add(makeStadiumRing(track));
      group.add(backdropRing(theme, { rounded: true, heightScale: 0.35 }));
      break;
    case 'hills':
      group.add(backdropRing(theme, { rounded: true, heightScale: 0.55 }));
      group.add(makeTreeRing(track, theme.prop, 26, 25, 80));
      break;
    case 'plains':
      group.add(backdropRing(theme, { rounded: true, heightScale: 0.3 }));
      group.add(makeObservationTower(track));
      break;
    case 'coast':
      group.add(makeWater(track));
      group.add(backdropRing(theme));
      break;
    default: // 'mountains'
      group.add(backdropRing(theme));
  }
  return group;
}

export function makeProps(track, theme) {
  const group = new THREE.Group();
  const build = PROP_BUILDERS[theme.prop] ?? makePine;
  const count = 56;
  for (let i = 0; i < count; i++) {
    const s = (i / count) * track.length;
    // keep clear of the start/finish grandstand zone
    if (s < 90 || s > track.length - 90) continue;
    const side = (i % 2 ? 1 : -1) * (22 + hash(i) * 38);
    const prop = build();
    const { position } = worldPose(track, s, side);
    prop.position.copy(position);
    prop.position.y = 0;
    prop.rotation.y = hash(i + 20) * Math.PI * 2;
    const sc = 0.9 + hash(i + 50) * 0.7;
    prop.scale.set(sc, sc, sc);
    group.add(prop);
  }
  return group;
}
