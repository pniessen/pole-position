import { describe, it, expect } from 'vitest';
import { TRAFFIC, createTraffic, updateTraffic, findCollision } from '../src/traffic.js';

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

  it('car changes lane to avoid a slower car directly ahead', () => {
    const cars = [
      { s: 100, x: 0, lane: 0, speed: 60, colorIndex: 0 },
      { s: 110, x: 0, lane: 0, speed: 50, colorIndex: 1 },
    ];
    updateTraffic(cars, 0.01, 100, L, rng);
    expect(cars[0].lane).not.toBe(0);
  });
});
