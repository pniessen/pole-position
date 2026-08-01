import { describe, it, expect } from 'vitest';
import { RACE, createRace, startRace, updateRace, crossed, startLightState } from '../src/race.js';

const L = 2000;
const CPS = [0, 1000];

function racing() {
  let r = startRace(createRace(L, CPS));
  r = updateRace(r, RACE.countdown + 0.01, 0, 0, 0); // burn countdown
  return r;
}

describe('crossed', () => {
  it('detects simple crossing', () => expect(crossed(990, 1010, 1000, L)).toBe(true));
  it('rejects non-crossing', () => expect(crossed(500, 700, 1000, L)).toBe(false));
  it('detects wrap-around crossing of 0', () => expect(crossed(1990, 15, 0, L)).toBe(true));
  it('ignores zero movement', () => expect(crossed(1000, 1000, 1000, L)).toBe(false));
  it('target exactly at prevS does not count', () => expect(crossed(1000, 1010, 1000, L)).toBe(false));
});

describe('startLightState', () => {
  it('is off outside countdown/launch', () => {
    expect(startLightState(createRace(L, CPS))).toBe('off');
    let r = racing();
    r = updateRace(r, RACE.startTime + 1, 100, 110, 10); // gameover
    expect(startLightState(r)).toBe('off');
  });

  it('lights one red lamp per elapsed countdown second', () => {
    let r = startRace(createRace(L, CPS));
    expect(startLightState(r)).toBe(1); // countdown 3.0
    r = updateRace(r, 1.1, 0, 0, 0);    // ~1.9 left
    expect(startLightState(r)).toBe(2);
    r = updateRace(r, 1.0, 0, 0, 0);    // ~0.9 left
    expect(startLightState(r)).toBe(3);
  });

  it('goes green for the first second of racing, then off', () => {
    let r = racing();
    expect(startLightState(r)).toBe('go');
    r = updateRace(r, 1.5, 0, 10, 10);
    expect(startLightState(r)).toBe('off');
  });
});

describe('race flow', () => {
  it('countdown leads to racing', () => {
    let r = startRace(createRace(L, CPS));
    expect(r.phase).toBe('countdown');
    r = updateRace(r, 1, 0, 0, 0);
    expect(r.phase).toBe('countdown');
    r = updateRace(r, 2.1, 0, 0, 0);
    expect(r.phase).toBe('racing');
    expect(r.timeLeft).toBeCloseTo(RACE.startTime);
  });

  it('time runs out → gameover', () => {
    let r = racing();
    r = updateRace(r, RACE.startTime + 1, 100, 110, 10);
    expect(r.phase).toBe('gameover');
    expect(r.timeLeft).toBe(0);
  });

  it('checkpoint at mid-track grants bonus once', () => {
    let r = racing();
    const t0 = r.timeLeft;
    r = updateRace(r, 0.1, 990, 1010, 50);
    expect(r.timeLeft).toBeCloseTo(t0 + RACE.checkpointBonus - 0.1, 1);
    expect(r.justCheckpoint).toBe(true);
    const t1 = r.timeLeft;
    r = updateRace(r, 0.1, 1010, 1030, 50); // no re-trigger
    expect(r.timeLeft).toBeCloseTo(t1 - 0.1, 1);
    expect(r.justCheckpoint).toBe(false);
  });

  it('crossing start line increments lap and grants bonus', () => {
    let r = racing();
    const t0 = r.timeLeft;
    r = updateRace(r, 0.1, 1990, 10, 50);
    expect(r.lap).toBe(2);
    expect(r.justLap).toBe(true);
    expect(r.timeLeft).toBeCloseTo(t0 + RACE.checkpointBonus - 0.1, 1);
  });

  it('completing final lap → finished', () => {
    let r = racing();
    for (let lap = 0; lap < RACE.totalLaps - 1; lap++) {
      r = updateRace(r, 0.1, 990, 1010, 50);
      r = updateRace(r, 0.1, 1990, 10, 50);
    }
    r = updateRace(r, 0.1, 990, 1010, 50);
    r = updateRace(r, 0.1, 1990, 10, 50);
    expect(r.phase).toBe('finished');
    expect(r.lap).toBe(RACE.totalLaps);
  });

  it('score accumulates with speed', () => {
    let r = racing();
    r = updateRace(r, 1, 100, 150, 50);
    expect(r.score).toBeCloseTo(50 * RACE.scoreRate);
  });
});
