// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DOM_EDIT_LAYER_OBSERVER_INIT,
  type DomEditLayerWalkCache,
  createDomEditLayerWalkCache,
  drainPendingLayerMutations,
} from "./domEditLayerWalkCache";
import { collectDomEditLayerItems } from "./domEditingLayers";
import type { DomEditLayerItem } from "./domEditingTypes";

const opts = { activeCompositionPath: "index.html", isMasterView: true };

/** Attached, not detached: the occurrence index is resolved with a whole-document
 *  query, so a detached fixture would number every element as a miss. */
function mountPreview(cardCount: number): HTMLElement {
  const cards = Array.from(
    { length: cardCount },
    (_unused, i) =>
      `<div class="box"><span class="label">card ${i}</span><b class="tag">t${i}</b></div>`,
  ).join("");
  document.body.innerHTML = `<div data-composition-id="index.html">${cards}</div>`;
  return document.body.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

/** Everything a caller can observe about a walk. Compared field by field so a
 *  divergence names itself instead of failing on object identity. */
function shape(items: DomEditLayerItem[]): unknown {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    tagName: item.tagName,
    depth: item.depth,
    childCount: item.childCount,
    id: item.id,
    hfId: item.hfId,
    selector: item.selector,
    selectorIndex: item.selectorIndex,
    sourceFile: item.sourceFile,
    element: item.element,
  }));
}

/**
 * Count `getComputedStyle` calls, which is the per-element cost this cache
 * exists to avoid: `isInspectableLayerElement` makes one for the element and
 * `getDirectLayerChildren` one more for each direct child. A count that does not
 * grow with the document is the whole claim.
 */
function countingComputedStyle(): { calls: () => number; restore: () => void } {
  const real = window.getComputedStyle.bind(window);
  let calls = 0;
  window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
    calls += 1;
    return real(el, pseudo ?? undefined);
  }) as typeof window.getComputedStyle;
  return { calls: () => calls, restore: () => (window.getComputedStyle = real) };
}

interface WarmWalk {
  root: HTMLElement;
  cache: DomEditLayerWalkCache;
  observer: MutationObserver;
}

/**
 * A mounted preview whose cache has already done one full walk, with the
 * observer live. Every test here needs exactly this before it can measure what
 * a SECOND walk costs, so it lives in one place.
 */
function withWarmWalk<T>(cardCount: number, run: (ctx: WarmWalk) => T): T {
  const root = mountPreview(cardCount);
  const cache = createDomEditLayerWalkCache();
  const observer = new MutationObserver(() => {});
  observer.observe(document.documentElement, DOM_EDIT_LAYER_OBSERVER_INIT);
  try {
    collectDomEditLayerItems(root, opts, undefined, cache);
    return run({ root, cache, observer });
  } finally {
    observer.disconnect();
  }
}

describe("collectDomEditLayerItems incremental rebuild", () => {
  /**
   * The load-bearing assertion, and it is INVARIANCE, not a threshold: a
   * threshold ("under 20 style reads") passes on a small fixture and still
   * degrades linearly on a real preview. Quadrupling the card count must not
   * change what one style edit costs at all.
   *
   * Before the cache both numbers tracked the document size (every element and
   * every direct child re-derived on every mutation, whatever the mutation was).
   */
  function styleEditRebuildCost(cardCount: number): number {
    return withWarmWalk(cardCount, ({ root, cache, observer }) => {
      // What animation writes on a frame: one element's transform, nothing that
      // can change any element's selector, membership or label.
      root.querySelector<HTMLElement>(".box")!.style.transform = "translateX(4px)";
      cache.ingest(observer.takeRecords());

      const probe = countingComputedStyle();
      try {
        collectDomEditLayerItems(root, opts, undefined, cache);
        return probe.calls();
      } finally {
        probe.restore();
      }
    });
  }

  it("costs the same for one style edit at n cards and at 4n", () => {
    const small = styleEditRebuildCost(12);
    const large = styleEditRebuildCost(48);

    expect(large).toBe(small);
    // A ceiling as well, so a future change that reintroduces a per-element term
    // fails here even if it happens to be document-size-flat. The edited element,
    // its parent, and each of their direct children is the whole budget.
    expect(small).toBeLessThanOrEqual(12);
  });

  it("performs no document query at all for an edit that touches no selector", () => {
    withWarmWalk(12, ({ root, cache, observer }) => {
      root.querySelector<HTMLElement>(".tag")!.style.opacity = "0.5";
      cache.ingest(observer.takeRecords());

      const real = document.querySelectorAll.bind(document);
      let queries = 0;
      Object.defineProperty(document, "querySelectorAll", {
        configurable: true,
        value: (selector: string) => {
          queries += 1;
          return real(selector);
        },
      });
      try {
        collectDomEditLayerItems(root, opts, undefined, cache);
      } finally {
        delete (document as Partial<Document>).querySelectorAll;
      }
      // The only document query in the walk resolves a selector's occurrence
      // index, and no cached selector was invalidated.
      expect(queries).toBe(0);
    });
  });

  it("queries the document for no selector when a walk meets elements it has not seen", () => {
    const root = mountPreview(12);
    const boxes = Array.from(root.querySelectorAll<HTMLElement>(".box"));
    // The scenes a scrub has not reached yet: hidden, so no identity is read for them.
    for (const box of boxes.slice(6)) box.style.display = "none";
    const cache = createDomEditLayerWalkCache();
    const observer = new MutationObserver(() => {});
    observer.observe(document.documentElement, DOM_EDIT_LAYER_OBSERVER_INIT);
    try {
      collectDomEditLayerItems(root, opts, undefined, cache);
      for (const box of boxes.slice(6)) box.style.display = "";
      cache.ingest(observer.takeRecords());

      const real = document.querySelectorAll.bind(document);
      let queries = 0;
      Object.defineProperty(document, "querySelectorAll", {
        configurable: true,
        value: (selector: string) => {
          queries += 1;
          return real(selector);
        },
      });
      let kept: DomEditLayerItem[];
      try {
        kept = collectDomEditLayerItems(root, opts, undefined, cache);
      } finally {
        delete (document as Partial<Document>).querySelectorAll;
      }
      // The revealed cards are in the kept index for their selector.
      expect(queries).toBe(0);
      expect(shape(kept)).toEqual(shape(collectDomEditLayerItems(root, opts)));
    } finally {
      observer.disconnect();
    }
  });

  it("builds the selector index again once a node is added", () => {
    withWarmWalk(6, ({ root, cache, observer }) => {
      const added = document.createElement("div");
      added.className = "box";
      root.insertBefore(added, root.firstElementChild);
      cache.ingest(observer.takeRecords());

      const kept = collectDomEditLayerItems(root, opts, undefined, cache);
      expect(shape(kept)).toEqual(shape(collectDomEditLayerItems(root, opts)));
    });
  });

  /**
   * The equivalence half, and the one that would catch a wrong optimisation
   * rather than a missing one. Every mutation KIND the invalidation reasons
   * about is applied in turn, and after each the incremental walk must equal a
   * walk with no cache at all — which is what every other caller still gets.
   */
  it("matches an uncached walk after every kind of mutation it reasons about", () => {
    const root = mountPreview(6);
    const cache = createDomEditLayerWalkCache();
    const observer = new MutationObserver(() => {});
    observer.observe(document.documentElement, DOM_EDIT_LAYER_OBSERVER_INIT);
    // Captured up front: later cases change class and id, so re-querying `.box`
    // would hand the next case a different element than it names.
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".box"));
    const box = (i: number) => cards[i]!;

    const mutations: Array<[string, () => void]> = [
      ["a style write that cannot change membership", () => (box(0).style.opacity = "0.5")],
      // Inherited: the subtree's computed visibility moves with it.
      ["a style write that hides a subtree", () => (box(1).style.visibility = "hidden")],
      ["clearing that same subtree hide", () => (box(1).style.visibility = "")],
      // display:none removes the element from the list and shifts its
      // descendants' depth by one, without touching their own computed display.
      ["display:none on a card", () => (box(2).style.display = "none")],
      // Renumbers `.box` for every card after it, and relabels this one.
      ["a class change that renumbers a shared selector", () => (box(3).className = "crate")],
      ["an id, which outranks the class selector", () => (box(4).id = "hero")],
      ["edited text, which is a label input", () => (box(5).firstChild!.textContent = "renamed")],
      // The unattributable case: the documented full-rebuild fallback.
      ["a node inserted mid-document", () => box(0).append(document.createElement("i"))],
      ["a node removed", () => box(0).querySelector("b")!.remove()],
      ["a data attribute nothing derives from", () => box(0).setAttribute("data-x", "1")],
    ];

    try {
      collectDomEditLayerItems(root, opts, undefined, cache);
      for (const [what, mutate] of mutations) {
        mutate();
        cache.ingest(observer.takeRecords());
        expect(
          shape(collectDomEditLayerItems(root, opts, undefined, cache)),
          `incremental walk diverged after ${what}`,
        ).toEqual(shape(collectDomEditLayerItems(root, opts)));
      }
    } finally {
      observer.disconnect();
    }
  });

  /**
   * The subtree drop is the one expensive branch in the ingest path, and it runs
   * in the raw observer callback — not behind the rebuild throttle. GSAP's
   * `autoAlpha` writes `visibility: visible` into inline style ONCE on fade-in
   * and leaves it there, so a rule that fires whenever the style attribute
   * mentions visibility fires on every transform tick for the rest of the clip:
   * a whole-subtree walk per animation frame, for the exact elements a
   * composition animates most.
   */
  it("does not re-walk a subtree when a faded-in element merely animates", () => {
    const root = mountPreview(6);
    const cache = createDomEditLayerWalkCache();
    const observer = new MutationObserver(() => {});
    observer.observe(document.documentElement, DOM_EDIT_LAYER_OBSERVER_INIT);
    const card = root.querySelector<HTMLElement>(".box")!;
    try {
      collectDomEditLayerItems(root, opts, undefined, cache);
      // The fade-in itself. This one legitimately invalidates the subtree.
      card.style.visibility = "visible";
      cache.ingest(observer.takeRecords());

      let subtreeWalks = 0;
      const real = Element.prototype.querySelectorAll;
      Element.prototype.querySelectorAll = function (this: Element, selector: string) {
        if (selector === "*") subtreeWalks += 1;
        return real.call(this, selector);
      } as typeof Element.prototype.querySelectorAll;
      try {
        // Ordinary animation frames. `visibility: visible` is still sitting in
        // the attribute, but the value has not moved.
        card.style.transform = "translateX(1px)";
        cache.ingest(observer.takeRecords());
        card.style.transform = "translateX(2px)";
        cache.ingest(observer.takeRecords());
      } finally {
        Element.prototype.querySelectorAll = real;
      }

      expect(subtreeWalks).toBe(0);
    } finally {
      observer.disconnect();
    }
  });

  it("drops everything when the walk is re-scoped to a different composition", () => {
    const root = mountPreview(3);
    const cache = createDomEditLayerWalkCache();
    collectDomEditLayerItems(root, opts, undefined, cache);

    const rescoped = { ...opts, activeCompositionPath: "scenes/two.html" };
    expect(shape(collectDomEditLayerItems(root, rescoped, undefined, cache))).toEqual(
      shape(collectDomEditLayerItems(root, rescoped)),
    );
  });
});

describe("drainPendingLayerMutations", () => {
  it("applies records the observer has not delivered yet", () => {
    withWarmWalk(6, ({ root, cache, observer }) => {
      const card = root.querySelector<HTMLElement>(".box")!;
      // Not delivered: the callback runs in a microtask, and this test never
      // yields to one.
      card.id = "renamed";

      drainPendingLayerMutations(observer, cache);

      // An identity attribute drops the whole cache, so the walk after the drain
      // must agree with an uncached walk.
      expect(shape(collectDomEditLayerItems(root, opts, undefined, cache))).toEqual(
        shape(collectDomEditLayerItems(root, opts)),
      );
      // And the records really were consumed by the drain, not still queued.
      expect(observer.takeRecords()).toHaveLength(0);
    });
  });

  it("is a no-op when no observer is attached yet", () => {
    withWarmWalk(6, ({ root, cache }) => {
      expect(() => drainPendingLayerMutations(null, cache)).not.toThrow();
      expect(collectDomEditLayerItems(root, opts, undefined, cache)).toHaveLength(
        collectDomEditLayerItems(root, opts).length,
      );
    });
  });
});
