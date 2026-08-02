import { describe, it, expect } from 'vitest';
import { CAR, CARS, GEARS, ROAD_HALF_WIDTH, createCarState, stepCar, crashCar, isCrashed, isOffroad, shiftGear, shiftAdvice, weatherSpec } from '../src/handling.js';

const IDLE = { throttle: 0, brake: 0, steer: 0 };
const GAS = { throttle: 1, brake: 0, steer: 0 };

describe('car roster', () => {
  it('has 6 cars with unique names and complete specs', () => {
    expect(CARS.length).toBe(6);
    expect(new Set(CARS.map(c => c.name)).size).toBe(6);
    for (const c of CARS) {
      for (const key of ['maxSpeed', 'accel', 'steerSpeed', 'offroadMax', 'eyeHeight']) {
        expect(c.spec[key], `${c.name}.${key}`).toBeGreaterThan(0);
      }
      expect(c.hood).toBeTruthy();
    }
  });

  it('stepCar honors a per-car spec: F1 tops out above the base car', () => {
    const f1 = CARS.find(c => c.name.includes('F1')).spec;
    let car = { ...createCarState(), gear: 4 };
    for (let i = 0; i < 100; i++) car = stepCar(car, GAS, 0, 100000, 1, f1);
    expect(car.speed).toBe(f1.maxSpeed);
    expect(f1.maxSpeed).toBeGreaterThan(CAR.maxSpeed);
  });

  it('stepCar honors offroadMax: AWD wagon keeps more speed on grass', () => {
    const wagon = CARS.find(c => c.name.includes('325xi')).spec;
    let a = { ...createCarState(), gear: 4, x: ROAD_HALF_WIDTH + 2, speed: wagon.maxSpeed };
    for (let i = 0; i < 10; i++) a = stepCar(a, GAS, 0, 100000, 1, wagon);
    expect(a.speed).toBe(wagon.offroadMax);
    expect(wagon.offroadMax).toBeGreaterThan(CAR.offroadMax);
  });
});

describe('stepCar', () => {
  it('accelerates under throttle up to maxSpeed in top gear', () => {
    let car = { ...createCarState(), gear: 4 };
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBeCloseTo(CAR.accel * 0.9); // 4th gear accel multiplier
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
    let car = { ...createCarState(), gear: 4, x: ROAD_HALF_WIDTH + 2, speed: CAR.offroadMax + 5 };
    car = stepCar(car, GAS, 0, 10000, 1);
    expect(car.speed).toBe(CAR.offroadMax);
  });

  it('gearbox: 4 gears with rising speed caps up to 100%', () => {
    expect(GEARS.length).toBe(4);
    for (let i = 1; i < 4; i++) expect(GEARS[i].cap).toBeGreaterThan(GEARS[i - 1].cap);
    expect(GEARS[3].cap).toBe(1);
  });

  it('cars start in 1st and shiftGear clamps to 1..4', () => {
    const car = createCarState();
    expect(car.gear).toBe(1);
    expect(shiftGear(car, 3).gear).toBe(3);
    expect(shiftGear(car, 0).gear).toBe(1);
    expect(shiftGear(car, 9).gear).toBe(4);
  });

  it('each gear caps speed at its fraction of maxSpeed', () => {
    let car = { ...createCarState(), gear: 1 };
    for (let i = 0; i < 60; i++) car = stepCar(car, GAS, 0, 100000, 1);
    expect(car.speed).toBeCloseTo(CAR.maxSpeed * GEARS[0].cap);
    car = shiftGear(car, 4);
    for (let i = 0; i < 60; i++) car = stepCar(car, GAS, 0, 100000, 1);
    expect(car.speed).toBe(CAR.maxSpeed);
  });

  it('low gears accelerate harder from a standstill', () => {
    const first = stepCar({ ...createCarState(), gear: 1 }, GAS, 0, 100000, 0.5);
    const fourth = stepCar({ ...createCarState(), gear: 4 }, GAS, 0, 100000, 0.5);
    expect(first.speed).toBeGreaterThan(fourth.speed);
  });

  it('downshifting at speed drags the car back to the gear cap', () => {
    let car = { ...createCarState(), gear: 4, speed: CAR.maxSpeed };
    car = shiftGear(car, 2);
    for (let i = 0; i < 60; i++) car = stepCar(car, GAS, 0, 100000, 1);
    expect(car.speed).toBeCloseTo(CAR.maxSpeed * GEARS[1].cap);
  });

  it('shiftAdvice: up at the limiter, down when lugging, null otherwise', () => {
    // pinned at 1st gear cap → upshift
    expect(shiftAdvice({ ...createCarState(), gear: 1, speed: CAR.maxSpeed * GEARS[0].cap })).toBe('up');
    // 4th gear at low speed → downshift pulls harder
    expect(shiftAdvice({ ...createCarState(), gear: 4, speed: 30 })).toBe('down');
    // mid-band in 2nd → no advice
    expect(shiftAdvice({ ...createCarState(), gear: 2, speed: CAR.maxSpeed * 0.5 })).toBe(null);
    // at the 4th gear cap → nothing above to shift to
    expect(shiftAdvice({ ...createCarState(), gear: 4, speed: CAR.maxSpeed })).toBe(null);
    // 1st gear standstill → nothing below
    expect(shiftAdvice({ ...createCarState(), gear: 1, speed: 0 })).toBe(null);
  });

  it('weatherSpec: rain cuts grip and braking, clear is untouched', () => {
    const wet = weatherSpec(CAR, 'rain');
    expect(wet.centrifugal).toBeGreaterThan(CAR.centrifugal);
    expect(wet.brakeDecel).toBeLessThan(CAR.brakeDecel);
    expect(weatherSpec(CAR, undefined)).toBe(CAR);
    expect(weatherSpec(CAR, 'mist')).toBe(CAR);
  });

  it('Lotus Elise has the best handling in the roster', () => {
    const elise = CARS.find(c => c.name.includes('Elise'));
    expect(elise).toBeTruthy();
    for (const c of CARS) {
      if (c !== elise) expect(elise.spec.steerSpeed).toBeGreaterThan(c.spec.steerSpeed);
    }
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
