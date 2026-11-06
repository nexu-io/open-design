import { describe, expect, it, vi } from "vitest";
import { resolveThumbnailSeekTime } from "../../player/components/CompositionThumbnail";
import { resolveCompositionPreviewScale, syncIframePlayback } from "./CompositionsTab";

describe("resolveCompositionPreviewScale", () => {
  it("scales a 16:9 stage to fit the composition card", () => {
    expect(
      resolveCompositionPreviewScale({
        cardWidth: 80,
        cardHeight: 45,
        stageWidth: 1920,
        stageHeight: 1080,
      }),
    ).toBeCloseTo(80 / 1920);
  });

  it("scales non-16:9 stages against their actual dimensions", () => {
    expect(
      resolveCompositionPreviewScale({
        cardWidth: 80,
        cardHeight: 45,
        stageWidth: 1280,
        stageHeight: 720,
      }),
    ).toBeCloseTo(80 / 1280);
  });

  it("falls back to the default stage when dimensions are invalid", () => {
    expect(
      resolveCompositionPreviewScale({
        cardWidth: 80,
        cardHeight: 45,
        stageWidth: 0,
        stageHeight: Number.NaN,
      }),
    ).toBeCloseTo(80 / 1920);
  });
});

describe("resolveThumbnailSeekTime", () => {
  it("uses the default 3s frame for compositions longer than 3s", () => {
    expect(resolveThumbnailSeekTime(6)).toBe(3);
  });

  it("uses the midpoint for compositions of 3s or shorter, never their end frame", () => {
    expect(resolveThumbnailSeekTime(2)).toBe(1);
    expect(resolveThumbnailSeekTime(3)).toBe(1.5);
  });

  it("falls back to the default 3s frame when duration is unknown", () => {
    expect(resolveThumbnailSeekTime(null)).toBe(3);
    expect(resolveThumbnailSeekTime(Number.NaN)).toBe(3);
  });
});

describe("syncIframePlayback", () => {
  it("mutes a composition-card preview before playing it", () => {
    const calls: string[] = [];
    const postMessage = vi.fn(() => calls.push("mute"));
    const player = {
      play: vi.fn(() => calls.push("play")),
    };
    const iframe = {
      contentWindow: { __player: player, postMessage },
      getRootNode: () => ({}),
    } as unknown as HTMLIFrameElement;

    expect(syncIframePlayback(iframe, true)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "set-muted", muted: true }),
      "*",
    );
    expect(calls).toEqual(["mute", "play"]);
    expect(player.play).toHaveBeenCalledOnce();
  });
});
