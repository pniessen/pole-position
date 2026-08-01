export const RACE = { startTime: 75, checkpointBonus: 40, totalLaps: 4, countdown: 3, scoreRate: 5 };

export function crossed(prevS, newS, target, trackLength) {
  if (prevS === newS) return false;
  const travel = ((newS - prevS) % trackLength + trackLength) % trackLength;
  if (travel > trackLength / 2) return false; // ignore huge/backward jumps
  const toTarget = ((target - prevS) % trackLength + trackLength) % trackLength;
  return toTarget > 0 && toTarget <= travel;
}

export function createRace(trackLength, checkpoints) {
  return {
    phase: 'attract', timeLeft: RACE.startTime, lap: 1, score: 0,
    trackLength, checkpoints, countdown: RACE.countdown,
    justCheckpoint: false, justLap: false,
  };
}

export function startRace(race) {
  return { ...race, phase: 'countdown', countdown: RACE.countdown };
}

export function updateRace(race, dt, prevS, newS, speed) {
  const r = { ...race, justCheckpoint: false, justLap: false };
  if (r.phase === 'countdown') {
    r.countdown -= dt;
    if (r.countdown <= 0) { r.phase = 'racing'; r.countdown = 0; }
    return r;
  }
  if (r.phase !== 'racing') return r;
  r.timeLeft -= dt;
  r.score += speed * RACE.scoreRate * dt;
  // mid-track checkpoint
  if (crossed(prevS, newS, r.checkpoints[1], r.trackLength)) {
    r.timeLeft += RACE.checkpointBonus;
    r.justCheckpoint = true;
  }
  // start/finish line
  if (crossed(prevS, newS, 0, r.trackLength)) {
    r.lap += 1;
    r.timeLeft += RACE.checkpointBonus;
    r.justLap = true;
    if (r.lap > RACE.totalLaps) { r.phase = 'finished'; r.lap = RACE.totalLaps; }
  }
  if (r.phase === 'racing' && r.timeLeft <= 0) { r.timeLeft = 0; r.phase = 'gameover'; }
  return r;
}
