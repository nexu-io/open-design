import { setStudioKeys } from "../components/studioShortcuts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import {
  buildStandaloneRootTimelineElement,
  createStaticSeekPlaybackAdapter,
  createTimelineElementFromManifestClip,
  findTimelineDomNodeForClip,
  getTimelineElementSelector,
  parseTimelineFromDOM,
  readTimelineDurationFromDocument,
  type ClipManifestClip,
  mergeTimelineElementsPreservingDowngrades,
  resolveStandaloneRootCompositionSrc,
  shouldIgnorePlaybackShortcutEvent,
  shouldIgnorePlaybackShortcutTarget,
} from "./useTimelinePlayer";

function createDocument(markup: string): Document {
  const window = new Window();
  Object.assign(window, { SyntaxError });
  window.document.body.innerHTML = markup;
  return window.document;
}

function createClip(overrides: Partial<ClipManifestClip>): ClipManifestClip {
  return {
    id: null,
    label: "",
    start: 0,
    duration: 4,
    track: 0,
    kind: "element",
    tagName: "div",
    compositionId: null,
    parentCompositionId: null,
    compositionSrc: null,
    assetUrl: null,
    ...overrides,
  };
}

function mockTargetMatching(selectorNeedle: string): EventTarget {
  return {
    closest: (selector: string) => (selector.includes(selectorNeedle) ? ({} as Element) : null),
  } as unknown as EventTarget;
}

function mockKeyboardEvent(
  code: string,
  overrides: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "target">> = {},
): Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "code" | "target"> {
  return {
    key: code,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    code,
    target: mockTargetMatching("[data-missing]"),
    ...overrides,
  };
}

function createManualAnimationClock() {
  let now = 0;
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    now: () => now,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      nextId += 1;
      callbacks.set(nextId, callback);
      return nextId;
    },
    cancelAnimationFrame: (id: number) => {
      callbacks.delete(id);
    },
    step: (milliseconds: number) => {
      now += milliseconds;
      const pending = Array.from(callbacks.entries());
      callbacks.clear();
      for (const [, callback] of pending) {
        callback(now);
      }
    },
    scheduledCount: () => callbacks.size,
  };
}

describe("readTimelineDurationFromDocument", () => {
  it("prefers the root composition duration", () => {
    const doc = createDocument(`
      <div data-composition-id="main" data-duration="3">
        <section data-start="0" data-duration="8"></section>
      </div>
    `);

    expect(readTimelineDurationFromDocument(doc)).toBe(3);
  });

  it("falls back to the maximum child end time", () => {
    const doc = createDocument(`
      <div data-composition-id="main">
        <section data-start="1" data-duration="2"></section>
        <section data-start="4" data-duration="1.5"></section>
      </div>
    `);

    expect(readTimelineDurationFromDocument(doc)).toBe(5.5);
  });

  it("reads data-hf-authored-duration when data-duration is stripped", () => {
    const doc = createDocument(`
      <div data-composition-id="main">
        <div data-composition-id="sub-a" data-start="0" data-hf-authored-duration="8"></div>
        <div data-composition-id="sub-b" data-start="60" data-hf-authored-duration="10"></div>
      </div>
    `);

    expect(readTimelineDurationFromDocument(doc)).toBe(70);
  });

  it("picks the larger of data-duration and data-hf-authored-duration children", () => {
    const doc = createDocument(`
      <div data-composition-id="main">
        <div data-start="0" data-duration="5"></div>
        <div data-composition-id="ext" data-start="74" data-hf-authored-duration="8"></div>
      </div>
    `);

    expect(readTimelineDurationFromDocument(doc)).toBe(82);
  });
});

describe("createStaticSeekPlaybackAdapter", () => {
  it("drives renderSeek while playing a duration-only composition", () => {
    const clock = createManualAnimationClock();
    const renderedTimes: number[] = [];
    const adapter = createStaticSeekPlaybackAdapter(
      {
        getTime: () => 0,
        renderSeek: (time: number) => {
          renderedTimes.push(time);
        },
      },
      3,
      clock,
    );

    adapter.seek(1);
    adapter.play();
    clock.step(500);
    clock.step(2_000);

    expect(renderedTimes).toEqual([1, 1.5, 3]);
    expect(adapter.getTime()).toBe(3);
    expect(adapter.isPlaying()).toBe(false);
    expect(clock.scheduledCount()).toBe(0);
  });

  it("clamps explicit seeks to the fallback duration", () => {
    const clock = createManualAnimationClock();
    const renderedTimes: number[] = [];
    const adapter = createStaticSeekPlaybackAdapter(
      {
        getTime: () => 0,
        renderSeek: (time: number) => {
          renderedTimes.push(time);
        },
      },
      2,
      clock,
    );

    adapter.seek(9);

    expect(renderedTimes).toEqual([2]);
    expect(adapter.getTime()).toBe(2);
  });

  it("works with a seek-only adapter (no renderSeek)", () => {
    const clock = createManualAnimationClock();
    const seekedTimes: number[] = [];
    const adapter = createStaticSeekPlaybackAdapter(
      {
        getTime: () => 0,
        seek: (time: number) => {
          seekedTimes.push(time);
        },
      },
      82,
      clock,
    );

    adapter.seek(77);
    expect(seekedTimes).toEqual([77]);
    expect(adapter.getTime()).toBe(77);
    expect(adapter.getDuration()).toBe(82);
  });

  it("clamps time at the duration boundary during RAF tick", () => {
    const clock = createManualAnimationClock();
    const renderedTimes: number[] = [];
    const adapter = createStaticSeekPlaybackAdapter(
      {
        getTime: () => 0,
        renderSeek: (time: number) => {
          renderedTimes.push(time);
        },
      },
      2,
      clock,
    );

    adapter.seek(0);
    adapter.play();
    clock.step(3_000);

    expect(adapter.getTime()).toBe(2);
    expect(adapter.isPlaying()).toBe(false);
    expect(renderedTimes).toEqual([0, 2]);
  });

  it("pauses old adapter before replacing with new duration", () => {
    const clock = createManualAnimationClock();
    const adapter = createStaticSeekPlaybackAdapter(
      { getTime: () => 0, renderSeek: () => {} },
      10,
      clock,
    );
    adapter.play();
    expect(adapter.isPlaying()).toBe(true);
    adapter.pause();
    expect(adapter.isPlaying()).toBe(false);
  });
});

describe("buildStandaloneRootTimelineElement", () => {
  it("includes selector and source metadata for standalone composition fallback clips", () => {
    expect(
      buildStandaloneRootTimelineElement({
        compositionId: "hero",
        tagName: "DIV",
        rootDuration: 8,
        iframeSrc: "http://127.0.0.1:4173/api/projects/demo/preview/comp/scenes/hero.html?_t=123",
        selector: '[data-composition-id="hero"]',
      }),
      // toMatchObject (not toEqual): asserts the selector/source metadata this
      // test is about, without re-pinning the full element shape (stacking
      // metadata like hasExplicitZIndex is covered in timelineDOM.test.ts).
    ).toMatchObject({
      id: "hero",
      label: "hero",
      key: 'scenes/hero.html:[data-composition-id="hero"]:0',
      tag: "div",
      start: 0,
      duration: 8,
      track: 0,
      compositionSrc: "scenes/hero.html",
      selector: '[data-composition-id="hero"]',
      selectorIndex: undefined,
      sourceFile: "scenes/hero.html",
    });
  });

  it("returns null for invalid fallback durations", () => {
    expect(
      buildStandaloneRootTimelineElement({
        compositionId: "hero",
        tagName: "div",
        rootDuration: 0,
        iframeSrc: "http://localhost/preview/comp/hero.html",
      }),
    ).toBe(null);
    expect(
      buildStandaloneRootTimelineElement({
        compositionId: "hero",
        tagName: "div",
        rootDuration: Number.NaN,
        iframeSrc: "http://localhost/preview/comp/hero.html",
      }),
    ).toBe(null);
  });
});

describe("resolveStandaloneRootCompositionSrc", () => {
  it("extracts the composition path from a preview iframe url", () => {
    expect(
      resolveStandaloneRootCompositionSrc(
        "http://127.0.0.1:4173/api/projects/demo/preview/comp/scenes/hero.html?_t=123",
      ),
    ).toBe("scenes/hero.html");
  });

  it("returns undefined for non-composition preview urls", () => {
    expect(
      resolveStandaloneRootCompositionSrc("http://127.0.0.1:4173/api/projects/demo/preview"),
    ).toBe(undefined);
  });
});

describe("findTimelineDomNodeForClip", () => {
  it("matches anonymous manifest clips back to repeated DOM nodes in timeline order", () => {
    const doc = createDocument(`
      <div data-composition-id="main" data-start="0" data-duration="8">
        <section id="identity-card" class="clip identity-card" data-start="0" data-duration="4" data-track-index="0"></section>
        <div class="clip duplicate-card first" data-start="0" data-duration="4" data-track-index="1"></div>
        <div class="clip duplicate-card second" data-start="0" data-duration="4" data-track-index="2"></div>
      </div>
    `);
    const used = new Set<Element>();

    const first = findTimelineDomNodeForClip(
      doc,
      createClip({ id: "__node__index_2", track: 1 }),
      1,
      used,
    ) as HTMLElement;
    used.add(first);
    const second = findTimelineDomNodeForClip(
      doc,
      createClip({ id: "__node__index_3", track: 2 }),
      2,
      used,
    ) as HTMLElement;

    expect(first.className).toBe("clip duplicate-card first");
    expect(second.className).toBe("clip duplicate-card second");
    expect(getTimelineElementSelector(first)).toBe(".duplicate-card");
    expect(getTimelineElementSelector(second)).toBe(".duplicate-card");
  });
});

describe("anonymous timeline identity", () => {
  it("does not invent rows for root-level untimed wrappers", () => {
    const doc = createDocument(`
      <div data-composition-id="compare" data-start="0" data-duration="18">
        <div class="scene-shell"><div class="topline">Title</div></div>
        <video id="main-video" class="clip main-video" data-start="0" data-duration="18" data-track-index="1"></video>
      </div>
    `);

    const elements = parseTimelineFromDOM(doc, 18);

    expect(elements.map((element) => element.tag)).toEqual(["video"]);
  });

  it("keeps fallback-parsed anonymous clips distinct when labels match", () => {
    const doc = createDocument(`
      <div data-composition-id="main" data-start="0" data-duration="8">
        <div class="clip card" data-label="Card" data-start="0" data-duration="3" data-track-index="0"></div>
        <div class="clip card" data-label="Card" data-start="3" data-duration="3" data-track-index="1"></div>
      </div>
    `);

    const elements = parseTimelineFromDOM(doc, 8);

    expect(elements).toHaveLength(2);
    expect(elements.map((element) => element.label)).toEqual(["Card", "Card"]);
    expect(new Set(elements.map((element) => element.id)).size).toBe(2);
    expect(new Set(elements.map((element) => element.key)).size).toBe(2);
    expect(elements.map((element) => element.selectorIndex)).toEqual([0, 1]);
  });

  it("keeps runtime-manifest anonymous clips distinct when labels match", () => {
    const doc = createDocument(`
      <div data-composition-id="main" data-start="0" data-duration="8">
        <div class="clip card" data-start="0" data-duration="3" data-track-index="0"></div>
        <div class="clip card" data-start="3" data-duration="3" data-track-index="1"></div>
      </div>
    `);
    const clips = [
      createClip({ id: null, label: "Card", start: 0, duration: 3, track: 0 }),
      createClip({ id: null, label: "Card", start: 3, duration: 3, track: 1 }),
    ];
    const used = new Set<Element>();
    const elements = clips.map((clip, index) => {
      const hostEl = findTimelineDomNodeForClip(doc, clip, index, used);
      if (hostEl) used.add(hostEl);
      return createTimelineElementFromManifestClip({
        clip,
        fallbackIndex: index,
        doc,
        hostEl,
      });
    });

    expect(elements.map((element) => element.label)).toEqual(["Card", "Card"]);
    expect(new Set(elements.map((element) => element.id)).size).toBe(2);
    expect(new Set(elements.map((element) => element.key)).size).toBe(2);
    expect(elements.map((element) => element.selectorIndex)).toEqual([0, 1]);
  });

  it("reads media metadata from owner-window media elements", () => {
    const doc = createDocument(`
      <div data-composition-id="main" data-start="0" data-duration="8">
        <div class="clip video-card" data-start="0" data-duration="3" data-track-index="0">
          <video src="/clip.mp4" data-source-duration="12"></video>
        </div>
      </div>
    `);
    const hostEl = doc.querySelector(".video-card");
    const video = hostEl?.querySelector("video");
    if (!hostEl || !video) throw new Error("missing video test fixture");
    Object.defineProperty(video, "defaultPlaybackRate", {
      value: 1.5,
      configurable: true,
    });

    const element = createTimelineElementFromManifestClip({
      clip: createClip({ kind: "video", tagName: "div" }),
      fallbackIndex: 0,
      doc,
      hostEl,
    });

    expect(element.tag).toBe("video");
    expect(element.src).toBe("/clip.mp4");
    expect(element.sourceDuration).toBe(12);
    expect(element.playbackRate).toBe(1.5);
  });
});

describe("mergeTimelineElementsPreservingDowngrades", () => {
  it("preserves missing sub-composition elements when a shorter manifest arrives", () => {
    expect(
      mergeTimelineElementsPreservingDowngrades(
        [
          { id: "hero", tag: "div", start: 0, duration: 4, track: 0 },
          {
            id: "cta",
            tag: "div",
            start: 4,
            duration: 2,
            track: 1,
            compositionSrc: "scenes/cta.html",
          },
        ],
        [{ id: "hero", tag: "div", start: 0, duration: 4, track: 0 }],
        8,
        8,
      ),
    ).toEqual([
      { id: "hero", tag: "div", start: 0, duration: 4, track: 0 },
      {
        id: "cta",
        tag: "div",
        start: 4,
        duration: 2,
        track: 1,
        compositionSrc: "scenes/cta.html",
      },
    ]);
  });

  it("drops missing top-level elements so undo does not leave ghost clips", () => {
    expect(
      mergeTimelineElementsPreservingDowngrades(
        [
          { id: "hero", tag: "div", start: 0, duration: 4, track: 0 },
          { id: "split-clone", tag: "div", start: 4, duration: 2, track: 1 },
        ],
        [{ id: "hero", tag: "div", start: 0, duration: 4, track: 0 }],
        8,
        8,
      ),
    ).toEqual([{ id: "hero", tag: "div", start: 0, duration: 4, track: 0 }]);
  });

  it("accepts longer-duration or same-size updates as authoritative", () => {
    expect(
      mergeTimelineElementsPreservingDowngrades(
        [{ id: "hero", tag: "div", start: 0, duration: 4, track: 0 }],
        [{ id: "hero", tag: "div", start: 0, duration: 4, track: 0 }],
        4,
        6,
      ),
    ).toEqual([{ id: "hero", tag: "div", start: 0, duration: 4, track: 0 }]);
  });

  it("preserves distinct anonymous clips that share the same friendly id label", () => {
    expect(
      mergeTimelineElementsPreservingDowngrades(
        [
          {
            id: "Card",
            key: "index.html:.card:0",
            label: "Card",
            tag: "div",
            start: 0,
            duration: 3,
            track: 0,
            compositionSrc: "scenes/cards.html",
          },
          {
            id: "Card",
            key: "index.html:.card:1",
            label: "Card",
            tag: "div",
            start: 3,
            duration: 3,
            track: 1,
            compositionSrc: "scenes/cards.html",
          },
        ],
        [
          {
            id: "Card",
            key: "index.html:.card:0",
            label: "Card",
            tag: "div",
            start: 0,
            duration: 3,
            track: 0,
            compositionSrc: "scenes/cards.html",
          },
        ],
        8,
        8,
      ),
    ).toEqual([
      {
        id: "Card",
        key: "index.html:.card:0",
        label: "Card",
        tag: "div",
        start: 0,
        duration: 3,
        track: 0,
        compositionSrc: "scenes/cards.html",
      },
      {
        id: "Card",
        key: "index.html:.card:1",
        label: "Card",
        tag: "div",
        start: 3,
        duration: 3,
        track: 1,
        compositionSrc: "scenes/cards.html",
      },
    ]);
  });
});

describe("shouldIgnorePlaybackShortcutTarget", () => {
  it("ignores focused toolbar buttons so Space can activate the button itself", () => {
    expect(shouldIgnorePlaybackShortcutTarget(mockTargetMatching("button"))).toBe(true);
  });

  it("ignores the seek slider so ArrowRight reaches the slider key handler", () => {
    expect(shouldIgnorePlaybackShortcutTarget(mockTargetMatching("[role='slider']"))).toBe(true);
  });

  it("allows non-interactive preview targets to use playback shortcuts", () => {
    expect(shouldIgnorePlaybackShortcutTarget(mockTargetMatching("[data-missing]"))).toBe(false);
  });
});

describe("shouldIgnorePlaybackShortcutEvent", () => {
  it("defers Arrow frame shortcuts while caption edit mode has selected words", () => {
    const captionSelection = { isCaptionEditMode: true, selectedCaptionSegmentCount: 1 };

    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("ArrowLeft"), captionSelection),
    ).toBe(true);
    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("ArrowRight"), captionSelection),
    ).toBe(true);
    expect(shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("KeyJ"), captionSelection)).toBe(
      false,
    );
  });

  it("defers a remapped frame key, not the arrows, while caption words are selected", () => {
    setStudioKeys({ frameBack: "," });
    const captionSelection = { isCaptionEditMode: true, selectedCaptionSegmentCount: 1 };
    expect(
      shouldIgnorePlaybackShortcutEvent(
        { ...mockKeyboardEvent("Comma"), key: "," },
        captionSelection,
      ),
    ).toBe(true);
    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("ArrowLeft"), captionSelection),
    ).toBe(false);
    setStudioKeys(null);
  });

  it("allows Arrow frame shortcuts when captions are not selected", () => {
    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("ArrowRight"), {
        isCaptionEditMode: true,
        selectedCaptionSegmentCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("ArrowRight"), {
        isCaptionEditMode: false,
        selectedCaptionSegmentCount: 1,
      }),
    ).toBe(false);
  });
});

describe("shouldIgnorePlaybackShortcutEvent while a modal dialog is open", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // happy-dom has no layout, so the `hidden` attribute stands in for checkVisibility.
  function stubStudioDocument(markup: string): Document {
    const document = createDocument(markup);
    const elementProto = document.defaultView!.Element.prototype as {
      checkVisibility?: (this: Element) => boolean;
    };
    elementProto.checkVisibility = function () {
      return this.closest("[hidden]") === null;
    };
    vi.stubGlobal("document", document);
    return document;
  }

  it("ignores playback keys with focus still on the page behind the dialog", () => {
    const document = stubStudioDocument(
      `<div role="dialog" aria-modal="true"><p>Lint results</p></div>`,
    );
    for (const code of ["Space", "ArrowRight", "KeyL"]) {
      expect(
        shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent(code, { target: document.body })),
      ).toBe(true);
    }
  });

  it("ignores playback keys with focus inside the dialog", () => {
    const document = stubStudioDocument(
      `<div role="dialog" aria-modal="true" tabindex="-1"><p>Lint results</p></div>`,
    );
    const dialog = document.querySelector("[role='dialog']");
    const text = document.querySelector("p");
    expect(shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("Space", { target: dialog }))).toBe(
      true,
    );
    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("ArrowLeft", { target: text })),
    ).toBe(true);
  });

  it("keeps playback keys for dialogs that are hidden, inert or not modal", () => {
    for (const markup of [
      `<div role="dialog" aria-modal="true" hidden></div>`,
      `<div inert><div role="dialog" aria-modal="true"></div></div>`,
      `<div role="dialog"></div>`,
    ]) {
      const document = stubStudioDocument(markup);
      expect(
        shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("Space", { target: document.body })),
      ).toBe(false);
    }
  });

  it("counts a dialog under fullscreen only when the fullscreen element holds it", () => {
    const document = stubStudioDocument(
      `<div id="stage"><div id="inner" role="dialog" aria-modal="true"></div></div>` +
        `<div id="outer" role="dialog" aria-modal="true"></div>`,
    );
    const space = () =>
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("Space", { target: document.body }));
    const fullscreenOn = (id: string) =>
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: document.getElementById(id),
      });
    fullscreenOn("stage");
    expect(space()).toBe(true);
    document.getElementById("inner")!.remove();
    expect(space()).toBe(false);
  });

  it("counts an aria-modal dialog where the browser has no checkVisibility", () => {
    const document = createDocument(`<div role="dialog" aria-modal="true"></div>`);
    delete (document.defaultView!.Element.prototype as { checkVisibility?: unknown })
      .checkVisibility;
    vi.stubGlobal("document", document);
    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("Space", { target: document.body })),
    ).toBe(true);
  });

  it("keeps playback keys when no dialog is open", () => {
    const document = stubStudioDocument(`<main><p>Preview</p></main>`);
    expect(
      shouldIgnorePlaybackShortcutEvent(mockKeyboardEvent("Space", { target: document.body })),
    ).toBe(false);
  });
});
