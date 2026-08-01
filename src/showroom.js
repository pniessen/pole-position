// Generates the selector artwork: studio "photos" of each car (rendered once
// with a shared offscreen WebGL renderer) and map thumbnails for each track.
import * as THREE from 'three';
import { makeCarModel } from './carmodels.js';
import { posAt } from './track.js';

const PHOTO_W = 400, PHOTO_H = 240;

export function renderCarPhotos(cars) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(PHOTO_W, PHOTO_H);
  const camera = new THREE.PerspectiveCamera(32, PHOTO_W / PHOTO_H, 0.1, 60);
  camera.position.set(5.2, 2.7, 5.8);
  camera.lookAt(0, 0.55, 0);

  const photos = cars.map((car) => {
    const scene = new THREE.Scene();
    // light studio backdrop so black paint still reads as a silhouette
    scene.background = new THREE.Color(0x9fa8b8);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbdd8ff, 1.0);
    rim.position.set(-5, 3, -4);
    scene.add(rim);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 48),
      new THREE.MeshBasicMaterial({ color: 0x6f7787 })
    );
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);
    const model = makeCarModel(car.hood.style, car.hood.color);
    model.rotation.y = Math.PI * 0.72; // three-quarter front view
    scene.add(model);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL();
    scene.traverse((o) => o.geometry?.dispose?.());
    return url;
  });

  renderer.dispose();
  return photos;
}

export function renderTrackThumb(track) {
  const w = PHOTO_W, h = PHOTO_H, pad = 26;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const theme = track.theme;
  const sky = '#' + new THREE.Color(theme.sky).getHexString();
  const grass = '#' + new THREE.Color(theme.grass).getHexString();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, sky);
  grad.addColorStop(0.45, sky);
  grad.addColorStop(0.46, grass);
  grad.addColorStop(1, '#' + new THREE.Color(theme.grass).offsetHSL(0, 0, -0.08).getHexString());
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // normalized track outline
  const n = 200;
  const pts = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = posAt(track, (i / n) * track.length);
    pts.push(p);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = (h - (maxZ - minZ) * scale) / 2 - minZ * scale;
  const xy = (p) => [p.x * scale + ox, p.z * scale + oz];

  ctx.beginPath();
  ctx.moveTo(...xy(pts[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(...xy(pts[i]));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 13;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#4c525c';
  ctx.stroke();
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#f2f2e0';
  ctx.stroke();
  ctx.setLineDash([]);

  // start/finish + checkpoint markers
  const dot = (p, color) => {
    const [x, y] = xy(p);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
  };
  dot(pts[0], '#ffffff');
  dot(pts[Math.floor(n / 2)], '#ffd21f');

  return canvas.toDataURL();
}
