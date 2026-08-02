import { describe, it, expect } from 'vitest';
import { TRAFFIC, RACERS, createTraffic, updateTraffic, findCollision, draftFactor, createRacers, updateRacers, standings } from '../src/traffic.js';

const L = 2000;
const rng = () => 0.5;

describe('traffic', () => {
  it('creates count cars with valid lanes and speeds', () => {
    const cars = createTraffic(L, rng);
    expect(cars.length).toBe(TRAFFIC.count);
    for (const c of cars) {
      expect(Math.abs(c.lane)).toBeLessThanOrEqual(TRAFFIC.laneAbs);
      expect(c.speed).toBeGreaterThanOrEqual(80 * TRAFFIC.minSpeedFrac);
      expect(c.speed).toBeLessThanOrEqual(80 * TRAFFIC.maxSpeedFrac);
      expect(c.s).toBeGreaterThanOrEqual(0);
      expect(c.s).toBeLessThan(L);
    }
  });

  it('advances cars along the track with wrapping, keeps cars near ahead', () => {
    const cars = [{ s: 1990, x: 0, lane: 0, speed: 50, colorIndex: 0 }];
    updateTraffic(cars, 1, 0, L, rng);
    expect(cars[0].s).toBeCloseTo(40);
  });

  it('keeps a car that is just behind the player (no instant pop)', () => {
    const cars = [{ s: 1090, x: 0, lane: 0, speed: 0, colorIndex: 0 }];
    updateTraffic(cars, 0.01, 1100, L, rng);
    expect(cars[0].s).toBeCloseTo(1090, 0);
  });

  it('respawns cars that fall far behind the player', () => {
    const cars = [{ s: 0, x: 0, lane: 0, speed: 48, colorIndex: 0 }];
    updateTraffic(cars, 0.01, 1100, L, rng);
    const ahead = ((cars[0].s - 1100) % L + L) % L;
    expect(ahead).toBeGreaterThanOrEqual(TRAFFIC.respawnAheadMin);
    expect(ahead).toBeLessThanOrEqual(TRAFFIC.respawnAheadMax);
  });

  it('detects collision within thresholds only', () => {
    const player = { s: 100, x: 1 };
    const hit = [{ s: 102, x: 0.5, lane: 0, speed: 50, colorIndex: 0 }];
    const missLat = [{ s: 102, x: 4.5, lane: 0, speed: 50, colorIndex: 0 }];
    const missLong = [{ s: 120, x: 1, lane: 0, speed: 50, colorIndex: 0 }];
    expect(findCollision(player, hit, L)).toBe(hit[0]);
    expect(findCollision(player, missLat, L)).toBe(null);
    expect(findCollision(player, missLong, L)).toBe(null);
  });

  it('collision check wraps around start line', () => {
    const player = { s: 1999, x: 0 };
    const cars = [{ s: 1, x: 0, lane: 0, speed: 50, colorIndex: 0 }];
    expect(findCollision(player, cars, L)).toBe(cars[0]);
  });

  it('draftFactor peaks close behind a rival and fades with distance', () => {
    const cars = [{ s: 110, x: 0.5, lane: 0, speed: 50, colorIndex: 0 }];
    const close = draftFactor({ s: 104, x: 0 }, cars, 2000);
    const far = draftFactor({ s: 80, x: 0 }, cars, 2000);
    const offline = draftFactor({ s: 104, x: 4 }, cars, 2000);
    const behindRival = draftFactor({ s: 120, x: 0 }, cars, 2000);
    expect(close).toBeGreaterThan(0.7);
    expect(far).toBe(0);
    expect(offline).toBe(0);
    expect(behindRival).toBe(0);
  });

  it('car changes lane to avoid a slower car directly ahead', () => {
    const cars = [
      { s: 100, x: 0, lane: 0, speed: 60, colorIndex: 0 },
      { s: 110, x: 0, lane: 0, speed: 50, colorIndex: 1 },
    ];
    updateTraffic(cars, 0.01, 100, L, rng);
    expect(cars[0].lane).not.toBe(0);
  });
});

describe('racers (grand prix mode)', () => {
  it('creates a staggered grid ahead of the line, all on lap 1', () => {
    const racers = createRacers(L, 80, rng);
    expect(racers.length).toBe(RACERS.count);
    for (const r of racers) {
      expect(r.lap).toBe(1);
      expect(r.s).toBeGreaterThan(0);
      expect(r.s).toBeLessThan(100);
      expect(r.baseSpeed).toBeGreaterThanOrEqual(80 * RACERS.minFrac);
      expect(r.baseSpeed).toBeLessThanOrEqual(80 * RACERS.maxFrac);
    }
  });

  it('increments laps when racers cross the line and never respawns them', () => {
    const racers = [{ s: L - 30, x: 0, lane: 0, baseSpeed: 60, speed: 60, lap: 1, colorIndex: 0 }];
    updateRacers(racers, 1, 0, L, rng);
    expect(racers[0].lap).toBe(2);
    // far ahead of the player, so rubber-banding trims speed to 54 m/s
    expect(racers[0].s).toBeCloseTo(24, 0);
  });

  it('rubber-bands: trailing racers speed up, leading racers back off', () => {
    const behind = [{ s: 100, x: 0, lane: 0, baseSpeed: 70, speed: 70, lap: 1, colorIndex: 0 }];
    const ahead = [{ s: 900, x: 0, lane: 0, baseSpeed: 70, speed: 70, lap: 1, colorIndex: 0 }];
    const playerProgress = 500; // player at lap 1, s 500
    updateRacers(behind, 0.01, playerProgress, L, rng);
    updateRacers(ahead, 0.01, playerProgress, L, rng);
    expect(behind[0].speed).toBeGreaterThan(70);
    expect(ahead[0].speed).toBeLessThan(70);
    expect(behind[0].speed).toBeLessThanOrEqual(70 * (1 + RACERS.rubberBand) + 0.01);
  });

  it('standings ranks by lap and distance', () => {
    const racers = [
      { s: 600, lap: 1 }, // ahead of player on same lap
      { s: 300, lap: 2 }, // a lap up
      { s: 300, lap: 1 }, // behind player
    ];
    expect(standings(1, 500, racers, L)).toBe(3); // two racers ahead → P3
    expect(standings(2, 200, racers, L)).toBe(2); // only the lap-up car ahead
  });
});
