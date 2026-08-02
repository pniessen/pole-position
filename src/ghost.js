// Best-lap ghost: fixed-cadence (s, x) samples recorded during a lap,
// replayed by interpolating on elapsed lap time. Pure and storage-friendly.

export const GHOST_DT = 0.1;
const MAX_SAMPLES = 3600; // 6 minutes — beyond any sane lap

export function createLapRecorder() {
  return { acc: 0, samples: [] };
}

export function recordLap(rec, dt, s, x) {
  rec.acc += dt;
  while (rec.acc >= GHOST_DT && rec.samples.length < MAX_SAMPLES) {
    rec.acc -= GHOST_DT;
    rec.samples.push([Math.round(s * 100) / 100, Math.round(x * 100) / 100]);
  }
  return rec;
}

export function finishLap(rec, lapTime) {
  return { lapTime, dt: GHOST_DT, samples: rec.samples };
}

export function sampleGhost(ghost, t) {
  const n = ghost.samples.length;
  if (n === 0) return null;
  const f = t / ghost.dt;
  const i = Math.floor(f);
  if (i < 0) return { s: ghost.samples[0][0], x: ghost.samples[0][1] };
  if (i >= n - 1) return { s: ghost.samples[n - 1][0], x: ghost.samples[n - 1][1] };
  const a = ghost.samples[i], b = ghost.samples[i + 1];
  const u = f - i;
  return { s: a[0] + (b[0] - a[0]) * u, x: a[1] + (b[1] - a[1]) * u };
}
