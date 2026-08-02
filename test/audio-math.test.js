import { describe, it, expect } from 'vitest';
import {
  PITCH_STEPS, LEVEL_STEPS, RATE_MIN, RATE_MAX, GAIN_MIN, GAIN_MAX,
  quantizeStep, quantizePitch, quantizeLevel, rpmFrac,
  enginePlaybackRate, engineGainValue, engineWaveSamples,
  WSG_HARMONICS, RIVAL, wrappedDelta, rivalVoice,
} from '../src/audio-math.js';
import { GEARS, CARS } from '../src/handling.js';

describe('quantizers', () => {
  it('quantizeStep clamps and hits both endpoints', () => {
    expect(quantizeStep(-0.5, 64)).toBe(0);
    expect(quantizeStep(0, 64)).toBe(0);
    expect(quantizeStep(1, 64)).toBe(63);
    expect(quantizeStep(1.7, 64)).toBe(63);
  });

  it('quantizePitch produces exactly 64 distinct values over the sweep', () => {
    const seen = new Set();
    for (let i = 0; i <= 10000; i++) seen.add(quantizePitch(i / 10000));
    expect(seen.size).toBe(PITCH_STEPS);
  });

  it('quantizeLevel produces exactly 8 distinct values over the sweep', () => {
    const seen = new Set();
    for (let i = 0; i <= 10000; i++) seen.add(quantizeLevel(i / 10000));
    expect(seen.size).toBe(LEVEL_STEPS);
  });

  it('quantized values are monotonic stair-steps', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const q = quantizePitch(i / 100);
      expect(q).toBeGreaterThanOrEqual(prev);
      prev = q;
    }
    // a small change within one step does NOT move the pitch
    expect(quantizePitch(0.500)).toBe(quantizePitch(0.503));
  });
});

describe('rpmFrac', () => {
  it('is 0 at standstill and 1 at the gear cap', () => {
    expect(rpmFrac(0, 1, 80)).toBe(0);
    const cap1 = 80 * GEARS[0].cap;
    expect(rpmFrac(cap1, 1, 80)).toBe(1);
  });

  it('drops on upshift at the same speed (revs fall)', () => {
    const speed = 80 * GEARS[0].cap; // redline in 1st
    expect(rpmFrac(speed, 2, 80)).toBeLessThan(rpmFrac(speed, 1, 80));
  });

  it('clamps above the cap and tolerates missing gear', () => {
    expect(rpmFrac(999, 1, 80)).toBe(1);
    expect(rpmFrac(40, undefined, 80)).toBeCloseTo(0.5, 5); // defaults to top gear
  });
});

describe('enginePlaybackRate', () => {
  it('spans RATE_MIN..RATE_MAX', () => {
    expect(enginePlaybackRate(0)).toBe(RATE_MIN);
    expect(enginePlaybackRate(1)).toBe(RATE_MAX);
  });

  it('scales by per-car base pitch (F1 higher than SUV)', () => {
    expect(enginePlaybackRate(0.5, 1.3)).toBeGreaterThan(enginePlaybackRate(0.5, 0.8));
    expect(enginePlaybackRate(0.5, 2)).toBeCloseTo(2 * enginePlaybackRate(0.5, 1), 10);
  });
});

describe('engineGainValue', () => {
  it('is silent when stopped and steps through 8 levels', () => {
    expect(engineGainValue(0, 0)).toBe(0);
    expect(engineGainValue(0.4, 1)).toBe(0);
    const seen = new Set();
    for (let i = 0; i <= 1000; i++) seen.add(engineGainValue(10, i / 1000));
    expect(seen.size).toBe(LEVEL_STEPS);
    expect(Math.min(...seen)).toBeCloseTo(GAIN_MIN, 10);
    expect(Math.max(...seen)).toBeCloseTo(GAIN_MAX, 10);
  });
});

describe('engineWaveSamples', () => {
  it('returns the requested length within [-1, 1]', () => {
    const w = engineWaveSamples(64);
    expect(w.length).toBe(64);
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is 4-bit quantized: at most 16 distinct amplitude levels', () => {
    const w = engineWaveSamples(512);
    expect(new Set(w).size).toBeLessThanOrEqual(16);
    expect(new Set(w).size).toBeGreaterThan(4); // but not degenerate
  });

  it('is harmonically rich, not a flat or single-step wave', () => {
    const w = engineWaveSamples(256);
    // more sign-structure than a plain square: several rising/falling runs
    let changes = 0;
    for (let i = 1; i < w.length; i++) if (w[i] !== w[i - 1]) changes++;
    expect(changes).toBeGreaterThan(20);
  });
});

describe('WSG_HARMONICS', () => {
  it('is fundamental-led with odd harmonics dominating (square-ish organ)', () => {
    expect(WSG_HARMONICS[0]).toBe(1);
    expect(WSG_HARMONICS[2]).toBeGreaterThan(WSG_HARMONICS[1]); // 3rd > 2nd
    expect(WSG_HARMONICS[4]).toBeGreaterThan(WSG_HARMONICS[3]); // 5th > 4th
  });
});

describe('wrappedDelta', () => {
  it('measures the short way around the loop, signed', () => {
    expect(wrappedDelta(10, 30, 1000)).toBe(20);
    expect(wrappedDelta(990, 10, 1000)).toBe(20);   // across the line, ahead
    expect(wrappedDelta(10, 990, 1000)).toBe(-20);  // across the line, behind
  });
});

describe('rivalVoice', () => {
  const player = { s: 100, x: 0 };

  it('is silent with no cars or all cars out of range', () => {
    expect(rivalVoice(player, [], 1000, 80).gain).toBe(0);
    const far = [{ s: 500, x: 0, speed: 60 }];
    expect(rivalVoice(player, far, 1000, 80).gain).toBe(0);
  });

  it('gets louder as the nearest rival gets closer', () => {
    const near = rivalVoice(player, [{ s: 110, x: 0, speed: 60 }], 1000, 80);
    const nearer = rivalVoice(player, [{ s: 103, x: 0, speed: 60 }], 1000, 80);
    expect(nearer.gain).toBeGreaterThan(near.gain);
    expect(near.gain).toBeGreaterThan(0);
    expect(nearer.gain).toBeLessThanOrEqual(RIVAL.gainMax);
  });

  it('picks the nearest car when several are around', () => {
    const cars = [
      { s: 140, x: 0, speed: 40 },
      { s: 105, x: 1, speed: 70 },
    ];
    const v = rivalVoice(player, cars, 1000, 80);
    // nearest car is the fast one → pitch near the top of the range
    expect(v.rate).toBeGreaterThan(enginePlaybackRate(0.5));
  });

  it('pans by lateral offset relative to the player', () => {
    const right = rivalVoice(player, [{ s: 104, x: 4, speed: 60 }], 1000, 80);
    const left = rivalVoice({ s: 100, x: 4 }, [{ s: 104, x: -3, speed: 60 }], 1000, 80);
    expect(right.pan).toBeGreaterThan(0);
    expect(left.pan).toBeLessThan(0);
    expect(Math.abs(right.pan)).toBeLessThanOrEqual(1);
  });

  it('maps rival speed to playback rate within the engine range', () => {
    const slow = rivalVoice(player, [{ s: 104, x: 0, speed: 0 }], 1000, 80);
    const fast = rivalVoice(player, [{ s: 104, x: 0, speed: 80 }], 1000, 80);
    expect(slow.rate).toBe(RATE_MIN);
    expect(fast.rate).toBe(RATE_MAX);
  });
});

describe('per-car engine pitch hints', () => {
  it('every car carries an enginePitch, F1 highest and SUV lowest', () => {
    for (const c of CARS) expect(c.enginePitch).toBeGreaterThan(0);
    const pitches = CARS.map((c) => c.enginePitch);
    const f1 = CARS.find((c) => c.name.includes('F1')).enginePitch;
    const suv = CARS.find((c) => c.name.includes('RAV4')).enginePitch;
    expect(f1).toBe(Math.max(...pitches));
    expect(suv).toBe(Math.min(...pitches));
  });
});
