export const CAR = {
  maxSpeed: 80, accel: 25, brakeDecel: 60, coastDecel: 8,
  offroadMax: 30, offroadDecel: 40, steerSpeed: 16,
  centrifugal: 0.18, crashDuration: 2,
};
export const ROAD_HALF_WIDTH = 6;

export function createCarState() {
  return { s: 0, x: 0, speed: 0, crashTimer: 0 };
}

export function isCrashed(car) { return car.crashTimer > 0; }
export function isOffroad(car) { return Math.abs(car.x) > ROAD_HALF_WIDTH; }

export function crashCar(car) {
  return { ...car, speed: 0, crashTimer: CAR.crashDuration };
}

export function stepCar(car, input, curvature, trackLength, dt) {
  const next = { ...car };
  if (next.crashTimer > 0) {
    next.crashTimer = Math.max(0, next.crashTimer - dt);
    return next;
  }
  // longitudinal
  if (input.brake) next.speed -= CAR.brakeDecel * dt;
  else if (input.throttle) next.speed += CAR.accel * dt;
  else next.speed -= CAR.coastDecel * dt;
  if (isOffroad(next) && next.speed > CAR.offroadMax) {
    next.speed = Math.max(CAR.offroadMax, car.speed - CAR.offroadDecel * dt);
  }
  next.speed = Math.min(CAR.maxSpeed, Math.max(0, next.speed));
  // lateral: steering scaled by speed fraction, centrifugal pushes outward
  const steerAmount = input.steer * CAR.steerSpeed * Math.min(1, next.speed / 30);
  const push = curvature * next.speed * next.speed * CAR.centrifugal;
  next.x += (steerAmount + push) * dt;
  next.x = Math.max(-ROAD_HALF_WIDTH * 2.5, Math.min(ROAD_HALF_WIDTH * 2.5, next.x));
  // advance along track
  next.s = (next.s + next.speed * dt) % trackLength;
  return next;
}
