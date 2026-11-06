import { describe, expect, it } from "vitest";
import { RECOMPUTE_INTERVAL_MS, rebuildDue } from "./offCanvasIndicatorRefresh";

describe("rebuildDue", () => {
  it("collapses mutations arriving inside one window into a single rebuild", () => {
    // A rebuild walks the whole preview and reads layout per element, and what
    // marks it dirty is a MutationObserver on inline style — which is how
    // animation writes. Without this, playback pays that on nearly every frame.
    const first = 1_000;
    expect(rebuildDue(true, Number.NEGATIVE_INFINITY, first)).toBe(true);
    expect(rebuildDue(true, first, first + RECOMPUTE_INTERVAL_MS - 1)).toBe(false);
    expect(rebuildDue(true, first, first + RECOMPUTE_INTERVAL_MS)).toBe(true);
  });

  it("never rebuilds when nothing changed", () => {
    expect(rebuildDue(false, Number.NEGATIVE_INFINITY, 1_000)).toBe(false);
  });
});
