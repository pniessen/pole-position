// Showroom models built from extruded side-profile silhouettes with beveled
// edges and cylindrical wheels — one profile per style so each car keeps a
// recognizable shape without asset files.
import * as THREE from 'three';

// pts: [[z, y], ...] tracing the silhouette nose→roof→tail; closed along the
// bottom automatically. Extruded across the car's width with a soft bevel.
function extrudeProfile(pts, width, material, bevel = 0.05) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
  });
  // shape plane is (z=length, y=height); extrusion runs along world -x,
  // so shift by +half-width to center the body on the pedestal
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2 - bevel, 0, 0);
  const mesh = new THREE.Mesh(geo, material);
  return mesh;
}

function makeWheel(radius, width, dark) {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), dark);
  tire.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 12),
    new THREE.MeshLambertMaterial({ color: 0x8b9099 })
  );
  hub.rotation.z = Math.PI / 2;
  wheel.add(tire, hub);
  return wheel;
}

export function makeCarModel(style, color) {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2b3c50 });

  const addWheels = (positions, radius, width) => {
    for (const [x, z] of positions) {
      const w = makeWheel(radius, width, dark);
      w.position.set(x, radius, z);
      g.add(w);
    }
  };

  if (style === 'open-wheel') {
    const tub = extrudeProfile(
      [[2.0, 0.32], [1.4, 0.55], [0.2, 0.62], [-0.7, 0.85], [-1.5, 0.8], [-1.6, 0.25], [2.0, 0.22]],
      0.85, body, 0.04
    );
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 1.0, 10), body);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.42, 2.35);
    const fwing = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.06, 0.55), body);
    fwing.position.set(0, 0.22, 2.5);
    const rwing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 0.5), dark);
    rwing.position.set(0, 1.0, -1.65);
    const rwingPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.25), dark);
    rwingPost.position.set(0, 0.78, -1.6);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), dark);
    head.position.set(0, 0.92, -0.45);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 10), body);
    intake.position.set(0, 1.05, -1.0);
    const sidepodGeo = new THREE.BoxGeometry(0.5, 0.32, 1.5);
    const podL = new THREE.Mesh(sidepodGeo, body);
    podL.position.set(-0.62, 0.4, -0.3);
    const podR = podL.clone();
    podR.position.x = 0.62;
    addWheels([[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.25], [0.95, -1.25]], 0.42, 0.5);
    g.add(tub, nose, fwing, rwing, rwingPost, head, intake, podL, podR);
    return g;
  }

  // beltline body + separate glass canopy per style
  const PROFILES = {
    sedan: {
      width: 1.9,
      body: [[2.2, 0.34], [2.16, 0.74], [1.05, 0.88], [-1.6, 0.92], [-2.2, 0.82], [-2.2, 0.34]],
      canopy: [[0.85, 0.88], [0.45, 1.36], [-0.7, 1.4], [-1.35, 0.9]],
      canopyWidth: 1.68,
      wheels: { r: 0.36, w: 0.32, pos: [[-0.93, 1.42], [0.93, 1.42], [-0.93, -1.42], [0.93, -1.42]] },
    },
    wagon: {
      width: 1.9,
      body: [[2.2, 0.34], [2.15, 0.74], [1.05, 0.88], [-2.1, 0.92], [-2.2, 0.8], [-2.2, 0.34]],
      canopy: [[0.85, 0.88], [0.5, 1.38], [-1.95, 1.42], [-2.08, 0.9]],
      canopyWidth: 1.68,
      wheels: { r: 0.36, w: 0.32, pos: [[-0.93, 1.42], [0.93, 1.42], [-0.93, -1.42], [0.93, -1.42]] },
    },
    roadster: {
      width: 1.85,
      body: [[1.95, 0.3], [1.88, 0.66], [0.85, 0.8], [-1.35, 0.84], [-1.9, 0.72], [-1.9, 0.3]],
      canopy: [[0.6, 0.8], [0.38, 1.08], [0.05, 0.82]],
      canopyWidth: 1.5,
      wheels: { r: 0.35, w: 0.32, pos: [[-0.9, 1.25], [0.9, 1.25], [-0.9, -1.25], [0.9, -1.25]] },
    },
    suv: {
      width: 1.95,
      body: [[2.05, 0.42], [2.0, 0.98], [1.15, 1.12], [-1.95, 1.16], [-2.05, 0.95], [-2.05, 0.42]],
      canopy: [[0.9, 1.12], [0.6, 1.72], [-1.7, 1.76], [-1.92, 1.14]],
      canopyWidth: 1.72,
      wheels: { r: 0.42, w: 0.36, pos: [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]] },
    },
  };
  const p = PROFILES[style] ?? PROFILES.sedan;

  g.add(extrudeProfile(p.body, p.width, body));
  g.add(extrudeProfile(p.canopy, p.canopyWidth, glass, 0.04));
  addWheels(p.wheels.pos, p.wheels.r, p.wheels.w);

  if (style === 'sedan') {
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 1.05), body);
    roofCap.position.set(0, 1.41, -0.15);
    g.add(roofCap);
  }
  if (style === 'wagon') {
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 2.35), body);
    roofCap.position.set(0, 1.43, -0.75);
    const rails = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, 2.1), dark);
    rails.position.set(0, 1.49, -0.75);
    g.add(roofCap, rails);
  }
  if (style === 'roadster') {
    const hoopGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.36, 8);
    const hoopL = new THREE.Mesh(hoopGeo, dark);
    hoopL.position.set(-0.45, 1.0, -0.7);
    const hoopR = hoopL.clone();
    hoopR.position.x = 0.45;
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.15), dark);
    cockpit.position.set(0, 0.85, -0.35);
    g.add(hoopL, hoopR, cockpit);
  }
  if (style === 'suv') {
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 2.45), body);
    roofCap.position.set(0, 1.77, -0.5);
    const rails = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 2.2), dark);
    rails.position.set(0, 1.84, -0.5);
    const cladding = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 4.05), dark);
    cladding.position.y = 0.4;
    g.add(roofCap, rails, cladding);
  }
  return g;
}
