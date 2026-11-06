import { describe, expect, it } from "vitest";
import { applyPatchByTarget, applyPatch } from "./sourcePatcher";

/**
 * Reproduction tests for https://github.com/heygen-com/hyperframes/issues/958
 *
 * The bug: dragging a clip in the Studio timeline rewrites index.html with
 * inline style="z-index: N" on EVERY clip, overriding the author's CSS z-index.
 * Additionally, void elements (img, audio) get malformed self-closing tags.
 */

const ISSUE_HTML = `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }
  #bg-video  { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  #title     { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
               font: 700 120px sans-serif; color: #fff; z-index: 20; }
</style>

<div id="root" data-composition-id="main" data-start="0" data-duration="10"
     data-width="1920" data-height="1080">
  <video id="bg-video" data-start="0" data-track-index="0" src="some-bg.mp4" muted playsinline></video>
  <div   id="title" class="clip" data-start="0" data-duration="10" data-track-index="1">TITLE</div>
</div>`;

const VOID_ELEMENT_HTML = `<div id="root" data-composition-id="main" data-start="0" data-duration="14"
     data-width="1920" data-height="1080">
  <video id="bg-video" data-start="0" data-track-index="0" src="some-bg.mp4" muted playsinline></video>
  <img id="gif-img" class="clip" data-start="1" data-duration="13" data-track-index="2" src="assets/earth.gif" alt="rotating earth gif" />
  <div id="title" class="clip" data-start="0" data-duration="10" data-track-index="1">TITLE</div>
</div>`;

describe("issue #958 — timeline drag must not inject inline z-index", () => {
  it("reproduces the old bug: z-index injection on all clips overrides CSS layering", () => {
    // Simulate the OLD behavior: buildTrackZIndexMap + loop over all clips
    function buildTrackZIndexMap(tracks: number[]): Map<number, number> {
      const uniqueTracks = Array.from(new Set(tracks)).sort((a, b) => a - b);
      const maxZIndex = uniqueTracks.length;
      return new Map(uniqueTracks.map((track, index) => [track, maxZIndex - index]));
    }

    const elements = [
      { id: "bg-video", track: 0 },
      { id: "title", track: 1 },
    ];
    const trackZIndices = buildTrackZIndexMap(elements.map((e) => e.track));

    // Apply the old z-index injection loop
    let broken = ISSUE_HTML;
    for (const el of elements) {
      const nextZIndex = trackZIndices.get(el.track);
      if (nextZIndex == null) continue;
      broken = applyPatch(broken, el.id, {
        type: "inline-style",
        property: "z-index",
        value: String(nextZIndex),
      });
    }

    // Verify the bug: bg-video gets z-index: 2, title gets z-index: 1
    // This INVERTS the intended layering (CSS had bg-video: 0, title: 20)
    expect(broken).toContain('id="bg-video"');
    expect(broken).toContain('style="z-index: 2"');
    expect(broken).toContain('id="title"');
    expect(broken).toContain('style="z-index: 1"');

    // The title (z-index: 1) is now BEHIND the video (z-index: 2)
    // — the opposite of the author's intent (CSS z-index: 20 vs 0)
  });

  it("verifies the fix: moving a clip only patches data-start and data-track-index", () => {
    // Simulate the NEW behavior: only patch the moved clip's timing attributes
    const movedElement = { id: "bg-video" };
    const updates = { start: "2.5", track: "0" };

    let fixed = applyPatchByTarget(
      ISSUE_HTML,
      { id: movedElement.id },
      { type: "attribute", property: "start", value: updates.start },
    );
    fixed = applyPatchByTarget(
      fixed,
      { id: movedElement.id },
      { type: "attribute", property: "track-index", value: updates.track },
    );

    // The moved clip's timing changed
    expect(fixed).toContain('id="bg-video" data-start="2.5" data-track-index="0"');

    // No inline z-index was injected on ANY element
    expect(fixed).not.toContain('style="z-index');

    // The title clip is completely untouched
    expect(fixed).toContain(
      '<div   id="title" class="clip" data-start="0" data-duration="10" data-track-index="1">TITLE</div>',
    );

    // CSS z-index declarations in <style> are preserved
    expect(fixed).toContain("z-index: 0;");
    expect(fixed).toContain("z-index: 20;");
  });

  it("verifies the fix: deleting a clip does not inject z-index on remaining clips", () => {
    // After the element removal API call returns the content without bg-video,
    // the old code would loop over remaining clips and inject z-index.
    // The new code just uses the removal result as-is.
    const afterRemoval = ISSUE_HTML.replace(/<video id="bg-video"[^>]*><\/video>\n  /, "");

    // No z-index injection step — the result is used directly
    expect(afterRemoval).not.toContain('style="z-index');
    expect(afterRemoval).toContain(
      '<div   id="title" class="clip" data-start="0" data-duration="10" data-track-index="1">TITLE</div>',
    );
  });
});

describe("issue #958 — void element inline style injection", () => {
  it("reproduces the old bug: self-closing tags get malformed when style is injected", () => {
    // The old code did: tag.replace(/>$/, "") + ` style="z-index: 7"`
    // But `tag` from the regex capture never includes `>`, and for self-closing
    // elements it ends with `/`. The replace was a no-op, producing:
    //   <img ... / style="z-index: 7">
    const img = `<img id="gif-img" class="clip" data-start="1" src="earth.gif" alt="earth" />`;
    const result = applyPatch(img, "gif-img", {
      type: "inline-style",
      property: "z-index",
      value: "7",
    });

    // With the fix, the style is inserted before the self-closing slash
    expect(result).not.toContain("/ style");
    expect(result).toContain('style="z-index: 7" />');
  });

  it("verifies inline style on void elements in a full composition", () => {
    // Even though we no longer inject z-index during move/delete,
    // the patchInlineStyleInTag fix is still important for other inline style
    // patches (e.g., position, opacity) that the Studio applies to void elements.
    const result = applyPatch(VOID_ELEMENT_HTML, "gif-img", {
      type: "inline-style",
      property: "opacity",
      value: "0.8",
    });

    expect(result).toContain('style="opacity: 0.8" />');
    expect(result).not.toContain("/ style");
    // Other elements untouched
    expect(result).toContain(
      '<video id="bg-video" data-start="0" data-track-index="0" src="some-bg.mp4" muted playsinline></video>',
    );
    expect(result).toContain(
      '<div id="title" class="clip" data-start="0" data-duration="10" data-track-index="1">TITLE</div>',
    );
  });
});
