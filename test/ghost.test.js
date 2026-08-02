import { describe, it, expect } from 'vitest';
import { GHOST_DT, createLapRecorder, recordLap, finishLap, sampleGhost } from '../src/ghost.js';

describe('ghost recorder', () => {
  it('samples at the fixed cadence regardless of frame rate', () => {
    const rec = createLapRecorder();
    for (let i = 0; i < 100; i++) recordLap(rec, 1 / 60, i * 2, 0.5);
    // 100 frames at 60fps ≈ 1.67s → ~16 samples
    expect(rec.samples.length).toBeGreaterThanOrEqual(15);
    expect(rec.samples.length).toBeLessThanOrEqual(18);
  });

  it('finishLap packages lapTime and samples', () => {
    const rec = createLapRecorder();
    recordLap(rec, GHOST_DT, 10, 1);
    recordLap(rec, GHOST_DT, 20, 2);
    const ghost = finishLap(rec, 42.5);
    expect(ghost.lapTime).toBe(42.5);
    expect(ghost.dt).toBe(GHOST_DT);
    expect(ghost.samples.length).toBe(2);
  });

  it('sampleGhost interpolates between samples and clamps at the ends', () => {
    const ghost = { lapTime: 0.3, dt: 0.1, samples: [[0, 0], [10, 1], [20, 2]] };
    expect(sampleGhost(ghost, 0).s).toBe(0);
    const mid = sampleGhost(ghost, 0.05);
    expect(mid.s).toBeCloseTo(5);
    expect(mid.x).toBeCloseTo(0.5);
    expect(sampleGhost(ghost, 99).s).toBe(20);
  });
});
