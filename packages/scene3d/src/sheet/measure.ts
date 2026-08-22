import { DecodedImage } from "./png.js";

/**
 * Deterministic measurements of one 2D sheet.
 *
 * Same shape as the 3D census: the measuring step produces plain numbers and
 * knows nothing about policy, and the rules are pure functions over those
 * numbers. That split is what lets the 2D rules be unit-tested without a
 * decoder, and the decoder be tested without a rule set.
 */
export interface SheetMeasurement {
  file: string;
  width: number;
  height: number;
  powerOfTwo: boolean;
  /** Fraction of pixels above the visibility threshold. */
  opaqueRatio: number;
  maxAlpha: number;
  /**
   * Luminance facts, for additive sheets whose silhouette lives in RGB, not
   * alpha. `litRatio` is the additive analog of `opaqueRatio` (fraction of
   * pixels whose brightest channel is above the visibility threshold);
   * `maxLuminance` is the brightest channel anywhere; `borderMaxLuminance` is
   * the brightest channel on the outer 1px frame — a bright frame flashes as
   * a visible rectangle once the quad is drawn additively.
   */
  litRatio: number;
  maxLuminance: number;
  borderMaxLuminance: number;
  /** Fraction of pixels that are not fully opaque. */
  nonOpaqueRatio: number;
  /** Fraction of visible pixels carrying hue (max-min channel > 6). */
  hueRatio: number;
  /** Visible pixels touching the outer `inset` border. */
  borderTouch: number;
  /** Mean absolute channel difference between the first and last column. */
  seamLeftRight: number;
  /** Visible pixels on the top or bottom row. */
  longEdgeTouch: number;
  /** Fraction of pixels clipped to pure black or pure white. */
  clippedRatio: number;
  /** Per-cell facts, when the sheet was declared as a grid. */
  cells?: {
    cols: number;
    rows: number;
    divides: boolean;
    /** Indices of cells with nothing drawn in them. */
    blank: number[];
    /** Visible pixels inside a cell's 2px inner border. */
    bleed: number;
    /** Count of visually distinct cells; 1 means the animation never moves. */
    distinct: number;
    /** True when each cell's pixel dimensions are themselves power-of-two.
     *  A POT atlas with non-POT cells still tears under mip sampling — the
     *  cell is the unit the shader addresses, so the cell is what must be POT. */
    cellPowerOfTwo: boolean;
  };
}

const VISIBLE = 8;
const HUE_SPREAD = 6;
const CELL_BORDER = 2;

export interface MeasureOptions {
  /** Grid to slice the sheet into, for flipbooks. */
  grid?: [number, number];
  /** Fraction of the sheet that must stay clear of the outer border. */
  inset?: number;
}

export function measureSheet(
  file: string,
  image: DecodedImage,
  options: MeasureOptions = {},
): SheetMeasurement {
  const { width, height, data } = image;
  const pixels = width * height;

  let visible = 0;
  let maxAlpha = 0;
  let nonOpaque = 0;
  let hued = 0;
  let clipped = 0;
  let lit = 0;
  let maxLuminance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    // Luminance is measured regardless of alpha: an additive sheet carries
    // its silhouette in RGB and may leave alpha at zero, so an alpha-gated
    // read would call a bright flame "empty".
    const lum = Math.max(r, g, b);
    if (lum > maxLuminance) maxLuminance = lum;
    if (lum > VISIBLE) lit++;
    if (a > maxAlpha) maxAlpha = a;
    if (a !== 255) nonOpaque++;
    if (a > VISIBLE) {
      visible++;
      if (lum - Math.min(r, g, b) > HUE_SPREAD) hued++;
      if ((r < 3 && g < 3 && b < 3) || (r > 252 && g > 252 && b > 252)) clipped++;
    }
  }

  // Brightest channel on the outer 1px frame — the additive border check.
  let borderMaxLuminance = 0;
  const lumAt = (x: number, y: number): number => {
    const at = (y * width + x) * 4;
    return Math.max(data[at]!, data[at + 1]!, data[at + 2]!);
  };
  for (let x = 0; x < width; x++) {
    borderMaxLuminance = Math.max(borderMaxLuminance, lumAt(x, 0), lumAt(x, height - 1));
  }
  for (let y = 0; y < height; y++) {
    borderMaxLuminance = Math.max(borderMaxLuminance, lumAt(0, y), lumAt(width - 1, y));
  }

  const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3]!;

  // Border contact: a particle that touches the atlas edge bleeds into its
  // neighbour once packed, which only shows up in-engine.
  const inset = options.inset ?? 0.99;
  const pad = Math.max(1, Math.round((width * (1 - inset)) / 2));
  let borderTouch = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= pad && x < width - pad && y >= pad && y < height - pad;
      if (!inside && alphaAt(x, y) > VISIBLE) borderTouch++;
    }
  }

  // Tiling seam: a strip meant to repeat must have matching first and last
  // columns, or the repeat shows a hard line.
  let seamSum = 0;
  for (let y = 0; y < height; y++) {
    const left = (y * width) * 4;
    const right = (y * width + width - 1) * 4;
    for (let c = 0; c < 4; c++) seamSum += Math.abs(data[left + c]! - data[right + c]!);
  }
  const seamLeftRight = seamSum / (height * 4);

  let longEdgeTouch = 0;
  for (let x = 0; x < width; x++) {
    if (alphaAt(x, 0) > VISIBLE) longEdgeTouch++;
    if (alphaAt(x, height - 1) > VISIBLE) longEdgeTouch++;
  }

  const measurement: SheetMeasurement = {
    file,
    width,
    height,
    powerOfTwo: isPowerOfTwo(width) && isPowerOfTwo(height),
    opaqueRatio: visible / pixels,
    maxAlpha,
    litRatio: lit / pixels,
    maxLuminance,
    borderMaxLuminance,
    nonOpaqueRatio: nonOpaque / pixels,
    hueRatio: visible === 0 ? 0 : hued / visible,
    borderTouch,
    seamLeftRight,
    longEdgeTouch,
    clippedRatio: visible === 0 ? 0 : clipped / pixels,
  };

  if (options.grid) {
    measurement.cells = measureCells(image, options.grid);
  }
  return measurement;
}

function measureCells(
  image: DecodedImage,
  [cols, rows]: [number, number],
): NonNullable<SheetMeasurement["cells"]> {
  const { width, height, data } = image;
  const divides = cols > 0 && rows > 0 && width % cols === 0 && height % rows === 0;
  if (!divides)
    return { cols, rows, divides: false, blank: [], bleed: 0, distinct: 0, cellPowerOfTwo: false };

  const cw = width / cols;
  const ch = height / rows;
  const cellPowerOfTwo = isPowerOfTwo(cw) && isPowerOfTwo(ch);
  const blank: number[] = [];
  let bleed = 0;
  const signatures = new Set<string>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let any = 0;
      // A coarse per-cell signature: enough to tell "this frame differs from
      // that one" without being sensitive to a single pixel of dither.
      let sumA = 0;
      let sumX = 0;
      let sumY = 0;
      // Count/mean/centroid are all invariant under ROTATION about the
      // centroid, which is what most flipbooks animate — so a spinning blade,
      // a turning gear or an orbiting spark read as one signature and the
      // atlas was declared a static kernel (W-601) while plainly animating.
      // A coarse occupancy grid is the missing term: it says WHERE the visible
      // pixels are, not just how many and how bright.
      const OCC = 4;
      const occupancy = new Array<number>(OCC * OCC).fill(0);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const a = data[((r * ch + y) * width + (c * cw + x)) * 4 + 3]!;
          if (a <= VISIBLE) continue;
          any++;
          sumA += a;
          sumX += x;
          sumY += y;
          occupancy[Math.floor((y * OCC) / ch) * OCC + Math.floor((x * OCC) / cw)]!++;
          if (x < CELL_BORDER || y < CELL_BORDER || x >= cw - CELL_BORDER || y >= ch - CELL_BORDER) {
            bleed++;
          }
        }
      }
      if (any === 0) blank.push(r * cols + c);
      else {
        // Each bucket as a share of THIS frame's visible pixels, not of the
        // bucket's area: sprite content is mostly thin and sparse, and against
        // bucket area every band rounds to zero, which is how the first
        // attempt at this discriminated nothing at all.
        const shape = occupancy.map((n) => Math.min(7, Math.round((n / any) * (OCC * OCC)))).join("");
        signatures.add(
          `${Math.round(sumA / any)}:${Math.round(sumX / any)}:${Math.round(sumY / any)}:${any}:${shape}`,
        );
      }
    }
  }

  return { cols, rows, divides: true, blank, bleed, distinct: signatures.size, cellPowerOfTwo };
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/**
 * Mean absolute channel difference between two face edges.
 *
 * Cubemap seams are the one 2D defect that is invisible in every single
 * asset and obvious the moment the six faces are assembled — exactly the
 * class of thing a compiler should own.
 */
export function edgeOf(
  image: DecodedImage,
  side: "top" | "bottom" | "left" | "right",
): number[][] {
  const { width, height, data } = image;
  const count = side === "top" || side === "bottom" ? width : height;
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    const x = side === "left" ? 0 : side === "right" ? width - 1 : i;
    const y = side === "top" ? 0 : side === "bottom" ? height - 1 : i;
    const at = (y * width + x) * 4;
    out.push([data[at]!, data[at + 1]!, data[at + 2]!]);
  }
  return out;
}

export function edgeDifference(a: number[][], b: number[][], reversed = false): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  const other = reversed ? [...b].reverse() : b;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    for (let c = 0; c < 3; c++) sum += Math.abs(a[i]![c]! - other[i]![c]!);
  }
  return sum / (a.length * 3);
}
