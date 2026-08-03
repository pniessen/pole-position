// The real 1982 Pole Position hardware palette.
//
// These are not eyeballed. They come from Atari's own manufacturing PROM upload
// files (POL137/138/139.ROM, dated 11-NOV-1982, CRC32-verified against MAME's
// ROM database) pushed through the cabinet's resistor-ladder DAC, then
// cross-checked against unfiltered 256x224 captures — every colour in those
// captures is an exact member of this set. Full derivation, provenance and the
// complete 128-entry table:
//   docs/research/1982-palette-and-graphics.md
//
// Do NOT hand-tweak these values. The DAC could only emit 16 levels per channel
// (LEVELS below); anything off that grid is a colour the hardware could not
// produce, and test/palette.test.js will fail.

// The 16 levels one 4-bit channel can reach through the 220/470/1k/2.2k ladder,
// whose normalised conductances are 143/67/31/14 and sum to exactly 255.
export const LEVELS = [
  0x00, 0x0e, 0x1f, 0x2d, 0x43, 0x51, 0x62, 0x70,
  0x8f, 0x9d, 0xae, 0xbc, 0xd2, 0xe0, 0xf1, 0xff,
];

// True when every channel of a 0xRRGGBB colour sits on the hardware grid.
export function isHardwareColor(hex) {
  if (!Number.isInteger(hex) || hex < 0 || hex > 0xffffff) return false;
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
    .every((c) => LEVELS.includes(c));
}

// --- racing surfaces (road PROM bank 4, indices 0x40-0x4F) ------------------
export const ROAD = 0x515151;        // 0x40 asphalt
export const KERB_RED = 0xe02d0e;    // 0x47
export const KERB_WHITE = 0xe0e0e0;  // 0x48 — also the edge/centre line
export const EDGE_YELLOW = 0xe0e000; // 0x46
export const GRASS = 0x439d0e;       // 0x4F verge
export const START_WHITE = 0xffffff; // 0x44
export const START_RED = 0xff0000;   // 0x45

// --- sky, top to horizon (background bank 0, indices 0x0F down to 0x0B) -----
// Five hard bands, not a smooth gradient — the hardware drew discrete strips.
export const SKY_BANDS = [0x1f70ff, 0x2d70ff, 0x4370ff, 0x5170ff, 0x6270ff];
export const HORIZON = 0x2d5162;     // 0x03 dark band under the sky
export const TERRAIN = 0x62431f;     // 0x02 distant brown

// --- HUD / alpha layer (bank 2, indices 0x20-0x2F) --------------------------
export const HUD_WHITE = 0xffffff;   // 0x21
export const HUD_RED = 0xd21f1f;     // 0x28
export const HUD_ORANGE = 0xff7000;  // 0x2A
export const HUD_SAND = 0xe0bc70;    // 0x2C title-screen sand

// Convenience for CSS/canvas consumers.
export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
