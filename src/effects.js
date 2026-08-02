// Transient visual effects: tire-mark decals and smoke puffs, pooled and
// recycled so there is zero allocation during play.
import * as THREE from 'three';

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(230,230,230,0.45)');
  grad.addColorStop(1, 'rgba(220,220,220,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createEffects(scene) {
  // --- skid decals ---
  const SKIDS = 150;
  const skidGeo = new THREE.PlaneGeometry(0.35, 2.4);
  skidGeo.rotateX(-Math.PI / 2); // flat on the ground, length along z
  const skids = [];
  for (let i = 0; i < SKIDS; i++) {
    const mesh = new THREE.Mesh(
      skidGeo,
      new THREE.MeshBasicMaterial({ color: 0x0b0c0e, transparent: true, opacity: 0, depthWrite: false })
    );
    mesh.visible = false;
    scene.add(mesh);
    skids.push({ mesh, life: 0 });
  }
  let skidIdx = 0;

  function addSkid(position, tangent) {
    const s = skids[skidIdx++ % SKIDS];
    s.mesh.position.copy(position);
    s.mesh.position.y += 0.08;
    s.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
    s.life = 5;
    s.mesh.visible = true;
  }

  // --- smoke puffs ---
  const SMOKES = 26;
  const tex = smokeTexture();
  const smokes = [];
  for (let i = 0; i < SMOKES; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })
    );
    sprite.visible = false;
    scene.add(sprite);
    smokes.push({ sprite, life: 0 });
  }
  let smokeIdx = 0;

  function addSmoke(position, size = 1.4) {
    const s = smokes[smokeIdx++ % SMOKES];
    s.sprite.position.copy(position);
    s.sprite.position.y += 0.6;
    s.sprite.scale.setScalar(size);
    s.baseSize = size;
    s.life = 1;
    s.sprite.visible = true;
  }

  function update(dt) {
    for (const s of skids) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.material.opacity = Math.min(0.4, Math.max(0, s.life) * 0.12);
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const s of smokes) {
      if (s.life <= 0) continue;
      s.life -= dt * 1.3;
      s.sprite.position.y += dt * 1.6;
      const grown = 1 + (1 - Math.max(0, s.life)) * 2.6;
      s.sprite.scale.setScalar(s.baseSize * grown);
      s.sprite.material.opacity = Math.max(0, s.life) * 0.55;
      if (s.life <= 0) s.sprite.visible = false;
    }
  }

  return { addSkid, addSmoke, update };
}
