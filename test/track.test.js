import { describe, it, expect } from 'vitest';
import { TRACKS, createTrack, posAt, tangentAt, curvatureAt, worldPose, countTurns } from '../src/track.js';

describe('track roster', () => {
  it('has 11 tracks (3 originals + 8 famous circuits) with unique names and themes', () => {
    expect(TRACKS.length).toBe(11);
    const names = TRACKS.map(t => t.name);
    expect(new Set(names).size).toBe(TRACKS.length);
    for (const t of TRACKS) {
      expect(typeof t.name).toBe('string');
      expect(t.theme).toBeTruthy();
      expect(t.theme.sky).toBeDefined();
      expect(t.theme.grass).toBeDefined();
      expect(t.theme.mountain).toBeDefined();
    }
  });

  it('every track has a tagline and a sensible turn count', () => {
    for (let i = 0; i < TRACKS.length; i++) {
      expect(typeof TRACKS[i].tagline).toBe('string');
      const turns = countTurns(createTrack(i));
      // ovals legitimately have few distinct corners; the Nordschleife has many
      expect(turns, TRACKS[i].name).toBeGreaterThanOrEqual(2);
      expect(turns, TRACKS[i].name).toBeLessThanOrEqual(40);
    }
  });

  it('createTrack carries name, theme, and index', () => {
    const t1 = createTrack(1);
    expect(t1.name).toBe(TRACKS[1].name);
    expect(t1.theme).toBe(TRACKS[1].theme);
    expect(t1.index).toBe(1);
  });
});

for (let i = 0; i < TRACKS.length; i++) {
  describe(`track ${i} (${TRACKS[i].name})`, () => {
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
      expect(track.length).toBeLessThan(4500);
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

    it('minimum curve radius exceeds the road half-width (no ribbon folds or seam cusps)', () => {
      let maxK = 0;
      for (let s = 0; s < track.length; s += 2) maxK = Math.max(maxK, Math.abs(curvatureAt(track, s)));
      expect(1 / maxK, `min radius on ${track.name}`).toBeGreaterThan(11);
    });

    it('curvature integrates to ±2π around the loop (no figure-eights)', () => {
      let total = 0;
      const step = 2; // fine sampling so hairpins are not underestimated
      for (let s = 0; s < track.length; s += step) total += curvatureAt(track, s) * step;
      expect(Math.abs(Math.abs(total) - Math.PI * 2)).toBeLessThan(0.35);
    });
  });
}
