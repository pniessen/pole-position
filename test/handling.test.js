import { describe, it, expect } from 'vitest';
import { CAR, CARS, ROAD_HALF_WIDTH, createCarState, stepCar, crashCar, isCrashed, isOffroad } from '../src/handling.js';

const IDLE = { throttle: 0, brake: 0, steer: 0 };
const GAS = { throttle: 1, brake: 0, steer: 0 };

describe('car roster', () => {
  it('has 4 cars with unique names and complete specs', () => {
    expect(CARS.length).toBe(4);
    expect(new Set(CARS.map(c => c.name)).size).toBe(4);
    for (const c of CARS) {
      for (const key of ['maxSpeed', 'accel', 'steerSpeed', 'offroadMax', 'eyeHeight']) {
        expect(c.spec[key], `${c.name}.${key}`).toBeGreaterThan(0);
      }
      expect(c.hood).toBeTruthy();
    }
  });

  it('stepCar honors a per-car spec: F1 tops out above the base car', () => {
    const f1 = CARS.find(c => c.name.includes('F1')).spec;
    let car = createCarState();
    for (let i = 0; i < 100; i++) car = stepCar(car, GAS, 0, 100000, 1, f1);
    expect(car.speed).toBe(f1.maxSpeed);
    expect(f1.maxSpeed).toBeGreaterThan(CAR.maxSpeed);
  });

  it('stepCar honors offroadMax: AWD wagon keeps more speed on grass', () => {
    const wagon = CARS.find(c => c.name.includes('325xi')).spec;
    let a = { ...createCarState(), x: ROAD_HALF_WIDTH + 2, speed: wagon.maxSpeed };
    for (let i = 0; i < 10; i++) a = stepCar(a, GAS, 0, 100000, 1, wagon);
    expect(a.speed).toBe(wagon.offroadMax);
    expect(wagon.offroadMax).toBeGreaterThan(CAR.offroadMax);
  });
});

describe('stepCar', () => {
  it('accelerates under throttle up to maxSpeed', () => {
    let car = createCarState();
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBeCloseTo(CAR.accel);
    for (let i = 0; i < 100; i++) car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBe(CAR.maxSpeed);
  });

  it('coasts down without input and never goes below 0', () => {
    let car = { ...createCarState(), speed: 10 };
    car = stepCar(car, IDLE, 0, 10000, 1);
    expect(car.speed).toBeCloseTo(10 - CAR.coastDecel);
    car = stepCar(car, IDLE, 0, 10000, 1);
    expect(car.speed).toBe(0);
  });

  it('brakes harder than coasting', () => {
    const car = { ...createCarState(), speed: 70 };
    const braked = stepCar(car, { throttle: 0, brake: 1, steer: 0 }, 0, 10000, 1);
    expect(braked.speed).toBeCloseTo(70 - CAR.brakeDecel);
  });

  it('advances s by post-update speed*dt and wraps at trackLength', () => {
    let car = { ...createCarState(), s: 9990, speed: 20 };
    car = stepCar(car, IDLE, 0, 10000, 1);
    // post-update speed = 20 - coastDecel = 12; s = (9990 + 12) % 10000
    expect(car.s).toBeCloseTo(2);
  });

  it('steering moves x, scaled by speed', () => {
    let car = { ...createCarState(), speed: CAR.maxSpeed };
    car = stepCar(car, { throttle: 1, brake: 0, steer: 1 }, 0, 10000, 0.5);
    expect(car.x).toBeGreaterThan(0);
    const slow = stepCar({ ...createCarState(), speed: 10 }, { throttle: 0, brake: 0, steer: 1 }, 0, 10000, 0.5);
    expect(slow.x).toBeLessThan(car.x);
    expect(slow.x).toBeGreaterThan(0);
  });

  it('left curve (positive curvature) pushes car right (+x)', () => {
    let car = { ...createCarState(), speed: 60 };
    car = stepCar(car, GAS, 0.02, 10000, 0.5);
    expect(car.x).toBeGreaterThan(0);
  });

  it('offroad clamps speed toward offroadMax', () => {
    let car = { ...createCarState(), x: ROAD_HALF_WIDTH + 2, speed: CAR.maxSpeed };
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBeCloseTo(CAR.maxSpeed - CAR.offroadDecel);
    expect(isOffroad(car)).toBe(true);
  });

  it('offroad does not slow below offroadMax', () => {
    let car = { ...createCarState(), x: ROAD_HALF_WIDTH + 2, speed: CAR.offroadMax + 5 };
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBe(CAR.offroadMax);
  });

  it('crash freezes controls until timer expires', () => {
    let car = crashCar({ ...createCarState(), speed: 80 });
    expect(car.speed).toBe(0);
    expect(isCrashed(car)).toBe(true);
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBe(0); // no throttle while crashed
    expect(isCrashed(car)).toBe(true);
    car = stepCar(car, GAS, 0, 10000, 1.5); // timer expires
    expect(isCrashed(car)).toBe(false);
  });
});
