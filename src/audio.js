// All-procedural WebAudio voiced after the 1982 Pole Position cabinet.
// Engine: a tiny looped 4-bit sample pitch-shifted via playbackRate, through
// FIXED analog-style formant filters (the timbre never tracks RPM — only
// pitch and volume move, in quantized steps). Jingles: Namco-WSG-style
// wavetable organ tones. No music during the race — the engine is the
// soundtrack; the chiptune loop is menu/attract only.
// Everything routes through a master gain; failures leave the game silent
// but working. All tuning math lives in audio-math.js (pure, tested).

import {
  quantizePitch, rpmFrac, enginePlaybackRate, engineGainValue,
  engineWaveSamples, WSG_HARMONICS, rivalVoice,
} from './audio-math.js';

export function createAudio() {
  return {
    ctx: null, master: null,
    engineSrc: null, engineGain: null,
    rivalSrc: null, rivalGain: null, rivalPan: null,
    skidGain: null, crowdGain: null,
    wsgWave: null, engineBuffer: null,
    musicTimer: null, musicStep: 0,
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
      buildRivalEngine(audio);
      buildSkid(audio);
      buildCrowd(audio);
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
  } catch { /* run silent */ }
}

// The looped "PROM sample": one harmonically rich cycle, 4-bit quantized.
// 512 samples ≈ 86 Hz fundamental at 44.1 kHz — playbackRate sweeps it
// through the engine range while the quantization staircase supplies the
// wideband buzz for the formant stack to chew on.
function makeEngineBuffer(ctx) {
  const samples = engineWaveSamples(512);
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

// Player engine: looped sample → two FIXED bandpasses (~1.2 kHz and ~2.2 kHz,
// summed) → ~950 Hz highpass → gain. The filters NEVER move — that fixed
// formant is the signature nasal buzz; RPM only changes playbackRate + gain.
function buildEngine(audio) {
  const { ctx, master } = audio;
  const src = makeLoopSource(ctx, audio.engineBuffer);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  for (const freq of [1200, 2200]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.6;
    src.connect(bp).connect(mix);
  }
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 950;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  mix.connect(hp).connect(gain).connect(master);
  src.start();
  audio.engineSrc = src;
  audio.engineGain = gain;
}

// Shared rival voice: same sample and formant idea (one bandpass is enough
// for a distant car), stereo-panned by the rival's lateral offset.
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

// level 0..1 — cheering swells as the grandstands approach
export function updateCrowd(audio, level) {
  if (!audio.crowdGain) return;
  audio.crowdGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.28, audio.ctx.currentTime, 0.15);
}

// RPM = speed within the current gear's band. Pitch snaps to 64 steps and
// volume to 8 levels (short time constants keep the stair-steps audible but
// click-free). basePitch is the per-car character (F1 revvy, SUV gruff).
export function updateEngine(audio, speed, gear, spec, basePitch = 1) {
  if (!audio.engineSrc) return;
  const frac = rpmFrac(speed, gear, spec.maxSpeed);
  const t = audio.ctx.currentTime;
  audio.engineSrc.playbackRate.setTargetAtTime(enginePlaybackRate(quantizePitch(frac), basePitch), t, 0.02);
  audio.engineGain.gain.setTargetAtTime(engineGainValue(speed, frac), t, 0.03);
}

// One shared voice for the nearest rival: pitch from its speed, volume from
// proximity, stereo pan from its lateral offset. Pass an empty array to hush.
export function updateRivalEngine(audio, player, cars, trackLength, maxSpeed) {
  if (!audio.rivalSrc) return;
  const v = rivalVoice(player, cars, trackLength, maxSpeed);
  const t = audio.ctx.currentTime;
  audio.rivalGain.gain.setTargetAtTime(v.gain * 0.12, t, 0.08);
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
