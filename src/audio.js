// All-procedural WebAudio: engine, skid, crash, checkpoint jingle, chiptune loop.
// Everything routes through a master gain; failures leave the game silent but working.

export function createAudio() {
  return {
    ctx: null, master: null,
    engineOsc: null, engineGain: null, engineFilter: null, engineLfo: null,
    skidSource: null, skidGain: null,
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
      buildEngine(audio);
      buildSkid(audio);
      buildCrowd(audio);
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
  } catch { /* run silent */ }
}

function buildEngine(audio) {
  const { ctx, master } = audio;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 55;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 11;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain).connect(osc.frequency);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(master);
  osc.start();
  lfo.start();
  audio.engineOsc = osc;
  audio.engineGain = gain;
  audio.engineFilter = filter;
  audio.engineLfo = lfo;
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

export function updateEngine(audio, speed, maxSpeed) {
  if (!audio.engineOsc) return;
  const frac = Math.min(1, speed / maxSpeed);
  const t = audio.ctx.currentTime;
  audio.engineOsc.frequency.setTargetAtTime(55 + 190 * frac, t, 0.05);
  audio.engineFilter.frequency.setTargetAtTime(300 + 1400 * frac, t, 0.1);
  audio.engineGain.gain.setTargetAtTime(speed < 0.5 ? 0 : 0.16 + 0.1 * frac, t, 0.1);
}

export function setSkid(audio, on) {
  if (!audio.skidGain) return;
  audio.skidGain.gain.setTargetAtTime(on ? 0.22 : 0, audio.ctx.currentTime, 0.05);
}

export function playCrash(audio) {
  if (!audio.ctx) return;
  const { ctx, master } = audio;
  const t = ctx.currentTime;
  // noise burst
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.8);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  src.connect(gain).connect(master);
  src.start(t);
  // descending tone
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.7);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.3, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  osc.connect(og).connect(master);
  osc.start(t);
  osc.stop(t + 0.75);
}

export function playJingle(audio) {
  if (!audio.ctx) return;
  const { ctx, master } = audio;
  const t0 = ctx.currentTime;
  [660, 880, 1100, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t = t0 + i * 0.09;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.1);
  });
}

const BASSLINE = [110, 110, 165, 110, 131, 110, 165, 196];
const STEP_SECONDS = 60 / 112 / 2; // 112 BPM eighth notes

export function startMusic(audio) {
  if (!audio.ctx || audio.musicTimer) return;
  audio.musicStep = 0;
  let nextTime = audio.ctx.currentTime + 0.1;
  const schedule = () => {
    while (nextTime < audio.ctx.currentTime + 0.3) {
      const freq = BASSLINE[audio.musicStep % BASSLINE.length];
      const osc = audio.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = audio.ctx.createGain();
      g.gain.setValueAtTime(0.06, nextTime);
      g.gain.exponentialRampToValueAtTime(0.001, nextTime + STEP_SECONDS * 0.9);
      osc.connect(g).connect(audio.master);
      osc.start(nextTime);
      osc.stop(nextTime + STEP_SECONDS);
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
