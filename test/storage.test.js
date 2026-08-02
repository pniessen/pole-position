import { describe, it, expect } from 'vitest';
import { submitScore, qualifies, trackRecord, withTrackRecord } from '../src/storage.js';

describe('leaderboard', () => {
  it('inserts sorted descending', () => {
    let s = [];
    s = submitScore(s, 'AAA', 100);
    s = submitScore(s, 'BBB', 300);
    s = submitScore(s, 'CCC', 200);
    expect(s.map(e => e.initials)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('truncates to top 10 and rounds scores', () => {
    let s = [];
    for (let i = 0; i < 12; i++) s = submitScore(s, 'P' + i, i * 10 + 0.7);
    expect(s.length).toBe(10);
    expect(s[0].score).toBe(111);
    expect(s.at(-1).score).toBe(21);
  });

  it('qualifies when board not full or score beats lowest', () => {
    let s = [];
    expect(qualifies(s, 1)).toBe(true);
    for (let i = 0; i < 10; i++) s = submitScore(s, 'AAA', (i + 1) * 100);
    expect(qualifies(s, 50)).toBe(false);
    expect(qualifies(s, 150)).toBe(true);
  });
});

describe('per-track records', () => {
  it('trackRecord returns an empty record for unknown tracks', () => {
    const rec = trackRecord({}, 'MONZA');
    expect(rec.scores).toEqual([]);
    expect(rec.bestLap).toBe(null);
    expect(rec.ghost).toBe(null);
  });

  it('withTrackRecord merges updates immutably per track', () => {
    let records = {};
    records = withTrackRecord(records, 'MONZA', { bestLap: 42.5 });
    records = withTrackRecord(records, 'MONZA', { scores: [{ initials: 'AAA', score: 10 }] });
    records = withTrackRecord(records, 'MONACO', { bestLap: 61 });
    expect(trackRecord(records, 'MONZA').bestLap).toBe(42.5);
    expect(trackRecord(records, 'MONZA').scores.length).toBe(1);
    expect(trackRecord(records, 'MONACO').bestLap).toBe(61);
    expect(trackRecord(records, 'MONACO').scores).toEqual([]);
  });
});
