import { describe, it, expect } from 'vitest';
import { TRACKS, createTrack, posAt, tangentAt, curvatureAt, worldPose } from '../src/track.js';

describe('track roster', () => {
  it('has 3 tracks with unique names and themes', () => {
    expect(TRACKS.length).toBe(3);
    const names = TRACKS.map(t => t.name);
    expect(new Set(names).size).toBe(3);
    for (const t of TRACKS) {
      expect(typeof t.name).toBe('string');
      expect(t.theme).toBeTruthy();
      expect(t.theme.sky).toBeDefined();
      expect(t.theme.grass).toBeDefined();
      expect(t.theme.mountain).toBeDefined();
    }
  });

  it('createTrack carries name, theme, and index', () => {
    const t1 = createTrack(1);
    expect(t1.name).toBe(TRACKS[1].name);
    expect(t1.theme).toBe(TRACKS[1].theme);
    expect(t1.index).toBe(1);
  });
});

for (let i = 0; i < 3; i++) {
  describe(`track ${i}`, () => {
    const track = createTrack(i);

    it('is a closed loop: posAt(0) ≈ posAt(length)', () => {
      const a = posAt(track, 0), b = posAt(track, track.length);
      expect(a.distanceTo(b)).toBeLessThan(0.5);
    });

    it('wraps s beyond length and below 0', () => {
      const a = posAt(track, 100), b = posAt(track, track.length + 100);
      expect(a.distanceTo(b)).toBeLessThan(0.5);
      const c = posAt(track, -50), d = posAt(track, track.length - 50);
      expect(c.distanceTo(d)).toBeLessThan(0.5);
    });

    it('has a plausible length', () => {
      expect(track.length).toBeGreaterThan(1400);
      expect(track.length).toBeLessThan(4000);
    });

    it('checkpoints at 0 and half distance', () => {
      expect(track.checkpoints).toEqual([0, track.length / 2]);
    });

    it('right vector is horizontal-ish and perpendicular to tangent', () => {
      const { tangent, right } = worldPose(track, 300, 0);
      expect(Math.abs(tangent.dot(right))).toBeLessThan(0.05);
      expect(Math.abs(right.y)).toBeLessThan(0.05);
      expect(right.length()).toBeCloseTo(1, 1);
    });

    it('worldPose offsets laterally by x', () => {
      const a = worldPose(track, 500, 0).position;
      const b = worldPose(track, 500, 6).position;
      expect(a.distanceTo(b)).toBeCloseTo(6, 0);
    });

    it('curvature integrates to ±2π around the loop', () => {
      let total = 0;
      const step = 5;
      for (let s = 0; s < track.length; s += step) total += curvatureAt(track, s) * step;
      expect(Math.abs(Math.abs(total) - Math.PI * 2)).toBeLessThan(0.3);
    });
  });
}
