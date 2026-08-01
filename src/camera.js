import * as THREE from 'three';
import { worldPose, curvatureAt } from './track.js';
import { CAR, isCrashed, isOffroad } from './handling.js';

const EYE_HEIGHT = 1.15;
const LOOK_AHEAD = 14;
const BASE_FOV = 68;
const FOV_BOOST = 16;

export function createCamera() {
  return new THREE.PerspectiveCamera(BASE_FOV, (innerWidth || 1280) / (innerHeight || 720), 0.1, 4000);
}

const _look = new THREE.Vector3();

export function updateCamera(camera, track, car, dt, steer = 0) {
  const pose = worldPose(track, car.s, car.x);
  const eye = pose.position;
  eye.y += EYE_HEIGHT;

  // shake when offroad or near top speed
  const speedFrac = car.speed / CAR.maxSpeed;
  if (isOffroad(car) && car.speed > 1) {
    eye.y += (Math.random() - 0.5) * 0.09;
    eye.x += (Math.random() - 0.5) * 0.05;
    eye.z += (Math.random() - 0.5) * 0.05;
  } else if (speedFrac > 0.93) {
    eye.y += (Math.random() - 0.5) * 0.03;
  }

  camera.position.copy(eye);

  const ahead = worldPose(track, car.s + LOOK_AHEAD, car.x * 0.6);
  _look.copy(ahead.position);
  _look.y += 1;
  camera.lookAt(_look);

  if (isCrashed(car)) {
    // spin-out: lookAt has reset the pose, so apply total yaw for the
    // elapsed crash time (several full turns over the crash duration)
    camera.rotation.y += (CAR.crashDuration - car.crashTimer) * 6;
  } else {
    // lean into steering and curves
    const lean = -steer * 0.045 - curvatureAt(track, car.s) * car.speed * 0.06;
    camera.rotation.z += lean;
  }

  const targetFov = BASE_FOV + FOV_BOOST * speedFrac;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
}
