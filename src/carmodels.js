// Full 3D showroom models for the selectable cars. Box-built, one silhouette
// per hood style so each car reads instantly in the selector.
import * as THREE from 'three';

export function makeCarModel(style, color) {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2b3c50 });

  const addWheels = (positions, geo) => {
    for (const [x, z] of positions) {
      const w = new THREE.Mesh(geo, dark);
      w.position.set(x, 0.35, z);
      g.add(w);
    }
  };

  if (style === 'open-wheel') {
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 3.2), body);
    tub.position.y = 0.5;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 1.3), body);
    nose.position.set(0, 0.45, 2.1);
    const fwing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.55), body);
    fwing.position.set(0, 0.22, 2.55);
    const rwing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.55), dark);
    rwing.position.set(0, 1.0, -1.65);
    const rwingPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.3), dark);
    rwingPost.position.set(0, 0.78, -1.6);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), dark);
    head.position.set(0, 0.92, -0.5);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.9), body);
    intake.position.set(0, 0.95, -1.05);
    addWheels(
      [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.25], [0.95, -1.25]],
      new THREE.BoxGeometry(0.55, 0.75, 0.95)
    );
    g.add(tub, nose, fwing, rwing, rwingPost, head, intake);
    return g;
  }

  const isWagon = style === 'wagon';
  const isRoadster = style === 'roadster';
  const bodyLen = isRoadster ? 3.7 : 4.4;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, bodyLen), body);
  shell.position.y = 0.52;
  g.add(shell);

  if (isRoadster) {
    // open cockpit: windshield strip + twin roll hoops, no roof
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.1), glass);
    screen.position.set(0, 1.0, 0.55);
    screen.rotation.x = -0.25;
    const hoopGeo = new THREE.BoxGeometry(0.18, 0.35, 0.18);
    const hoopL = new THREE.Mesh(hoopGeo, dark);
    hoopL.position.set(-0.5, 1.0, -0.75);
    const hoopR = hoopL.clone();
    hoopR.position.x = 0.5;
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.3), dark);
    cockpit.position.set(0, 0.85, -0.1);
    g.add(screen, hoopL, hoopR, cockpit);
  } else if (isWagon) {
    // long roof running all the way to the tail
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 2.9), glass);
    cabin.position.set(0, 1.1, -0.65);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 3.0), body);
    roof.position.set(0, 1.45, -0.65);
    const rails = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 2.6), dark);
    rails.position.set(0, 1.53, -0.65);
    g.add(cabin, roof, rails);
  } else {
    // sedan: classic three-box
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.9), glass);
    cabin.position.set(0, 1.05, -0.25);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 1.95), body);
    roof.position.set(0, 1.36, -0.25);
    g.add(cabin, roof);
  }

  addWheels(
    [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]],
    new THREE.BoxGeometry(0.5, 0.7, 0.9)
  );
  return g;
}
