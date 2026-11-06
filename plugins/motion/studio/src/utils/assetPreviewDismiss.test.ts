import { describe, expect, it } from "vitest";
import { shouldDismissAssetPreview } from "./assetPreviewDismiss";

describe("shouldDismissAssetPreview", () => {
  const idle = { isPlaying: false, currentTime: 3.5, requestedSeekTime: null };

  it("keeps the preview open while nothing moves", () => {
    expect(shouldDismissAssetPreview(3.5, idle)).toBe(false);
  });

  it("tolerates sub-epsilon float noise in currentTime echoes", () => {
    expect(shouldDismissAssetPreview(3.5, { ...idle, currentTime: 3.5 + 1e-9 })).toBe(false);
  });

  it("dismisses when playback starts", () => {
    expect(shouldDismissAssetPreview(3.5, { ...idle, isPlaying: true })).toBe(true);
  });

  it("dismisses when the playhead is scrubbed/seeked to a new time", () => {
    expect(shouldDismissAssetPreview(3.5, { ...idle, currentTime: 4.2 })).toBe(true);
    expect(shouldDismissAssetPreview(3.5, { ...idle, currentTime: 0 })).toBe(true);
  });

  it("dismisses on a pending out-of-loop seek request", () => {
    expect(shouldDismissAssetPreview(3.5, { ...idle, requestedSeekTime: 3.5 })).toBe(true);
  });
});
