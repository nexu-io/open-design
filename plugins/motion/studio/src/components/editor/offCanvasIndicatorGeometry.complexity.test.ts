// @vitest-environment happy-dom

import type React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { OffCanvasRect } from "./OffCanvasIndicators";
import { recomputeOffCanvasIndicators } from "./offCanvasIndicatorGeometry";
import { DOM_EDIT_LAYER_OBSERVER_INIT, createDomEditLayerWalkCache } from "./domEditLayerWalkCache";

const realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
afterEach(() => {
  Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
});

/** The composition frame every fixture here is measured against. */
const COMP = { left: 0, top: 0, width: 800, height: 450 };

interface Preview {
  doc: Document;
  /** One real rebuild through the production entry point. Returns the markers
   *  it produced. `observe` opts the walk cache and its observer in, which is
   *  how `startOffCanvasIndicatorRefresh` calls it. */
  rebuild: () => OffCanvasRect[];
  dispose: () => void;
}

/**
 * A mounted preview wired to `recomputeOffCanvasIndicators` exactly as the
 * refresh loop wires it.
 *
 * `rectFor` stands in for layout, which happy-dom does not do: return the box
 * an element should report, or null for "measures empty". Every test here
 * varies only the markup and that function, so the scaffolding lives once.
 */
function mountPreview(
  bodyHtml: string,
  rectFor: (el: Element) => DOMRect | null,
  options: { observe?: boolean } = {},
): Preview {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe content document");
  doc.body.innerHTML = `<div data-composition-id="root" data-width="800" data-height="450">${bodyHtml}</div>`;

  const overlay = document.createElement("div");
  document.body.append(overlay);
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    if (this === iframe || this === overlay) return new DOMRect(0, 0, 800, 450);
    return rectFor(this) ?? new DOMRect(0, 0, 0, 0);
  };

  const cache = options.observe ? createDomEditLayerWalkCache() : undefined;
  const observer = options.observe ? new MutationObserver(() => {}) : null;
  observer?.observe(doc.documentElement, DOM_EDIT_LAYER_OBSERVER_INIT);

  const sigRef = { current: "" } as React.MutableRefObject<string>;
  const elementsRef = { current: new Map<string, HTMLElement>() } as React.MutableRefObject<
    Map<string, HTMLElement>
  >;
  let rects: OffCanvasRect[] = [];
  return {
    doc,
    rebuild: () => {
      if (cache && observer) cache.ingest(observer.takeRecords());
      recomputeOffCanvasIndicators(
        iframe,
        overlay,
        doc,
        COMP,
        "index.html",
        sigRef,
        elementsRef,
        (next) => {
          rects = next;
        },
        cache,
      );
      return rects;
    },
    dispose: () => {
      observer?.disconnect();
      iframe.remove();
      overlay.remove();
    },
  };
}

/** `cardCount` cards sharing `.box`, all off-canvas to the left. */
function cardsMarkup(cardCount: number): string {
  return Array.from(
    { length: cardCount },
    (_unused, i) => `<div class="box"><span class="label">card ${i}</span></div>`,
  ).join("");
}

/** Counts computed-style reads on a preview document while `run` executes. */
function countStyleReads(doc: Document, run: () => void): number {
  const win = doc.defaultView!;
  const real = win.getComputedStyle.bind(win);
  let reads = 0;
  win.getComputedStyle = ((el: Element, pseudo?: string | null) => (
    (reads += 1), real(el, pseudo ?? undefined)
  )) as typeof win.getComputedStyle;
  try {
    run();
  } finally {
    win.getComputedStyle = real;
  }
  return reads;
}

interface Rebuild {
  /** querySelectorAll calls on the preview document, per selector. */
  queriesBySelector: Map<string, number>;
  /** querySelector (singular) calls on the preview document, per selector. This
   *  is where the composition-root lookup that resolves the iframe→overlay
   *  basis shows up. */
  singleQueriesBySelector: Map<string, number>;
  /** The indicator keys, which carry each element's selector occurrence index. */
  keys: string[];
}

/**
 * One real rebuild over a preview whose `cardCount` cards all share `.box`,
 * counting the preview document's queries. Everything below the entry point is
 * production code: the layer walk, the patch targets, and the selector
 * occurrence indices that end up in each indicator's key.
 */
function rebuildWithSharedSelector(cardCount: number): Rebuild {
  // Cards sit left of the composition, so every one of them is off-canvas and
  // reaches the indicator list; everything else measures empty and does not.
  const preview = mountPreview(cardsMarkup(cardCount), (el) =>
    el.classList.contains("box") ? new DOMRect(-500, 40, 100, 40) : null,
  );
  const { doc } = preview;

  const queriesBySelector = new Map<string, number>();
  const realQuerySelectorAll = doc.querySelectorAll.bind(doc);
  Object.defineProperty(doc, "querySelectorAll", {
    configurable: true,
    value: (selector: string) => {
      queriesBySelector.set(selector, (queriesBySelector.get(selector) ?? 0) + 1);
      return realQuerySelectorAll(selector);
    },
  });

  const singleQueriesBySelector = new Map<string, number>();
  const realQuerySelector = doc.querySelector.bind(doc);
  Object.defineProperty(doc, "querySelector", {
    configurable: true,
    value: (selector: string) => {
      singleQueriesBySelector.set(selector, (singleQueriesBySelector.get(selector) ?? 0) + 1);
      return realQuerySelector(selector);
    },
  });

  const keys = preview.rebuild().map((rect) => rect.key);
  preview.dispose();
  return { queriesBySelector, singleQueriesBySelector, keys };
}

/** The composition-root lookups a rebuild makes. `computeOverlayRootScale` and
 *  `recomputeOffCanvasIndicators` each resolve the root once; nothing else in
 *  the pass may. */
const COMPOSITION_ROOT_SELECTOR = "[data-composition-id]";

/** The queries that resolve a class selector's occurrence index — the work this
 *  guards. Excluded: the per-element `[data-composition-id]` ancestor lookup and
 *  the stylesheet scan, which are linear per element and a separate seam. */
function classSelectorQueries(rebuild: Rebuild): Array<[string, number]> {
  return [...rebuild.queriesBySelector].filter(([selector]) => selector.startsWith(".")).sort();
}

describe("recomputeOffCanvasIndicators selector-index cost", () => {
  // The defect this guards: the occurrence index used to be resolved with its
  // own whole-document querySelectorAll PER element, so n cards sharing a class
  // cost n queries and n² source-file resolutions. A threshold would pass on a
  // small fixture while a real composition runs hundreds of cards. Invariance
  // across a 4x fixture cannot — it fails for any per-element term at all.
  it("resolves shared selectors with the same number of queries at n and at 4n", () => {
    const small = rebuildWithSharedSelector(12);
    const large = rebuildWithSharedSelector(48);

    expect(classSelectorQueries(large)).toEqual(classSelectorQueries(small));
    expect(classSelectorQueries(small)).toEqual([
      [".box", 1],
      [".label", 1],
    ]);
  });

  it("still numbers every shared-selector element in document order", () => {
    for (const cardCount of [12, 48]) {
      const { keys } = rebuildWithSharedSelector(cardCount);
      expect(keys).toEqual(
        Array.from({ length: cardCount }, (_unused, i) => `index.html:.box:${i}`),
      );
    }
  });
});

describe("recomputeOffCanvasIndicators composition-basis cost", () => {
  /**
   * The defect this guards: the iframe→overlay basis was resolved INSIDE
   * `orientedGroupAwareOverlayRect`, so every element in the preview paid its
   * own `querySelector("[data-composition-id]")` plus three layout reads to
   * rediscover a basis that is a property of the composition, not of the
   * element. On a real preview that is one lookup per element per rebuild.
   *
   * The basis is hoisted to the caller and threaded through, so the count is
   * a property of the COMPOSITION (one root, resolved twice: once for the walk
   * root, once for the basis) and cannot grow with the element count.
   */
  it("resolves the composition root the same number of times at n and at 4n", () => {
    const small = rebuildWithSharedSelector(12);
    const large = rebuildWithSharedSelector(48);

    expect(large.singleQueriesBySelector.get(COMPOSITION_ROOT_SELECTOR)).toEqual(
      small.singleQueriesBySelector.get(COMPOSITION_ROOT_SELECTOR),
    );
    // A ceiling as well as invariance, so a future caller that reintroduces a
    // per-element lookup fails here even if it happens to be element-count-flat.
    expect(small.singleQueriesBySelector.get(COMPOSITION_ROOT_SELECTOR)).toBe(2);
  });

  // Non-vacuity guard for the assertion above: it only means something if the
  // fixture actually drives the per-element geometry path.
  it("measures a rebuild that really did resolve every card's rect", () => {
    expect(rebuildWithSharedSelector(12).keys).toHaveLength(12);
  });
});

/**
 * A group's box is the union of its MEMBERS' rects, not its own. That makes it
 * the one item whose measurement depends on elements BELOW it, so any scheme
 * that reuses a wrapper's rect while a member moves shows a marker frozen in
 * the member's old place — and nothing ever writes to the wrapper, so it would
 * never repair.
 */
describe("recomputeOffCanvasIndicators group measurement", () => {
  it("re-measures a group when a member moves and nothing writes to the wrapper", () => {
    // Only the member has a box; the wrapper measures empty, which is exactly
    // the case the union exists for.
    let memberLeft = -500;
    const preview = mountPreview(
      `<div id="grp" data-hf-group="Group"><div id="member" class="member"></div></div>`,
      (el) => (el.id === "member" ? new DOMRect(memberLeft, 40, 100, 40) : null),
      { observe: true },
    );
    const groupBox = () => {
      const group = preview.rebuild().find((rect) => rect.key.includes("grp"));
      return group ? `${group.left},${group.top},${group.width},${group.height}` : "absent";
    };

    const first = groupBox();
    // What an animation frame does: one inline style write on the member.
    memberLeft = -300;
    preview.doc.getElementById("member")!.style.transform = "translateX(200px)";
    const second = groupBox();
    preview.dispose();

    expect(first).not.toBe("absent");
    expect(second).not.toBe(first);
  });
});

/**
 * Layout changes that emit no mutation record at all.
 *
 * An `<img>` finishing decode, a web font swapping in, a CSS transition or
 * `@keyframes` frame, a container query re-evaluating, a
 * `CSSStyleSheet.insertRule` — every one of them moves an element's border box
 * with nothing written to the DOM. A rebuild that measures everything picks
 * them up for free; anything that reuses a previous measurement cannot see
 * them at all, and there is no record to invalidate on and no observer that
 * reports all of them. This is why the pass is scoped to one rebuild.
 */
describe("recomputeOffCanvasIndicators layout changes with no mutation record", () => {
  it("re-measures an element whose own box changed with no DOM write", () => {
    // Before decode the image lays out small; after decode it takes its
    // intrinsic size. No attribute is written, no node added, no text changed.
    let heroRect = new DOMRect(-500, 40, 100, 40);
    const preview = mountPreview(
      `<img id="hero" class="hero">`,
      (el) => (el.id === "hero" ? heroRect : null),
      { observe: true },
    );
    const heroBox = () => {
      const marker = preview.rebuild().find((rect) => rect.key.includes("hero"));
      return marker ? `${marker.left},${marker.top},${marker.width},${marker.height}` : "absent";
    };

    const first = heroBox();
    heroRect = new DOMRect(-500, 40, 320, 180); // decode finished
    const second = heroBox();
    preview.dispose();

    expect(first).toBe("-500,40,100,40");
    expect(second).toBe("-500,40,320,180");
  });
});

/**
 * The other half of "the pass is scoped to one rebuild".
 *
 * The no-mutation-record test above varies an element's own BOX, which the pass
 * never memoizes — so it would still pass if the pass leaked across rebuilds.
 * This one varies an ANCESTOR-derived input, which is exactly what the pass
 * does hold: fade a wrapper out and every descendant's visibility answer has to
 * be recomputed, not served from the previous rebuild's memo.
 */
describe("recomputeOffCanvasIndicators ancestor-derived state across rebuilds", () => {
  it("re-answers visibility when an ancestor fades between rebuilds", () => {
    const preview = mountPreview(
      `<div id="wrap"><div class="box"></div></div>`,
      (el) => (el.classList.contains("box") ? new DOMRect(-500, 40, 100, 40) : null),
      { observe: true },
    );

    const visible = preview.rebuild().length;
    // Nothing about the box changes — only what it inherits from above it.
    preview.doc.getElementById("wrap")!.style.opacity = "0";
    const faded = preview.rebuild().length;
    preview.dispose();

    expect(visible).toBe(1);
    expect(faded).toBe(0);
  });
});

/**
 * The ancestor work, measured through the production entry point.
 *
 * Everything the rebuild asks about an ancestor — does it render, what does it
 * contribute to the composed transform, is it the source-file boundary — is the
 * same question for every element underneath it. The guard is INVARIANCE in
 * depth: burying the same cards under more shared wrappers may cost one style
 * read per added wrapper, and must not cost one per wrapper PER CARD.
 */
describe("recomputeOffCanvasIndicators ancestor cost", () => {
  /** Computed-style reads for one rebuild of `cardCount` cards buried under
   *  `depth` shared wrappers. */
  function styleReadsAtDepth(cardCount: number, depth: number): number {
    const open = Array.from({ length: depth }, (_unused, i) => `<div class="w${i}">`).join("");
    const preview = mountPreview(
      `${open}${cardsMarkup(cardCount)}${"</div>".repeat(depth)}`,
      (el) => (el.classList.contains("box") ? new DOMRect(-500, 40, 100, 40) : null),
    );
    let markers = 0;
    const reads = countStyleReads(preview.doc, () => {
      markers = preview.rebuild().length;
    });
    preview.dispose();
    // Non-vacuity, checked on every measurement rather than in its own test:
    // the count only means something if the rebuild really did resolve every
    // card's rect.
    expect(markers).toBe(cardCount);
    return reads;
  }

  /** What burying the same cards 8 wrappers deeper costs, at `cardCount`. */
  const depthSurcharge = (cardCount: number): number =>
    styleReadsAtDepth(cardCount, 10) - styleReadsAtDepth(cardCount, 2);

  // The load-bearing assertion, and it is INVARIANCE rather than a threshold: a
  // ceiling ("under 40 reads") passes on a small fixture and still degrades on
  // a real preview. Eight wrappers are shared by every card, so what they cost
  // is a property of the WRAPPERS. Asking each card about them separately makes
  // it a property of wrappers x cards, and that is the thing that has to stay
  // flat when the card count moves.
  it("pays for a deeper tree per added ancestor, not per ancestor per card", () => {
    expect(depthSurcharge(48)).toBe(depthSurcharge(24));
  });
});
