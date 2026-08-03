import { describe, it, expect } from 'vitest';
import * as PAL from '../src/palette.js';
import {
  LEVELS, isHardwareColor, ROAD, KERB_RED, KERB_WHITE, EDGE_YELLOW, GRASS,
  START_WHITE, START_RED, SKY_BANDS, HORIZON, TERRAIN,
  HUD_WHITE, HUD_RED, HUD_ORANGE, HUD_SAND, css,
} from '../src/palette.js';

describe('LEVELS — the DAC grid', () => {
  it('has 16 ascending levels spanning the full range', () => {
    expect(LEVELS).toHaveLength(16);
    expect(LEVELS[0]).toBe(0x00);
    expect(LEVELS[15]).toBe(0xff);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i]).toBeGreaterThan(LEVELS[i - 1]);
  });

  it('re-derives from the 220/470/1k/2.2k resistor ladder', () => {
    // Each level is the sum of the weights of the bits set in its nibble, where
    // the weights are the normalised conductances of the four resistors.
    const conduct = [1 / 2200, 1 / 1000, 1 / 470, 1 / 220]; // bit0..bit3
    const total = conduct.reduce((a, g) => a + g, 0);
    const weights = conduct.map((g) => Math.round((255 * g) / total));
    expect(weights).toEqual([14, 31, 67, 143]);
    expect(weights.reduce((a, w) => a + w, 0)).toBe(255); // full scale, exactly
    const derived = Array.from({ length: 16 }, (_, n) =>
      weights.reduce((sum, w, bit) => sum + ((n >> bit) & 1 ? w : 0), 0));
    expect(derived).toEqual(LEVELS);
  });
});

describe('isHardwareColor', () => {
  it('accepts colours on the grid and rejects ones off it', () => {
    expect(isHardwareColor(0x515151)).toBe(true);
    expect(isHardwareColor(0x000000)).toBe(true);
    expect(isHardwareColor(0xffffff)).toBe(true);
    expect(isHardwareColor(0x515152)).toBe(false); // one off in blue
    expect(isHardwareColor(0x555a5e)).toBe(false); // the old eyeballed road grey
  });

  it('rejects non-colours', () => {
    for (const bad of [-1, 0x1000000, 1.5, NaN, '#515151', null, undefined]) {
      expect(isHardwareColor(bad)).toBe(false);
    }
  });
});

describe('every exported colour is hardware-legal', () => {
  // The whole point of this module is that the values came off real PROMs.
  // If someone hand-tweaks one to "look nicer", this fails.
  const entries = Object.entries(PAL)
    .filter(([, v]) => typeof v === 'number');
  const skyEntries = SKY_BANDS.map((c, i) => [`SKY_BANDS[${i}]`, c]);

  it('covers every scalar colour export plus the sky bands', () => {
    expect(entries.length).toBeGreaterThan(10);
    for (const [name, hex] of [...entries, ...skyEntries]) {
      expect(isHardwareColor(hex), `${name} = ${css(hex)} is off the DAC grid`).toBe(true);
    }
  });
});

describe('the researched values, exactly as documented', () => {
  it('road surfaces match docs/research/1982-palette-and-graphics.md §7', () => {
    expect(css(ROAD)).toBe('#515151');
    expect(css(KERB_RED)).toBe('#e02d0e');
    expect(css(KERB_WHITE)).toBe('#e0e0e0');
    expect(css(EDGE_YELLOW)).toBe('#e0e000');
    expect(css(GRASS)).toBe('#439d0e');
    expect(css(START_WHITE)).toBe('#ffffff');
    expect(css(START_RED)).toBe('#ff0000');
  });

  it('sky runs in five bands, darkening top to horizon', () => {
    expect(SKY_BANDS.map(css)).toEqual(
      ['#1f70ff', '#2d70ff', '#4370ff', '#5170ff', '#6270ff']);
    // green and blue are constant across the run; only red climbs
    for (const band of SKY_BANDS) {
      expect((band >> 8) & 0xff).toBe(0x70);
      expect(band & 0xff).toBe(0xff);
    }
    const reds = SKY_BANDS.map((b) => (b >> 16) & 0xff);
    for (let i = 1; i < reds.length; i++) expect(reds[i]).toBeGreaterThan(reds[i - 1]);
  });

  it('HUD and terrain match the documented indices', () => {
    expect(css(HORIZON)).toBe('#2d5162');
    expect(css(TERRAIN)).toBe('#62431f');
    expect(css(HUD_WHITE)).toBe('#ffffff');
    expect(css(HUD_RED)).toBe('#d21f1f');
    expect(css(HUD_ORANGE)).toBe('#ff7000');
    expect(css(HUD_SAND)).toBe('#e0bc70');
  });
});

describe('css helper', () => {
  it('zero-pads to six digits', () => {
    expect(css(0x000000)).toBe('#000000');
    expect(css(0x0e0e0e)).toBe('#0e0e0e');
    expect(css(0xffffff)).toBe('#ffffff');
  });
});
