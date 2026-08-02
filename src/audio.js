// All-procedural WebAudio. The engine is a layered synthetic race engine: three
// detuned copies of a firing-pulse loop through a load-dependent lowpass, with a
// wind layer, a slow flutter, overrun burble and an upshift dip. The jingles,
// countdown and menu chiptune stay Namco-WSG retro — no music during the race,
// the engine is the soundtrack.
// Everything routes through a master gain; failures leave the game silent
// but working. All tuning math lives in audio-math.js (pure, tested).

import {
  rpmFrac, enginePlaybackRate, engineGainValue,
  PULSE_SECONDS, firingPulseSamples, ENGINE_LAYERS,
  CUTOFF, engineCutoff, windGain, flutterStep, burbleBursts, SHIFT_DIP,
  WSG_HARMONICS, rivalVoice, countdownTone,
} from './audio-math.js';

// Trackside PA: a wide horn band that leaves the consonants intact, plus one
// slapback repeat for the size of the venue. The old narrow bandpass plus 4-bit
// crush is what made the announcer unintelligible.
const VOICE = { highpass: 250, lowpass: 5000, gain: 1.3, slapback: 0.15, echoLevel: 0.28 };

export function createAudio() {
  return {
    ctx: null, master: null,
    engineLayers: null, engineGain: null, engineLoad: null, engineShift: null,
    windGainNode: null,
    rivalSrc: null, rivalGain: null, rivalPan: null,
    skidGain: null, crowdGain: null,
    wsgWave: null, engineBuffer: null,
    flutter: null, prevThrottle: 0, prevGear: 1,
    musicTimer: null, musicStep: 0,
    voices: {}, voicesLoading: false,
  };
}

export function unlock(audio) {
  try {
    if (!audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.engineBuffer = makeEngineBuffer(audio.ctx);
      audio.wsgWave = makeWsgWave(audio.ctx);
      buildEngine(audio);
      buildWind(audio);
      buildRivalEngine(audio);
      buildSkid(audio);
      buildCrowd(audio);
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
  } catch { /* run silent */ }
}

// A 1.5 s loop of cylinder firing pulses — uneven, jittered, overlapping.
// playbackRate sweeps its ~171 Hz firing rate across the engine range.
function makeEngineBuffer(ctx) {
  const samples = firingPulseSamples(Math.round(ctx.sampleRate * PULSE_SECONDS));
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  return buf;
}

// WSG wavetable voice (Pac-Man lineage): square-ish organ built from a small
// harmonic recipe.
function makeWsgWave(ctx) {
  const n = WSG_HARMONICS.length + 1;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 0; i < WSG_HARMONICS.length; i++) imag[i + 1] = WSG_HARMONICS[i];
  return ctx.createPeriodicWave(real, imag);
}

function makeLoopSource(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

// Player engine: three detuned copies of the firing-pulse loop, summed into a
// load-dependent lowpass (opens with revs AND throttle), a bit of top-end bite,
// then a shift-dip gain in series with the main gain so the upshift duck can be
// scheduled without fighting the per-frame gain updates.
function buildEngine(audio) {
  const { ctx, master } = audio;
  const load = ctx.createBiquadFilter();
  load.type = 'lowpass';
  load.frequency.value = CUTOFF.min;
  load.Q.value = 0.9;
  const bite = ctx.createBiquadFilter();
  bite.type = 'highshelf';
  bite.frequency.value = 2400;
  bite.gain.value = 4;
  const shift = ctx.createGain();
  shift.gain.value = 1;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  load.connect(bite).connect(shift).connect(gain).connect(master);

  audio.engineLayers = ENGINE_LAYERS.map((layer) => {
    const src = makeLoopSource(ctx, audio.engineBuffer);
    const g = ctx.createGain();
    g.gain.value = layer.gain;
    src.connect(g).connect(load);
    src.start(0, layer.offset * audio.engineBuffer.duration);
    return { src, detune: layer.detune };
  });
  audio.engineLoad = load;
  audio.engineShift = shift;
  audio.engineGain = gain;
}

// Wind and road roar: broad filtered noise whose level tracks speed squared.
function buildWind(audio) {
  const { ctx, master } = audio;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2);
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 700;
  band.Q.value = 0.4;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(band).connect(gain).connect(master);
  src.start();
  audio.windGainNode = gain;
}

// Shared rival voice: one layer of the same pulse loop (enough for a car you
// aren't sitting in), bandpassed to sit behind the player's engine and
// stereo-panned by the rival's lateral offset.
function buildRivalEngine(audio) {
  const { ctx, master } = audio;
  const src = makeLoopSource(ctx, audio.engineBuffer);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1600;
  bp.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const pan = ctx.createStereoPanner();
  src.connect(bp).connect(gain).connect(pan).connect(master);
  src.start();
  audio.rivalSrc = src;
  audio.rivalGain = gain;
  audio.rivalPan = pan;
}

function noiseBuffer(ctx, seconds = 1) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function buildSkid(audio) {
  const { ctx, master } = audio;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 1);
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900;
  band.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(band).connect(gain).connect(master);
  src.start();
  audio.skidGain = gain;
}

function buildCrowd(audio) {
  const { ctx, master } = audio;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2);
  src.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 480;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(low).connect(gain).connect(master);
  src.start();
  audio.crowdGain = gain;
}

// Park the whole graph when the page is hidden. rAF stops firing in a
// background tab, so updateEngine stops being called and every gain stays
// latched at whatever it was — a backgrounded race would otherwise hum at you
// forever. Suspending releases the output device rather than merely muting it.
export function setAudioSuspended(audio, suspended) {
  if (!audio.ctx) return;
  try {
    if (suspended) audio.ctx.suspend();
    else if (audio.ctx.state === 'suspended') audio.ctx.resume();
  } catch { /* run silent */ }
}

// level 0..1 — cheering swells as the grandstands approach
export function updateCrowd(audio, level) {
  if (!audio.crowdGain) return;
  audio.crowdGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.28, audio.ctx.currentTime, 0.15);
}

// RPM = speed within the current gear's band. Pitch and volume follow it
// continuously; throttle controls brightness and level, so the engine answers
// the right foot and not just the speedometer. basePitch is the per-car
// character (F1 revvy, SUV gruff).
export function updateEngine(audio, speed, gear, spec, basePitch = 1, throttle = 1) {
  if (!audio.engineLayers) return;
  const frac = rpmFrac(speed, gear, spec.maxSpeed);
  const t = audio.ctx.currentTime;
  audio.flutter = flutterStep(audio.flutter);
  const rate = enginePlaybackRate(frac, basePitch) * audio.flutter.pitchMul;
  for (const layer of audio.engineLayers) {
    layer.src.playbackRate.setTargetAtTime(rate * layer.detune, t, 0.04);
  }
  audio.engineGain.gain.setTargetAtTime(
    engineGainValue(speed, frac, throttle) * audio.flutter.gainMul, t, 0.04);
  audio.engineLoad.frequency.setTargetAtTime(engineCutoff(frac, throttle), t, 0.05);
  audio.windGainNode.gain.setTargetAtTime(windGain(speed, spec.maxSpeed), t, 0.15);
  if (audio.prevThrottle > 0.5 && throttle <= 0.5) playBurble(audio, frac);
  if (gear > audio.prevGear) playShiftDip(audio);
  audio.prevThrottle = throttle;
  audio.prevGear = gear;
}

// Off-throttle crackle: a short run of lowpassed noise pops.
function playBurble(audio, frac) {
  const { ctx, master } = audio;
  const t0 = ctx.currentTime;
  for (const pop of burbleBursts(frac)) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 3;
    const g = ctx.createGain();
    const start = t0 + pop.t;
    g.gain.setValueAtTime(pop.level, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
    src.connect(lp).connect(g).connect(master);
    src.start(start);
    src.stop(start + 0.09);
  }
}

// Brief duck on its own gain node, so shifting is audible as an event.
function playShiftDip(audio) {
  const g = audio.engineShift.gain;
  const t = audio.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(1, t);
  g.linearRampToValueAtTime(SHIFT_DIP.depth, t + SHIFT_DIP.seconds * 0.25);
  g.linearRampToValueAtTime(1, t + SHIFT_DIP.seconds);
}

// One shared voice for the nearest rival: pitch from its speed, volume from
// proximity, stereo pan from its lateral offset. Pass an empty array to hush.
export function updateRivalEngine(audio, player, cars, trackLength, maxSpeed) {
  if (!audio.rivalSrc) return;
  const v = rivalVoice(player, cars, trackLength, maxSpeed);
  const t = audio.ctx.currentTime;
  audio.rivalGain.gain.setTargetAtTime(v.gain * 0.34, t, 0.08);
  audio.rivalPan.pan.setTargetAtTime(v.pan, t, 0.08);
  if (v.gain > 0) audio.rivalSrc.playbackRate.setTargetAtTime(v.rate, t, 0.08);
}

export function setSkid(audio, on) {
  if (!audio.skidGain) return;
  audio.skidGain.gain.setTargetAtTime(on ? 0.22 : 0, audio.ctx.currentTime, 0.05);
}

// Multi-stage crash, like the cabinet: impact burst → explosion rumble →
// sizzle tail.
export function playCrash(audio) {
  if (!audio.ctx) return;
  const { ctx, master } = audio;
  const t = ctx.currentTime;
  const stage = (start, dur, gainStart, filterSetup) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainStart, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    let head = src;
    if (filterSetup) {
      const f = ctx.createBiquadFilter();
      filterSetup(f);
      src.connect(f);
      head = f;
    }
    head.connect(g).connect(master);
    src.start(start);
    src.stop(start + dur + 0.05);
  };
  // 1. impact: short full-band white-noise hit
  stage(t, 0.07, 0.8, null);
  // 2. explosion: lowpassed rumble, ~0.8 s decay
  stage(t + 0.05, 0.8, 0.6, (f) => { f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 0.7; });
  // 3. sizzle: highpassed hiss fading ~1.5 s
  stage(t + 0.2, 1.5, 0.2, (f) => { f.type = 'highpass'; f.frequency.value = 3200; });
}

// One WSG organ note through the shared wavetable voice.
function wsgNote(audio, freq, start, dur, level = 0.16) {
  const osc = audio.ctx.createOscillator();
  osc.setPeriodicWave(audio.wsgWave);
  osc.frequency.value = freq;
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(level, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(g).connect(audio.master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// One beep per start-light change: low boops on the reds, a held higher
// note on green, WSG-voiced like the cabinet's countdown.
export function playCountdownBeep(audio, lightState) {
  if (!audio.ctx) return;
  const tone = countdownTone(lightState);
  if (!tone) return;
  wsgNote(audio, tone.freq, audio.ctx.currentTime, tone.dur, 0.22);
}

// Announcer speech: full-bandwidth phrases (see tools/make-voices.sh), played
// back untouched apart from the PA colouration below.
export function loadVoices(audio, urls) {
  if (!audio.ctx || audio.voicesLoading) return;
  audio.voicesLoading = true;
  for (const [kind, url] of Object.entries(urls)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => audio.ctx.decodeAudioData(buf))
      .then((decoded) => { audio.voices[kind] = decoded; })
      .catch(() => { /* run silent */ });
  }
}

// Trackside tannoy: wide horn band (keeps the 2–5 kHz consonant energy the old
// narrow bandpass ate) plus a single slapback repeat for the size of the place.
export function playVoice(audio, kind) {
  if (!audio.ctx || !audio.voices[kind]) return;
  const { ctx, master } = audio;
  const src = ctx.createBufferSource();
  src.buffer = audio.voices[kind];
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = VOICE.highpass;
  hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = VOICE.lowpass;
  lp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = VOICE.gain;
  src.connect(hp).connect(lp).connect(g).connect(master);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = VOICE.slapback;
  const echo = ctx.createGain();
  echo.gain.value = VOICE.echoLevel;
  g.connect(delay).connect(echo).connect(master);
  src.start();
}

// Checkpoint/lap jingle — WSG wavetable arpeggio (square-ish organ, not a
// bare oscillator).
export function playJingle(audio) {
  if (!audio.ctx) return;
  const t0 = audio.ctx.currentTime;
  [660, 880, 1100, 1320].forEach((freq, i) => wsgNote(audio, freq, t0 + i * 0.09, 0.09));
}

// Short WSG fanfare for the starting grid ("prepare to qualify!" stinger —
// voiced as a wavetable flourish, no speech synthesis).
export function playStartFanfare(audio) {
  if (!audio.ctx) return;
  const t0 = audio.ctx.currentTime;
  const notes = [523, 659, 784, 1047, 784, 1047];
  notes.forEach((freq, i) => wsgNote(audio, freq, t0 + i * 0.11, i === notes.length - 1 ? 0.4 : 0.11, 0.15));
}

const BASSLINE = [110, 110, 165, 110, 131, 110, 165, 196];
const STEP_SECONDS = 60 / 112 / 2; // 112 BPM eighth notes

// Menu/attract chiptune loop, WSG-voiced. Never runs during the race —
// in-race audio is engine + effects only, as on the original cabinet.
export function startMusic(audio) {
  if (!audio.ctx || audio.musicTimer) return;
  audio.musicStep = 0;
  let nextTime = audio.ctx.currentTime + 0.1;
  const schedule = () => {
    while (nextTime < audio.ctx.currentTime + 0.3) {
      const freq = BASSLINE[audio.musicStep % BASSLINE.length];
      wsgNote(audio, freq, nextTime, STEP_SECONDS * 0.9, 0.06);
      nextTime += STEP_SECONDS;
      audio.musicStep++;
    }
  };
  schedule();
  audio.musicTimer = setInterval(schedule, 120);
}

export function stopMusic(audio) {
  if (audio.musicTimer) {
    clearInterval(audio.musicTimer);
    audio.musicTimer = null;
  }
}
