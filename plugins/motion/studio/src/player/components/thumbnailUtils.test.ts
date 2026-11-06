import { describe, expect, it } from "vitest";
import { buildTimelineAssetInsertHtml } from "../../utils/timelineAssetDrop";
import {
  authoredSrcPath,
  computeThumbnailStrip,
  encodePreviewPath,
  resolveMediaPreviewUrl,
  quantizeThumbnailFrameCount,
  thumbnailFrameForTile,
} from "./thumbnailUtils";
import { MAX_VISIBLE_THUMBNAIL_FRAMES } from "../lib/timelineViewportBudgets";

describe("computeThumbnailStrip", () => {
  it("sizes tiles by aspect ratio at the clip height", () => {
    expect(computeThumbnailStrip(500, 16 / 9, 40).frameW).toBe(71);
    expect(computeThumbnailStrip(500, 2.7, 40).frameW).toBe(108);
  });

  it("repeats tiles to cover the container width", () => {
    const { frameW, frameCount } = computeThumbnailStrip(500, 1, 40);
    expect(frameW).toBe(40);
    expect(frameCount).toBe(13);
    expect(frameCount * frameW).toBeGreaterThanOrEqual(500);
  });

  it("paints tiles across the full clip past the shared visible-frame budget", () => {
    expect(computeThumbnailStrip(14_400, 16 / 9, 40).frameCount).toBeGreaterThan(33);
  });

  it("returns one tile until the container is measured", () => {
    expect(computeThumbnailStrip(0, 16 / 9, 40).frameCount).toBe(1);
    expect(computeThumbnailStrip(-10, 16 / 9, 40).frameCount).toBe(1);
    expect(computeThumbnailStrip(500, 16 / 9, 0).frameCount).toBe(1);
  });

  it("falls back to 16:9 for degenerate aspects", () => {
    const expected = Math.round(40 * (16 / 9));
    expect(computeThumbnailStrip(300, 0, 40).frameW).toBe(expected);
    expect(computeThumbnailStrip(300, -2, 40).frameW).toBe(expected);
    expect(computeThumbnailStrip(300, Number.NaN, 40).frameW).toBe(expected);
    expect(computeThumbnailStrip(300, Number.POSITIVE_INFINITY, 40).frameW).toBe(expected);
  });

  it("never returns a zero-width tile (avoids divide-by-zero repeat counts)", () => {
    const { frameW, frameCount } = computeThumbnailStrip(300, 0.001, 40);
    expect(frameW).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(frameCount)).toBe(true);
  });

  it("keeps narrow tiles above a caller-owned minimum", () => {
    expect(computeThumbnailStrip(300, 0.25, 40, 48)).toEqual({
      frameW: 48,
      frameCount: 7,
    });
  });
});

describe("thumbnailFrameForTile", () => {
  it("shows the clip's last frame in the last tile, and the slice under each other tile's centre", () => {
    // 8 slices and the end frame.
    expect([0, 1, 2].map((tile) => thumbnailFrameForTile(tile, 3, 9))).toEqual([1, 4, 8]);
    // 2 slices and the end frame across 4 tiles.
    expect([0, 1, 2, 3].map((tile) => thumbnailFrameForTile(tile, 4, 3))).toEqual([0, 0, 1, 2]);
    expect(thumbnailFrameForTile(0, 1, 9)).toBe(4);
  });
});

describe("quantizeThumbnailFrameCount", () => {
  it("uses doubling buckets and never exceeds the 4K geometry ceiling", () => {
    expect(quantizeThumbnailFrameCount(5)).toBe(8);
    expect(quantizeThumbnailFrameCount(32)).toBe(32);
  });

  it("caps decode requests at the largest step within the visible-frame budget", () => {
    // A step that is not a power of two would share no frames with the step below it.
    expect(MAX_VISIBLE_THUMBNAIL_FRAMES).toBeGreaterThan(32);
    expect(quantizeThumbnailFrameCount(34)).toBe(32);
    expect(quantizeThumbnailFrameCount(124)).toBe(32);
  });
});

describe("resolveMediaPreviewUrl", () => {
  it("reroutes same-origin root media resolved by the preview iframe", () => {
    expect(
      resolveMediaPreviewUrl(
        "http://localhost:5190/assets/clip.mp4",
        "proj-1",
        "http://localhost:5190",
      ),
    ).toBe("/api/projects/proj-1/preview/assets/clip.mp4");
  });

  it("preserves empty, canonical preview, and same-origin API sources", () => {
    expect(resolveMediaPreviewUrl("", "proj-1", "http://localhost:5190")).toBe("");
    expect(
      resolveMediaPreviewUrl(
        "http://localhost:5190/api/projects/proj-1/preview/assets/clip.mp4",
        "proj-1",
        "http://localhost:5190",
      ),
    ).toBe("http://localhost:5190/api/projects/proj-1/preview/assets/clip.mp4");
    expect(
      resolveMediaPreviewUrl(
        "http://localhost:5190/api/media/clip.mp4",
        "proj-1",
        "http://localhost:5190",
      ),
    ).toBe("http://localhost:5190/api/media/clip.mp4");
  });

  it("routes composition-relative paths through the project preview endpoint", () => {
    expect(resolveMediaPreviewUrl("assets/image.png", "proj-1")).toBe(
      "/api/projects/proj-1/preview/assets/image.png",
    );
  });

  it("passes absolute http(s) URLs through untouched", () => {
    expect(resolveMediaPreviewUrl("http://cdn.example.com/a.mp4", "proj-1")).toBe(
      "http://cdn.example.com/a.mp4",
    );
    expect(resolveMediaPreviewUrl("https://cdn.example.com/a.png", "proj-1")).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("percent-encodes spaces in filenames", () => {
    expect(resolveMediaPreviewUrl("assets/my logo.png", "proj-1")).toBe(
      "/api/projects/proj-1/preview/assets/my%20logo.png",
    );
  });

  it("percent-encodes parentheses in filenames", () => {
    expect(resolveMediaPreviewUrl("assets/heygen-symbol-blue-logo (2).svg", "proj-1")).toBe(
      "/api/projects/proj-1/preview/assets/heygen-symbol-blue-logo%20(2).svg",
    );
  });

  it("preserves slashes as path separators while encoding each segment", () => {
    expect(resolveMediaPreviewUrl("sub dir/file (v2).mp4", "proj-2")).toBe(
      "/api/projects/proj-2/preview/sub%20dir/file%20(v2).mp4",
    );
  });

  it("percent-encodes unicode characters in filenames", () => {
    expect(resolveMediaPreviewUrl("assets/café logo.png", "proj-1")).toBe(
      "/api/projects/proj-1/preview/assets/caf%C3%A9%20logo.png",
    );
  });

  it("leaves paths with no special characters unchanged", () => {
    expect(resolveMediaPreviewUrl("assets/logo.svg", "proj-1")).toBe(
      "/api/projects/proj-1/preview/assets/logo.svg",
    );
  });

  it("percent-encodes a U+202F narrow no-break space (macOS screenshot artifact)", () => {
    // "Screenshot … 2.16.30 PM.png" — the char between the time and PM is a
    // narrow no-break space; it must encode to %E2%80%AF, not route raw (404).
    expect(resolveMediaPreviewUrl("assets/Screenshot 2.16.30 PM.png", "proj-1")).toBe(
      "/api/projects/proj-1/preview/assets/Screenshot%202.16.30%E2%80%AFPM.png",
    );
  });

  it("passes data: URIs through untouched (never routes them through preview → HTTP 431)", () => {
    const svg = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    expect(resolveMediaPreviewUrl(svg, "proj-1")).toBe(svg);
  });

  it("passes blob: URLs through untouched", () => {
    const blob = "blob:http://localhost:5190/2b3c-4d5e";
    expect(resolveMediaPreviewUrl(blob, "proj-1")).toBe(blob);
  });
});

// The shared encoder used by every timeline media-URL builder (filmstrip, audio
// waveform, sub-composition preview) — must match the assets panel's per-segment
// encoding so those paths stop 404ing on non-ASCII filenames.
describe("encodePreviewPath", () => {
  it("encodes spaces and parentheses per segment, preserving slashes", () => {
    expect(encodePreviewPath("sub dir/file (v2).mp3")).toBe("sub%20dir/file%20(v2).mp3");
  });

  it("encodes a U+202F narrow no-break space to %E2%80%AF", () => {
    expect(encodePreviewPath("assets/clip 2.mp3")).toBe("assets/clip%202.mp3");
    expect(encodePreviewPath(`assets/clip${" "}2.mp3`)).toBe("assets/clip%E2%80%AF2.mp3");
  });

  it("leaves a plain path unchanged", () => {
    expect(encodePreviewPath("assets/music.mp3")).toBe("assets/music.mp3");
  });
});

describe("authoredSrcPath", () => {
  const droppedSrc = (assetPath: string) =>
    /src="([^"]*)"/.exec(
      buildTimelineAssetInsertHtml({
        id: "clip",
        hfId: "hf-clip",
        assetPath,
        kind: "video",
        start: 0,
        duration: 2,
        track: 1,
        zIndex: 1,
      }),
    )![1]!;

  it.each([
    ["assets/My clip.mp4", "/api/projects/p/preview/assets/My%20clip.mp4"],
    ["assets/café.mp4", "/api/projects/p/preview/assets/caf%C3%A9.mp4"],
    ["assets/50% off #1?.mp4", "/api/projects/p/preview/assets/50%25%20off%20%231%3F.mp4"],
  ])("previews a dropped %j at its own file", (assetPath, url) => {
    expect(resolveMediaPreviewUrl(authoredSrcPath(droppedSrc(assetPath)), "p")).toBe(url);
  });

  it("drops the query and fragment, and leaves URLs with a scheme alone", () => {
    expect(authoredSrcPath("assets/a%20b.mp4?v=2#t=1")).toBe("assets/a b.mp4");
    expect(authoredSrcPath("assets/100%.png")).toBe("assets/100%.png");
    expect(authoredSrcPath("https://cdn.example/a%20b.mp4")).toBe("https://cdn.example/a%20b.mp4");
    expect(authoredSrcPath("//cdn.example/a%20b.mp4")).toBe("//cdn.example/a%20b.mp4");
  });
});
