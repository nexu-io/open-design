import { describe, expect, it } from "vitest";
import { findClipForAsset, isPointerClick, DRAG_THRESHOLD_PX } from "./assetClickBehavior";
import type { TimelineElement } from "../player/store/playerStore";

// Minimal TimelineElement factory — only the fields the function inspects.
function makeEl(overrides: Partial<TimelineElement> & { id: string }): TimelineElement {
  return {
    tag: "div",
    start: 0,
    duration: 5,
    track: 0,
    ...overrides,
  };
}

describe("findClipForAsset", () => {
  it("returns null when elements array is empty", () => {
    expect(findClipForAsset([], "assets/foo.mp4")).toBeNull();
  });

  it("returns null when no element matches", () => {
    const el = makeEl({ id: "el1", src: "assets/other.mp4" });
    expect(findClipForAsset([el], "assets/foo.mp4")).toBeNull();
  });

  it("matches a bare relative src against the project-relative asset path", () => {
    const el = makeEl({ id: "el1", src: "assets/clip.mp4", start: 2 });
    expect(findClipForAsset([el], "assets/clip.mp4")).toBe(el);
  });

  it("matches a src with a ./ prefix", () => {
    const el = makeEl({ id: "el1", src: "./assets/logo.png" });
    expect(findClipForAsset([el], "assets/logo.png")).toBe(el);
  });

  it("matches a server-relative /api/projects/…/preview/ src", () => {
    const el = makeEl({ id: "el1", src: "/api/projects/demo/preview/assets/bgm.mp3" });
    expect(findClipForAsset([el], "assets/bgm.mp3")).toBe(el);
  });

  it("matches a fully-absolute URL (as produced by the core runtime)", () => {
    const el = makeEl({
      id: "el1",
      src: "http://localhost:3012/api/projects/demo/preview/assets/clip.mp4",
    });
    expect(findClipForAsset([el], "assets/clip.mp4")).toBe(el);
  });

  it("decodes percent-encoded filenames when matching", () => {
    const el = makeEl({
      id: "el1",
      src: "http://localhost:3012/api/projects/p/preview/assets/my%20file%20(1).mp4",
    });
    expect(findClipForAsset([el], "assets/my file (1).mp4")).toBe(el);
  });

  it("strips query strings from src before matching", () => {
    const el = makeEl({ id: "el1", src: "assets/clip.mp4?v=2" });
    expect(findClipForAsset([el], "assets/clip.mp4")).toBe(el);
  });

  it("returns the element with the earliest start when multiple clips match", () => {
    const later = makeEl({ id: "late", src: "assets/clip.mp4", start: 10 });
    const earlier = makeEl({ id: "early", src: "assets/clip.mp4", start: 2 });
    const first = makeEl({ id: "first", src: "assets/clip.mp4", start: 0 });
    expect(findClipForAsset([later, earlier, first], "assets/clip.mp4")).toBe(first);
  });

  it("prefers the key over id when the element has both", () => {
    // findClipForAsset returns the element object itself; callers do `clip.key ?? clip.id`
    const el = makeEl({ id: "el1", key: "clip-key", src: "assets/img.png" });
    const found = findClipForAsset([el], "assets/img.png");
    expect(found?.key).toBe("clip-key");
  });

  it("skips elements with no src", () => {
    const noSrc = makeEl({ id: "nosrc" });
    const withSrc = makeEl({ id: "withsrc", src: "assets/img.png" });
    expect(findClipForAsset([noSrc, withSrc], "assets/img.png")).toBe(withSrc);
  });
});

describe("isPointerClick", () => {
  it("returns true for zero movement", () => {
    expect(isPointerClick(0, 0)).toBe(true);
  });

  it("returns true for movement within the threshold", () => {
    expect(isPointerClick(DRAG_THRESHOLD_PX - 1, 0)).toBe(true);
    expect(isPointerClick(0, DRAG_THRESHOLD_PX - 1)).toBe(true);
    expect(isPointerClick(DRAG_THRESHOLD_PX - 1, DRAG_THRESHOLD_PX - 1)).toBe(true);
  });

  it("returns false at or beyond the threshold", () => {
    expect(isPointerClick(DRAG_THRESHOLD_PX, 0)).toBe(false);
    expect(isPointerClick(0, DRAG_THRESHOLD_PX)).toBe(false);
    expect(isPointerClick(DRAG_THRESHOLD_PX + 10, 0)).toBe(false);
  });

  it("handles negative movement (pointer moved left/up)", () => {
    expect(isPointerClick(-(DRAG_THRESHOLD_PX - 1), 0)).toBe(true);
    expect(isPointerClick(-DRAG_THRESHOLD_PX, 0)).toBe(false);
  });
});
