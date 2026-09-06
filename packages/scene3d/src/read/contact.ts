import { decodePng, encodePng, type DecodedImage } from "../sheet/png.js";
import {
  blendPixel,
  drawText,
  drawTextCentred,
  drawTextRight,
  fitText,
  textHeight,
  textWidth,
  wrapText,
  type Rgba,
  type Surface,
} from "./font.js";
import { projectDirection, type ProofView } from "./views.js";

/**
 * The contact sheet: every proof frame on one labelled page.
 *
 * A turntable ships N loose PNGs named by a hash and a serial. Opening one
 * tells a reader what the model looks like from SOMEWHERE, and nothing else —
 * not which side, not which blob is which part, not how big any of it is. So
 * the reader's questions ("is the back finished?", "which of those cylinders
 * is `prp_column`?") are unanswerable from the very artifact that exists to
 * answer them, and an agent burns a turn guessing filenames to find out.
 *
 * This is the one image that answers all of it:
 *
 *   - Every frame, gridded, so the whole orbit is one glance rather than N
 *     file opens with nothing carried between them.
 *   - A compass name and azimuth over each cell, from `views.ts` — the same
 *     source the text report quotes, so the picture and the prose agree.
 *   - A projected axis gnomon in each cell, so "which way is +X here" is
 *     read off the picture rather than reconstructed from trigonometry.
 *   - Numbered badges on the parts, keyed to a legend, so a shape in the
 *     render has a NAME the reader can put in their next edit.
 *   - The conventions themselves, printed along the bottom. The sheet has to
 *     survive being the only thing in the reader's context.
 *
 * Restraint is a requirement, not a taste: a sheet dense enough to be
 * unreadable is worse than no sheet, because it costs the same context and
 * returns less. Hence one background, one accent, badges only on parts big
 * enough to be worth naming, and every measurement stated once.
 *
 * Deterministic: no timestamps, no float formatting drift, integer scaling
 * only. The same compile writes byte-identical pixels, so the sheet diffs.
 */

const SHEET_BG: Rgba = [18, 16, 14, 255];
const CELL_BG: Rgba = [30, 27, 24, 255];
const CELL_EDGE: Rgba = [56, 50, 44, 255];
const TITLE_FG: Rgba = [240, 233, 222, 255];
const LABEL_FG: Rgba = [226, 216, 200, 255];
const DIM_FG: Rgba = [138, 128, 116, 255];
const RULE: Rgba = [48, 43, 38, 255];
/** The report's own dimension red, so the two artifacts share a palette. */
const ACCENT: Rgba = [198, 106, 88, 255];
const BADGE_BG: Rgba = [16, 14, 12, 225];

/** Blender's own axis colours: an author already reads these as X/Y/Z. */
const AXIS_X: Rgba = [222, 96, 92, 255];
const AXIS_Y: Rgba = [140, 198, 108, 255];
const AXIS_Z: Rgba = [104, 152, 226, 255];

const PAD = 16;
const GUTTER = 10;
const CELL_LABEL_H = 20;
const TEXT = 2;
const TITLE_TEXT = 3;
const MAX_COLUMNS = 4;
/**
 * The narrowest the frame grid may be, in pixels.
 *
 * Sized so the convention footnote wraps to a few lines rather than a
 * paragraph: those sentences are the sheet's only self-explanation, and a
 * page where they outweigh the pictures has inverted its own purpose.
 */
const MIN_GRID_W = 720;

/**
 * The largest a decoded proof frame is kept while the sheet composites.
 *
 * `proof.resolution` is contract-bounded only at 8192, so a maximum turntable
 * (64 frames) at that size would hold ~17 GB of decoded RGBA surfaces at once —
 * an out-of-memory kill instead of a picture. Every cell downsamples to at most
 * the grid's `cellPx ≤ 1024` measure regardless, so bounding each frame to this
 * as it decodes is lossless for the sheet and turns the pathological case into a
 * normal render. Comfortably above the widest single-frame cell (`MIN_GRID_W`).
 */
const MAX_FRAME_WORK_PX = 1024;

/**
 * The id-map channel steps, mirroring `ID_STEPS` in `runner.py`.
 *
 * Eight evenly-spaced levels per channel with 36–37 between neighbours, so a
 * nearest-step decode has ±17 of guaranteed headroom against filtering and
 * codec rounding. Duplicated here rather than imported because the producer
 * is Python; the pairing is pinned by a test.
 */
const ID_STEPS = Array.from({ length: 8 }, (_, k) => Math.round((k * 255) / 7));

export interface ContactFrame {
  /** The beauty frame, as PNG bytes. */
  png: Uint8Array;
  /** The object-index map rendered beside it, when the proof wrote one. */
  idPng?: Uint8Array;
  /** Where this frame was photographed from, when that is knowable. */
  view?: ProofView;
}

export interface ContactSheetInput {
  /** Scene name, or whatever names this compile. */
  title: string;
  frames: ContactFrame[];
  /**
   * Part names in id-map code order (`proofIdParts`): the name at index i is
   * encoded as code i+1. Without it the badges have nothing to say and are
   * omitted — a badge with no legend entry is a worse artifact than none.
   */
  idParts?: string[];
  /** Short facts for the header: world size, triangle count, and so on. */
  facts?: string[];
  /** Rendered pixels per frame cell. */
  cellPx?: number;
}

/** What the sheet measured while drawing itself, for the caller to report. */
export interface ContactSheetResult {
  png: Uint8Array;
  width: number;
  height: number;
  /** Legend number (1-based) → part name, in the order drawn. */
  legend: Array<{ badge: number; part: string }>;
  /**
   * Parts that carry an id map but occupy no pixel in ANY frame.
   *
   * Measured, not inferred, and worth surfacing: a part present in the census
   * and invisible from every angle of the orbit is either fully enclosed or
   * fully occluded, and neither is something an author can see going wrong.
   */
  neverVisible: string[];
}

/**
 * Draw the sheet.
 *
 * Never throws on a frame it cannot read: a sheet that renders seven of eight
 * frames and SAYS the eighth was unreadable is useful, and one that fails the
 * whole compile over a truncated PNG is not. The unreadable cell is drawn as
 * a labelled blank for the same reason the font has a missing-glyph box —
 * absence must look like absence.
 */
export function renderContactSheet(input: ContactSheetInput): ContactSheetResult {
  const cellPx = clampInt(input.cellPx ?? 256, 96, 1024);
  const frames = input.frames;
  const columns = Math.min(MAX_COLUMNS, Math.max(1, frames.length));
  const rows = Math.max(1, Math.ceil(frames.length / columns));

  /* Few frames make the cells BIGGER, never the page narrower.
     A one-frame proof laid out at the nominal cell size produced a 288px
     column with thirteen legend rows and a footer wrapped into a dozen
     lines — a sheet taller than it was wide, in which the one thing worth
     seeing was the smallest element on the page. The grid keeps a minimum
     measure instead, and the frames grow to fill it. */
  const cellW = Math.max(cellPx, Math.floor((MIN_GRID_W - (columns - 1) * GUTTER) / columns));
  const cellH = cellW + CELL_LABEL_H;

  const gridW = columns * cellW + (columns - 1) * GUTTER;
  const width = gridW + PAD * 2;
  /* The header facts wrap rather than ellipsise. They are the scene's
     measurements — how big, how many parts — and a narrow sheet cutting
     `13 parts` to `13...` drops the noun that made the number mean
     anything. Cheap: it is one line on any multi-column sheet. */
  const factLines = wrapText((input.facts ?? []).join("  ·  "), width - PAD * 2, TEXT);
  const headerH =
    PAD + textHeight(TITLE_TEXT) + 8 + factLines.length * (textHeight(TEXT) + 4) + 8;
  const gridTop = headerH;
  const gridH = rows * cellH + (rows - 1) * GUTTER;

  // Decode first: the legend's height depends on how many parts actually
  // showed up, and the canvas cannot be allocated before that is known.
  //
  // The BEAUTY frames persist to the end (drawn into cells), so each is bounded
  // to the working resolution as it decodes — a cell is ≤1024 px anyway, so the
  // downsample is lossless for display and the held set is
  // O(frames × MAX_FRAME_WORK_PX²), never O(frames × proof-resolution²).
  const decoded = frames.map((frame) => {
    const img = safeDecode(frame.png);
    return img ? boundResolution(img) : null;
  });
  const names = input.idParts ?? [];
  // The ID maps are counted at FULL resolution — deliberately NOT downsampled
  // like the beauty frames. The badge floor (MIN_BADGE_PIXELS) is a correctness
  // threshold, and a part's exact pixel count is the honest input to it; a
  // downsampled count would be a nearest-sampling estimate with no bound in
  // either direction (a 1-pixel speck could scale past the floor, a thin part
  // could vanish). The cost is a full-resolution scan, which is a CONSCIOUS
  // tradeoff: it is bounded (each map is decoded TRANSIENTLY here and only the
  // small normalized placement survives the iteration, so at most one map is live
  // at a time), and it is paid only by an unusual >1024px proof the author chose.
  // Correctness of the threshold beats shrinking a transient the caller opted into.
  const placements = frames.map((frame) => {
    if (!frame.idPng) return new Map<number, Placement>();
    const map = safeDecode(frame.idPng);
    return map ? locateParts(map, names.length) : new Map<number, Placement>();
  });

  /* Each part is badged ONCE, in the frame where it shows largest.
     Badging every part in every cell was the first thing tried and it
     buried the geometry: 13 parts over 8 frames is 104 discs, and the
     render underneath them stopped being legible — the sheet cost its
     context and returned less than the loose PNGs it replaced. One badge
     per part is the same information (every part gets a name) at an eighth
     of the ink, and it lands where the part is easiest to actually see. */
  const bestFrame = assignBadges(placements);
  const seen = new Set(bestFrame.keys());
  const legend = names
    .map((part, index) => ({ badge: index + 1, part }))
    .filter((entry) => seen.has(entry.badge));
  const neverVisible = names.filter((_, index) => !seen.has(index + 1));

  /* One crop rectangle for the whole sheet, from the union of every frame's
     subject. The proof auto-frames each render with generous margin, so
     eight uncropped tiles spend most of their pixels on backdrop. Cropping
     each frame to its OWN subject would be tighter still and would silently
     rescale the model between cells — the one thing a turntable must not
     do, since a reader compares proportions across it. */
  const crop = contentCrop(decoded);

  const legendBlock = layoutLegend(legend, width - PAD * 2);
  const footerLines = conventionLines(frames).flatMap((line) =>
    wrapText(line, width - PAD * 2, TEXT),
  );
  const legendH =
    legend.length > 0 ? 10 + legendBlock.rows * (textHeight(TEXT) + 6) + 8 : 0;
  const footerH = footerLines.length * (textHeight(TEXT) + 4) + 10;
  const height = gridTop + gridH + legendH + footerH + PAD;

  const sheet: Surface = {
    width,
    height,
    data: new Uint8Array(width * height * 4),
  };
  fill(sheet, SHEET_BG);

  /* Header. The title carries the scene; the facts line carries the numbers
     an author checks before anything else (how big, how many parts). */
  drawText(sheet, fitText(input.title, width - PAD * 2, TITLE_TEXT), PAD, PAD, TITLE_FG, TITLE_TEXT);
  let factY = PAD + textHeight(TITLE_TEXT) + 8;
  for (const line of factLines) {
    if (line.length > 0) drawText(sheet, line, PAD, factY, DIM_FG, TEXT);
    factY += textHeight(TEXT) + 4;
  }

  frames.forEach((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = PAD + col * (cellW + GUTTER);
    const y = gridTop + row * (cellH + GUTTER);
    drawCell(sheet, {
      x,
      y,
      w: cellW,
      h: cellH,
      image: decoded[index]!,
      crop,
      view: frame.view,
      index,
      badges: [...bestFrame.entries()]
        .filter(([, at]) => at.frame === index)
        .map(([code, at]) => ({ code, u: at.u, v: at.v, pixels: at.pixels })),
    });
  });

  let cursorY = gridTop + gridH;
  if (legend.length > 0) {
    cursorY += 10;
    rule(sheet, PAD, cursorY - 5, width - PAD);
    for (let i = 0; i < legend.length; i++) {
      const col = i % legendBlock.columns;
      const row = Math.floor(i / legendBlock.columns);
      const lx = PAD + col * legendBlock.columnW;
      const ly = cursorY + row * (textHeight(TEXT) + 6);
      const entry = legend[i]!;
      const numberW = drawText(sheet, String(entry.badge), lx, ly, ACCENT, TEXT) - lx;
      drawText(
        sheet,
        fitText(entry.part, legendBlock.columnW - numberW - 14, TEXT),
        lx + numberW + 6,
        ly,
        LABEL_FG,
        TEXT,
      );
    }
    cursorY += legendBlock.rows * (textHeight(TEXT) + 6) + 8;
  }

  /* The conventions, on the page. Everything above is unreadable without
     them — "az 135°" means nothing to a reader who does not know where 0 is
     — and the sheet has to work as the only artifact in someone's context.
     Wrapped, never ellipsised: a convention cut off mid-sentence is the one
     label on this page that fails at its whole job when shortened. */
  rule(sheet, PAD, cursorY, width - PAD);
  cursorY += 10;
  for (const line of footerLines) {
    drawText(sheet, line, PAD, cursorY, DIM_FG, TEXT);
    cursorY += textHeight(TEXT) + 4;
  }

  return {
    png: encodePng({ width, height, data: sheet.data }),
    width,
    height,
    legend,
    neverVisible,
  };
}

interface CellBadge {
  code: number;
  u: number;
  v: number;
  pixels: number;
}

interface CellInput {
  x: number;
  y: number;
  w: number;
  h: number;
  image: DecodedImage | null;
  crop: Crop | null;
  view?: ProofView;
  index: number;
  badges: CellBadge[];
}

function drawCell(sheet: Surface, cell: CellInput): void {
  const imgTop = cell.y + CELL_LABEL_H;
  const imgH = cell.h - CELL_LABEL_H;

  /* The label sits ABOVE the picture, outside it. Overlaying it would put
     text on the one part of the cell whose pixels are the evidence.
     Split left/right rather than run as one string: `[3] back-right · az
     135°` overflows a cell at a readable size, and ellipsising it drops the
     azimuth — the half a reader cannot reconstruct from the other. */
  const left = cell.view ? `[${cell.index}] ${cell.view.name}` : `[${cell.index}]`;
  // The bare angle, not `az 135°`: the two characters of prefix were enough
  // to push `[7] front-left` past the cell edge, and the footer already
  // establishes that the number is an azimuth. Better a complete compass
  // name than a labelled number beside a truncated one.
  const right = cell.view ? `${Math.round(cell.view.azimuthDeg)}°` : "pose not recorded";
  drawText(sheet, fitText(left, cell.w - textWidth(right, TEXT) - 10, TEXT), cell.x, cell.y + 3, LABEL_FG, TEXT);
  drawTextRight(sheet, right, cell.x + cell.w, cell.y + 3, DIM_FG, TEXT);

  rect(sheet, cell.x, imgTop, cell.w, imgH, CELL_BG);
  if (!cell.image) {
    drawTextCentred(sheet, "frame unreadable", cell.x + cell.w / 2, imgTop + imgH / 2 - 6, ACCENT, TEXT);
    outline(sheet, cell.x, imgTop, cell.w, imgH, CELL_EDGE);
    return;
  }

  const placed = blitFitted(sheet, cell.image, cell.crop, cell.x, imgTop, cell.w, imgH);
  outline(sheet, cell.x, imgTop, cell.w, imgH, CELL_EDGE);

  if (cell.view) {
    const inset = gnomonInset(cell.w);
    drawGnomon(sheet, cell.view, cell.x + inset, imgTop + imgH - inset, cell.w);
  }
  drawBadges(sheet, cell, placed);
}

/**
 * The numbered discs, on the pixels the part actually occupies.
 *
 * The placement comes from the id map, not from the screen rect, and the
 * difference matters. A rect is a bounding box: its centre is the hole of a
 * torus and the empty air inside an arch, and for an occluded part it points
 * confidently at whatever is standing in front. The id map says which pixels
 * ARE the part, so a badge lands on the part and an invisible part gets no
 * badge at all — which is itself the correct report.
 */
function drawBadges(sheet: Surface, cell: CellInput, area: Placed): void {
  const radius = badgeRadius(cell.w);
  const placed: Array<{ x: number; y: number }> = [];
  // Largest first, so when two badges collide the one that gets nudged is
  // the smaller part — it has less room to be wrong about.
  const ordered = [...cell.badges].sort((a, b) => b.pixels - a.pixels || a.code - b.code);
  for (const entry of ordered) {
    const spot = deconflict(
      area.x + entry.u * area.w,
      area.y + entry.v * area.h,
      placed,
      cell.x,
      cell.y + CELL_LABEL_H,
      cell.x + cell.w,
      cell.y + cell.h,
      radius,
    );
    placed.push(spot);
    badge(sheet, spot.x, spot.y, entry.code, radius);
  }
}

/**
 * Choose the one frame that badges each part.
 *
 * The frame where the part shows the most pixels — the angle where it is
 * least occluded and most foreshortening-free, which is the angle a reader
 * asked "which one is `prp_lantern`?" would want to be looking at anyway.
 * Ties break on the lower frame index so the sheet stays deterministic.
 *
 * A part below the visibility floor everywhere gets no badge and no legend
 * row. That is not a silent drop: `neverVisible` reports it, because a part
 * the orbit never shows is a fact about the scene, not about the sheet.
 */
function assignBadges(
  placements: Array<Map<number, Placement>>,
): Map<number, { frame: number; u: number; v: number; pixels: number }> {
  const best = new Map<number, { frame: number; u: number; v: number; pixels: number }>();
  placements.forEach((placement, frame) => {
    for (const [code, place] of placement) {
      if (place.pixels < MIN_BADGE_PIXELS) continue;
      const hit = best.get(code);
      if (!hit || place.pixels > hit.pixels) {
        best.set(code, { frame, u: place.u, v: place.v, pixels: place.pixels });
      }
    }
  });
  return best;
}

/** The frame area the badge floor is stated against — parts are measured as
 *  pixels-at-this-resolution (see locateParts), so the floor is resolution-
 *  consistent: a threshold that means "visible in the sheet cell" whether the
 *  proof rendered at 512 px or 4096. Chosen at 1024² so the historical 40-px
 *  floor keeps its calibration. */
const REFERENCE_FRAME_AREA = 1024 * 1024;

/**
 * Pixels a part must occupy — AT THE REFERENCE RESOLUTION — before it can be
 * badged in a frame. Below roughly this many, the part is a speck the reader
 * cannot resolve in the sheet's downsampled cell, so a badge would point at
 * nothing they can see. Resolution-consistent (locateParts rescales the exact
 * count to REFERENCE_FRAME_AREA), so a high-res proof does not badge a part that
 * is invisible once the cell is drawn.
 */
const MIN_BADGE_PIXELS = 40;
const BADGE_R = 9;

/**
 * Nudge a badge off its neighbours.
 *
 * A fixed spiral, not a random jitter or a physics relaxation: the sheet is
 * meant to be byte-identical across compiles, so every tie has to break the
 * same way every time.
 */
function deconflict(
  x: number,
  y: number,
  placed: Array<{ x: number; y: number }>,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  radius: number,
): { x: number; y: number } {
  const clampTo = (p: { x: number; y: number }) => ({
    x: Math.min(maxX - radius - 1, Math.max(minX + radius + 1, Math.round(p.x))),
    y: Math.min(maxY - radius - 1, Math.max(minY + radius + 1, Math.round(p.y))),
  });
  const free = (p: { x: number; y: number }) =>
    placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= radius * 2 + 2);

  let spot = clampTo({ x, y });
  if (free(spot)) return spot;
  const step = radius * 2 + 3;
  for (let ring = 1; ring <= 4; ring++) {
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4;
      spot = clampTo({
        x: x + Math.cos(angle) * step * ring,
        y: y + Math.sin(angle) * step * ring,
      });
      if (free(spot)) return spot;
    }
  }
  return clampTo({ x, y });
}

/** A numbered disc: dark fill, accent ring, light numeral. */
function badge(sheet: Surface, cx: number, cy: number, n: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      blendPixel(sheet, cx + dx, cy + dy, d > radius - 1.6 ? ACCENT : BADGE_BG);
    }
  }
  /* Drawn once. An earlier version drew two-digit numerals twice, a pixel
     apart, to "thicken" them — which smeared the strokes together and made
     `10` read as `16`. A badge that names the wrong part is worse than no
     badge, so the numeral is single-struck and the disc is sized to it. */
  const scale = radius >= 13 ? 2 : 1;
  drawTextCentred(sheet, String(n), cx, cy - Math.round(textHeight(scale) / 2), TITLE_FG, scale);
}

/**
 * The axis gnomon: world +X, +Y and +Z as they run across THIS frame.
 *
 * Projected from the actual camera pose, so it is a measurement rather than a
 * decoration. It is the difference between a reader knowing the model is
 * turned and knowing which way to turn it back.
 *
 * An axis pointing nearly at the camera projects to nearly nothing, and a
 * one-pixel stub labelled `Z` would claim a direction it cannot show. Those
 * are drawn short and dim instead, with the label still placed, so
 * "foreshortened" reads as foreshortened.
 */
/**
 * Gnomon geometry.
 *
 * The origin is inset far enough from the cell corner that its pad is a whole
 * disc. Sitting it in the corner clipped the pad to a quarter and it read as
 * a smudge on the render rather than as an instrument on the page.
 */
const GNOMON_LEN = 17;

/**
 * How much bigger the cell furniture draws in a bigger cell.
 *
 * A one-frame sheet gives its single cell the whole page, and instruments
 * sized for a 256px tile become specks on a 720px one. Scaled sub-linearly
 * and capped: the badge and the gnomon are annotation, and annotation that
 * grows in step with the picture starts competing with it.
 */
function furnitureScale(cellW: number): number {
  return Math.min(1.7, Math.max(1, cellW / 256));
}

function gnomonLen(cellW: number): number {
  return Math.round(GNOMON_LEN * furnitureScale(cellW));
}

function gnomonPadR(cellW: number): number {
  return gnomonLen(cellW) + 9;
}

function gnomonInset(cellW: number): number {
  return gnomonPadR(cellW) + 2;
}

function badgeRadius(cellW: number): number {
  return Math.round(BADGE_R * furnitureScale(cellW));
}

function drawGnomon(sheet: Surface, view: ProofView, ox: number, oy: number, cellW: number): void {
  const LEN = gnomonLen(cellW);
  const GNOMON_PAD_R = gnomonPadR(cellW);
  /* A dimmed disc under the whole gnomon. The frames are photographs and a
     thin coloured stroke over a pale roof is invisible; without the pad the
     one instrument that says which way is which vanished on exactly the
     bright renders where a reader is most likely to be disoriented. */
  for (let dy = -GNOMON_PAD_R; dy <= GNOMON_PAD_R; dy++) {
    for (let dx = -GNOMON_PAD_R; dx <= GNOMON_PAD_R; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > GNOMON_PAD_R) continue;
      // Softened at the rim so the pad reads as a shadow rather than as a
      // hard black coin pasted over the render.
      const edge = Math.min(1, (GNOMON_PAD_R - d) / 6);
      blendPixel(sheet, ox + dx, oy + dy, [12, 11, 10, Math.round(125 * edge)]);
    }
  }
  const axes: Array<{ dir: readonly [number, number, number]; colour: Rgba; name: string }> = [
    { dir: [1, 0, 0], colour: AXIS_X, name: "X" },
    { dir: [0, 1, 0], colour: AXIS_Y, name: "Y" },
    { dir: [0, 0, 1], colour: AXIS_Z, name: "Z" },
  ];
  for (const axis of axes) {
    const p = projectDirection(axis.dir, view.eye);
    const len = Math.hypot(p.x, p.y);
    // An axis pointing nearly at the camera projects to nearly nothing, and
    // a one-pixel stub labelled `Y` claims a direction it cannot show. Drawn
    // dim instead, with the label still placed, so foreshortened reads as
    // foreshortened rather than as missing.
    const dim: Rgba = [axis.colour[0], axis.colour[1], axis.colour[2], len < 0.3 ? 130 : 255];
    line(sheet, ox, oy, ox + p.x * LEN, oy + p.y * LEN, dim);
    // The label rides past the tip, pushed out along the same direction so
    // it never sits on the stroke it names.
    const labelScale = furnitureScale(cellW) >= 1.5 ? 2 : 1;
    drawText(
      sheet,
      axis.name,
      ox + p.x * (LEN + 8) - 2 * labelScale,
      oy + p.y * (LEN + 8) - 4 * labelScale,
      dim,
      labelScale,
    );
  }
}

interface Placement {
  /** Normalised position of a pixel the part actually occupies. */
  u: number;
  v: number;
  pixels: number;
}

/**
 * Where each part sits in one id map.
 *
 * Two passes on purpose. The first finds each part's centroid, which is the
 * right place for a label on a convex blob and the wrong place on a ring or a
 * horseshoe — it can land on the hole, or on another part entirely. The
 * second snaps to the part's own pixel nearest that centroid, so the badge is
 * always ON the thing it names. Storing every pixel to do it in one pass
 * would cost a megabyte per frame for a placement decided in two.
 */
function locateParts(map: DecodedImage, partCount: number): Map<number, Placement> {
  const sums = new Map<number, { sx: number; sy: number; n: number }>();
  const { width, height, data } = map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const code = codeAt(data, (y * width + x) * 4, partCount);
      if (code === 0) continue;
      const acc = sums.get(code) ?? { sx: 0, sy: 0, n: 0 };
      acc.sx += x;
      acc.sy += y;
      acc.n++;
      sums.set(code, acc);
    }
  }

  const best = new Map<number, { x: number; y: number; d: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const code = codeAt(data, (y * width + x) * 4, partCount);
      if (code === 0) continue;
      const acc = sums.get(code)!;
      const d = Math.hypot(x - acc.sx / acc.n, y - acc.sy / acc.n);
      const hit = best.get(code);
      if (!hit || d < hit.d) best.set(code, { x, y, d });
    }
  }

  const area = width * height;
  const out = new Map<number, Placement>();
  for (const [code, spot] of best) {
    out.set(code, {
      u: (spot.x + 0.5) / width,
      v: (spot.y + 0.5) / height,
      // The part's size as pixels AT THE REFERENCE RESOLUTION — the EXACT count
      // (the map is full-res) rescaled by the frame's own area to a fixed
      // reference, so the badge floor means the same thing at any proof size. A
      // part that is 40 px on a 1024² proof reads as 40 here; the same fraction
      // on a 4096² proof also reads ~40 — matching what the reader sees in the
      // downsampled sheet CELL, not the raw proof. Resolution-consistent, and
      // still exact (only the threshold is normalised, never the count).
      pixels: Math.round((sums.get(code)!.n * REFERENCE_FRAME_AREA) / area),
    });
  }
  return out;
}

/**
 * Decode one id-map pixel to a part code, or 0 for "nothing here".
 *
 * Nearest-step per channel, which is what the encoding's 36-wide gaps were
 * chosen to survive. A code beyond the parts actually rendered is background
 * noise — a stray filtered pixel between two steps — and reads as nothing
 * rather than as a part that does not exist.
 */
function codeAt(data: Uint8Array, at: number, partCount: number): number {
  if (data[at + 3]! < 128) return 0;
  const code =
    nearestStep(data[at]!) * 64 + nearestStep(data[at + 1]!) * 8 + nearestStep(data[at + 2]!);
  return code >= 1 && code <= partCount ? code : 0;
}

function nearestStep(value: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < ID_STEPS.length; k++) {
    const d = Math.abs(value - ID_STEPS[k]!);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/**
 * The legend's grid.
 *
 * Sized from the LONGEST name rather than an average, so the column that has
 * to hold `prp_lantern_bracket_left` is wide enough for it and nothing gets
 * an ellipsis the page had room to avoid.
 */
function layoutLegend(
  legend: Array<{ badge: number; part: string }>,
  availableW: number,
): { columns: number; rows: number; columnW: number } {
  if (legend.length === 0) return { columns: 1, rows: 0, columnW: availableW };
  const widest = legend.reduce(
    (max, entry) => Math.max(max, textWidth(`${entry.badge}  ${entry.part}`, TEXT)),
    0,
  );
  const columns = Math.max(1, Math.min(legend.length, Math.floor(availableW / (widest + 24))));
  return {
    columns,
    rows: Math.ceil(legend.length / columns),
    columnW: Math.floor(availableW / columns),
  };
}

/**
 * The footnote that makes every other label meaningful.
 *
 * Stated as facts about the world, not as a key to this picture: a reader who
 * takes only these two lines away from the sheet can still author correct
 * `scene.json` coordinates tomorrow.
 */
function conventionLines(frames: ContactFrame[]): string[] {
  /* The footnote describes what is ON the page and nothing else. An
     unposed sheet draws no gnomon, and promising one there sends a reader
     hunting an instrument that is not in the picture. */
  const posed = frames.some((f) => f.view);
  const lines = ["world is Z-up (scene.json authors height in Z, resting on z=0)."];
  if (posed) {
    lines.push(
      "the gnomon in each frame shows world +X +Y +Z as projected from that camera.",
      "cell label is [frame index] compass-name, then the camera azimuth. azimuth 0° = front = camera on -Y (Blender numpad-1); azimuth increases toward +X, so the orbit runs front -> right -> back -> left.",
    );
  } else {
    lines.push(
      "camera poses were authored, not orbited, so no compass name and no axis gnomon is claimed for these frames.",
    );
  }
  lines.push(
    "each part is badged once, in the frame where it shows largest; the badge sits on pixels that part actually occupies.",
  );
  return lines;
}

/* ---------------------------------------------------------------- *
 * Raster primitives. Deliberately tiny and local: the sheet needs a
 * rectangle, a line and a box blit, and nothing here is worth a
 * dependency or a general-purpose graphics layer.
 * ---------------------------------------------------------------- */

function fill(surface: Surface, colour: Rgba): void {
  for (let i = 0; i < surface.data.length; i += 4) {
    surface.data[i] = colour[0];
    surface.data[i + 1] = colour[1];
    surface.data[i + 2] = colour[2];
    surface.data[i + 3] = colour[3];
  }
}

function rect(surface: Surface, x: number, y: number, w: number, h: number, colour: Rgba): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) blendPixel(surface, x + dx, y + dy, colour);
  }
}

function outline(surface: Surface, x: number, y: number, w: number, h: number, colour: Rgba): void {
  for (let dx = 0; dx < w; dx++) {
    blendPixel(surface, x + dx, y, colour);
    blendPixel(surface, x + dx, y + h - 1, colour);
  }
  for (let dy = 0; dy < h; dy++) {
    blendPixel(surface, x, y + dy, colour);
    blendPixel(surface, x + w - 1, y + dy, colour);
  }
}

function rule(surface: Surface, x0: number, y: number, x1: number): void {
  for (let x = x0; x < x1; x++) blendPixel(surface, x, y, RULE);
}

function line(surface: Surface, x0: number, y0: number, x1: number, y1: number, colour: Rgba): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    // Two pixels wide: a one-pixel diagonal over a photographic background
    // is invisible at the size these cells are read at.
    blendPixel(surface, x, y, colour);
    blendPixel(surface, x + 1, y, colour);
  }
}

/**
 * Box-average `image` into a `w`×`h` slot, composited over what is there.
 *
 * Box-averaged rather than point-sampled for the reason the ASCII renderer
 * gives: a thin part is mostly background, and dropping three of every four
 * source pixels drops exactly the ones carrying the subject — a mast or a
 * railing disappears from the downscale while sitting plainly in the frame.
 *
 * The frames render with a transparent film, so alpha IS the subject mask;
 * compositing over the cell rather than over the frame's own grey backdrop is
 * what puts every subject on one background and makes the page read as a
 * page instead of eight tiles.
 */
function blitFitted(
  surface: Surface,
  image: DecodedImage,
  crop: Crop | null,
  x: number,
  y: number,
  w: number,
  h: number,
): Placed {
  const src = crop ?? { x: 0, y: 0, w: image.width, h: image.height };
  // Aspect-preserving: squashing a proof frame would corrupt the one thing
  // it exists to show.
  const scale = Math.min(w / src.w, h / src.h);
  const drawW = Math.max(1, Math.round(src.w * scale));
  const drawH = Math.max(1, Math.round(src.h * scale));
  const offX = x + Math.round((w - drawW) / 2);
  const offY = y + Math.round((h - drawH) / 2);

  for (let dy = 0; dy < drawH; dy++) {
    const sy0 = src.y + Math.floor((dy * src.h) / drawH);
    const sy1 = Math.max(sy0 + 1, src.y + Math.floor(((dy + 1) * src.h) / drawH));
    for (let dx = 0; dx < drawW; dx++) {
      const sx0 = src.x + Math.floor((dx * src.w) / drawW);
      const sx1 = Math.max(sx0 + 1, src.x + Math.floor(((dx + 1) * src.w) / drawW));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < Math.min(sy1, image.height); sy++) {
        for (let sx = sx0; sx < Math.min(sx1, image.width); sx++) {
          const at = (sy * image.width + sx) * 4;
          const alpha = image.data[at + 3]! / 255;
          // Premultiply before averaging: straight RGBA averaged directly
          // drags the colour of fully transparent pixels into every edge,
          // which fringes every silhouette with the backdrop's grey.
          r += image.data[at]! * alpha;
          g += image.data[at + 1]! * alpha;
          b += image.data[at + 2]! * alpha;
          a += alpha;
          n++;
        }
      }
      if (n === 0 || a === 0) continue;
      blendPixel(surface, offX + dx, offY + dy, [
        Math.round(r / a),
        Math.round(g / a),
        Math.round(b / a),
        Math.round((a / n) * 255),
      ]);
    }
  }
  return { x: offX, y: offY, w: drawW, h: drawH };
}

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a frame actually landed in its cell, so badges follow the crop. */
type Placed = Crop;

/**
 * The rectangle that holds every frame's subject, with a margin.
 *
 * The proof auto-frames with generous headroom, so an uncropped tile spends
 * most of its pixels on backdrop and the model reads small. One rectangle for
 * all frames rather than one each: a per-frame crop would rescale the subject
 * between cells, and comparing proportions across the orbit is most of what a
 * turntable is for.
 *
 * Returns null when nothing has alpha — an all-empty proof is a finding the
 * lint rules already make, and cropping to a degenerate box would turn it
 * into a corrupt-looking sheet instead.
 */
function contentCrop(images: Array<DecodedImage | null>): Crop | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let width = 0;
  let height = 0;
  for (const image of images) {
    if (!image) continue;
    width = Math.max(width, image.width);
    height = Math.max(height, image.height);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        // The same alpha floor the frame statistics use, so "subject" means
        // one thing across every consumer of these pixels.
        if (image.data[(y * image.width + x) * 4 + 3]! <= 5) continue;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (!Number.isFinite(x0) || x1 < x0 || y1 < y0) return null;

  // Breathing room, then squared up: a wide subject cropped tight and then
  // letterboxed into a square cell wastes the space the crop just won.
  const margin = Math.round(Math.max(x1 - x0, y1 - y0) * 0.06) + 4;
  x0 = Math.max(0, x0 - margin);
  y0 = Math.max(0, y0 - margin);
  x1 = Math.min(width - 1, x1 + margin);
  y1 = Math.min(height - 1, y1 + margin);
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    x: Math.max(0, Math.round(cx - side / 2)),
    y: Math.max(0, Math.round(cy - side / 2)),
    w: Math.min(width, side),
    h: Math.min(height, side),
  };
}

function safeDecode(png: Uint8Array): DecodedImage | null {
  try {
    return decodePng(png);
  } catch {
    return null;
  }
}

/**
 * Downsample a BEAUTY frame so its longer side is at most `maxDim`, returning it
 * untouched when it already fits (the common case — proofs render near the grid
 * measure). Nearest sampling, which is ample for a display tile drawn at ≤1024 px.
 * Used ONLY for beauty frames — the id maps are counted at full resolution (their
 * pixel counts feed the badge floor, a correctness threshold), so this never
 * touches a part-code map, where a downsample would distort the count.
 */
function boundResolution(img: DecodedImage, maxDim = MAX_FRAME_WORK_PX): DecodedImage {
  const big = Math.max(img.width, img.height);
  if (big <= maxDim) return img;
  const w = Math.max(1, Math.round((img.width * maxDim) / big));
  const h = Math.max(1, Math.round((img.height * maxDim) / big));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / w));
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      data[di] = img.data[si]!;
      data[di + 1] = img.data[si + 1]!;
      data[di + 2] = img.data[si + 2]!;
      data[di + 3] = img.data[si + 3]!;
    }
  }
  return { width: w, height: h, data };
}

function clampInt(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(value)));
}
