import { decodePng } from "../sheet/png.js";

/**
 * Render a proof frame as text.
 *
 * The compiler ships PNGs, and a text-only agent cannot open one. That is not
 * a hypothetical: a field run reported building its own PowerShell luminance
 * sampler on the spot to inspect frames, and that sampler immediately found a
 * blown highlight band no pixel-free report had mentioned. The eyes were worth
 * having; the agent had to grow them itself.
 *
 * So the frames become readable in the medium every consumer of this compiler
 * already reads. No dependency and no new decoder: `decodePng` is the same one
 * the sheet linter uses, so an image this can display is exactly an image the
 * rest of the package can adjudicate.
 *
 * Deliberately NOT a picture. A 48-column ramp cannot show a normal seam or a
 * texture, and pretending otherwise would invite conclusions the medium cannot
 * support. What it does show is what the proof lint already judges — where the
 * light is, whether the subject is in frame, whether highlights clip — with
 * the numbers beside it so an agent can act on the measurement rather than on
 * an impression of the art.
 */

/** Dark to light. Chosen for even perceived steps in a terminal, and ASCII
 *  only: box-drawing and braille render at different widths across the
 *  consoles these reports land in, which shears the image. */
const RAMP = " .:-=+*#%@";

export interface AsciiFrame {
  /** Rows of the ramp, top row first. */
  rows: string[];
  /** Mean luminance over non-transparent pixels, 0-1. */
  meanLuminance: number;
  /** Fraction of pixels carrying any subject at all (alpha > 0). */
  coverage: number;
  /** Fraction of LIT pixels within a hair of white — the clipping measure the
   *  proof lint's blow-out rule judges. */
  clipped: number;
  /** Source pixel dimensions, so a reader knows what was sampled down. */
  width: number;
  height: number;
}

export interface AsciiOptions {
  /** Ramp columns. Rows follow from the image's aspect. */
  columns?: number;
  /** Terminal cells are about twice as tall as they are wide; rows are scaled
   *  by this so a square image reads square. */
  cellAspect?: number;
}

/**
 * Sample an image down to a ramp, measuring as it goes.
 *
 * Box-averaged rather than point-sampled: a turntable frame of a thin part is
 * mostly background, and nearest-neighbour sampling drops exactly the pixels
 * that carry the subject — the frame would read as empty when it is not. The
 * average also makes the measurements below honest, since every source pixel
 * contributes to exactly one cell.
 */
export function renderAsciiFrame(png: Uint8Array, options: AsciiOptions = {}): AsciiFrame {
  const image = decodePng(png);
  const columns = Math.max(8, Math.min(200, options.columns ?? 48));
  const cellAspect = options.cellAspect ?? 2;
  const rowsCount = Math.max(
    4,
    Math.round((columns * image.height) / Math.max(1, image.width) / cellAspect),
  );

  const rows: string[] = [];
  let litTotal = 0;
  let litCount = 0;
  let covered = 0;
  let clipped = 0;
  let pixels = 0;

  for (let ry = 0; ry < rowsCount; ry++) {
    let line = "";
    const y0 = Math.floor((ry * image.height) / rowsCount);
    const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * image.height) / rowsCount));
    for (let rx = 0; rx < columns; rx++) {
      const x0 = Math.floor((rx * image.width) / columns);
      const x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * image.width) / columns));
      let sum = 0;
      let alpha = 0;
      let cells = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * image.width + x) * 4;
          const a = image.data[at + 3]! / 255;
          // Rec.709, the same weighting the proof lint measures luminance by.
          const lum =
            (image.data[at]! * 0.2126 + image.data[at + 1]! * 0.7152 + image.data[at + 2]! * 0.0722) /
            255;
          sum += lum * a;
          alpha += a;
          cells++;
          pixels++;
          if (a > 0.02) {
            covered++;
            litTotal += lum;
            litCount++;
            if (lum > 0.96) clipped++;
          }
        }
      }
      const mean = cells > 0 ? sum / cells : 0;
      const solid = cells > 0 ? alpha / cells : 0;
      // Transparent background reads as the ramp's own blank, so the subject's
      // silhouette is the thing the eye follows.
      const index = solid < 0.02 ? 0 : Math.min(RAMP.length - 1, Math.round(mean * (RAMP.length - 1)));
      line += RAMP[index];
    }
    rows.push(line);
  }

  return {
    rows,
    meanLuminance: litCount > 0 ? litTotal / litCount : 0,
    coverage: pixels > 0 ? covered / pixels : 0,
    clipped: litCount > 0 ? clipped / litCount : 0,
    width: image.width,
    height: image.height,
  };
}

/** One frame as a labelled block: the ramp, then the numbers under it. */
export function formatAsciiFrame(label: string, frame: AsciiFrame): string {
  const stats =
    `lum ${frame.meanLuminance.toFixed(3)} · ` +
    `coverage ${(frame.coverage * 100).toFixed(1)}% · ` +
    `clipped ${(frame.clipped * 100).toFixed(1)}% · ` +
    `${frame.width}x${frame.height}`;
  return [`${label}  ${stats}`, ...frame.rows].join("\n");
}
