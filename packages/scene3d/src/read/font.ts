/**
 * A 5×7 bitmap font, and the blitter that draws it.
 *
 * The contact sheet is a PNG, and a PNG has no text. Every alternative to
 * carrying our own glyphs was worse:
 *
 *   - Rendering labels in Blender couples a *reporting* artifact to the
 *     renderer's font stack, which varies by machine and by Blender version.
 *     The sheet would stop being byte-deterministic, which is the property
 *     that lets it be diffed and pinned by a test.
 *   - A system font needs a rasteriser, i.e. a dependency, in a package whose
 *     only dependency today is the glTF validator.
 *   - SVG keeps text as text but cannot be READ as an image by the consumer
 *     this artifact exists for: a model with vision opens PNGs, not SVGs.
 *     (The text-only half of that audience is already served — `ortho.svg`
 *     and `digest.md` carry the same facts as characters.)
 *
 * So: 5×7 cells, one bit per pixel, written as string art. String art rather
 * than packed hex because a glyph you cannot read in the source is a glyph
 * nobody will ever fix, and the cost is a few hundred bytes of source.
 *
 * 5×7 is the smallest cell that renders lowercase with true descenders, which
 * matters here: part identifiers are lowercase (`prp_plinth`) and case is
 * significant, so upper-casing labels to fit a smaller cell would print a
 * name that does not exist in the scene.
 */

/**
 * Glyph cell, in pixels, before any integer scale factor.
 *
 * Five wide and NINE tall, for a face that is really 5×7. The two extra rows
 * are the descender bed. Without them the cell has one baseline for everyone,
 * so `p` and `g` have to be drawn with their bowls raised into the x-height —
 * which is precisely how `prp_plinth` first rendered as `PrP_Plinth`, a part
 * name that does not exist in any scene. Capitals and digits occupy rows 0–6,
 * lowercase sits on the same row-6 baseline with its x-height at rows 2–6,
 * and only the five descending letters reach rows 7–8.
 */
export const GLYPH_W = 5;
export const GLYPH_H = 9;
/** Blank columns between glyphs, at scale 1. */
export const GLYPH_GAP = 1;

/**
 * Rows are top-first; `#` is ink, anything else is paper.
 *
 * An entry shorter than `GLYPH_H` is padded with blank rows at the BOTTOM, so
 * a glyph that does not descend is written as the seven rows it actually
 * uses. That keeps the art readable in source and puts every non-descending
 * character on the same baseline by construction rather than by care.
 *
 * Only the characters the sheet can actually emit are defined. Anything else
 * renders as `MISSING` — an outlined box — rather than as a space: a part
 * named with a character this font lacks must LOOK unrenderable, because a
 * silently blank label reads as a part with no name.
 */
const GLYPHS: Record<string, string> = {
  " ": "...../...../...../...../...../...../.....",

  A: ".###./#...#/#...#/#####/#...#/#...#/#...#",
  B: "####./#...#/#...#/####./#...#/#...#/####.",
  C: ".###./#...#/#..../#..../#..../#...#/.###.",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####",
  F: "#####/#..../#..../####./#..../#..../#....",
  G: ".###./#...#/#..../#.###/#...#/#...#/.###.",
  H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: "#####/..#../..#../..#../..#../..#../#####",
  J: "..###/...#./...#./...#./...#./#..#./.##..",
  K: "#...#/#..#./#.#../##.../#.#../#..#./#...#",
  L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#...#/#...#/#...#/#...#",
  N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#",
  O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
  R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".###./#...#/#..../.###./....#/#...#/.###.",
  T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
  W: "#...#/#...#/#...#/#...#/#.#.#/##.##/#...#",
  X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..",
  Z: "#####/....#/...#./..#../.#.../#..../#####",

  a: "...../...../.###./....#/.####/#...#/.####",
  b: "#..../#..../####./#...#/#...#/#...#/####.",
  c: "...../...../.###./#...#/#..../#...#/.###.",
  d: "....#/....#/.####/#...#/#...#/#...#/.####",
  e: "...../...../.###./#...#/#####/#..../.###.",
  f: "..##./.#..#/.#.../####./.#.../.#.../.#...",
  /* The five descenders, and the only glyphs that use rows 7–8. Their bowls
     sit on the row-6 baseline exactly like `a` and `o`; the tail is what
     hangs. Raising the bowl instead is what turned `p` into `P`. */
  g: "...../...../.####/#...#/#...#/#...#/.####/....#/.###.",
  h: "#..../#..../####./#...#/#...#/#...#/#...#",
  i: "..#../...../.##../..#../..#../..#../.###.",
  j: "...#./...../..##./...#./...#./...#./...#./#..#./.##..",
  /* The arm starts at the x-height, not at the ascender. Drawn full-height
     it is indistinguishable from `K`, and `prp_socket` rendered as
     `prp_socKet` — a name that matches nothing in the scene. */
  k: "#..../#..../#..#./#.#../##.../#.#../#..#.",
  l: ".##../..#../..#../..#../..#../..#../.###.",
  m: "...../...../##.#./#.#.#/#.#.#/#...#/#...#",
  n: "...../...../####./#...#/#...#/#...#/#...#",
  o: "...../...../.###./#...#/#...#/#...#/.###.",
  p: "...../...../####./#...#/#...#/#...#/####./#..../#....",
  q: "...../...../.####/#...#/#...#/#...#/.####/....#/....#",
  r: "...../...../#.##./##..#/#..../#..../#....",
  s: "...../...../.####/#..../.###./....#/####.",
  t: ".#.../.#.../####./.#.../.#.../.#..#/..##.",
  u: "...../...../#...#/#...#/#...#/#..##/.##.#",
  v: "...../...../#...#/#...#/#...#/.#.#./..#..",
  w: "...../...../#...#/#...#/#.#.#/#.#.#/.#.#.",
  x: "...../...../#...#/.#.#./..#../.#.#./#...#",
  y: "...../...../#...#/#...#/#...#/#...#/.####/....#/.###.",
  z: "...../...../#####/...#./..#../.#.../#####",

  "0": ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
  "1": "..#../.##../..#../..#../..#../..#../.###.",
  "2": ".###./#...#/....#/...#./..#../.#.../#####",
  "3": "#####/...#./..##./....#/....#/#...#/.###.",
  "4": "...#./..##./.#.#./#..#./#####/...#./...#.",
  "5": "#####/#..../####./....#/....#/#...#/.###.",
  "6": "..##./.#.../#..../####./#...#/#...#/.###.",
  "7": "#####/....#/...#./..#../.#.../.#.../.#...",
  "8": ".###./#...#/#...#/.###./#...#/#...#/.###.",
  "9": ".###./#...#/#...#/.####/....#/...#./.##..",

  ".": "...../...../...../...../...../..##./..##.",
  ",": "...../...../...../...../...../..##./..##./.#.../.....",
  ":": "...../...../..##./..##./...../..##./..##.",
  ";": "...../...../..##./..##./...../..##./..##./.#.../.....",
  "-": "...../...../...../.###./...../...../.....",
  "+": "...../..#../..#../#####/..#../..#../.....",
  "=": "...../...../#####/...../#####/...../.....",
  /* Below the baseline, where an underscore belongs. On the baseline it
     merged with the descender of any `p` or `g` beside it, and `prp_ramp`
     read as one connected scribble. */
  _: "...../...../...../...../...../...../...../#####/.....",
  "/": "....#/....#/...#./..#../.#.../#..../#....",
  "\\": "#..../#..../.#.../..#../...#./....#/....#",
  "(": "...#./..#../.#.../.#.../.#.../..#../...#.",
  ")": ".#.../..#../...#./...#./...#./..#../.#...",
  "[": ".###./.#.../.#.../.#.../.#.../.#.../.###.",
  "]": ".###./...#./...#./...#./...#./...#./.###.",
  "<": "...#./..#../.#.../#..../.#.../..#../...#.",
  ">": ".#.../..#../...#./....#/...#./..#../.#...",
  "#": ".#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.",
  "%": "#...#/#..#./...#./..#../.#.../.#..#/#...#",
  "?": ".###./#...#/....#/...#./..#../...../..#..",
  "!": "..#../..#../..#../..#../..#../...../..#..",
  "'": "..#../..#../...../...../...../...../.....",
  '"': ".#.#./.#.#./...../...../...../...../.....",
  "*": "...../#.#.#/.###./#####/.###./#.#.#/.....",
  /* `compassName` prefixes an off-octant view with this — a 6-step
     turntable's 60° is genuinely between `front-right` and `right`. Missing
     from the face at first, so the sheet drew its missing-glyph box and a
     legitimate label read as a corrupt one. */
  "~": "...../...../...../.##../#..##/...../.....",

  /* Typographic characters the report vocabulary already uses. Kept as the
     real Unicode keys so a caller writes "45°" rather than remembering an
     ASCII stand-in — the sheet and the text report then read alike. */
  "°": ".##../#..#./#..#./.##../...../...../.....",
  "×": "...../...../#...#/.#.#./..#../.#.#./#...#",
  "·": "...../...../...../..##./..##./...../.....",
  "→": "...../..#../...#./#####/...#./..#../.....",
  "←": "...../..#../.#.../#####/.#.../..#../.....",
  "↑": "..#../.###./#.#.#/..#../..#../..#../..#..",
  "↓": "..#../..#../..#../..#../#.#.#/.###./..#..",
};

/**
 * The glyph drawn for a character the font does not carry.
 *
 * An outlined box, deliberately conspicuous. The alternative — falling back
 * to a space — turns "this label contains a character we cannot draw" into
 * "this part has a shorter name", and the reader has no way to tell.
 */
const MISSING = "#####/#...#/#...#/#...#/#...#/#...#/#####";

/** Rows of a glyph as bit arrays, memoised on first use. */
const cache = new Map<string, number[][]>();

function glyphRows(ch: string): number[][] {
  const hit = cache.get(ch);
  if (hit) return hit;
  const art = GLYPHS[ch] ?? MISSING;
  const rows = art.split("/").map((row) => {
    const bits: number[] = [];
    for (let x = 0; x < GLYPH_W; x++) bits.push(row[x] === "#" ? 1 : 0);
    return bits;
  });
  // A malformed entry is a source bug, not a runtime condition: pad rather
  // than throw so one bad glyph cannot take down a whole compile's report.
  while (rows.length < GLYPH_H) rows.push(new Array(GLYPH_W).fill(0));
  cache.set(ch, rows);
  return rows;
}

/** Width in pixels of `text` at `scale`, including inter-glyph gaps. */
export function textWidth(text: string, scale = 1): number {
  if (text.length === 0) return 0;
  return ([...text].length * (GLYPH_W + GLYPH_GAP) - GLYPH_GAP) * scale;
}

/** Height in pixels of one line at `scale`. */
export function textHeight(scale = 1): number {
  return GLYPH_H * scale;
}

/**
 * Shorten `text` to fit `maxPx`, with a trailing ellipsis when it had to cut.
 *
 * The ellipsis is not decoration: a label silently cut at the cell edge reads
 * as the whole name, and a reader then hunts the manifest for a part that
 * does not exist. `…` is not in the font, so the mark is three periods, which
 * is.
 */
export function fitText(text: string, maxPx: number, scale = 1): string {
  if (textWidth(text, scale) <= maxPx) return text;
  const chars = [...text];
  const dots = "...";
  for (let keep = chars.length - 1; keep > 0; keep--) {
    const candidate = chars.slice(0, keep).join("") + dots;
    if (textWidth(candidate, scale) <= maxPx) return candidate;
  }
  return "";
}

/**
 * Break `text` into lines that each fit `maxPx`.
 *
 * Greedy, on spaces. Sentences explaining a convention are the one thing on
 * the sheet that must survive intact — a truncated "azimuth 0° is..." teaches
 * the reader nothing and costs the same pixels — so these wrap where every
 * other label ellipsises. A single word longer than the line is emitted whole
 * and allowed to overhang rather than being cut mid-identifier.
 */
export function wrapText(text: string, maxPx: number, scale = 1): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, scale) > maxPx) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

/** An RGBA surface the blitter writes into. Matches `DecodedImage`. */
export interface Surface {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Rgba = readonly [number, number, number, number];

/** Set one pixel, alpha-blended over what is already there, bounds-checked. */
export function blendPixel(surface: Surface, x: number, y: number, colour: Rgba): void {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return;
  const at = (y * surface.width + x) * 4;
  const a = colour[3] / 255;
  if (a <= 0) return;
  const d = surface.data;
  if (a >= 1) {
    d[at] = colour[0];
    d[at + 1] = colour[1];
    d[at + 2] = colour[2];
    d[at + 3] = 255;
    return;
  }
  const dstA = d[at + 3]! / 255;
  const outA = a + dstA * (1 - a);
  for (let c = 0; c < 3; c++) {
    const src = colour[c]!;
    const dst = d[at + c]!;
    d[at + c] = outA > 0 ? Math.round((src * a + dst * dstA * (1 - a)) / outA) : 0;
  }
  d[at + 3] = Math.round(outA * 255);
}

/**
 * Draw `text` with its top-left corner at (x, y).
 *
 * Returns the x the caller would continue at, so runs of differently-coloured
 * text compose without the caller re-measuring.
 */
export function drawText(
  surface: Surface,
  text: string,
  x: number,
  y: number,
  colour: Rgba,
  scale = 1,
): number {
  let cursor = Math.round(x);
  const top = Math.round(y);
  for (const ch of text) {
    const rows = glyphRows(ch);
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = rows[gy]!;
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (row[gx] !== 1) continue;
        // One source bit becomes a scale×scale block: integer scaling only,
        // so glyph edges stay hard and the sheet stays byte-deterministic.
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            blendPixel(surface, cursor + gx * scale + sx, top + gy * scale + sy, colour);
          }
        }
      }
    }
    cursor += (GLYPH_W + GLYPH_GAP) * scale;
  }
  return cursor;
}

/** `drawText`, right-aligned so its last pixel column lands on `right`. */
export function drawTextRight(
  surface: Surface,
  text: string,
  right: number,
  y: number,
  colour: Rgba,
  scale = 1,
): void {
  drawText(surface, text, right - textWidth(text, scale), y, colour, scale);
}

/** `drawText`, centred on `cx`. */
export function drawTextCentred(
  surface: Surface,
  text: string,
  cx: number,
  y: number,
  colour: Rgba,
  scale = 1,
): void {
  drawText(surface, text, Math.round(cx - textWidth(text, scale) / 2), y, colour, scale);
}
