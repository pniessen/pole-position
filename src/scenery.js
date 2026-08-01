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

export function makeSkyDome(theme) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const top = new THREE.Color(theme.sky).offsetHSL(0, 0.05, -0.12);
  const mid = new THREE.Color(theme.sky);
  const horizon = new THREE.Color(theme.horizon ?? 0xdceeff);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#' + top.getHexString());
  grad.addColorStop(0.55, '#' + mid.getHexString());
  grad.addColorStop(0.78, '#' + horizon.getHexString());
  grad.addColorStop(1, '#' + horizon.getHexString());
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2800, 24, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(theme.sunSize ?? 55, 24),
    new THREE.MeshBasicMaterial({ color: theme.sunColor ?? 0xfff6d8, fog: false })
  );
  sun.position.set(900, 620, -1500);
  sun.lookAt(0, 0, 0);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry((theme.sunSize ?? 55) * 1.8, 24),
    new THREE.MeshBasicMaterial({ color: theme.sunColor ?? 0xfff6d8, fog: false, transparent: true, opacity: 0.25 })
  );
  halo.position.copy(sun.position).multiplyScalar(1.001);
  halo.lookAt(0, 0, 0);
  const group = new THREE.Group();
  group.add(dome, sun, halo);
  return group;
}

// --- clouds ---

export function makeClouds(count = 10) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
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
  return unit;
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
    prop.rotation.y = hash(i + 20) * Math.PI * 2;
    const sc = 0.9 + hash(i + 50) * 0.7;
    prop.scale.set(sc, sc, sc);
    group.add(prop);
  }
  return group;
}
