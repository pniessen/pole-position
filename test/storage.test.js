import { describe, it, expect } from 'vitest';
import { submitScore, qualifies } from '../src/storage.js';

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
