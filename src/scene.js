import * as THREE from 'three';
import { worldPose, posAt, tangentAt } from './track.js';
import { ROAD_HALF_WIDTH } from './handling.js';
import { makeSkyDome, makeClouds, makeBirds, makeBlimp, makeStartLights, makeGrandstands, makeProps, makeEnvironment } from './scenery.js';
import { makeCarModel } from './carmodels.js';

function jitter(n) {
  const x = Math.sin(n * 91.7 + 33.3) * 43758.5453;
  return x - Math.floor(x);
}

const ROADCOL = new THREE.Color(0x555a5e);
const RUMBLE_A = new THREE.Color(0xe01818);
const RUMBLE_B = new THREE.Color(0xffffff);
const LINE = new THREE.Color(0xf7f7e8);

export const RIVAL_COLORS = [0xff5533, 0xffcc22, 0x22ccff, 0xcc44ff, 0x44ff77, 0xff8844, 0x4488ff];

const BILLBOARD_TEXTS = ['THE DAD SHOW', 'TURBO', 'THE DAD SHOW', 'SPEED UP', 'THE DAD SHOW', 'GRIP+', 'NITRO COLA', '500 MPH RADIO'];
const BILLBOARD_BG = ['#1a56c4', '#d92222', '#e8a013', '#15881e', '#7722cc', '#0b0b0b', '#d92222', '#1a56c4'];

function buildRoad(track, theme, roadShade = 1) {
  // Non-indexed geometry with flat per-face colors: crisp retro segments,
  // no vertex-color bleeding between road, centerline, and rumble strips.
  const ROAD = ROADCOL.clone().multiplyScalar(roadShade);
  const RUM_A = RUMBLE_A.clone().multiplyScalar(Math.min(1, roadShade + 0.12));
  const RUM_B = RUMBLE_B.clone().multiplyScalar(Math.min(1, roadShade + 0.12));
  const CLINE = LINE.clone().multiplyScalar(Math.min(1, roadShade + 0.12));
  const step = 3;
  const half = ROAD_HALF_WIDTH;
  const rumble = half + 2.0;
  const n = Math.ceil(track.length / step);
  // columns: rumble | road | lane wear | road | centerline | road | lane wear | road | rumble
  const offs = [-rumble, -half, -4.6, -2.8, -0.3, 0.3, 2.8, 4.6, half, rumble];
  const WEAR_COLS = new Set([2, 6]);
  const CENTER_COL = 4;
  const positions = [], colors = [];

  const ringPos = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * track.length;
    const ring = [];
    for (let j = 0; j < offs.length; j++) {
      const { position } = worldPose(track, s, offs[j]);
      // curbs ridge up at their outer edge so the road still reads as a
      // red/white line when a bend is viewed edge-on across flat ground
      const dy = j === 0 || j === offs.length - 1 ? 0.22 : 0.05;
      ring.push([position.x, position.y + dy, position.z]);
    }
    ringPos.push(ring);
  }

  const scratch = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const s = (i / n) * track.length;
    const seg = Math.floor(s / 12) % 2;
    // arcade-style curbs: short red/white stripes, independent of the
    // centerline dash cycle
    const rumbleSeg = Math.floor(s / 6) % 2;
    // subtle patchiness so the asphalt doesn't read as one flat sheet
    const shade = 0.95 + jitter(i) * 0.08;
    for (let j = 0; j < offs.length - 1; j++) {
      const isRumble = j === 0 || j === offs.length - 2;
      let c;
      if (isRumble) c = rumbleSeg ? RUM_A : RUM_B;
      else if (j === CENTER_COL && seg) c = CLINE;
      else {
        scratch.copy(ROAD).multiplyScalar(shade * (WEAR_COLS.has(j) ? 0.86 : 1));
        c = scratch;
      }
      const a = ringPos[i][j], b = ringPos[i + 1][j];
      const d = ringPos[i][j + 1], e = ringPos[i + 1][j + 1];
      // two triangles: a,b,d and b,e,d
      positions.push(...a, ...b, ...d, ...b, ...e, ...d);
      for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
    }
  }

  // embankment skirts: walls from each road edge down to below the terrain,
  // so elevated sections read as earthworks instead of floating ribbons
  const dirt = new THREE.Color(theme?.grass ?? 0x3cb043).multiplyScalar(0.55);
  const dirtDark = dirt.clone().multiplyScalar(0.85);
  for (const j of [0, offs.length - 1]) {
    for (let i = 0; i < n; i++) {
      const a = ringPos[i][j], b = ringPos[i + 1][j];
      const a2 = [a[0], -0.4, a[2]], b2 = [b[0], -0.4, b[2]];
      positions.push(...a, ...a2, ...b, ...b, ...a2, ...b2);
      const c = i % 2 ? dirt : dirtDark;
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

// rivals reuse the refined showroom models, cycling body styles for variety
const RIVAL_STYLES = ['sedan', 'roadster', 'wagon', 'suv', 'open-wheel'];

export function makeRivalCar(colorIndex) {
  const color = RIVAL_COLORS[colorIndex % RIVAL_COLORS.length];
  return makeCarModel(RIVAL_STYLES[colorIndex % RIVAL_STYLES.length], color);
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

  // roadsters show a long hood; SUVs a short one that drops away quickly
  const depth = def.style === 'roadster' ? 1.9 : def.style === 'suv' ? 1.25 : 1.5;
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

// Resolves a track theme + its time-of-day/weather into concrete sky, fog,
// light, and road-shade values.
function atmosphere(theme) {
  const base = {
    sky: theme.sky, horizon: theme.horizon ?? theme.sky,
    fogNear: 280, fogFar: 1000,
    ambient: 0.85, ambientColor: 0xffffff, sunLight: 1.1, sunLightColor: 0xfff2cc,
    sunVisible: true, sunColor: theme.sunColor, sunSize: theme.sunSize,
    sunPos: undefined, stars: false, roadShade: 1,
  };
  if (theme.time === 'sunset') {
    return { ...base,
      sky: 0xc4653f, horizon: 0xffb36b, sunColor: 0xffc27a, sunSize: 95,
      sunPos: [1400, 260, -900], ambient: 0.7, ambientColor: 0xffd9b0,
      sunLight: 0.9, sunLightColor: 0xff9955, roadShade: 0.92,
    };
  }
  if (theme.time === 'night') {
    return { ...base,
      sky: 0x0c1226, horizon: 0x1c2c4e, sunVisible: false, stars: true,
      ambient: 0.5, ambientColor: 0xaabbff, sunLight: 0.45, sunLightColor: 0xbfd0ff,
      fogFar: 850, roadShade: 0.8,
    };
  }
  if (theme.weather === 'rain') {
    return { ...base,
      sky: 0x8b959e, horizon: 0xb4bcc4, sunVisible: false,
      ambient: 0.78, sunLight: 0.5, sunLightColor: 0xdde4ea,
      fogNear: 200, fogFar: 700, roadShade: 0.72,
    };
  }
  if (theme.weather === 'mist') {
    return { ...base,
      sky: 0xa9bdb4, horizon: 0xd3ded6, sunVisible: false,
      ambient: 0.82, sunLight: 0.6, fogNear: 120, fogFar: 520, roadShade: 0.9,
    };
  }
  return base;
}

export function buildScene(track) {
  const theme = track.theme || { sky: 0x63b1ff, grass: 0x3cb043, mountain: 0x7d8ca3, snow: true };
  const atmo = atmosphere(theme);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(atmo.horizon);
  scene.fog = new THREE.Fog(atmo.horizon, atmo.fogNear, atmo.fogFar);

  scene.add(new THREE.AmbientLight(atmo.ambientColor, atmo.ambient));
  const sun = new THREE.DirectionalLight(atmo.sunLightColor, atmo.sunLight);
  sun.position.set(300, 400, 100);
  scene.add(sun);

  scene.add(makeSkyDome(atmo));

  // terrain with subtle color patches (mowed-field feel)
  const terrainGeo = new THREE.CircleGeometry(2500, 64);
  {
    const pos = terrainGeo.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    const base = new THREE.Color(theme.grass);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const shade = 0.88 + jitter(i * 3.7) * 0.2;
      c.copy(base).multiplyScalar(shade);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.1;
  scene.add(terrain);

  // road
  scene.add(buildRoad(track, theme, atmo.roadShade));

  // surroundings matched to the track's character (forest, urban, stadium, …)
  scene.add(makeEnvironment(track, theme));

  // billboards along the track
  const spread = [0.06, 0.14, 0.22, 0.31, 0.4, 0.48, 0.57, 0.66, 0.74, 0.83, 0.9, 0.97];
  spread.forEach((frac, i) => {
    const s = frac * track.length;
    const side = i % 2 ? -14 : 14;
    const { position, tangent } = worldPose(track, s, side);
    const bb = makeBillboard(BILLBOARD_TEXTS[i % BILLBOARD_TEXTS.length], BILLBOARD_BG[i % BILLBOARD_BG.length]);
    bb.position.copy(position);
    bb.position.y = 0; // stand on the terrain, not at road elevation
    bb.lookAt(worldPose(track, s, 0).position.setY(0));
    scene.add(bb);
  });

  // start gantry + checkpoint arch
  scene.add(makeArch(track, 0, 0xdddddd, 'START'));
  scene.add(makeArch(track, track.checkpoints[1], 0xf2c522, 'CHECKPOINT'));

  // spectacle: sky traffic, grandstands, start lights, theme flora
  const startLights = makeStartLights(track);
  const cloudColor = atmo.stars ? 0x232c48 : atmo.sunVisible === false ? 0xc9ced4 : 0xffffff;
  scene.add(makeClouds(10, cloudColor), makeBirds(), makeBlimp(), startLights, makeGrandstands(track), makeProps(track, theme));

  // anything that registered a userData.update (clouds, birds, blimp,
  // grandstand flags/flashes…) gets ticked each frame
  const animated = [];
  scene.traverse((obj) => { if (obj.userData?.update) animated.push(obj); });

  function updateWorld(dt) {
    for (const obj of animated) obj.userData.update(dt);
  }

  const setStartLights = (state) => startLights.userData.setState(state);

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
      position.y += 0.05; // tires on the asphalt surface
      mesh.position.copy(position);
      _look.copy(position).add(tangent);
      mesh.lookAt(_look);
    }
  }

  return { scene, rivalMeshes, updateRivals, updateWorld, setStartLights };
}
