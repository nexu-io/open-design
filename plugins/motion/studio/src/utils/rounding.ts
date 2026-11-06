/** Round to 3 decimal places (millisecond precision for GSAP values). */
export function roundTo3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

/** Whole CSS px: GSAP parses a -50% translate against the integer offsetWidth/Height. */
export function roundToLayoutPx(val: number): number {
  return Math.round(val);
}

export function roundToLayoutSize(size: { width: number; height: number }) {
  return {
    width: roundToLayoutPx(Math.max(1, size.width)),
    height: roundToLayoutPx(Math.max(1, size.height)),
  };
}

/** Round to 2 decimal places (centisecond precision for timeline values). */
export function roundToCenti(val: number): number {
  return Math.round(val * 100) / 100;
}
