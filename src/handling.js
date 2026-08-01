export const CAR = {
  maxSpeed: 80, accel: 25, brakeDecel: 60, coastDecel: 8,
  offroadMax: 30, offroadDecel: 40, steerSpeed: 16,
  centrifugal: 0.18, crashDuration: 2, eyeHeight: 1.15,
};
export const ROAD_HALF_WIDTH = 7.5;

// Selectable cars: spec overrides the base CAR physics; hood describes the
// first-person view built by scene.js.
export const CARS = [
  {
    name: 'E60 M5',
    desc: 'V10 sedan — top speed monster',
    spec: { ...CAR, maxSpeed: 82, accel: 27, steerSpeed: 15, offroadMax: 28 },
    hood: { style: 'sedan', color: 0x23262e },
  },
  {
    name: 'E85 Z4 M',
    desc: 'Roadster — quickest hands',
    spec: { ...CAR, maxSpeed: 78, accel: 26, steerSpeed: 18.5, offroadMax: 28, eyeHeight: 1.0 },
    hood: { style: 'roadster', color: 0x1d2028 },
  },
  {
    name: 'E46 325xi Wagon',
    desc: 'AWD estate — unstoppable on grass',
    spec: { ...CAR, maxSpeed: 70, accel: 20, steerSpeed: 15, offroadMax: 45, offroadDecel: 25 },
    hood: { style: 'wagon', color: 0xb31414 },
  },
  {
    name: 'Classic F1',
    desc: 'Open wheels — fast and fragile',
    spec: { ...CAR, maxSpeed: 88, accel: 32, steerSpeed: 17, offroadMax: 20, offroadDecel: 60, eyeHeight: 0.85 },
    hood: { style: 'open-wheel', color: 0xf2f2f2 },
  },
];

export function createCarState() {
  return { s: 0, x: 0, speed: 0, crashTimer: 0 };
}

export function isCrashed(car) { return car.crashTimer > 0; }
export function isOffroad(car) { return Math.abs(car.x) > ROAD_HALF_WIDTH; }

export function crashCar(car) {
  return { ...car, speed: 0, crashTimer: CAR.crashDuration };
}

export function stepCar(car, input, curvature, trackLength, dt, spec = CAR) {
  const next = { ...car };
  if (next.crashTimer > 0) {
    next.crashTimer = Math.max(0, next.crashTimer - dt);
    return next;
  }
  // longitudinal
  if (input.brake) next.speed -= spec.brakeDecel * dt;
  else if (input.throttle) next.speed += spec.accel * dt;
  else next.speed -= spec.coastDecel * dt;
  if (isOffroad(next) && next.speed > spec.offroadMax) {
    next.speed = Math.max(spec.offroadMax, car.speed - spec.offroadDecel * dt);
  }
  next.speed = Math.min(spec.maxSpeed, Math.max(0, next.speed));
  // lateral: steering scaled by speed fraction, centrifugal pushes outward
  const steerAmount = input.steer * spec.steerSpeed * Math.min(1, next.speed / 30);
  const push = curvature * next.speed * next.speed * spec.centrifugal;
  next.x += (steerAmount + push) * dt;
  next.x = Math.max(-ROAD_HALF_WIDTH * 2.5, Math.min(ROAD_HALF_WIDTH * 2.5, next.x));
  // advance along track
  next.s = (next.s + next.speed * dt) % trackLength;
  return next;
}
