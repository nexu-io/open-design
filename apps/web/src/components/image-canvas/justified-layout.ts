/**
 * Justified (flickr-style) row packing for the image canvas grid.
 *
 * Ported from the reference prototype's `layoutGrid()` in
 * `version/v2/pages/workspace-social-canvas.html`: fill a row with cards until
 * their combined width at the nominal height would overflow the container,
 * then solve for the row height that makes the row span the full width. A
 * trailing row that never filled keeps the nominal height instead of being
 * stretched across the container.
 */

export interface JustifiedBox {
  width: number;
  height: number;
}

export const JUSTIFIED_GAP = 16;
/** Nominal row height used to decide how many cards fit on a row. */
export const JUSTIFIED_NOMINAL_HEIGHT = 236;
/** Ceiling so a row holding one very wide card doesn't tower over the rest. */
export const JUSTIFIED_MAX_HEIGHT = 360;

/** A ratio of 0/NaN means the image hasn't decoded yet; treat it as square. */
function safeRatio(value: number | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 1;
}

export function justifiedLayout(
  aspectRatios: number[],
  containerWidth: number,
  options?: { gap?: number; nominalHeight?: number; maxHeight?: number },
): JustifiedBox[] {
  const gap = options?.gap ?? JUSTIFIED_GAP;
  const nominal = options?.nominalHeight ?? JUSTIFIED_NOMINAL_HEIGHT;
  const max = options?.maxHeight ?? JUSTIFIED_MAX_HEIGHT;
  const boxes: JustifiedBox[] = [];
  if (containerWidth <= 0) return boxes;

  let i = 0;
  while (i < aspectRatios.length) {
    let sum = 0;
    let j = i;
    while (j < aspectRatios.length) {
      sum += safeRatio(aspectRatios[j]);
      j++;
      if (sum * nominal + gap * (j - i - 1) >= containerWidth) break;
    }
    const count = j - i;
    const natural = sum * nominal + gap * (count - 1);
    const trailingShortRow = j >= aspectRatios.length && natural < containerWidth;
    const height = Math.min(
      trailingShortRow ? nominal : (containerWidth - gap * (count - 1)) / sum,
      max,
    );
    for (let k = i; k < j; k++) {
      boxes.push({
        height: Math.floor(height),
        // The -0.5 mirrors the prototype: rounding each width up can push the
        // last card of a row past the container and wrap it onto its own line.
        width: Math.floor(safeRatio(aspectRatios[k]) * height - 0.5),
      });
    }
    i = j;
  }
  return boxes;
}

/** "16:9" → 1.777…; falls back to 3:4 for anything unparseable. */
export function ratioToNumber(ratio: string): number {
  const parts = ratio.split(':').map(Number);
  const w = parts[0];
  const h = parts[1];
  if (w == null || h == null) return 3 / 4;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 3 / 4;
  return w / h;
}
