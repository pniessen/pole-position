// Pure math for the 1982-style audio engine: quantizers, RPM/pitch mapping,
// waveform generation, and rival-proximity/pan math. No WebAudio here — the
// node graph in audio.js stays thin and calls into these functions.

import { GEARS } from './handling.js';

// The original cabinet set engine pitch with a 6-bit register (64 steps) and
// volume with ~8 discrete levels — accelerating stair-steps, never glides.
export const PITCH_STEPS = 64;
export const LEVEL_STEPS = 8;

// Engine playbackRate span (multiplied by the per-car base pitch).
export const RATE_MIN = 0.5;
export const RATE_MAX = 2.4;

// Engine loudness span at idle → redline (post-formant-stack gain).
export const GAIN_MIN = 0.22;
export const GAIN_MAX = 0.5;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// frac 0..1 → integer step 0..steps-1
export function quantizeStep(frac, steps) {
  return Math.round(clamp01(frac) * (steps - 1));
}

// frac 0..1 → nearest of 64 discrete pitch positions, returned as a 0..1 ratio
export function quantizePitch(frac) {
  return quantizeStep(frac, PITCH_STEPS) / (PITCH_STEPS - 1);
}

// frac 0..1 → nearest of 8 discrete volume levels, returned as a 0..1 ratio
export function quantizeLevel(frac) {
  return quantizeStep(frac, LEVEL_STEPS) / (LEVEL_STEPS - 1);
}

// Engine RPM as a fraction of the current gear's band: 0 at standstill, 1 when
// speed reaches this gear's cap (maxSpeed * GEARS[gear-1].cap).
export function rpmFrac(speed, gear, maxSpeed) {
  const g = GEARS[Math.max(1, Math.min(GEARS.length, gear ?? GEARS.length)) - 1];
  const cap = maxSpeed * g.cap;
  return cap > 0 ? clamp01(speed / cap) : 0;
}

// Quantized RPM fraction → AudioBufferSourceNode playbackRate.
export function enginePlaybackRate(qfrac, basePitch = 1) {
  return basePitch * (RATE_MIN + (RATE_MAX - RATE_MIN) * clamp01(qfrac));
}

// Engine gain: silent when (nearly) stopped, else one of 8 discrete levels.
export function engineGainValue(speed, frac) {
  if (speed < 0.5) return 0;
  return GAIN_MIN + (GAIN_MAX - GAIN_MIN) * quantizeLevel(frac);
}

// One cycle of the looped "PROM sample": a harmonically rich saw-ish wave
// crushed to 4-bit (16 amplitude levels), like the tiny sample the original
// cabinet looped. The quantization staircase supplies the wideband buzz that
// the fixed formant filters then shape.
export function engineWaveSamples(length = 512, harmonics = 24) {
  const out = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const phase = (2 * Math.PI * i) / length;
    let v = 0;
    for (let k = 1; k <= harmonics; k++) v += Math.sin(k * phase) / k;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < length; i++) {
    const norm = out[i] / peak; // -1..1
    out[i] = Math.round(norm * 7.5 - 0.5) / 7.5 + 1 / 15; // 16 levels (4-bit)
  }
  return out;
}

// WSG-style harmonic recipe (Pac-Man lineage): square-ish organ tone — strong
// odd harmonics with a touch of even warmth. Index 0 is the fundamental.
export const WSG_HARMONICS = [1, 0.18, 0.55, 0.1, 0.32, 0.06, 0.2, 0.04, 0.11];

// --- rival engine layer -----------------------------------------------------

// Audible range along-track (metres) and lateral pan scaling for the shared
// nearest-rival voice.
// closeCurve > 1 keeps distant cars a faint hum while door-to-door passes
// swell to full volume.
export const RIVAL = { range: 45, panSpan: 8, gainMax: 1, closeCurve: 1.7 };

// Signed wrapped distance from `from` to `to` in [-L/2, L/2).
export function wrappedDelta(from, to, trackLength) {
  let d = (((to - from) % trackLength) + trackLength) % trackLength;
  if (d >= trackLength / 2) d -= trackLength;
  return d;
}

// Voice parameters for the single shared rival engine: nearest car by combined
// along-track + lateral distance. Returns { gain 0..1, pan -1..1, rate }.
// gain is 0 when no car is within range (rate/pan then hold neutral values).
export function rivalVoice(player, cars, trackLength, maxSpeed, basePitch = 1) {
  let best = null;
  let bestDist = Infinity;
  for (const car of cars) {
    const ds = wrappedDelta(player.s, car.s, trackLength);
    const dx = car.x - player.x;
    const d = Math.hypot(ds, dx);
    if (d < bestDist) { bestDist = d; best = { car, dx }; }
  }
  if (!best || bestDist >= RIVAL.range) return { gain: 0, pan: 0, rate: enginePlaybackRate(0, basePitch) };
  const gain = RIVAL.gainMax * Math.pow(1 - bestDist / RIVAL.range, RIVAL.closeCurve);
  const pan = Math.max(-1, Math.min(1, best.dx / RIVAL.panSpan));
  const frac = quantizePitch(clamp01(best.car.speed / maxSpeed));
  return { gain, pan, rate: enginePlaybackRate(frac, basePitch) };
}
