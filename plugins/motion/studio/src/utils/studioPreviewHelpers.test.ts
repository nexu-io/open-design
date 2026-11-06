// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import {
  coversComposition,
  getAllPreviewTargetsFromPointer,
  getPreviewTargetFromPointer,
  pauseStudioPreviewPlayback,
} from "./studioPreviewHelpers";

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function stubRect(el: Element, rect: DOMRect): void {
  el.getBoundingClientRect = () => rect;
}

/** Create and attach a preview iframe, returning it with its (asserted) document. */
function createPreviewIframe(): { iframe: HTMLIFrameElement; doc: Document } {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe document");
  return { iframe, doc };
}

describe("coversComposition (full-bleed canvas-pick exclusion)", () => {
  const viewport = { width: 1920, height: 1080 };

  it("treats a full-bleed scene wrapper as covering the composition", () => {
    expect(coversComposition({ width: 1920, height: 1080 }, viewport)).toBe(true);
    expect(coversComposition({ width: 1900, height: 1040 }, viewport)).toBe(true); // ~99%/96%
  });

  it("does NOT exclude inner content (a stat card, a heading)", () => {
    expect(coversComposition({ width: 320, height: 180 }, viewport)).toBe(false);
    expect(coversComposition({ width: 1900, height: 200 }, viewport)).toBe(false); // wide but short
    expect(coversComposition({ width: 200, height: 1040 }, viewport)).toBe(false); // tall but narrow
  });

  it("needs BOTH axes near full-bleed (>=95%)", () => {
    expect(coversComposition({ width: 1800, height: 1080 }, viewport)).toBe(false); // 93.75% wide
    expect(coversComposition({ width: 1920, height: 1000 }, viewport)).toBe(false); // 92.6% tall
  });

  it("guards against a degenerate viewport", () => {
    expect(coversComposition({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(false);
    expect(coversComposition({ width: 100, height: 100 }, { width: 1, height: 1 })).toBe(false);
  });
});

describe("pauseStudioPreviewPlayback", () => {
  it("pauses through __player without pausing sibling timelines directly", () => {
    const playerPause = vi.fn();
    const timelinePause = vi.fn();
    const siblingPause = vi.fn();

    const iframe = {
      contentWindow: {
        __player: {
          getTime: () => 4.25,
          pause: playerPause,
        },
        __timeline: {
          time: () => 4.25,
          pause: timelinePause,
        },
        __timelines: {
          root: {
            pause: siblingPause,
          },
        },
      },
    } as unknown as HTMLIFrameElement;

    expect(pauseStudioPreviewPlayback(iframe)).toBe(4.25);
    expect(playerPause).toHaveBeenCalledTimes(1);
    expect(timelinePause).not.toHaveBeenCalled();
    expect(siblingPause).not.toHaveBeenCalled();
  });

  it("falls back to pausing timelines directly when __player is unavailable", () => {
    const timelinePause = vi.fn();
    const siblingPause = vi.fn();

    const iframe = {
      contentWindow: {
        __timeline: {
          time: () => 2.5,
          pause: timelinePause,
        },
        __timelines: {
          root: {
            pause: siblingPause,
          },
        },
      },
    } as unknown as HTMLIFrameElement;

    expect(pauseStudioPreviewPlayback(iframe)).toBe(2.5);
    expect(timelinePause).toHaveBeenCalledTimes(1);
    expect(siblingPause).toHaveBeenCalledTimes(1);
  });
});

describe("getPreviewTargetFromPointer", () => {
  it("chooses the deepest headline through a transparent overflow mask", () => {
    const { iframe, doc } = createPreviewIframe();
    doc.body.innerHTML = `
      <template id="source-template"></template>
      <main data-composition-id="scene">
        <section class="hl-block">
          <div class="hl-mask" style="overflow: hidden; background: transparent">
            <h1 class="hl-text">Launch title</h1>
          </div>
        </section>
      </main>
    `;
    const scene = doc.querySelector<HTMLElement>("main")!;
    const block = doc.querySelector<HTMLElement>(".hl-block")!;
    const mask = doc.querySelector<HTMLElement>(".hl-mask")!;
    const headline = doc.querySelector<HTMLElement>(".hl-text")!;
    stubRect(iframe, domRect(0, 0, 400, 300));
    stubRect(scene, domRect(0, 0, 400, 300));
    stubRect(block, domRect(30, 30, 300, 100));
    stubRect(mask, domRect(40, 40, 260, 64));
    stubRect(headline, domRect(44, 44, 220, 48));
    doc.elementsFromPoint = () => [headline, mask, block, scene];

    expect(getPreviewTargetFromPointer(iframe, 80, 64, "index.html")).toBe(headline);
    iframe.remove();
  });

  it("hit-tests without adding styles to the preview document", () => {
    const { iframe, doc } = createPreviewIframe();
    doc.body.innerHTML = `<main data-composition-id="scene"><h1 id="headline">Title</h1></main>`;
    const scene = doc.querySelector<HTMLElement>("main")!;
    const headline = doc.getElementById("headline")!;
    stubRect(iframe, domRect(0, 0, 400, 300));
    stubRect(scene, domRect(0, 0, 400, 300));
    stubRect(headline, domRect(40, 40, 160, 48));
    const stylesAtHitTest: number[] = [];
    doc.elementsFromPoint = () => {
      stylesAtHitTest.push(doc.querySelectorAll("style").length + doc.adoptedStyleSheets.length);
      return [headline, scene];
    };
    // First call runs the once-per-document inheritance probe, a body mutation.
    expect(getPreviewTargetFromPointer(iframe, 80, 64, "index.html")).toBe(headline);
    const observer = new MutationObserver(() => {});
    observer.observe(doc, { subtree: true, childList: true, attributes: true });

    expect(getPreviewTargetFromPointer(iframe, 80, 64, "index.html")).toBe(headline);
    expect(getAllPreviewTargetsFromPointer(iframe, 80, 64, "index.html")).toEqual([headline]);
    const mutations = observer.takeRecords();
    observer.disconnect();

    expect(stylesAtHitTest).toEqual([0, 0, 0]);
    expect(mutations).toEqual([]);
    iframe.remove();
  });

  it("skips candidates hidden from author hit-testing by inherited pointer-events:none", () => {
    const { iframe, doc } = createPreviewIframe();

    doc.body.innerHTML = `
      <main id="scene" data-composition-id="scene">
        <h1 id="headline">Launch title</h1>
        <div id="overlay-parent" style="pointer-events: none;">
          <div id="overlay" style="position: absolute; background: rgba(0, 0, 0, 0.1);"></div>
        </div>
      </main>
    `;

    const scene = doc.getElementById("scene");
    const headline = doc.getElementById("headline");
    const overlayParent = doc.getElementById("overlay-parent");
    const overlay = doc.getElementById("overlay");
    if (!scene || !headline || !overlayParent || !overlay) {
      throw new Error("Expected preview fixture elements");
    }

    stubRect(iframe, domRect(0, 0, 400, 300));
    stubRect(scene, domRect(0, 0, 400, 300));
    stubRect(headline, domRect(40, 40, 160, 48));
    stubRect(overlayParent, domRect(0, 0, 360, 260));
    stubRect(overlay, domRect(0, 0, 360, 260));
    doc.elementsFromPoint = () => [overlay, overlayParent, headline, scene];

    expect(getPreviewTargetFromPointer(iframe, 80, 64, "index.html")).toBe(headline);

    iframe.remove();
  });

  it("honors a CSS-class pointer-events:auto opt-in under a pointer-events:none ancestor", () => {
    const { iframe, doc } = createPreviewIframe();

    doc.head.innerHTML = `<style>.clickable { pointer-events: auto; }</style>`;
    doc.body.innerHTML = `
      <main id="scene" data-composition-id="scene">
        <div id="overlay-parent" style="pointer-events: none;">
          <button id="clickable-child" class="clickable">Play</button>
        </div>
      </main>
    `;

    const scene = doc.getElementById("scene");
    const overlayParent = doc.getElementById("overlay-parent");
    const clickableChild = doc.getElementById("clickable-child");
    if (!scene || !overlayParent || !clickableChild) {
      throw new Error("Expected preview fixture elements");
    }

    stubRect(iframe, domRect(0, 0, 400, 300));
    stubRect(scene, domRect(0, 0, 400, 300));
    stubRect(overlayParent, domRect(0, 0, 360, 260));
    stubRect(clickableChild, domRect(40, 40, 80, 24));
    doc.elementsFromPoint = () => [clickableChild, overlayParent, scene];

    expect(getPreviewTargetFromPointer(iframe, 60, 50, "index.html")).toBe(clickableChild);

    iframe.remove();
  });

  it("selects a full-bleed <video> instead of skipping to the element behind it", () => {
    const { iframe, doc } = createPreviewIframe();

    doc.body.innerHTML = `
      <main id="scene" data-composition-id="scene">
        <div id="backdrop"></div>
        <video id="hero"></video>
      </main>
    `;

    const scene = doc.getElementById("scene");
    const backdrop = doc.getElementById("backdrop");
    const hero = doc.getElementById("hero");
    if (!scene || !backdrop || !hero) throw new Error("Expected preview fixture elements");

    stubRect(iframe, domRect(0, 0, 400, 300));
    stubRect(scene, domRect(0, 0, 400, 300));
    stubRect(backdrop, domRect(0, 0, 400, 300));
    // Full-bleed hero video painted on top of a full-bleed backdrop.
    stubRect(hero, domRect(0, 0, 400, 300));
    doc.elementsFromPoint = () => [hero, backdrop, scene];

    // Before the fix the video was full-bleed-excluded and the picker fell through
    // to the backdrop (or null). It must now return the video itself.
    expect(getPreviewTargetFromPointer(iframe, 200, 150, "index.html")).toBe(hero);

    iframe.remove();
  });

  it("still excludes a full-bleed non-media container so clicks reach inner content", () => {
    const { iframe, doc } = createPreviewIframe();

    doc.body.innerHTML = `
      <main id="scene" data-composition-id="scene">
        <div id="wrapper"><h1 id="headline">Title</h1></div>
      </main>
    `;

    const scene = doc.getElementById("scene");
    const wrapper = doc.getElementById("wrapper");
    const headline = doc.getElementById("headline");
    if (!scene || !wrapper || !headline) throw new Error("Expected preview fixture elements");

    stubRect(iframe, domRect(0, 0, 400, 300));
    stubRect(scene, domRect(0, 0, 400, 300));
    stubRect(wrapper, domRect(0, 0, 400, 300));
    stubRect(headline, domRect(40, 40, 160, 48));
    doc.elementsFromPoint = () => [headline, wrapper, scene];

    expect(getPreviewTargetFromPointer(iframe, 80, 64, "index.html")).toBe(headline);

    iframe.remove();
  });
});
