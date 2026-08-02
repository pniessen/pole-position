// Pure math for the engine and rival audio: the firing-pulse wavetable, the
// RPM/pitch/gain mappings, load-dependent filtering, wind, flutter and overrun
// burble. No WebAudio here — the node graph in audio.js stays thin and calls
// into these functions. Every tuning knob in this file is a named export so it
// can be adjusted after a listen without hunting through the graph code.

import { GEARS } from './handling.js';

// Engine playbackRate span (multiplied by the per-car base pitch). With the
// default firing rate below this sweeps roughly 85 Hz → 410 Hz of firing pulses.
export const RATE_MIN = 0.5;
export const RATE_MAX = 2.4;

// Engine loudness span at idle → redline.
export const GAIN_MIN = 0.22;
export const GAIN_MAX = 0.5;

// How much of the engine's level survives a full lift. Off-throttle is quieter
// as well as darker — see engineCutoff.
export const OFF_THROTTLE_GAIN = 0.72;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Engine RPM as a fraction of the current gear's band: 0 at standstill, 1 when
// speed reaches this gear's cap (maxSpeed * GEARS[gear-1].cap).
export function rpmFrac(speed, gear, maxSpeed) {
  const g = GEARS[Math.max(1, Math.min(GEARS.length, gear ?? GEARS.length)) - 1];
  const cap = maxSpeed * g.cap;
  return cap > 0 ? clamp01(speed / cap) : 0;
}

// RPM fraction → AudioBufferSourceNode playbackRate. Continuous: the old 64-step
// quantizer is gone, because stair-stepped pitch is a large part of what made
// the engine read as a machine holding one note.
export function enginePlaybackRate(frac, basePitch = 1) {
  return basePitch * (RATE_MIN + (RATE_MAX - RATE_MIN) * clamp01(frac));
}

// Engine gain: silent when (nearly) stopped, otherwise rising smoothly with revs
// and ducking when the driver lifts.
export function engineGainValue(speed, frac, throttle = 1) {
  if (speed < 0.5) return 0;
  const level = GAIN_MIN + (GAIN_MAX - GAIN_MIN) * clamp01(frac);
  return level * (OFF_THROTTLE_GAIN + (1 - OFF_THROTTLE_GAIN) * clamp01(throttle));
}

// --- firing-pulse wavetable -------------------------------------------------

// The loop is a train of decaying cylinder-firing bursts rather than one perfect
// wave cycle. `pulses / PULSE_SECONDS` is the firing rate at playbackRate 1.
// `bank` is the uneven-firing amplitude pattern that gives the low four-stroke
// lope; `jitter` is the per-pulse timing/amplitude randomness that keeps the
// buffer from announcing itself as a loop.
export const PULSE_SECONDS = 1.5;
export const PULSE = {
  pulses: 256,          // ≈ 171 Hz base firing rate
  jitter: 0.22,
  decay: 6,             // burst envelope: exp(-decay * u)
  ring: 8,              // ringing cycles inside one burst
  spread: 2.2,          // burst length as a multiple of the pulse spacing
  bank: [1, 0.82, 0.95, 0.74],
};

// Build one seamless loop of the firing-pulse train, normalized to full scale.
// `rand` is injected so tests are deterministic.
export function firingPulseSamples(length = 66150, opts = {}, rand = Math.random) {
  const { pulses, jitter, decay, ring, spread, bank } = { ...PULSE, ...opts };
  const out = new Float32Array(length);
  const spacing = length / pulses;
  const burst = Math.max(4, Math.round(spacing * spread));
  for (let i = 0; i < pulses; i++) {
    // Bursts are wider than their spacing and wrap around the loop end, so
    // successive cylinder events overlap and the seam is inaudible.
    const start = Math.round(i * spacing + (rand() * 2 - 1) * jitter * spacing);
    const amp = bank[i % bank.length] * (1 - jitter * rand());
    for (let k = 0; k < burst; k++) {
      const u = k / burst;
      const v = amp * Math.exp(-decay * u) * Math.sin(2 * Math.PI * ring * u);
      out[(((start + k) % length) + length) % length] += v;
    }
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak;
  return out;
}

// Three copies of the loop played at once. The few-cents detune makes them beat
// against each other — that slow interference is the difference between a synth
// tone and an engine. Distinct offsets start each layer elsewhere in the buffer
// so they never line up.
export const ENGINE_LAYERS = [
  { detune: 1, gain: 1, offset: 0 },
  { detune: 1.0075, gain: 0.72, offset: 0.37 },
  { detune: 0.9935, gain: 0.6, offset: 0.71 },
];

// --- load response ----------------------------------------------------------

// Lowpass cutoff for the engine bus. `closedShare` is how far the filter still
// opens with revs when the throttle is shut: on-throttle is bright and hard,
// the overrun goes dark. Reacting to the driver's right foot rather than to
// speed alone is the main cure for monotony.
export const CUTOFF = { min: 420, max: 5200, closedShare: 0.35 };

export function engineCutoff(frac, throttle = 1) {
  const open = clamp01(frac)
    * (CUTOFF.closedShare + (1 - CUTOFF.closedShare) * clamp01(throttle));
  return CUTOFF.min + (CUTOFF.max - CUTOFF.min) * open;
}

// Wind and road roar under the engine. Squared so it arrives late and hard,
// which is how speed feels; capped below GAIN_MIN so it never leads the mix.
export const WIND = { max: 0.16, curve: 2 };

export function windGain(speed, maxSpeed) {
  if (!(maxSpeed > 0)) return 0;
  return WIND.max * Math.pow(clamp01(speed / maxSpeed), WIND.curve);
}

// --- breathing --------------------------------------------------------------

// A bounded random walk on pitch and gain, so a perfectly held speed still
// never sits on a frozen tone. `rate` is how much of each step is new noise —
// low values wander slowly instead of jittering. Driven at frame rate, rate 0.08
// gives a waver about a fifth of a second long.
export const FLUTTER = { pitchDepth: 0.005, gainDepth: 0.04, rate: 0.08 };

// Scale the injected noise so the walk's stationary spread is ~0.5, i.e. it
// actually roams most of [-1, 1] instead of hugging zero. Derived from the AR(1)
// stationary variance r²·var(u) / (1 − (1−r)²) with u uniform on [-1, 1].
const FLUTTER_NOISE = 0.5 * Math.sqrt((3 * (2 - FLUTTER.rate)) / FLUTTER.rate);

export function flutterStep(state, rand = Math.random) {
  const walk = (v) => Math.max(-1, Math.min(1,
    v * (1 - FLUTTER.rate) + (rand() * 2 - 1) * FLUTTER_NOISE * FLUTTER.rate));
  const p = walk(state?.p ?? 0);
  const g = walk(state?.g ?? 0);
  return {
    p, g,
    pitchMul: 1 + p * FLUTTER.pitchDepth,
    gainMul: 1 + g * FLUTTER.gainDepth,
  };
}

// --- overrun burble ---------------------------------------------------------

// Lift off above minFrac and the engine crackles on the way down. Returns the
// pops to schedule as { t: seconds from now, level }, loudest first.
export const BURBLE = { minFrac: 0.45, maxPops: 7, level: 0.3, spread: 0.42 };

export function burbleBursts(frac, rand = Math.random) {
  const f = clamp01(frac);
  if (f < BURBLE.minFrac) return [];
  const intensity = (f - BURBLE.minFrac) / (1 - BURBLE.minFrac);
  const n = Math.max(2, Math.round(BURBLE.maxPops * intensity));
  const out = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += 0.02 + (rand() * BURBLE.spread) / n;
    out.push({ t, level: BURBLE.level * intensity * (0.55 + 0.45 * rand()) * (1 - (i / n) * 0.6) });
  }
  return out;
}

// A brief duck on upshift so changing gear is an event you hear, not a silent
// discontinuity in the pitch curve.
export const SHIFT_DIP = { depth: 0.45, seconds: 0.09 };

// WSG-style harmonic recipe (Pac-Man lineage): square-ish organ tone — strong
// odd harmonics with a touch of even warmth. Index 0 is the fundamental. Still
// used by the jingles, countdown and menu chiptune, which stay retro.
export const WSG_HARMONICS = [1, 0.18, 0.55, 0.1, 0.32, 0.06, 0.2, 0.04, 0.11];

// Start-light countdown voices: one low WSG boop per red lamp, a higher held
// beep on green — the classic arcade grid count.
export function countdownTone(lightState) {
  if (lightState === 1 || lightState === 2 || lightState === 3) return { freq: 330, dur: 0.18 };
  if (lightState === 'go') return { freq: 660, dur: 0.55 };
  return null;
}

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
  return { gain, pan, rate: enginePlaybackRate(clamp01(best.car.speed / maxSpeed), basePitch) };
}
