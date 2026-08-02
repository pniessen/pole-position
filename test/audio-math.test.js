import { describe, it, expect } from 'vitest';
import {
  RATE_MIN, RATE_MAX, GAIN_MIN, GAIN_MAX, OFF_THROTTLE_GAIN,
  rpmFrac, enginePlaybackRate, engineGainValue,
  PULSE, PULSE_SECONDS, firingPulseSamples, ENGINE_LAYERS,
  CUTOFF, engineCutoff, WIND, windGain, FLUTTER, flutterStep,
  BURBLE, burbleBursts, SHIFT_DIP,
  WSG_HARMONICS, RIVAL, wrappedDelta, rivalVoice, countdownTone,
} from '../src/audio-math.js';
import { GEARS, CARS } from '../src/handling.js';

// Deterministic RNG so buffer-generation tests are reproducible.
function lcg(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// RMS of one pulse-width window, used to probe the pulse train's regularity.
function windowRms(samples, start, width) {
  let sum = 0;
  for (let i = 0; i < width; i++) {
    const v = samples[(start + i) % samples.length];
    sum += v * v;
  }
  return Math.sqrt(sum / width);
}

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

  it('rises continuously — no stair-steps within the sweep', () => {
    const seen = new Set();
    for (let i = 0; i <= 500; i++) seen.add(enginePlaybackRate(i / 500));
    expect(seen.size).toBe(501); // every input moves the pitch
  });

  it('scales by per-car base pitch (F1 higher than SUV)', () => {
    expect(enginePlaybackRate(0.5, 1.3)).toBeGreaterThan(enginePlaybackRate(0.5, 0.8));
    expect(enginePlaybackRate(0.5, 2)).toBeCloseTo(2 * enginePlaybackRate(0.5, 1), 10);
  });
});

describe('engineGainValue', () => {
  it('is silent when stopped', () => {
    expect(engineGainValue(0, 0, 1)).toBe(0);
    expect(engineGainValue(0.4, 1, 1)).toBe(0);
  });

  it('rises smoothly with revs across GAIN_MIN..GAIN_MAX', () => {
    expect(engineGainValue(10, 0, 1)).toBeCloseTo(GAIN_MIN, 10);
    expect(engineGainValue(10, 1, 1)).toBeCloseTo(GAIN_MAX, 10);
    const seen = new Set();
    for (let i = 0; i <= 500; i++) seen.add(engineGainValue(10, i / 500, 1));
    expect(seen.size).toBe(501);
  });

  it('backs off when the driver lifts', () => {
    const on = engineGainValue(30, 0.8, 1);
    const off = engineGainValue(30, 0.8, 0);
    expect(off).toBeLessThan(on);
    expect(off).toBeCloseTo(on * OFF_THROTTLE_GAIN, 10);
  });
});

describe('firingPulseSamples', () => {
  const LEN = 1024;
  const PULSES = 64;
  const spacing = LEN / PULSES;

  it('returns the requested length, normalized into [-1, 1]', () => {
    const w = firingPulseSamples(LEN, { pulses: PULSES }, lcg(7));
    expect(w.length).toBe(LEN);
    let peak = 0;
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeCloseTo(1, 6); // normalized to full scale
  });

  it('is deterministic for a given RNG', () => {
    const a = firingPulseSamples(LEN, { pulses: PULSES }, lcg(42));
    const b = firingPulseSamples(LEN, { pulses: PULSES }, lcg(42));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('carries no DC offset', () => {
    const w = firingPulseSamples(LEN, { pulses: PULSES }, lcg(3));
    const mean = w.reduce((a, v) => a + v, 0) / w.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  it('lopes on a 4-pulse bank pattern: even without jitter, adjacent pulses differ', () => {
    const w = firingPulseSamples(LEN, { pulses: PULSES, jitter: 0 }, lcg(1));
    const rms = (i) => windowRms(w, i * spacing, spacing);
    // consecutive pulses are unequal (the uneven-firing rumble)...
    expect(Math.abs(rms(0) - rms(1))).toBeGreaterThan(1e-3);
    // ...but the pattern repeats every 4 pulses exactly
    for (let i = 0; i < 8; i++) expect(rms(i)).toBeCloseTo(rms(i + 4), 6);
  });

  it('jitter breaks the 4-pulse repeat — this is what stops it sounding looped', () => {
    const w = firingPulseSamples(LEN, { pulses: PULSES, jitter: 0.3 }, lcg(9));
    const rms = (i) => windowRms(w, i * spacing, spacing);
    let differing = 0;
    for (let i = 0; i < 16; i++) if (Math.abs(rms(i) - rms(i + 4)) > 1e-3) differing++;
    expect(differing).toBeGreaterThan(12);
  });

  it('ships defaults that give a plausible engine firing rate', () => {
    const hz = PULSE.pulses / PULSE_SECONDS;
    expect(hz).toBeGreaterThan(120); // idles low but not sub-audio
    expect(hz).toBeLessThan(260);
    // and the full pitch sweep lands in race-engine territory
    expect(hz * RATE_MIN).toBeGreaterThan(60);
    expect(hz * RATE_MAX).toBeLessThan(600);
  });
});

describe('ENGINE_LAYERS', () => {
  it('stacks three copies, one at unity, the others detuned a few cents', () => {
    expect(ENGINE_LAYERS).toHaveLength(3);
    expect(ENGINE_LAYERS[0].detune).toBe(1);
    for (const L of ENGINE_LAYERS) {
      expect(Math.abs(L.detune - 1)).toBeLessThan(0.02); // beating, not chorus
      expect(L.gain).toBeGreaterThan(0);
      expect(L.gain).toBeLessThanOrEqual(1);
      expect(L.offset).toBeGreaterThanOrEqual(0);
      expect(L.offset).toBeLessThan(1);
    }
  });

  it('detunes both up and down, and starts each layer elsewhere in the loop', () => {
    const detunes = ENGINE_LAYERS.map((L) => L.detune);
    expect(Math.max(...detunes)).toBeGreaterThan(1);
    expect(Math.min(...detunes)).toBeLessThan(1);
    expect(new Set(ENGINE_LAYERS.map((L) => L.offset)).size).toBe(3);
  });
});

describe('engineCutoff', () => {
  it('opens up with revs', () => {
    expect(engineCutoff(0, 1)).toBeCloseTo(CUTOFF.min, 6);
    expect(engineCutoff(1, 1)).toBeCloseTo(CUTOFF.max, 6);
    expect(engineCutoff(0.7, 1)).toBeGreaterThan(engineCutoff(0.3, 1));
  });

  it('is brighter on throttle than on the overrun at the same revs', () => {
    expect(engineCutoff(0.8, 1)).toBeGreaterThan(engineCutoff(0.8, 0));
    expect(engineCutoff(0.8, 0)).toBeGreaterThan(CUTOFF.min); // still audible, just dark
  });

  it('stays within the filter range for any input', () => {
    for (const f of [-1, 0, 0.5, 1, 2]) {
      for (const th of [-1, 0, 0.5, 1, 2]) {
        const c = engineCutoff(f, th);
        expect(c).toBeGreaterThanOrEqual(CUTOFF.min);
        expect(c).toBeLessThanOrEqual(CUTOFF.max);
      }
    }
  });
});

describe('windGain', () => {
  it('is silent at rest and loudest flat out', () => {
    expect(windGain(0, 80)).toBe(0);
    expect(windGain(80, 80)).toBeCloseTo(WIND.max, 10);
  });

  it('grows faster than linearly, so speed reads as speed', () => {
    expect(windGain(40, 80)).toBeLessThan(WIND.max / 2);
    expect(windGain(40, 80)).toBeGreaterThan(0);
  });

  it('clamps and survives a zero max speed', () => {
    expect(windGain(200, 80)).toBeCloseTo(WIND.max, 10);
    expect(windGain(10, 0)).toBe(0);
  });

  it('sits under the engine rather than over it', () => {
    expect(WIND.max).toBeLessThan(GAIN_MIN);
  });
});

describe('flutterStep', () => {
  it('starts from nothing and stays a gentle wobble', () => {
    const rand = lcg(11);
    let state;
    let minP = Infinity; let maxP = -Infinity;
    for (let i = 0; i < 5000; i++) {
      state = flutterStep(state, rand);
      expect(state.pitchMul).toBeGreaterThan(1 - FLUTTER.pitchDepth - 1e-9);
      expect(state.pitchMul).toBeLessThan(1 + FLUTTER.pitchDepth + 1e-9);
      expect(state.gainMul).toBeGreaterThan(1 - FLUTTER.gainDepth - 1e-9);
      expect(state.gainMul).toBeLessThan(1 + FLUTTER.gainDepth + 1e-9);
      minP = Math.min(minP, state.pitchMul);
      maxP = Math.max(maxP, state.pitchMul);
    }
    // it actually wanders — a frozen tone is the bug we're fixing
    expect(maxP - minP).toBeGreaterThan(FLUTTER.pitchDepth);
  });

  it('wanders rather than jumping: successive values stay correlated', () => {
    const rand = lcg(5);
    let state = flutterStep(undefined, rand);
    const series = [];
    for (let i = 0; i < 4000; i++) {
      state = flutterStep(state, rand);
      series.push(state.p);
    }
    const mean = series.reduce((a, v) => a + v, 0) / series.length;
    let cov = 0; let varr = 0;
    for (let i = 1; i < series.length; i++) {
      cov += (series[i] - mean) * (series[i - 1] - mean);
      varr += (series[i - 1] - mean) ** 2;
    }
    expect(cov / varr).toBeGreaterThan(0.8); // smooth drift, not white noise
  });

  it('is imperceptible per-frame but never dead still', () => {
    expect(FLUTTER.pitchDepth).toBeLessThan(0.02);
    expect(FLUTTER.pitchDepth).toBeGreaterThan(0);
    expect(FLUTTER.gainDepth).toBeLessThan(0.15);
  });
});

describe('burbleBursts', () => {
  it('stays quiet when you lift off at low revs', () => {
    expect(burbleBursts(0, lcg(1))).toEqual([]);
    expect(burbleBursts(BURBLE.minFrac - 0.01, lcg(1))).toEqual([]);
  });

  it('pops harder and more often the higher the revs when you lift', () => {
    const mid = burbleBursts(0.7, lcg(2));
    const high = burbleBursts(1, lcg(2));
    expect(mid.length).toBeGreaterThan(0);
    expect(high.length).toBeGreaterThanOrEqual(mid.length);
    expect(Math.max(...high.map((b) => b.level)))
      .toBeGreaterThan(Math.max(...mid.map((b) => b.level)));
  });

  it('schedules pops in order, within a short crackle, at sane levels', () => {
    const bursts = burbleBursts(1, lcg(4));
    expect(bursts.length).toBeLessThanOrEqual(BURBLE.maxPops);
    let prev = -1;
    for (const b of bursts) {
      expect(b.t).toBeGreaterThan(prev);
      prev = b.t;
      expect(b.level).toBeGreaterThan(0);
      expect(b.level).toBeLessThanOrEqual(BURBLE.level);
    }
    expect(prev).toBeLessThan(0.6); // a crackle, not a machine gun
  });
});

describe('SHIFT_DIP', () => {
  it('is a brief duck, deep enough to hear but short enough to feel like a shift', () => {
    expect(SHIFT_DIP.depth).toBeGreaterThan(0);
    expect(SHIFT_DIP.depth).toBeLessThan(1);
    expect(SHIFT_DIP.seconds).toBeGreaterThan(0.03);
    expect(SHIFT_DIP.seconds).toBeLessThan(0.25);
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

describe('countdownTone', () => {
  it('gives the same low boop for each red lamp', () => {
    const reds = [1, 2, 3].map(countdownTone);
    expect(new Set(reds.map((t) => t.freq)).size).toBe(1);
    for (const t of reds) expect(t.dur).toBeLessThan(0.3);
  });

  it('green is higher-pitched and held longer than the reds', () => {
    const red = countdownTone(1);
    const go = countdownTone('go');
    expect(go.freq).toBeGreaterThan(red.freq);
    expect(go.dur).toBeGreaterThan(red.dur);
  });

  it('is silent outside the countdown', () => {
    expect(countdownTone('off')).toBe(null);
    expect(countdownTone(undefined)).toBe(null);
  });
});
