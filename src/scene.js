import * as THREE from 'three';
import { worldPose, posAt, tangentAt } from './track.js';
import { ROAD_HALF_WIDTH } from './handling.js';

const ROADCOL = new THREE.Color(0x555a5e);
const RUMBLE_A = new THREE.Color(0xe33f3f);
const RUMBLE_B = new THREE.Color(0xf2f2f2);
const LINE = new THREE.Color(0xf7f7e8);

export const RIVAL_COLORS = [0xff5533, 0xffcc22, 0x22ccff, 0xcc44ff, 0x44ff77, 0xff8844, 0x4488ff];

const BILLBOARD_TEXTS = ['THE DAD SHOW', 'TURBO', 'THE DAD SHOW', 'SPEED UP', 'THE DAD SHOW', 'GRIP+', 'NITRO COLA', '500 MPH RADIO'];
const BILLBOARD_BG = ['#1a56c4', '#d92222', '#e8a013', '#15881e', '#7722cc', '#0b0b0b', '#d92222', '#1a56c4'];

function buildRoad(track) {
  // Non-indexed geometry with flat per-face colors: crisp retro segments,
  // no vertex-color bleeding between road, centerline, and rumble strips.
  const step = 3;
  const half = ROAD_HALF_WIDTH;
  const rumble = half + 1.6;
  const n = Math.ceil(track.length / step);
  const offs = [-rumble, -half, -0.25, 0.25, half, rumble];
  const positions = [], colors = [];

  const ringPos = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * track.length;
    const ring = [];
    for (const off of offs) {
      const { position } = worldPose(track, s, off);
      ring.push([position.x, position.y + 0.05, position.z]);
    }
    ringPos.push(ring);
  }

  for (let i = 0; i < n; i++) {
    const s = (i / n) * track.length;
    const seg = Math.floor(s / 12) % 2;
    for (let j = 0; j < offs.length - 1; j++) {
      const isRumble = j === 0 || j === offs.length - 2;
      const isCenter = j === 2;
      let c;
      if (isRumble) c = seg ? RUMBLE_A : RUMBLE_B;
      else if (isCenter && seg) c = LINE;
      else c = ROADCOL;
      const a = ringPos[i][j], b = ringPos[i + 1][j];
      const d = ringPos[i][j + 1], e = ringPos[i + 1][j + 1];
      // two triangles: a,b,d and b,e,d
      positions.push(...a, ...b, ...d, ...b, ...e, ...d);
      for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function textTexture(text, bg, fg = '#ffffff', w = 512, h = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = fg;
  const size = Math.min(Math.floor(h / 3), Math.floor((w - 80) / (0.62 * text.length)));
  ctx.font = `bold ${size}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function checkerTexture(w = 512, h = 64, cells = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const cw = w / cells, ch = h / 2;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#eee';
      ctx.fillRect(i * cw, j * ch, cw, ch);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBillboard(text, bg) {
  const group = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 0.4),
    [
      new THREE.MeshBasicMaterial({ color: 0x333333 }),
      new THREE.MeshBasicMaterial({ color: 0x333333 }),
      new THREE.MeshBasicMaterial({ color: 0x333333 }),
      new THREE.MeshBasicMaterial({ color: 0x333333 }),
      new THREE.MeshBasicMaterial({ map: textTexture(text, bg) }),
      new THREE.MeshBasicMaterial({ map: textTexture(text, bg) }),
    ]
  );
  face.position.y = 2.5;
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 1.2, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x444444 })
  );
  post.position.y = 0.6;
  group.add(face, post);
  return group;
}

function makeArch(track, s, color, label) {
  const group = new THREE.Group();
  const half = ROAD_HALF_WIDTH + 2;
  const postGeo = new THREE.BoxGeometry(0.8, 7, 0.8);
  const mat = new THREE.MeshBasicMaterial({ color });
  const left = new THREE.Mesh(postGeo, mat);
  left.position.set(-half, 3.5, 0);
  const right = new THREE.Mesh(postGeo, mat);
  right.position.set(half, 3.5, 0);
  const barMats = [];
  const barTex = label === 'START'
    ? checkerTexture()
    : textTexture(label, '#b8860b', '#111', 1024, 128);
  for (let i = 0; i < 6; i++) {
    barMats.push(new THREE.MeshBasicMaterial(i === 2 || i === 3 || i === 4 || i === 5 ? { map: barTex } : { color: 0x222222 }));
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.8, 1.6, 1), barMats);
  bar.position.y = 7;
  group.add(left, right, bar);

  const { position, tangent } = worldPose(track, s, 0);
  group.position.copy(position);
  group.lookAt(position.clone().add(new THREE.Vector3(tangent.x, 0, tangent.z)));
  return group;
}

function makeMountain(x, z, radius, height, color, snowCap = false) {
  // fog: false — mountains sit beyond the fog distance and act as a
  // flat retro horizon backdrop rather than fading out.
  const group = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 7),
    new THREE.MeshBasicMaterial({ color, fog: false })
  );
  cone.position.y = height / 2;
  group.add(cone);
  if (snowCap) {
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

export function makeRivalCar(colorIndex) {
  const group = new THREE.Group();
  const color = RIVAL_COLORS[colorIndex % RIVAL_COLORS.length];
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.55, 4.2), bodyMat);
  body.position.y = 0.45;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.2), bodyMat);
  nose.position.set(0, 0.35, 2.6);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.5), darkMat);
  cabin.position.set(0, 0.95, -0.3);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), darkMat);
  wing.position.set(0, 1.05, -2);
  group.add(body, nose, cabin, wing);

  const wheelGeo = new THREE.BoxGeometry(0.5, 0.7, 0.9);
  for (const [wx, wz] of [[-1.15, 1.4], [1.15, 1.4], [-1.15, -1.5], [1.15, -1.5]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.35, wz);
    group.add(wheel);
  }
  return group;
}

function hoodWedge(color, nearW, farW, depth, drop) {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -nearW, 0, 0,    nearW, 0, 0,    farW, -drop, -depth,
    -nearW, 0, 0,    farW, -drop, -depth,    -farW, -drop, -depth,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
}

export function makeHood(def = { style: 'sedan', color: 0xc41111 }) {
  const hood = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: 0x17181c });

  if (def.style === 'open-wheel') {
    // narrow nose cone, front wing, exposed front wheels — no dashboard
    const nose = hoodWedge(def.color, 0.5, 0.22, 2.0, 0.3);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.35), new THREE.MeshBasicMaterial({ color: def.color }));
    wing.position.set(0, -0.34, -2.1);
    const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.35), dark);
    wingTipL.position.set(-0.95, -0.28, -2.1);
    const wingTipR = wingTipL.clone();
    wingTipR.position.x = 0.95;
    const wheelGeo = new THREE.BoxGeometry(0.4, 0.5, 0.8);
    const wheelL = new THREE.Mesh(wheelGeo, dark);
    wheelL.position.set(-1.05, -0.22, -1.7);
    const wheelR = wheelL.clone();
    wheelR.position.x = 0.95;
    hood.add(nose, wing, wingTipL, wingTipR, wheelL, wheelR);
    hood.position.set(0, -0.5, -0.9);
    return hood;
  }

  const depth = def.style === 'roadster' ? 1.9 : 1.5;
  const wedge = hoodWedge(def.color, 1.35, 0.85, depth, 0.22);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.4), dark);
  dash.position.set(0, -0.03, 0.25);
  hood.add(wedge, dash);
  if (def.style === 'sedan') {
    // subtle power bulge
    const bulge = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.05, 1.0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).offsetHSL(0, 0, -0.06) })
    );
    bulge.position.set(0, -0.08, -0.7);
    hood.add(bulge);
  }
  if (def.style === 'wagon') {
    // roof rail shadows at the view edges (subtle wagon-ness)
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.9), dark);
    railL.position.set(-1.3, -0.05, 0.1);
    const railR = railL.clone();
    railR.position.x = 1.3;
    hood.add(railL, railR);
  }
  hood.position.set(0, -0.62, -1.1);
  return hood;
}

export function buildScene(track) {
  const theme = track.theme || { sky: 0x63b1ff, grass: 0x3cb043, mountain: 0x7d8ca3, snow: true };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, 250, 900);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.1);
  sun.position.set(300, 400, 100);
  scene.add(sun);

  // terrain
  const terrain = new THREE.Mesh(
    new THREE.CircleGeometry(2500, 48),
    new THREE.MeshBasicMaterial({ color: theme.grass })
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.1;
  scene.add(terrain);

  // road
  scene.add(buildRoad(track));

  // mountains on the horizon (positions relative to track centroid ~ (130, -280))
  const mtn = new THREE.Color(theme.mountain);
  const mtnLight = mtn.clone().offsetHSL(0, 0, 0.05).getHex();
  const mtnDark = mtn.clone().offsetHSL(0, 0, -0.05).getHex();
  scene.add(makeMountain(900, -1200, 350, 260, theme.mountain, theme.snow));
  scene.add(makeMountain(400, -1500, 260, 140, mtnLight));
  scene.add(makeMountain(-800, -1000, 300, 150, mtnDark));
  scene.add(makeMountain(1200, -300, 280, 120, mtnLight));
  scene.add(makeMountain(-900, 300, 320, 170, theme.mountain));
  scene.add(makeMountain(300, 900, 300, 130, mtnLight));

  // billboards along the track
  const spread = [0.06, 0.14, 0.22, 0.31, 0.4, 0.48, 0.57, 0.66, 0.74, 0.83, 0.9, 0.97];
  spread.forEach((frac, i) => {
    const s = frac * track.length;
    const side = i % 2 ? -14 : 14;
    const { position, tangent } = worldPose(track, s, side);
    const bb = makeBillboard(BILLBOARD_TEXTS[i % BILLBOARD_TEXTS.length], BILLBOARD_BG[i % BILLBOARD_BG.length]);
    bb.position.copy(position);
    // face the road
    bb.lookAt(worldPose(track, s, 0).position.setY(position.y));
    scene.add(bb);
  });

  // start gantry + checkpoint arch
  scene.add(makeArch(track, 0, 0xdddddd, 'START'));
  scene.add(makeArch(track, track.checkpoints[1], 0xf2c522, 'CHECKPOINT'));

  // rival meshes
  const rivalMeshes = [];
  for (let i = 0; i < RIVAL_COLORS.length; i++) {
    const mesh = makeRivalCar(i);
    scene.add(mesh);
    rivalMeshes.push(mesh);
  }

  const _look = new THREE.Vector3();
  function updateRivals(cars) {
    for (let i = 0; i < rivalMeshes.length; i++) {
      const mesh = rivalMeshes[i];
      const car = cars[i];
      if (!car) { mesh.visible = false; continue; }
      mesh.visible = true;
      const { position, tangent } = worldPose(track, car.s, car.x);
      mesh.position.copy(position);
      _look.copy(position).add(tangent);
      mesh.lookAt(_look);
    }
  }

  return { scene, rivalMeshes, updateRivals };
}
