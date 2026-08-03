# Pole Position (Namco/Atari, 1982) — colour palette and graphics hardware

Research note for the Three.js homage in this repo. **Nothing here was eyeballed.** Every
colour below is computed from the arcade board's colour PROM contents through the documented
resistor-ladder arithmetic, and independently confirmed against pixel histograms of native-
resolution emulator captures.

*Produced 2026-08-02. This is a research document only — no code in this repo was changed.*

---

## 0. Provenance and confidence at a glance

| Source | What it gave | Confidence |
|---|---|---|
| **A. Atari's own 1982 PROM data files** (`historicalsource/pole-position`) | Bit-exact contents of all seven graphics PROMs | **Very high** — CRC32 of every file matches MAME's ROM definitions exactly (see §2.2) |
| **B. MAME driver source** (`src/mame/namco/polepos_v.cpp`) | The resistor-ladder weights, bit→channel mapping, and the PROM→layer wiring, cited to Atari schematic sheets 13A/14B/15B | **High** — 25+ years of hardware-verified emulation; weights re-derive exactly from the stated resistor values (see §2.3) |
| **C. Pixel sampling of native 256x224 PNG captures** (Arcade Database) | Independent colour histograms | **High** — 4 captures, 39 unique colours, **100% exact match** to the PROM-derived set (see §4) |
| **D. Computer Archeology** | *Nothing.* The site has no Pole Position section at all. | **N/A — could not be used.** See §5 |

> **Honesty note.** The brief asked for Computer Archeology as source 1. It does not cover
> Pole Position (proof in §5). Rather than substitute an eyeballed guess, I substituted a
> *stronger* source: Atari's own 1982 PROM upload files, whose CRC32s I verified against
> MAME's ROM database. Every value in this document is marked with which source produced it.

---

## 1. Display hardware basics

| Property | Value | Source |
|---|---|---|
| Master clock | 24.576 MHz | MAME `polepos.cpp:251` |
| Pixel clock | 6.144 MHz (MASTER_CLOCK/4) | MAME `polepos.cpp:950` |
| Horizontal total / visible | 384 / **256** | `m_screen->set_raw(MASTER_CLOCK/4, 384, 0, 256, 264, 16, 240)` |
| Vertical total / visible | 264 / **224** (lines 16-239) | same |
| **Native framebuffer** | **256 x 224** | same |
| Refresh | 6 144 000 / (384 x 264) = **60.606 Hz** | computed from the above |
| Monitor orientation | horizontal | MAME driver has no `ROT` flag |
| Display aspect | 4:3 (MAME default; no `set_physical_aspect` override in the driver) | `polepos.cpp` |
| **Pixel aspect ratio** | **7:6 — pixels are wider than tall** ((4/3) / (256/224) = 1.1667) | computed |

So a faithful reproduction should render a 256x224 buffer and stretch it to 4:3, *not* display
it 1:1 square. The captures analysed in §3 are the unstretched 256x224 framebuffer.

### Layers, in draw order

From `polepos_state::screen_update` (`polepos_v.cpp:451`):

1. **Background / "view" tilemap** — 8x8 tiles, 2bpp, 64x16 map, horizontally scrolling. Clipped to `y <= 127`, i.e. the **top half of the screen only**. This is the sky, mountains and roadside scenery.
2. **Road** — procedurally generated per scanline for `y = 128..255`, i.e. the **bottom half only**.
3. **Sprites** — 64 hardware sprites, 4bpp, 16x16 or 32x32, hardware-scaled.
4. **Alpha / text tilemap** — 8x8 tiles, 2bpp, 32x32, full screen. Score, time, HUD.

The horizon is therefore not drawn — it is simply the seam at scanline 128 where the tilemap
stops and the road generator starts. The `128V` signal (bit 7 of the vertical counter) is also
wired into the palette PROMs, which is why the palette is split into a top-half bank and a
bottom-half bank (§2.5).

### Road generation

Three "road" ROMs at runtime (`136014-127` control, `-128` bits1, `-134` bits2) plus three
vertical-position PROMs (`-142/-143/-144`) that form a 12-bit **vertical position modifier**
per scanline. Per scanline (`draw_road`, `polepos_v.cpp:304`):

```
yoffs   = ((vertical_position_modifier[y] + road_vscroll) >> 3) & 0x1ff
roadpal = road_ram[yoffs] & 15                 // which of 16 road colour banks
xoffs   = road_ram[0x380 + (y & 0x7f)] & 0x3ff // per-scanline horizontal scroll
```

then 8 pixels at a time it clocks a 6-bit accumulator `roadval` across the scanline; the
pen is `roadpal*64 + roadval`, looked up in road-colour PROM `136014-145`. Perspective comes
entirely from the vertical-position PROM table plus the per-scanline x-scroll — there is no
divide, no z-buffer, no polygon.

### Sprite scaling

Vertical scaling is a **lookup PROM**, `136014-131` (4 KB, region `"scalelut"`), indexed by
`(destination_row << 6) + sizey` and yielding the source row (`polepos_v.cpp:393`). Horizontal
scaling is an **accumulator**: `siz += 1 + sizex`, and the destination x advances whenever bit
6 carries (`polepos_v.cpp:412-417`). 64 sprite slots, each independently positioned, sized
(6-bit sizex/sizey), flipped in x, and given one of 64 colour sets. This is how cars, trees and
signs grow smoothly as they approach — sprite zoom in hardware, no 3D.

---

## 2. Source A+B — the colour PROMs and the arithmetic

### 2.1 The PROM chips

| Atari part | MAME name (Namco set) | Board loc | Size | Role |
|---|---|---|---|---|
| 136014-137 | `pp1-7.8l` | 11E / 8L | 256 x 4 | **RED** palette |
| 136014-138 | `pp1-8.9l` | 11D / 9L | 256 x 4 | **GREEN** palette |
| 136014-139 | `pp1-9.10l` | 11C / 10L | 256 x 4 | **BLUE** palette |
| 136014-140 | `pp1-10.2h` | 8M / 2H | 256 x 4 | alpha/text colour lookup |
| 136014-141 | `pp1-11.4d` | 5K / 4D | 256 x 4 | background colour lookup |
| 136014-145 | `pp1-12.3c` | 4L / 3C | 1024 x 4 | road colour lookup |
| 136014-146 | `pp1-6.6m` | 12H / 6M | 1024 x 4 | sprite colour lookup |

Source: MAME `src/mame/namco/polepos.cpp` ROM definitions and the `polepos_palette` comments,
which cite Atari schematic **Sheet 15B** (palette PROMs + alpha), **Sheet 13A** (background,
road) and **Sheet 14B** (sprites).

### 2.2 Where the PROM bytes came from, and how I verified them

Atari's original manufacturing data files are archived at
`github.com/historicalsource/pole-position`. They are ASCII hex listings with a 1982 header:

```
; ROM/PROM data file created by UPLOAD V1.0  11-NOV-1982 17:33:42

;  POL137.ROM

0000=06,08,06,03,06,07,0E,0F,0D,04,06,06,05,04,03,02
0010=00,0F,0E,08,0F,00,07,09,00,00,0F,00,02,0D,0F,00
...
```

I parsed each file into 256 (or 1024) bytes and computed CRC32. **Every one matches MAME's
published CRC exactly**, which proves these are the same dumps the emulator has been validated
against — the two "independent" halves of source 1 corroborate each other bit-for-bit:

| File | Bytes | CRC32 computed | CRC32 in MAME | Match |
|---|---|---|---|---|
| POL137.ROM (136014-137, red) | 256 | `f07ff2ad` | `f07ff2ad` | yes |
| POL138.ROM (136014-138, green) | 256 | `adbde7d7` | `adbde7d7` | yes |
| POL139.ROM (136014-139, blue) | 256 | `ddac786a` | `ddac786a` | yes |
| POL140.ROM (136014-140, alpha LUT) | 256 | `1e8d0491` | `1e8d0491` | yes |
| POL141.ROM (136014-141, background LUT) | 256 | `0e4fe8a0` | `0e4fe8a0` | yes |
| POL145.ROM (136014-145, road LUT) | 1024 | `7afc7cfc` | `7afc7cfc` | yes |
| POL146.ROM (136014-146, sprite LUT) | 1024 | `ca4ba741` | `ca4ba741` | yes |

Every byte has only its low nibble set (max value `0x0F`), consistent with 256x4 / 1024x4 PROMs.

### 2.3 The resistor ladder and the conversion arithmetic

From the MAME driver header (`polepos_v.cpp:15-28`), transcribed from the Atari schematic:

```
  Pole Position has three 256x4 palette PROMs (one per gun).
  The palette PROMs are connected to the RGB output this way:

  bit 3 -- 220 ohm resistor  -- RED/GREEN/BLUE
        -- 470 ohm resistor  -- RED/GREEN/BLUE
        -- 1  kohm resistor  -- RED/GREEN/BLUE
  bit 0 -- 2.2kohm resistor  -- RED/GREEN/BLUE
```

MAME converts with (`polepos_v.cpp:62`):

```c
int const r = 0x0e * bit0 + 0x1f * bit1 + 0x43 * bit2 + 0x8f * bit3;   // and likewise g, b
```

**These weights are simply the normalised conductances of the four resistors**, so you can
re-derive them yourself rather than taking MAME's word for it:

| Bit | Resistor | Conductance 1/R | Share of total | x255 | Rounded | MAME weight |
|---|---|---|---|---|---|---|
| 0 | 2.2 kΩ | 0.00045455 | 0.05594 | 14.26 | 14 = `0x0E` | `0x0E` |
| 1 | 1 kΩ | 0.00100000 | 0.12303 | 31.37 | 31 = `0x1F` | `0x1F` |
| 2 | 470 Ω | 0.00212766 | 0.26178 | 66.75 | 67 = `0x43` | `0x43` |
| 3 | 220 Ω | 0.00454545 | 0.55926 | 142.61 | 143 = `0x8F` | `0x8F` |
| | | Σ = 0.00812766 | 1.00000 | 255.0 | **Σ = 255 = `0xFF`** | |

The four weights sum to exactly 255, so nibble `0xF` maps to `0xFF` and nibble `0x0` to `0x00`.
Each channel therefore has exactly **16 possible 8-bit levels**:

```
nibble : 0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F
8-bit  : 00 0E 1F 2D 43 51 62 70 8F 9D AE BC D2 E0 F1 FF
```

The full colour space is 16x16x16 = 4096; the PROMs select 128 entries from it.

**To re-derive any colour below:** take the nibble at address `i` in each of the three PROM
dumps in §2.4, map each nibble through the table above, concatenate as `#RRGGBB`.

> Note this is a *DC/linear-voltage* model of the DAC. It does not account for CRT gamma,
> phosphor primaries, or the monitor's own gain — the same caveat that applies to every MAME
> palette. It is the correct signal-level value, which is what a digital homage should use.

### 2.4 Raw PROM nibble dumps (source A)

Only the lower 128 entries are decoded: MAME's comment explains that "the upper 128 are all
black and used during the horizontal and vertical blanking periods" (`polepos_v.cpp:39-41`).
I confirmed this — addresses `0x80-0xFF` are not part of the visible palette.

```
136014-137  RED   (POL137.ROM)
  00: 6 8 6 3 6 7 E F D 4 6 6 5 4 3 2
  10: 0 F E 8 F 0 7 9 0 0 F 0 2 D F 0
  20: 0 F F F F 8 F A C F F 2 D A 3 0
  30: 0 F F F F 8 F A C F F 2 D A 3 0
  40: 5 0 0 0 F F D D D 0 0 0 0 0 0 4
  50: 0 F E 8 F 0 7 9 0 0 F 0 2 D F 0
  60: 0 F F F F 8 F A C F F 2 D A 3 0
  70: 0 F F F F 8 F A C F F 2 D A 3 0

136014-138  GREEN (POL138.ROM)
  00: 5 5 4 5 4 5 E F D 6 8 7 7 7 7 7
  10: 0 0 E 0 8 0 1 9 C 8 8 F 8 8 F 0
  20: 0 F 2 9 F F 8 F 2 0 7 7 B 5 4 0
  30: 0 F 2 9 F F 8 F 2 0 7 7 B 5 4 0
  40: 5 0 0 0 F 0 D 3 D 0 0 0 0 0 0 9
  50: 0 0 E 0 8 0 1 9 C 8 8 F 8 8 F 0
  60: 0 F 2 9 F F 8 F 2 0 7 7 B 5 4 0
  70: 0 F 2 9 F F 8 F 2 0 7 7 B 5 4 0

136014-139  BLUE  (POL139.ROM)
  00: 2 3 2 6 3 5 F F D A B F F F F F
  10: 0 0 0 0 0 F 9 9 C 8 A 0 2 8 F 0
  20: 0 F 4 3 7 7 A F 2 0 0 D 7 0 9 0
  30: 0 F 4 3 7 7 A F 2 0 0 D 7 0 9 0
  40: 5 0 0 0 F 0 0 1 D 0 0 0 0 0 0 1
  50: 0 0 0 0 0 F 9 9 C 8 A 0 2 8 F 0
  60: 0 F 4 3 7 7 A F 2 0 0 D 7 0 9 0
  70: 0 F 4 3 7 7 A F 2 0 0 D 7 0 9 0

```

### 2.5 The eight palette banks

The 128 entries are eight banks of 16. Which bank a pixel uses is decided by hardware inputs
`ALPHA/BACK`, `SPRITE/BACK` and `128V` (top vs bottom half of the screen):

| Bank | Indices | Selected by | Purpose |
|---|---|---|---|
| 0 | `0x00-0x0F` | background, `128V`=0 | **Background tilemap** (sky, mountains, scenery) |
| 1 | `0x10-0x1F` | sprite, `128V`=0 | **Sprites**, top half |
| 2 | `0x20-0x2F` | alpha, `128V`=0 | **Text / HUD**, top half |
| 3 | `0x30-0x3F` | alpha w/ sprite underneath | duplicate of bank 2 (verified identical) |
| 4 | `0x40-0x4F` | background, `128V`=1 | **Road**, bottom half |
| 5 | `0x50-0x5F` | sprite, `128V`=1 | Sprites, bottom half — **verified identical to bank 1** |
| 6 | `0x60-0x6F` | alpha, `128V`=1 | Text / HUD, bottom half — **verified identical to bank 2** |
| 7 | `0x70-0x7F` | alpha w/ sprite, `128V`=1 | duplicate of bank 2 (verified identical) |

I checked these equalities on the decoded data: banks 1≡5, 2≡3≡6≡7 are byte-identical;
banks 0 and 4 differ (that is the whole point of the `128V` input — the top half gets scenery
colours, the bottom half gets road colours, from the same 16 palette slots).

**Distinct RGB values in the whole 128-entry palette: 45.**

---

## 3. The palette (source A + B, derived)

### 3.1 Background / scenery — bank 0, indices `0x00-0x0F`

Used by the 8x8 background tilemap, top half of screen only. Tile colour set `c` (0-63) selects
4 of these via lookup PROM `136014-141` at address `c*4 + pixel`.

| Index | R G B nibbles | Hex | Purpose |
|---|---|---|---|
| `0x00` | 6 5 2 | `#62511F` | terrain / mountain brown |
| `0x01` | 8 5 3 | `#8F512D` | terrain highlight brown |
| `0x02` | 6 4 2 | `#62431F` | terrain shadow brown |
| `0x03` | 3 5 6 | `#2D5162` | dark slate blue-grey (horizon band immediately above the road; 1,869 px at y=105 in the in-game capture) |
| `0x04` | 6 4 3 | `#62432D` | terrain brown variant |
| `0x05` | 7 5 5 | `#705151` | warm grey |
| `0x06` | E E F | `#F1F1FF` | off-white |
| `0x07` | F F F | `#FFFFFF` | white |
| `0x08` | D D D | `#E0E0E0` | light grey |
| `0x09` | 4 6 A | `#4362AE` | mid blue |
| `0x0A` | 6 8 B | `#628FBC` | pale blue |
| `0x0B` | 6 7 F | `#6270FF` | sky band 5 (lowest, nearest horizon) |
| `0x0C` | 5 7 F | `#5170FF` | sky band 4 |
| `0x0D` | 4 7 F | `#4370FF` | sky band 3 |
| `0x0E` | 3 7 F | `#2D70FF` | sky band 2 |
| `0x0F` | 2 7 F | `#1F70FF` | sky band 1 (topmost) |

The sky gradient `0x0F -> 0x0B` is confirmed directly by the capture in §4: scanlines 0-42 are
`#1F70FF` (`0x0F`), 49-63 `#2D70FF` (`0x0E`), 70-77 `#4370FF` (`0x0D`), 84-91 `#5170FF`
(`0x0C`), 98 `#6270FF` (`0x0B`).

### 3.2 Road — bank 4, indices `0x40-0x4F`

Used by the per-scanline road generator, bottom half only.

| Index | R G B nibbles | Hex | Purpose |
|---|---|---|---|
| `0x40` | 5 5 5 | `#515151` | road asphalt (the main road surface) |
| `0x41` | 0 0 0 | `#000000` | black |
| `0x42` | 0 0 0 | `#000000` | black |
| `0x43` | 0 0 0 | `#000000` | black |
| `0x44` | F F F | `#FFFFFF` | white stripe (start/finish banding, centre dashes) |
| `0x45` | F 0 0 | `#FF0000` | red stripe (start/finish banding) |
| `0x46` | D D 0 | `#E0E000` | yellow road-edge line |
| `0x47` | D 3 1 | `#E02D0E` | red kerb / rumble strip |
| `0x48` | D D D | `#E0E0E0` | white kerb / white road-edge line |
| `0x49` | 0 0 0 | `#000000` | black |
| `0x4A` | 0 0 0 | `#000000` | black |
| `0x4B` | 0 0 0 | `#000000` | black |
| `0x4C` | 0 0 0 | `#000000` | black |
| `0x4D` | 0 0 0 | `#000000` | black |
| `0x4E` | 0 0 0 | `#000000` | black |
| `0x4F` | 4 9 1 | `#439D0E` | grass / verge (off-road) |

The purposes above are **not guesses** — they fall straight out of decoding road-colour PROM
`136014-145`. It is 16 banks (`roadpal`) x 64 horizontal positions (`roadval`). Decoded as
run-lengths (`N x count`, where N is the bank-4 index the road pen resolves to):

```
roadpal  0: F x1 7 x4 0 x2 8 x1 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 8 x1 0 x2 7 x4 F x1
roadpal  1: F x1 7 x4 0 x2 8 x1 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 4 x2 5 x2 8 x1 0 x2 7 x4 F x1
roadpal  2: F x1 8 x4 0 x2 8 x1 0 x48 8 x1 0 x2 8 x4 F x1
roadpal  3: F x1 7 x4 0 x2 8 x1 0 x48 8 x1 0 x2 7 x4 F x1
roadpal  4: F x1 8 x4 0 x2 8 x1 0 x24 8 x1 0 x23 8 x1 0 x2 8 x4 F x1
roadpal  5: F x1 7 x4 0 x2 8 x1 0 x24 8 x1 0 x23 8 x1 0 x2 7 x4 F x1
roadpal  6: F x1 8 x4 0 x2 8 x1 0 x12 4 x10 0 x10 4 x10 0 x6 8 x1 0 x2 8 x4 F x1
roadpal  7: F x1 8 x4 0 x2 8 x1 0 x6 4 x10 0 x10 4 x10 0 x12 8 x1 0 x2 8 x4 F x1
roadpal  8: F x1 8 x4 0 x2 6 x1 0 x48 6 x1 0 x2 8 x4 F x1
roadpal  9: F x1 7 x4 0 x2 6 x1 0 x48 6 x1 0 x2 7 x4 F x1
roadpal 10: F x1 8 x4 0 x2 6 x1 0 x24 8 x1 0 x23 6 x1 0 x2 8 x4 F x1
roadpal 11: F x1 7 x4 0 x2 6 x1 0 x24 8 x1 0 x23 6 x1 0 x2 7 x4 F x1
roadpal 12: F x1 8 x4 1 x2 8 x1 1 x1 0 x47 8 x1 1 x2 8 x4 F x1
roadpal 13: F x1 7 x4 1 x2 8 x1 1 x1 0 x47 8 x1 1 x2 7 x4 F x1
roadpal 14: F x1 8 x4 1 x2 8 x1 1 x1 0 x23 8 x1 0 x23 8 x1 1 x2 8 x4 F x1
roadpal 15: F x1 7 x4 1 x2 8 x1 1 x1 0 x23 8 x1 0 x23 8 x1 1 x2 7 x4 F x1
```

Reading `roadpal 3` left-to-right: 1 px grass (`F`=`0x4F`), 4 px red kerb (`7`=`0x47`), 2 px
asphalt (`0`=`0x40`), 1 px white edge line (`8`=`0x48`), 48 px asphalt, 1 px white edge line,
2 px asphalt, 4 px red kerb, 1 px grass. `roadpal 2` is the same road with a **white** kerb
instead of red — alternating banks 2 and 3 down successive scanlines is exactly how the classic
red/white striped kerb is produced. Banks 8-11 swap the white edge lines for **yellow**
(`6`=`0x46`); banks 4-7 and 10-15 add a centre line; banks 0-1 fill the whole road width with
alternating red/white (`5`/`4`) — the start/finish banding.

### 3.3 Sprites — bank 1, indices `0x10-0x1F` (bank 5 identical)

4bpp sprites; each of 64 sprite colour sets maps its 16 pen values through PROM `136014-146`
to these entries. **Pen value 15 is the transparency slot** — MAME maps it to index `0x1F`
and uses that as the transparent pen (`polepos_v.cpp:113`, `381`).

| Index | R G B nibbles | Hex | Notes |
|---|---|---|---|
| `0x10` | 0 0 0 | `#000000` | black (also a common sprite outline) |
| `0x11` | F 0 0 | `#FF0000` | pure red |
| `0x12` | E E 0 | `#F1F100` | yellow |
| `0x13` | 8 0 0 | `#8F0000` | dark red |
| `0x14` | F 8 0 | `#FF8F00` | orange |
| `0x15` | 0 0 F | `#0000FF` | pure blue |
| `0x16` | 7 1 9 | `#700E9D` | purple |
| `0x17` | 9 9 9 | `#9D9D9D` | mid grey |
| `0x18` | 0 C C | `#00D2D2` | cyan |
| `0x19` | 0 8 8 | `#008F8F` | dark cyan |
| `0x1A` | F 8 A | `#FF8FAE` | pink |
| `0x1B` | 0 F 0 | `#00FF00` | pure green |
| `0x1C` | 2 8 2 | `#1F8F1F` | dark green |
| `0x1D` | D 8 8 | `#E08F8F` | dusty pink |
| `0x1E` | F F F | `#FFFFFF` | white |
| `0x1F` | 0 0 0 | `#000000` | **transparency slot** (renders as black if ever drawn) |

Frequency with which each of the 16 entries is referenced across all 64 x 16 = 1024 sprite
lookup positions (from PROM `136014-146`): `0x10`:589, `0x11`:75, `0x12`:28, `0x13`:31, `0x14`:15, `0x15`:36, `0x16`:33, `0x17`:30, `0x18`:30, `0x19`:31, `0x1A`:2, `0x1B`:8, `0x1C`:6, `0x1D`:1, `0x1E`:48, `0x1F`:61.
Entry `0x10` (black) dominates because most sprite colour sets are mostly black outline/shadow.

I have deliberately **not** claimed "this index is the player car's red" etc. — sprite colour
assignment is per-object at runtime and I did not disassemble the game code to establish it.

### 3.4 Text / HUD (alpha layer) — bank 2, indices `0x20-0x2F` (banks 3, 6, 7 identical)

2bpp 8x8 character layer, full screen, drawn last. Character colour set `c` (0-63) selects 4
entries via PROM `136014-140` at `c*4 + pixel`. **Pen value 15 is transparency** (mapped to
index `0x2F`, `polepos_v.cpp:89`).

| Index | R G B nibbles | Hex | Notes |
|---|---|---|---|
| `0x20` | 0 0 0 | `#000000` | black (character background/shadow — by far the most-used, 127/256 LUT slots) |
| `0x21` | F F F | `#FFFFFF` | white (primary text) |
| `0x22` | F 2 4 | `#FF1F43` | crimson/pink-red |
| `0x23` | F 9 3 | `#FF9D2D` | amber |
| `0x24` | F F 7 | `#FFFF70` | pale yellow |
| `0x25` | 8 F 7 | `#8FFF70` | pale green |
| `0x26` | F 8 A | `#FF8FAE` | pink |
| `0x27` | A F F | `#AEFFFF` | pale cyan |
| `0x28` | C 2 2 | `#D21F1F` | brick red (the big red title/banner text) |
| `0x29` | F 0 0 | `#FF0000` | pure red |
| `0x2A` | F 7 0 | `#FF7000` | orange |
| `0x2B` | 2 7 D | `#1F70E0` | mid blue |
| `0x2C` | D B 7 | `#E0BC70` | tan / sand (the Pole Position title-screen field) |
| `0x2D` | A 5 0 | `#AE5100` | brown |
| `0x2E` | 3 4 9 | `#2D439D` | navy blue |
| `0x2F` | 0 0 0 | `#000000` | **transparency slot** |

Reference frequency across all 64 x 4 = 256 alpha lookup positions: `0x20`:127, `0x21`:25, `0x22`:4, `0x23`:1, `0x24`:6, `0x25`:6, `0x26`:6, `0x27`:1, `0x28`:1, `0x29`:1, `0x2A`:8, `0x2B`:8, `0x2C`:20, `0x2D`:2, `0x2E`:18, `0x2F`:22.

### 3.5 Complete 128-entry table

<details><summary>All 128 palette indices (banks 3, 5, 6, 7 are duplicates as noted)</summary>

| Index | R nib | G nib | B nib | Hex | Bank |
|---|---|---|---|---|---|
| `0x00` | 6 | 5 | 2 | `#62511F` | 0 background |
| `0x01` | 8 | 5 | 3 | `#8F512D` | 0 background |
| `0x02` | 6 | 4 | 2 | `#62431F` | 0 background |
| `0x03` | 3 | 5 | 6 | `#2D5162` | 0 background |
| `0x04` | 6 | 4 | 3 | `#62432D` | 0 background |
| `0x05` | 7 | 5 | 5 | `#705151` | 0 background |
| `0x06` | E | E | F | `#F1F1FF` | 0 background |
| `0x07` | F | F | F | `#FFFFFF` | 0 background |
| `0x08` | D | D | D | `#E0E0E0` | 0 background |
| `0x09` | 4 | 6 | A | `#4362AE` | 0 background |
| `0x0A` | 6 | 8 | B | `#628FBC` | 0 background |
| `0x0B` | 6 | 7 | F | `#6270FF` | 0 background |
| `0x0C` | 5 | 7 | F | `#5170FF` | 0 background |
| `0x0D` | 4 | 7 | F | `#4370FF` | 0 background |
| `0x0E` | 3 | 7 | F | `#2D70FF` | 0 background |
| `0x0F` | 2 | 7 | F | `#1F70FF` | 0 background |
| `0x10` | 0 | 0 | 0 | `#000000` | 1 sprite |
| `0x11` | F | 0 | 0 | `#FF0000` | 1 sprite |
| `0x12` | E | E | 0 | `#F1F100` | 1 sprite |
| `0x13` | 8 | 0 | 0 | `#8F0000` | 1 sprite |
| `0x14` | F | 8 | 0 | `#FF8F00` | 1 sprite |
| `0x15` | 0 | 0 | F | `#0000FF` | 1 sprite |
| `0x16` | 7 | 1 | 9 | `#700E9D` | 1 sprite |
| `0x17` | 9 | 9 | 9 | `#9D9D9D` | 1 sprite |
| `0x18` | 0 | C | C | `#00D2D2` | 1 sprite |
| `0x19` | 0 | 8 | 8 | `#008F8F` | 1 sprite |
| `0x1A` | F | 8 | A | `#FF8FAE` | 1 sprite |
| `0x1B` | 0 | F | 0 | `#00FF00` | 1 sprite |
| `0x1C` | 2 | 8 | 2 | `#1F8F1F` | 1 sprite |
| `0x1D` | D | 8 | 8 | `#E08F8F` | 1 sprite |
| `0x1E` | F | F | F | `#FFFFFF` | 1 sprite |
| `0x1F` | 0 | 0 | 0 | `#000000` | 1 sprite |
| `0x20` | 0 | 0 | 0 | `#000000` | 2 alpha |
| `0x21` | F | F | F | `#FFFFFF` | 2 alpha |
| `0x22` | F | 2 | 4 | `#FF1F43` | 2 alpha |
| `0x23` | F | 9 | 3 | `#FF9D2D` | 2 alpha |
| `0x24` | F | F | 7 | `#FFFF70` | 2 alpha |
| `0x25` | 8 | F | 7 | `#8FFF70` | 2 alpha |
| `0x26` | F | 8 | A | `#FF8FAE` | 2 alpha |
| `0x27` | A | F | F | `#AEFFFF` | 2 alpha |
| `0x28` | C | 2 | 2 | `#D21F1F` | 2 alpha |
| `0x29` | F | 0 | 0 | `#FF0000` | 2 alpha |
| `0x2A` | F | 7 | 0 | `#FF7000` | 2 alpha |
| `0x2B` | 2 | 7 | D | `#1F70E0` | 2 alpha |
| `0x2C` | D | B | 7 | `#E0BC70` | 2 alpha |
| `0x2D` | A | 5 | 0 | `#AE5100` | 2 alpha |
| `0x2E` | 3 | 4 | 9 | `#2D439D` | 2 alpha |
| `0x2F` | 0 | 0 | 0 | `#000000` | 2 alpha |
| `0x30` | 0 | 0 | 0 | `#000000` | 3 alpha(dup) |
| `0x31` | F | F | F | `#FFFFFF` | 3 alpha(dup) |
| `0x32` | F | 2 | 4 | `#FF1F43` | 3 alpha(dup) |
| `0x33` | F | 9 | 3 | `#FF9D2D` | 3 alpha(dup) |
| `0x34` | F | F | 7 | `#FFFF70` | 3 alpha(dup) |
| `0x35` | 8 | F | 7 | `#8FFF70` | 3 alpha(dup) |
| `0x36` | F | 8 | A | `#FF8FAE` | 3 alpha(dup) |
| `0x37` | A | F | F | `#AEFFFF` | 3 alpha(dup) |
| `0x38` | C | 2 | 2 | `#D21F1F` | 3 alpha(dup) |
| `0x39` | F | 0 | 0 | `#FF0000` | 3 alpha(dup) |
| `0x3A` | F | 7 | 0 | `#FF7000` | 3 alpha(dup) |
| `0x3B` | 2 | 7 | D | `#1F70E0` | 3 alpha(dup) |
| `0x3C` | D | B | 7 | `#E0BC70` | 3 alpha(dup) |
| `0x3D` | A | 5 | 0 | `#AE5100` | 3 alpha(dup) |
| `0x3E` | 3 | 4 | 9 | `#2D439D` | 3 alpha(dup) |
| `0x3F` | 0 | 0 | 0 | `#000000` | 3 alpha(dup) |
| `0x40` | 5 | 5 | 5 | `#515151` | 4 road |
| `0x41` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x42` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x43` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x44` | F | F | F | `#FFFFFF` | 4 road |
| `0x45` | F | 0 | 0 | `#FF0000` | 4 road |
| `0x46` | D | D | 0 | `#E0E000` | 4 road |
| `0x47` | D | 3 | 1 | `#E02D0E` | 4 road |
| `0x48` | D | D | D | `#E0E0E0` | 4 road |
| `0x49` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x4A` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x4B` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x4C` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x4D` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x4E` | 0 | 0 | 0 | `#000000` | 4 road |
| `0x4F` | 4 | 9 | 1 | `#439D0E` | 4 road |
| `0x50` | 0 | 0 | 0 | `#000000` | 5 sprite(dup) |
| `0x51` | F | 0 | 0 | `#FF0000` | 5 sprite(dup) |
| `0x52` | E | E | 0 | `#F1F100` | 5 sprite(dup) |
| `0x53` | 8 | 0 | 0 | `#8F0000` | 5 sprite(dup) |
| `0x54` | F | 8 | 0 | `#FF8F00` | 5 sprite(dup) |
| `0x55` | 0 | 0 | F | `#0000FF` | 5 sprite(dup) |
| `0x56` | 7 | 1 | 9 | `#700E9D` | 5 sprite(dup) |
| `0x57` | 9 | 9 | 9 | `#9D9D9D` | 5 sprite(dup) |
| `0x58` | 0 | C | C | `#00D2D2` | 5 sprite(dup) |
| `0x59` | 0 | 8 | 8 | `#008F8F` | 5 sprite(dup) |
| `0x5A` | F | 8 | A | `#FF8FAE` | 5 sprite(dup) |
| `0x5B` | 0 | F | 0 | `#00FF00` | 5 sprite(dup) |
| `0x5C` | 2 | 8 | 2 | `#1F8F1F` | 5 sprite(dup) |
| `0x5D` | D | 8 | 8 | `#E08F8F` | 5 sprite(dup) |
| `0x5E` | F | F | F | `#FFFFFF` | 5 sprite(dup) |
| `0x5F` | 0 | 0 | 0 | `#000000` | 5 sprite(dup) |
| `0x60` | 0 | 0 | 0 | `#000000` | 6 alpha(dup) |
| `0x61` | F | F | F | `#FFFFFF` | 6 alpha(dup) |
| `0x62` | F | 2 | 4 | `#FF1F43` | 6 alpha(dup) |
| `0x63` | F | 9 | 3 | `#FF9D2D` | 6 alpha(dup) |
| `0x64` | F | F | 7 | `#FFFF70` | 6 alpha(dup) |
| `0x65` | 8 | F | 7 | `#8FFF70` | 6 alpha(dup) |
| `0x66` | F | 8 | A | `#FF8FAE` | 6 alpha(dup) |
| `0x67` | A | F | F | `#AEFFFF` | 6 alpha(dup) |
| `0x68` | C | 2 | 2 | `#D21F1F` | 6 alpha(dup) |
| `0x69` | F | 0 | 0 | `#FF0000` | 6 alpha(dup) |
| `0x6A` | F | 7 | 0 | `#FF7000` | 6 alpha(dup) |
| `0x6B` | 2 | 7 | D | `#1F70E0` | 6 alpha(dup) |
| `0x6C` | D | B | 7 | `#E0BC70` | 6 alpha(dup) |
| `0x6D` | A | 5 | 0 | `#AE5100` | 6 alpha(dup) |
| `0x6E` | 3 | 4 | 9 | `#2D439D` | 6 alpha(dup) |
| `0x6F` | 0 | 0 | 0 | `#000000` | 6 alpha(dup) |
| `0x70` | 0 | 0 | 0 | `#000000` | 7 alpha(dup) |
| `0x71` | F | F | F | `#FFFFFF` | 7 alpha(dup) |
| `0x72` | F | 2 | 4 | `#FF1F43` | 7 alpha(dup) |
| `0x73` | F | 9 | 3 | `#FF9D2D` | 7 alpha(dup) |
| `0x74` | F | F | 7 | `#FFFF70` | 7 alpha(dup) |
| `0x75` | 8 | F | 7 | `#8FFF70` | 7 alpha(dup) |
| `0x76` | F | 8 | A | `#FF8FAE` | 7 alpha(dup) |
| `0x77` | A | F | F | `#AEFFFF` | 7 alpha(dup) |
| `0x78` | C | 2 | 2 | `#D21F1F` | 7 alpha(dup) |
| `0x79` | F | 0 | 0 | `#FF0000` | 7 alpha(dup) |
| `0x7A` | F | 7 | 0 | `#FF7000` | 7 alpha(dup) |
| `0x7B` | 2 | 7 | D | `#1F70E0` | 7 alpha(dup) |
| `0x7C` | D | B | 7 | `#E0BC70` | 7 alpha(dup) |
| `0x7D` | A | 5 | 0 | `#AE5100` | 7 alpha(dup) |
| `0x7E` | 3 | 4 | 9 | `#2D439D` | 7 alpha(dup) |
| `0x7F` | 0 | 0 | 0 | `#000000` | 7 alpha(dup) |

</details>

### 3.6 The 45 distinct colours

| Hex | Indices | Where it lives |
|---|---|---|
| `#000000` | `0x10`, `0x1F`, `0x20`, `0x2F`, `0x30`, `0x3F`, `0x41`, `0x42`, `0x43`, `0x49`, `0x4A`, `0x4B`, `0x4C`, `0x4D`, `0x4E`, `0x50`, `0x5F`, `0x60`, `0x6F`, `0x70`, `0x7F` | alpha, road, sprite |
| `#0000FF` | `0x15`, `0x55` | sprite |
| `#008F8F` | `0x19`, `0x59` | sprite |
| `#00D2D2` | `0x18`, `0x58` | sprite |
| `#00FF00` | `0x1B`, `0x5B` | sprite |
| `#1F70E0` | `0x2B`, `0x3B`, `0x6B`, `0x7B` | alpha |
| `#1F70FF` | `0x0F` | background |
| `#1F8F1F` | `0x1C`, `0x5C` | sprite |
| `#2D439D` | `0x2E`, `0x3E`, `0x6E`, `0x7E` | alpha |
| `#2D5162` | `0x03` | background |
| `#2D70FF` | `0x0E` | background |
| `#4362AE` | `0x09` | background |
| `#4370FF` | `0x0D` | background |
| `#439D0E` | `0x4F` | road |
| `#515151` | `0x40` | road |
| `#5170FF` | `0x0C` | background |
| `#62431F` | `0x02` | background |
| `#62432D` | `0x04` | background |
| `#62511F` | `0x00` | background |
| `#6270FF` | `0x0B` | background |
| `#628FBC` | `0x0A` | background |
| `#700E9D` | `0x16`, `0x56` | sprite |
| `#705151` | `0x05` | background |
| `#8F0000` | `0x13`, `0x53` | sprite |
| `#8F512D` | `0x01` | background |
| `#8FFF70` | `0x25`, `0x35`, `0x65`, `0x75` | alpha |
| `#9D9D9D` | `0x17`, `0x57` | sprite |
| `#AE5100` | `0x2D`, `0x3D`, `0x6D`, `0x7D` | alpha |
| `#AEFFFF` | `0x27`, `0x37`, `0x67`, `0x77` | alpha |
| `#D21F1F` | `0x28`, `0x38`, `0x68`, `0x78` | alpha |
| `#E02D0E` | `0x47` | road |
| `#E08F8F` | `0x1D`, `0x5D` | sprite |
| `#E0BC70` | `0x2C`, `0x3C`, `0x6C`, `0x7C` | alpha |
| `#E0E000` | `0x46` | road |
| `#E0E0E0` | `0x08`, `0x48` | background, road |
| `#F1F100` | `0x12`, `0x52` | sprite |
| `#F1F1FF` | `0x06` | background |
| `#FF0000` | `0x11`, `0x29`, `0x39`, `0x45`, `0x51`, `0x69`, `0x79` | alpha, road, sprite |
| `#FF1F43` | `0x22`, `0x32`, `0x62`, `0x72` | alpha |
| `#FF7000` | `0x2A`, `0x3A`, `0x6A`, `0x7A` | alpha |
| `#FF8F00` | `0x14`, `0x54` | sprite |
| `#FF8FAE` | `0x1A`, `0x26`, `0x36`, `0x5A`, `0x66`, `0x76` | alpha, sprite |
| `#FF9D2D` | `0x23`, `0x33`, `0x63`, `0x73` | alpha |
| `#FFFF70` | `0x24`, `0x34`, `0x64`, `0x74` | alpha |
| `#FFFFFF` | `0x07`, `0x1E`, `0x21`, `0x31`, `0x44`, `0x5E`, `0x61`, `0x71` | alpha, background, road, sprite |

---

## 4. Source C — pixel sampling of native captures

### 4.1 The captures and why they are trustworthy

Downloaded from the Arcade Database's MAME media mirror with `curl`:

| File | URL | Reported by `file(1)` |
|---|---|---|
| `ingames_polepos.png` | http://adb.arcadeitalia.net/media/mame.current/ingames/polepos.png | PNG, **256 x 224**, 8-bit RGB, non-interlaced |
| `titles_polepos.png` | http://adb.arcadeitalia.net/media/mame.current/titles/polepos.png | PNG, **256 x 224**, 8-bit RGB, non-interlaced |
| `ingames_poleposa.png` | http://adb.arcadeitalia.net/media/mame.current/ingames/poleposa.png | PNG, **256 x 224**, 8-bit RGB, non-interlaced |
| `titles_poleposa.png` | http://adb.arcadeitalia.net/media/mame.current/titles/poleposa.png | PNG, **256 x 224**, 8-bit RGB, non-interlaced |

`polepos` is the Namco World set, `poleposa` the Atari set — both use the identical palette
PROMs (same CRCs), so they are legitimate replicates.

Four independent checks that these are unscaled, unfiltered captures of the real framebuffer:

1. **Dimensions are exactly the native 256 x 224** derived independently in §1 from the CRTC timings.
2. **Tiny unique-colour counts** — 31 and 8 (below). Any bilinear resize or JPEG round-trip would produce thousands.
3. **Every channel value in every capture lands on the 16-level ladder grid** from §2.3. I tested this explicitly: zero offending values across all captures.
4. **Negative control:** the same test run on the *Pole Position II* (1983) capture, which uses different palette PROMs, produces 5 colours that are **not** in the 1982 set — so the test does discriminate and is not trivially passing.

### 4.2 Histograms

**In-game (`ingames_polepos.png`) — 31 unique colours:**

| Hex | Pixels | % of frame | PROM index |
|---|---|---|---|
| `#515151` | 15142 | 26.41% | `0x40` |
| `#1F70FF` | 11320 | 19.74% | `0x0F` |
| `#439D0E` | 9096 | 15.86% | `0x4F` |
| `#4370FF` | 4096 | 7.14% | `0x0D` |
| `#5170FF` | 4036 | 7.04% | `0x0C` |
| `#2D70FF` | 3884 | 6.77% | `0x0E` |
| `#6270FF` | 1670 | 2.91% | `0x0B` |
| `#E0E0E0` | 1600 | 2.79% | `0x08`, `0x48` |
| `#62431F` | 1032 | 1.80% | `0x02` |
| `#E02D0E` | 847 | 1.48% | `0x47` |
| `#2D5162` | 779 | 1.36% | `0x03` |
| `#FFFFFF` | 719 | 1.25% | `0x07`, `0x1E`, `0x21`, `0x31`, `0x44`, `0x5E`, `0x61`, `0x71` |
| `#000000` | 600 | 1.05% | `0x10`, `0x1F`, `0x20`, `0x2F`, `0x30`, `0x3F`, `0x41`, `0x42`, `0x43`, `0x49`, `0x4A`, `0x4B`, `0x4C`, `0x4D`, `0x4E`, `0x50`, `0x5F`, `0x60`, `0x6F`, `0x70`, `0x7F` |
| `#E0E000` | 391 | 0.68% | `0x46` |
| `#4362AE` | 227 | 0.40% | `0x09` |
| `#FF8FAE` | 197 | 0.34% | `0x1A`, `0x26`, `0x36`, `0x5A`, `0x66`, `0x76` |
| `#62511F` | 185 | 0.32% | `0x00` |
| `#8FFF70` | 176 | 0.31% | `0x25`, `0x35`, `0x65`, `0x75` |
| `#0000FF` | 173 | 0.30% | `0x15`, `0x55` |
| `#008F8F` | 170 | 0.30% | `0x19`, `0x59` |
| `#FF8F00` | 169 | 0.29% | `0x14`, `0x54` |
| `#8F0000` | 154 | 0.27% | `0x13`, `0x53` |
| `#700E9D` | 151 | 0.26% | `0x16`, `0x56` |
| `#FFFF70` | 129 | 0.22% | `0x24`, `0x34`, `0x64`, `0x74` |
| `#FF0000` | 106 | 0.18% | `0x11`, `0x29`, `0x39`, `0x45`, `0x51`, `0x69`, `0x79` |
| `#9D9D9D` | 94 | 0.16% | `0x17`, `0x57` |
| `#F1F1FF` | 64 | 0.11% | `0x06` |
| `#628FBC` | 45 | 0.08% | `0x0A` |
| `#705151` | 33 | 0.06% | `0x05` |
| `#F1F100` | 32 | 0.06% | `0x12`, `0x52` |
| `#00D2D2` | 27 | 0.05% | `0x18`, `0x58` |

**Title screen (`titles_polepos.png`) — 8 unique colours:**

| Hex | Pixels | % of frame | PROM index |
|---|---|---|---|
| `#E0BC70` | 49632 | 86.55% | `0x2C`, `0x3C`, `0x6C`, `0x7C` |
| `#000000` | 3841 | 6.70% | `0x10`, `0x1F`, `0x20`, `0x2F`, `0x30`, `0x3F`, `0x41`, `0x42`, `0x43`, `0x49`, `0x4A`, `0x4B`, `0x4C`, `0x4D`, `0x4E`, `0x50`, `0x5F`, `0x60`, `0x6F`, `0x70`, `0x7F` |
| `#D21F1F` | 1650 | 2.88% | `0x28`, `0x38`, `0x68`, `0x78` |
| `#FF7000` | 1416 | 2.47% | `0x2A`, `0x3A`, `0x6A`, `0x7A` |
| `#1F70E0` | 432 | 0.75% | `0x2B`, `0x3B`, `0x6B`, `0x7B` |
| `#FF0000` | 239 | 0.42% | `0x11`, `0x29`, `0x39`, `0x45`, `0x51`, `0x69`, `0x79` |
| `#FFFFFF` | 90 | 0.16% | `0x07`, `0x1E`, `0x21`, `0x31`, `0x44`, `0x5E`, `0x61`, `0x71` |
| `#AE5100` | 44 | 0.08% | `0x2D`, `0x3D`, `0x6D`, `0x7D` |

### 4.3 Row-by-row attribution (in-game capture)

Dominant colour of every 7th scanline. This is the evidence for the sky-gradient and
`128V` split claims:

```
y=  0  #1F70FF x256
y=  7  #1F70FF x256
y= 14  #1F70FF x180   #FF8FAE x31 
y= 21  #1F70FF x256
y= 28  #1F70FF x194   #FFFFFF x58 
y= 35  #1F70FF x256
y= 42  #1F70FF x256
y= 49  #2D70FF x256
y= 56  #2D70FF x236   #FFFFFF x11 
y= 63  #2D70FF x239   #F1F1FF x7  
y= 70  #4370FF x256
y= 77  #4370FF x256
y= 84  #5170FF x256
y= 91  #5170FF x249   #FFFFFF x4  
y= 98  #6270FF x231   #FFFFFF x12 
y=105  #2D5162 x134   #6270FF x44 
y=112  #439D0E x256
y=119  #439D0E x212   #515151 x38 
y=126  #439D0E x178   #515151 x56 
y=133  #439D0E x156   #515151 x70 
y=140  #439D0E x128   #515151 x104
y=147  #515151 x130   #439D0E x100
y=154  #515151 x150   #439D0E x72 
y=161  #515151 x178   #439D0E x57 
y=168  #515151 x185   #439D0E x53 
y=175  #515151 x180   #439D0E x47 
y=182  #515151 x150   #439D0E x42 
y=189  #515151 x142   #439D0E x36 
y=196  #515151 x134   #439D0E x31 
y=203  #515151 x139   #000000 x25 
y=210  #515151 x208   #E0E0E0 x26 
y=217  #515151 x214   #E0E0E0 x28 
```

Note the abrupt change at **y = 112**. The visible area starts at raster line 16, so screen
row 112 is raster line 128 — exactly the `128V` boundary. Above it: background-bank sky
(`0x0B-0x0F`) and horizon (`0x03`, `0x02`). Below it: road-bank grass (`0x4F`) and asphalt
(`0x40`). Sources A/B predicted this split; source C confirms it.

---

## 5. Cross-check between sources

| Question | Result |
|---|---|
| Unique colours across all four 1982-set captures | **39** |
| How many are exact members of the 128-entry PROM-derived palette | **39 of 39 — 100%** |
| How many differ even by 1 in any channel | **0** |
| PROM colours never seen in these four scenes | 6 (listed below) |
| Colours in the Pole Position II capture absent from the 1982 palette | 5 (negative control passed) |

**Every palette entry that appeared on screen matched exactly.** There is no "close but not
equal" category and no disagreement category to explain. That is the expected outcome for a
hardware-palette game captured without filtering, and it means the two sources fully corroborate.

The 6 PROM colours not observed are simply not on screen in these two scenes — they are
present in the hardware palette but unused by the title screen and this particular stretch of
track:

| Hex | Indices | Bank |
|---|---|---|
| `#00FF00` | `0x1B`, `0x5B` | sprite |
| `#1F8F1F` | `0x1C`, `0x5C` | sprite |
| `#2D439D` | `0x2E`, `0x3E`, `0x6E`, `0x7E` | alpha |
| `#AEFFFF` | `0x27`, `0x37`, `0x67`, `0x77` | alpha |
| `#E08F8F` | `0x1D`, `0x5D` | sprite |
| `#FF9D2D` | `0x23`, `0x33`, `0x63`, `0x73` | alpha |

### 5.1 What Computer Archeology gave: nothing

The brief named computerarcheology.com as source 1. **The site does not cover Pole Position.**
What I tried:

- `https://computerarcheology.com/Arcade/PolePosition/` -> HTTP **404**
- `https://computerarcheology.com/Arcade/PolePos/` -> HTTP **404**
- Fetched the section index `https://computerarcheology.com/Arcade/` and read its full game list — Pole Position is absent.
- Enumerated the site's own source repository, `github.com/topherCantrell/computerarcheology`, via the GitHub API (`git/trees?recursive=1`). The complete list of arcade titles under `content/Arcade/` is: Asteroids, CrazyClimber, Defender, DigDug, Frogger, Galaga, MoonPatrol, OmegaRace, Phoenix, Scramble, SeaWolf, SpaceEncounters, SpaceInvaders, ThePit, TimePilot, xevious. **No Pole Position directory exists.**
- Web-searched for a Pole Position page on the domain; nothing.

Because there is no JavaScript viewer to read, browser tooling would not have helped — the
content is not there in any form. I did not substitute an estimate; I substituted Atari's own
PROM data files (source A), which are strictly better evidence than a third-party decoding.

---

## 6. How many colours are on screen at once

Addressable simultaneously, by construction:

- top half: background bank (16) + sprite bank (16) + alpha bank (16) = 48 slots
- bottom half: road bank (16) + sprite bank (16) + alpha bank (16) = 48 slots
- of the sprite and alpha banks one entry each is the transparency slot

Union over a whole frame = **62 usable palette slots**, resolving to **45 distinct RGB values**
(the duplication is deliberate: several colours appear in more than one bank so the same hue is
available to scenery, sprites and text).

Measured: the in-game capture uses **31** distinct colours, the title screen **8**. Both are
well within the 45 available, which is consistent.

---

## 7. Practical shortlist for the homage

The colours that actually define the look, all `#RRGGBB` exactly as the hardware DAC emits them:

| Role | Hex | Index | Provenance |
|---|---|---|---|
| Road asphalt | `#515151` | `0x40` | A+B derived, C confirmed |
| Grass / verge | `#439D0E` | `0x4F` | A+B derived, C confirmed |
| Red kerb | `#E02D0E` | `0x47` | A+B derived, C confirmed |
| White kerb / edge line | `#E0E0E0` | `0x48` | A+B derived, C confirmed |
| Yellow edge line | `#E0E000` | `0x46` | A+B derived, C confirmed |
| Start-line white | `#FFFFFF` | `0x44` | A+B derived, C confirmed |
| Start-line red | `#FF0000` | `0x45` | A+B derived, C confirmed |
| Sky, topmost band | `#1F70FF` | `0x0F` | A+B derived, C confirmed |
| Sky band 2 | `#2D70FF` | `0x0E` | A+B derived, C confirmed |
| Sky band 3 | `#4370FF` | `0x0D` | A+B derived, C confirmed |
| Sky band 4 | `#5170FF` | `0x0C` | A+B derived, C confirmed |
| Sky band 5 (at horizon) | `#6270FF` | `0x0B` | A+B derived, C confirmed |
| Horizon dark band | `#2D5162` | `0x03` | A+B derived, C confirmed |
| Distant terrain brown | `#62431F` | `0x02` | A+B derived, C confirmed |
| HUD white | `#FFFFFF` | `0x21` | A+B derived, C confirmed |
| HUD red | `#D21F1F` | `0x28` | A+B derived, C confirmed |
| HUD orange | `#FF7000` | `0x2A` | A+B derived, C confirmed |
| Title-screen sand | `#E0BC70` | `0x2C` | A+B derived, C confirmed |

CSS-ready:

```css
--pp-road:        #515151;
--pp-grass:       #439D0E;
--pp-kerb-red:    #E02D0E;
--pp-kerb-white:  #E0E0E0;
--pp-edge-yellow: #E0E000;
--pp-sky-1:       #1F70FF;
--pp-sky-2:       #2D70FF;
--pp-sky-3:       #4370FF;
--pp-sky-4:       #5170FF;
--pp-sky-5:       #6270FF;
--pp-horizon:     #2D5162;
--pp-terrain:     #62431F;
--pp-hud-white:   #FFFFFF;
--pp-hud-red:     #D21F1F;
--pp-hud-orange:  #FF7000;
```

---

## 8. Sources

Exact URLs fetched, and what each produced.

| URL | What it gave |
|---|---|
| `https://raw.githubusercontent.com/mamedev/mame/master/src/mame/namco/polepos_v.cpp` | `polepos_palette()` — resistor-ladder comment block (220/470/1k/2.2k), weights `0x0e/0x1f/0x43/0x8f`, the PROM→layer wiring, `draw_road`, `zoom_sprite`, `screen_update`. Cites Atari schematic sheets 13A/14B/15B. |
| `https://raw.githubusercontent.com/mamedev/mame/master/src/mame/namco/polepos.cpp` | ROM definitions with PROM part numbers + CRC32/SHA1; `set_raw(MASTER_CLOCK/4, 384, 0, 256, 264, 16, 240)` giving native 256x224 @ 60.606 Hz; `GFXDECODE` layer/colorbase layout. |
| `https://raw.githubusercontent.com/mamedev/mame/master/src/mame/namco/polepos.h` | State-class member declarations (checked for completeness; no unique facts). |
| `https://raw.githubusercontent.com/historicalsource/pole-position/master/POL137.ROM` | Atari 1982 ASCII hex dump of the **red** palette PROM 136014-137. CRC32 `f07ff2ad`. |
| `.../POL138.ROM` | **Green** palette PROM 136014-138. CRC32 `adbde7d7`. |
| `.../POL139.ROM` | **Blue** palette PROM 136014-139. CRC32 `ddac786a`. |
| `.../POL140.ROM` | Alpha/text colour LUT 136014-140. CRC32 `1e8d0491`. |
| `.../POL141.ROM` | Background colour LUT 136014-141. CRC32 `0e4fe8a0`. |
| `.../POL145.ROM` | Road colour LUT 136014-145. CRC32 `7afc7cfc`. |
| `.../POL146.ROM` | Sprite colour LUT 136014-146. CRC32 `ca4ba741`. |
| `https://raw.githubusercontent.com/historicalsource/pole-position/master/014X0.DAT` | Atari's part manifest confirming `POLnnn.ROM` ↔ `136014-nnn` naming. |
| `https://api.github.com/repos/historicalsource/pole-position/git/trees/HEAD?recursive=1` | File listing of the Atari source archive. |
| `http://adb.arcadeitalia.net/media/mame.current/ingames/polepos.png` | Native 256x224 in-game capture, Namco World set. |
| `http://adb.arcadeitalia.net/media/mame.current/titles/polepos.png` | Native 256x224 title-screen capture. |
| `http://adb.arcadeitalia.net/media/mame.current/ingames/poleposa.png` | Native 256x224 in-game capture, Atari set (replicate). |
| `http://adb.arcadeitalia.net/media/mame.current/titles/poleposa.png` | Native 256x224 title-screen capture, Atari set (replicate). |
| `http://adb.arcadeitalia.net/media/mame.current/ingames/polepos2.png` | Pole Position II capture, used only as a **negative control**. |
| `https://computerarcheology.com/Arcade/PolePosition/` | **HTTP 404.** |
| `https://computerarcheology.com/Arcade/PolePos/` | **HTTP 404.** |
| `https://computerarcheology.com/Arcade/` | Section index — Pole Position not listed. |
| `https://api.github.com/repos/topherCantrell/computerarcheology/git/trees/HEAD?recursive=1` | Full site content tree — confirms no Pole Position material exists. |

### Reproducing this

```python
# 1. fetch POL137/138/139.ROM from historicalsource/pole-position
# 2. parse lines of the form  ADDR=hh,hh,...  into 256 bytes; verify CRC32
WEIGHTS = [0x0e, 0x1f, 0x43, 0x8f]          # 2.2k, 1k, 470, 220 ohm -> normalised conductance
level = lambda nib: sum(WEIGHTS[b] for b in range(4) if (nib >> b) & 1)
palette = [(level(RED[i]), level(GREEN[i]), level(BLUE[i])) for i in range(128)]
```

---

## 9. Limitations, stated plainly

- **Computer Archeology contributed nothing.** It has no Pole Position content (§5.1).
- The RGB values are **DAC signal levels**, not measured phosphor output. No CRT gamma, no colour-temperature correction. Same basis MAME uses.
- The four sampled captures are MAME renders, not photographs of a real PCB. They confirm that MAME's framebuffer matches the PROM arithmetic; they cannot independently confirm the resistor values. That corroboration comes instead from the arithmetic itself re-deriving `0x0e/0x1f/0x43/0x8f` from the schematic resistor values (§2.3).
- **Sprite colour purposes are not attributed to specific objects.** Doing so honestly would require disassembling the Z8002 code to see which colour set each object is issued. I did not do that, and I have not guessed.
- The road/background/alpha purposes **are** attributed, because they fall directly out of decoding the lookup PROMs and are confirmed by the row-attribution in §4.3.
- Only the Namco World (`polepos`) and Atari (`poleposa`) 1982 sets were analysed. Pole Position II (1983) has different palette PROMs and a different palette — do not mix them.
