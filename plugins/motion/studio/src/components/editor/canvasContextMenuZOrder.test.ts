// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  isElementVisibleForZOrder,
  isZOrderActionEnabled,
  parseZIndex,
  resolveCrossedNeighbor,
  resolveZOrderChange,
  resolveZOrderReposition,
  type ZOrderAction,
  type ZOrderPatch,
} from "./canvasContextMenuZOrder";

// ── helpers ───────────────────────────────────────────────────────────────────
//
// In jsdom getBoundingClientRect returns all zeros, so the target rect is 0×0
// and getOverlappingFamily returns the whole family — i.e. every sibling is
// treated as overlapping. That makes forward/backward and front/back exercise
// the same scoped set here, which is exactly what we want for order logic.

function makeEl(id: string, zIndex?: string): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  if (zIndex !== undefined) el.style.zIndex = zIndex;
  return el;
}

/**
 * Build a parent and append `[target, ...siblings]` in DOM order. Each spec is
 * [id, z]. The target's z is `targetZ`; it is appended FIRST unless
 * `targetLast` is set, in which case it is appended LAST (later in DOM).
 */
function makeFamily(
  targetZ: string,
  siblingSpecs: Array<[string, string]>,
  opts: { targetLast?: boolean } = {},
): { target: HTMLElement; parent: HTMLElement; byId: Record<string, HTMLElement> } {
  const parent = document.createElement("div");
  const target = makeEl("target", targetZ);
  const siblings = siblingSpecs.map(([id, z]) => makeEl(id, z));
  const byId: Record<string, HTMLElement> = { target };
  for (const s of siblings) byId[s.id] = s;
  if (opts.targetLast) {
    for (const s of siblings) parent.appendChild(s);
    parent.appendChild(target);
  } else {
    parent.appendChild(target);
    for (const s of siblings) parent.appendChild(s);
  }
  return { target, parent, byId };
}

/** Resolve a z-order change and assert it produced patches (fails otherwise). */
function resolveZOrderPatches(
  target: HTMLElement,
  action: ZOrderAction,
  options?: { isVisible?: (el: HTMLElement) => boolean },
): ZOrderPatch[] {
  const patches = resolveZOrderChange(target, action, options);
  expect(patches).not.toBeNull();
  if (!patches) throw new Error("expected z-order patches");
  return patches;
}

/** Look up a patch for a given element id in a patch list. */
function patchFor(patches: ZOrderPatch[], byId: Record<string, HTMLElement>, id: string) {
  return patches.find((p) => p.element === byId[id]);
}

/** Apply patches, then return the render-ordered ids (bottom→top). */
function renderOrderIds(
  parent: HTMLElement,
  byId: Record<string, HTMLElement>,
  patches: ZOrderPatch[],
): string[] {
  for (const p of patches) p.element.style.zIndex = String(p.zIndex);
  const children = Array.from(parent.children) as HTMLElement[];
  const withPos = children.map((el, domIndex) => ({
    id: Object.keys(byId).find((k) => byId[k] === el) ?? el.id,
    z: parseZIndex(el.style.zIndex || "0"),
    domIndex,
  }));
  withPos.sort((a, b) => a.z - b.z || a.domIndex - b.domIndex);
  return withPos.map((e) => e.id);
}

// ── parseZIndex ───────────────────────────────────────────────────────────────

describe("parseZIndex", () => {
  it("parses integers", () => {
    expect(parseZIndex("5")).toBe(5);
    expect(parseZIndex("0")).toBe(0);
    expect(parseZIndex("-3")).toBe(-3);
  });

  it("treats 'auto' / null / undefined / empty as 0", () => {
    expect(parseZIndex("auto")).toBe(0);
    expect(parseZIndex(null)).toBe(0);
    expect(parseZIndex(undefined)).toBe(0);
    expect(parseZIndex("")).toBe(0);
  });
});

// ── distinct-z fast path (single-element patch) ────────────────────────────────

describe("resolveZOrderChange – distinct z values (fast path)", () => {
  it("bring-to-front moves target above all with a single patch", () => {
    const { target, byId } = makeFamily("2", [
      ["a", "1"],
      ["b", "5"],
      ["c", "3"],
    ]);
    const patches = resolveZOrderPatches(target, "bring-to-front");
    expect(patches).toHaveLength(1);
    expect(patchFor(patches, byId, "target")?.zIndex).toBe(6);
  });

  it("bring-to-front returns null when already on top", () => {
    const { target } = makeFamily("6", [
      ["a", "1"],
      ["b", "5"],
      ["c", "3"],
    ]);
    expect(resolveZOrderChange(target, "bring-to-front")).toBeNull();
  });

  it("send-to-back moves target below all", () => {
    const { target, byId, parent } = makeFamily("3", [
      ["a", "1"],
      ["b", "5"],
      ["c", "2"],
    ]);
    const patches = resolveZOrderPatches(target, "send-to-back");
    // target must end up strictly below the current min (1) in render order.
    expect(renderOrderIds(parent, byId, patches)[0]).toBe("target");
  });

  it("send-to-back returns null when already at back", () => {
    const { target } = makeFamily("0", [
      ["a", "1"],
      ["b", "5"],
      ["c", "3"],
    ]);
    expect(resolveZOrderChange(target, "send-to-back")).toBeNull();
  });

  it("bring-forward steps up exactly one in render order", () => {
    const { target, byId, parent } = makeFamily("2", [
      ["a", "1"],
      ["b", "4"],
      ["c", "7"],
    ]);
    // render order bottom→top: a(1), target(2), b(4), c(7). forward → above b.
    const patches = resolveZOrderPatches(target, "bring-forward");
    expect(renderOrderIds(parent, byId, patches)).toEqual(["a", "b", "target", "c"]);
  });

  it("send-backward steps down exactly one in render order", () => {
    const { target, byId, parent } = makeFamily("5", [
      ["a", "1"],
      ["b", "3"],
      ["c", "8"],
    ]);
    // bottom→top: a(1), b(3), target(5), c(8). backward → below b.
    const patches = resolveZOrderPatches(target, "send-backward");
    expect(renderOrderIds(parent, byId, patches)).toEqual(["a", "target", "b", "c"]);
  });

  it("bring-forward returns null when already top of set", () => {
    const { target } = makeFamily("8", [
      ["a", "1"],
      ["b", "4"],
      ["c", "7"],
    ]);
    expect(resolveZOrderChange(target, "bring-forward")).toBeNull();
  });

  it("send-backward returns null when already bottom of set", () => {
    const { target } = makeFamily("0", [
      ["a", "1"],
      ["b", "3"],
      ["c", "8"],
    ]);
    expect(resolveZOrderChange(target, "send-backward")).toBeNull();
  });

  it("returns null when no siblings", () => {
    const target = makeEl("solo", "2");
    document.createElement("div").appendChild(target);
    for (const action of [
      "bring-forward",
      "send-backward",
      "bring-to-front",
      "send-to-back",
    ] as ZOrderAction[]) {
      expect(resolveZOrderChange(target, action)).toBeNull();
    }
  });
});

// ── DOM-order ties (the repro) ─────────────────────────────────────────────────

describe("resolveZOrderChange – DOM-order ties (repro: equal z)", () => {
  it("send-backward: tied target LATER in DOM (visually on top) can go below", () => {
    // img#a (z=0, earlier in DOM) then video#target (z=0, later) → video paints
    // on top. send-backward must put target below the image.
    const { target, byId, parent } = makeFamily("0", [["a", "0"]], { targetLast: true });
    const patches = resolveZOrderPatches(target, "send-backward");
    expect(renderOrderIds(parent, byId, patches)).toEqual(["target", "a"]);
    // target ends strictly below the image.
    const tz = patchFor(patches, byId, "target")?.zIndex ?? 0;
    expect(tz).toBeGreaterThanOrEqual(0);
  });

  it("send-to-back: tied target LATER in DOM goes to the very back", () => {
    const { target, byId, parent } = makeFamily("0", [["a", "0"]], { targetLast: true });
    const patches = resolveZOrderPatches(target, "send-to-back");
    expect(renderOrderIds(parent, byId, patches)[0]).toBe("target");
  });

  it("bring-forward: tied target EARLIER in DOM (visually below) can go above", () => {
    // target#target (z=0, earlier) then #a (z=0, later) → a paints on top.
    // bring-forward on target must lift it above a.
    const { target, byId, parent } = makeFamily("0", [["a", "0"]]);
    const patches = resolveZOrderPatches(target, "bring-forward");
    expect(renderOrderIds(parent, byId, patches)).toEqual(["a", "target"]);
  });

  it("bring-to-front: tied target EARLIER in DOM goes to the very front", () => {
    const { target, byId, parent } = makeFamily("0", [["a", "0"]]);
    const patches = resolveZOrderPatches(target, "bring-to-front");
    const order = renderOrderIds(parent, byId, patches);
    expect(order[order.length - 1]).toBe("target");
  });

  it("send-backward: tied target EARLIER in DOM is already at back → null", () => {
    // target earlier + a later, both z=0. target already paints below a.
    const { target } = makeFamily("0", [["a", "0"]]);
    expect(resolveZOrderChange(target, "send-backward")).toBeNull();
    expect(resolveZOrderChange(target, "send-to-back")).toBeNull();
  });

  it("bring-forward: tied target LATER in DOM is already on top → null", () => {
    const { target } = makeFamily("0", [["a", "0"]], { targetLast: true });
    expect(resolveZOrderChange(target, "bring-forward")).toBeNull();
    expect(resolveZOrderChange(target, "bring-to-front")).toBeNull();
  });

  it("renumber emits a real patch per changed element and none for the unchanged (minimal, no no-ops)", () => {
    // Three tied at z=0, target in the middle of DOM order. Sending it back must
    // renumber to distinct values but leave the target (which keeps its bottom
    // slot's value 0) unpatched — and every emitted patch must be a genuine change.
    const parent = document.createElement("div");
    const a = makeEl("a", "0");
    const target = makeEl("target", "0");
    const b = makeEl("b", "0");
    parent.append(a, target, b);
    const originalZ = new Map<HTMLElement, number>([
      [a, 0],
      [target, 0],
      [b, 0],
    ]);
    // render order bottom→top by (z, dom): a, target, b. send-backward → below a.
    const patches = resolveZOrderPatches(target, "send-backward");
    // Every emitted patch is a REAL change: its new z differs from the old z.
    for (const p of patches) expect(p.zIndex).not.toBe(originalZ.get(p.element));
    // target renumbers to 0 (its existing value) → it must NOT be in the patch set.
    expect(patchFor(patches, { a, target, b }, "target")).toBeUndefined();
    // No two patches collide on the same element (a well-formed minimal set).
    expect(new Set(patches.map((p) => p.element)).size).toBe(patches.length);
    for (const p of patches) p.element.style.zIndex = String(p.zIndex);
    expect(renderOrderIds(parent, { a, target, b }, [])).toEqual(["target", "a", "b"]);
  });
});

// ── overlap scoping (real getBoundingClientRect) ────────────────────────────────
//
// jsdom's getBoundingClientRect is 0×0, so getOverlappingFamily keeps the whole
// family and the SCOPED (overlapping-only) path is never exercised above. These
// mock rects so a sibling can be genuinely NON-overlapping and thus non-scoped.

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
function setRect(el: HTMLElement, r: Rect): void {
  el.getBoundingClientRect = (): DOMRect =>
    ({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.right - r.left,
      height: r.bottom - r.top,
      x: r.left,
      y: r.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("resolveZOrderChange – overlap scoping preserves untouched non-scoped pairs (#2202)", () => {
  it("send-backward renumber keeps a scoped sibling above an untouched NON-overlapping one", () => {
    // A (z5, overlaps target) and target (z5) are tied and overlap; C (z3) does NOT
    // overlap target, so it is non-scoped. Old renumber sent the scoped set to
    // 0..n-1 (A→1), dropping A BELOW C (z3) — an untouched (A, C) pair inverting.
    // The band-preserving renumber keeps the scoped block above C: A→6, C untouched.
    const parent = document.createElement("div");
    const a = makeEl("a", "5");
    const target = makeEl("target", "5");
    const c = makeEl("c", "3");
    parent.append(a, target, c);
    setRect(a, { left: 0, top: 0, right: 10, bottom: 10 });
    setRect(target, { left: 0, top: 0, right: 10, bottom: 10 });
    setRect(c, { left: 100, top: 100, right: 110, bottom: 110 }); // disjoint → non-scoped
    const byId = { a, target, c };

    const patches = resolveZOrderPatches(target, "send-backward");
    // C (untouched, non-scoped) is never patched.
    expect(patchFor(patches, byId, "c")).toBeUndefined();
    for (const p of patches) p.element.style.zIndex = String(p.zIndex);
    const order = renderOrderIds(parent, byId, []);
    // Deliberate move: target below a. Preserved untouched pair: a stays above c.
    expect(order.indexOf("target")).toBeLessThan(order.indexOf("a"));
    expect(order.indexOf("a")).toBeGreaterThan(order.indexOf("c"));
  });

  it("scopes forward/backward to the overlapping set (a non-overlapping sibling is ignored)", () => {
    // target (z1) overlaps a (z2) only; far (z5) does not overlap target. bring-
    // forward must step target above a (its sole overlapping neighbour), NOT chase
    // the non-overlapping far — proving the scoping actually runs with real rects.
    const parent = document.createElement("div");
    const target = makeEl("target", "1");
    const a = makeEl("a", "2");
    const far = makeEl("far", "5");
    parent.append(target, a, far);
    setRect(target, { left: 0, top: 0, right: 10, bottom: 10 });
    setRect(a, { left: 5, top: 5, right: 15, bottom: 15 }); // overlaps target
    setRect(far, { left: 200, top: 200, right: 210, bottom: 210 }); // disjoint
    const byId = { target, a, far };

    const patches = resolveZOrderPatches(target, "bring-forward");
    // far is untouched (not in the overlapping scope).
    expect(patchFor(patches, byId, "far")).toBeUndefined();
    for (const p of patches) p.element.style.zIndex = String(p.zIndex);
    const order = renderOrderIds(parent, byId, []);
    // target rose just above its overlapping neighbour a, staying below far.
    expect(order.indexOf("target")).toBeGreaterThan(order.indexOf("a"));
    expect(order.indexOf("target")).toBeLessThan(order.indexOf("far"));
  });
});

// ── non-painting sibling hygiene ───────────────────────────────────────────────

describe("resolveZOrderChange – excludes non-painting siblings", () => {
  it("ignores <audio>/<script>/<style> siblings in the family", () => {
    // Parent holds: img#a (z0), <audio> (a prior renumber wrote z=2 onto it),
    // video#target (z0, later in DOM), plus a <script> and <style>. Only the two
    // painting elements should form the family — the audio's z=2 must NOT pad the
    // renumber or count as a sibling above the target.
    const parent = document.createElement("div");
    const a = makeEl("a", "0");
    const audio = document.createElement("audio");
    audio.style.zIndex = "2";
    const script = document.createElement("script");
    const style = document.createElement("style");
    const target = makeEl("target", "0");
    parent.append(a, audio, script, style, target);

    // target is later in DOM than a, tied at z=0 → paints on top. send-to-back
    // must put it below a. If audio (z=2) were counted, the renumber would differ.
    const patches = resolveZOrderPatches(target, "send-to-back");
    // No patch may target the audio/script/style elements.
    for (const p of patches) {
      expect(p.element).not.toBe(audio);
      expect(p.element).not.toBe(script);
      expect(p.element).not.toBe(style);
    }
    // Order among the painting pair: target below a.
    const order = renderOrderIds(parent, { a, target }, patches);
    expect(order.indexOf("target")).toBeLessThan(order.indexOf("a"));
  });

  it("ignores <template>/<noscript> siblings in the family", () => {
    // A renumber fallback once wrote z-index/position into <template> source
    // markup because templates entered the sibling family. They never paint —
    // exclude them like audio/script/style.
    const parent = document.createElement("div");
    const a = makeEl("a", "0");
    const template = document.createElement("template");
    template.style.zIndex = "2";
    const noscript = document.createElement("noscript");
    const target = makeEl("target", "0");
    parent.append(a, template, noscript, target);

    const patches = resolveZOrderPatches(target, "send-to-back");
    for (const p of patches) {
      expect(p.element).not.toBe(template);
      expect(p.element).not.toBe(noscript);
    }
    const order = renderOrderIds(parent, { a, target }, patches);
    expect(order.indexOf("target")).toBeLessThan(order.indexOf("a"));
  });

  it("a lone painting element beside only non-painting siblings has no family → null", () => {
    const parent = document.createElement("div");
    const target = makeEl("target", "1");
    const audio = document.createElement("audio");
    parent.append(target, audio);
    // Only sibling is <audio> (excluded) → family size 1 → every action is a no-op.
    for (const action of [
      "bring-forward",
      "send-backward",
      "bring-to-front",
      "send-to-back",
    ] as ZOrderAction[]) {
      expect(resolveZOrderChange(target, action)).toBeNull();
    }
  });
});

// ── visibility scoping (forward/backward step over VISIBLE siblings only) ──────
//
// The visibility probe is injectable (ZOrderResolveOptions.isVisible) exactly
// like rect reading is stubbable — these tests drive the scoping logic with a
// stub, without a real style engine.

describe("resolveZOrderChange – visibility scoping (injectable stub)", () => {
  /** Probe that hides exactly the given elements. */
  function hiding(...hidden: HTMLElement[]) {
    return { isVisible: (el: HTMLElement) => !hidden.includes(el) };
  }

  it("bring-forward steps over the next VISIBLE sibling, ignoring an invisible z-neighbor", () => {
    // Render order: target(1), hidden(2), vis(3). The nearest z-neighbor above
    // is invisible at the current frame — forward must land the target above
    // `vis` (the next VISIBLE overlapping sibling), leaving `hidden` untouched.
    const { target, byId } = makeFamily("1", [
      ["hidden", "2"],
      ["vis", "3"],
    ]);
    const patches = resolveZOrderPatches(target, "bring-forward", hiding(byId.hidden!));
    expect(patches).toHaveLength(1);
    expect(patchFor(patches, byId, "target")?.zIndex).toBe(4);
    expect(patchFor(patches, byId, "hidden")).toBeUndefined();
  });

  it("send-backward steps below the next VISIBLE sibling, ignoring an invisible z-neighbor", () => {
    // Render order: vis(1), hidden(2), target(3). Backward must drop the target
    // below `vis`, not merely below the invisible `hidden`.
    const { target, byId } = makeFamily("3", [
      ["vis", "1"],
      ["hidden", "2"],
    ]);
    const patches = resolveZOrderPatches(target, "send-backward", hiding(byId.hidden!));
    expect(patches).toHaveLength(1);
    expect(patchFor(patches, byId, "target")?.zIndex).toBe(0);
    expect(patchFor(patches, byId, "hidden")).toBeUndefined();
  });

  it("forward/backward are no-ops when every overlapping sibling is invisible", () => {
    const { target, byId } = makeFamily("1", [["hidden", "2"]]);
    const opts = hiding(byId.hidden!);
    expect(resolveZOrderChange(target, "bring-forward", opts)).toBeNull();
    expect(resolveZOrderChange(target, "send-backward", opts)).toBeNull();
  });

  it("bring-to-front / send-to-back keep the FULL painting family (invisible siblings included)", () => {
    // Unchanged semantics: front/back operate across all siblings, so an
    // invisible sibling still counts and the actions stay meaningful.
    const { target, byId } = makeFamily("1", [["hidden", "2"]]);
    const opts = hiding(byId.hidden!);
    const patches = resolveZOrderPatches(target, "bring-to-front", opts);
    expect(patchFor(patches, byId, "target")?.zIndex).toBe(3);
    expect(resolveZOrderChange(target, "send-to-back", opts)).toBeNull(); // already bottom
  });

  it("the target itself is retained even when the probe reports it invisible", () => {
    const { target, byId } = makeFamily("1", [["vis", "2"]]);
    const patches = resolveZOrderPatches(target, "bring-forward", hiding(target));
    expect(patchFor(patches, byId, "target")?.zIndex).toBe(3);
  });

  it("isZOrderActionEnabled matches the resolver under the same visibility scope", () => {
    const { target, byId } = makeFamily("1", [["hidden", "2"]]);
    const opts = hiding(byId.hidden!);
    // Forward/backward: scoped set collapses to the target alone → disabled.
    expect(isZOrderActionEnabled(target, "bring-forward", opts)).toBe(false);
    expect(isZOrderActionEnabled(target, "send-backward", opts)).toBe(false);
    // Front/back: full family → enabled exactly where the resolver acts.
    expect(isZOrderActionEnabled(target, "bring-to-front", opts)).toBe(true);
    expect(isZOrderActionEnabled(target, "send-to-back", opts)).toBe(false);
  });
});

// ── default visibility probe (element-level computed style) ───────────────────

describe("isElementVisibleForZOrder – default probe", () => {
  function attachedEl(style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
    const el = document.createElement("div");
    Object.assign(el.style, style);
    document.body.appendChild(el);
    return el;
  }

  it("treats display:none / visibility:hidden / opacity≈0 as invisible", () => {
    expect(isElementVisibleForZOrder(attachedEl({ display: "none" }))).toBe(false);
    expect(isElementVisibleForZOrder(attachedEl({ visibility: "hidden" }))).toBe(false);
    expect(isElementVisibleForZOrder(attachedEl({ opacity: "0" }))).toBe(false);
    expect(isElementVisibleForZOrder(attachedEl({ opacity: "0.005" }))).toBe(false);
  });

  it("treats normal, translucent, and unstyled elements as visible", () => {
    expect(isElementVisibleForZOrder(attachedEl())).toBe(true);
    expect(isElementVisibleForZOrder(attachedEl({ opacity: "0.5" }))).toBe(true);
    expect(isElementVisibleForZOrder(attachedEl({ visibility: "visible" }))).toBe(true);
  });

  it("exempts a hidden color-grading source (its canvas paints in its place)", () => {
    const el = attachedEl({ opacity: "0" });
    el.setAttribute("data-hf-color-grading-source-hidden", "");
    expect(isElementVisibleForZOrder(el)).toBe(true);
  });

  it("is the default probe: the runtime's inline visibility:hidden on a time-inactive clip is skipped", () => {
    // End-to-end through resolveZOrderChange with NO injected probe: the
    // runtime hides inactive clips with inline `visibility:hidden` (see core
    // runtime syncTimedElementVisibility) — computed style picks that up.
    const parent = document.createElement("div");
    const target = makeEl("target", "1");
    const hidden = makeEl("hidden", "2");
    hidden.style.visibility = "hidden";
    const vis = makeEl("vis", "3");
    parent.append(target, hidden, vis);
    document.body.appendChild(parent);
    const patches = resolveZOrderPatches(target, "bring-forward");
    expect(patchFor(patches, { target, hidden, vis }, "target")?.zIndex).toBe(4);
    expect(patchFor(patches, { target, hidden, vis }, "hidden")).toBeUndefined();
  });
});

// ── resolveCrossedNeighbor (the "show your work" flash target) ────────────────

describe("resolveCrossedNeighbor", () => {
  it("returns the visible sibling directly above for bring-forward", () => {
    const { target, byId } = makeFamily("1", [
      ["hidden", "2"],
      ["vis", "3"],
    ]);
    const opts = { isVisible: (el: HTMLElement) => el !== byId.hidden };
    expect(resolveCrossedNeighbor(target, "bring-forward", opts)).toBe(byId.vis);
  });

  it("returns the visible sibling directly below for send-backward", () => {
    const { target, byId } = makeFamily("3", [
      ["vis", "1"],
      ["hidden", "2"],
    ]);
    const opts = { isVisible: (el: HTMLElement) => el !== byId.hidden };
    expect(resolveCrossedNeighbor(target, "send-backward", opts)).toBe(byId.vis);
  });

  it("returns null for front/back actions and for no-op steps", () => {
    const { target } = makeFamily("1", [["a", "2"]]);
    expect(resolveCrossedNeighbor(target, "bring-to-front")).toBeNull();
    expect(resolveCrossedNeighbor(target, "send-to-back")).toBeNull();
    expect(resolveCrossedNeighbor(target, "send-backward")).toBeNull(); // already bottom
    const { target: top } = makeFamily("5", [["a", "2"]]);
    expect(resolveCrossedNeighbor(top, "bring-forward")).toBeNull(); // already top
  });

  it("returns null when there are no siblings", () => {
    const solo = makeEl("solo", "1");
    document.createElement("div").appendChild(solo);
    expect(resolveCrossedNeighbor(solo, "bring-forward")).toBeNull();
  });
});

// ── isZOrderActionEnabled ─────────────────────────────────────────────────────

describe("isZOrderActionEnabled", () => {
  it("mirrors resolveZOrderChange non-null", () => {
    // target z=2 (DOM 0), a z=5 (DOM 1): render order = target, a. target is at
    // the bottom, so forward/front are enabled and backward/back are no-ops.
    const { target } = makeFamily("2", [["a", "5"]]);
    expect(isZOrderActionEnabled(target, "bring-to-front")).toBe(true);
    expect(isZOrderActionEnabled(target, "bring-forward")).toBe(true);
    expect(isZOrderActionEnabled(target, "send-to-back")).toBe(false);
    expect(isZOrderActionEnabled(target, "send-backward")).toBe(false);
  });

  it("false when already on top", () => {
    const { target } = makeFamily("6", [
      ["a", "1"],
      ["b", "5"],
    ]);
    expect(isZOrderActionEnabled(target, "bring-to-front")).toBe(false);
    expect(isZOrderActionEnabled(target, "bring-forward")).toBe(false);
  });

  it("tie repro: send-backward enabled for a visually-on-top tied target", () => {
    const { target } = makeFamily("0", [["a", "0"]], { targetLast: true });
    expect(isZOrderActionEnabled(target, "send-backward")).toBe(true);
    expect(isZOrderActionEnabled(target, "send-to-back")).toBe(true);
  });

  it("all actions disabled when there are no siblings", () => {
    const target = makeEl("solo", "1");
    document.createElement("div").appendChild(target);
    for (const action of [
      "bring-forward",
      "send-backward",
      "bring-to-front",
      "send-to-back",
    ] as ZOrderAction[]) {
      expect(isZOrderActionEnabled(target, action)).toBe(false);
    }
  });
});

describe("resolveZOrderReposition (Layers-panel arbitrary drop)", () => {
  it("multi-position jump with distinct z resolves to ONE between-z write", () => {
    // Render order bottom→top today: target(1), a(3), b(5). Drop target between
    // a and b → single write: z strictly between 3 and 5.
    const { target, byId } = makeFamily("1", [
      ["a", "3"],
      ["b", "5"],
    ]);
    const patches = resolveZOrderReposition(target, [byId.a, target, byId.b]);
    expect(patches).toEqual([{ element: target, zIndex: 4 }]);
  });

  it("jump to the very top writes one z above the previous top", () => {
    const { target, byId } = makeFamily("1", [
      ["a", "3"],
      ["b", "5"],
    ]);
    const patches = resolveZOrderReposition(target, [byId.a, byId.b, target]);
    expect(patches).toEqual([{ element: target, zIndex: 6 }]);
  });

  it("no-op drop (unchanged order) returns null", () => {
    const { target, byId } = makeFamily("1", [
      ["a", "3"],
      ["b", "5"],
    ]);
    expect(resolveZOrderReposition(target, [target, byId.a, byId.b])).toBeNull();
  });

  it("tied z values renumber the scoped set minimally (band-safe)", () => {
    const { target, byId } = makeFamily("2", [
      ["a", "2"],
      ["b", "2"],
    ]);
    // All tied at 2; DOM order target,a,b → render bottom→top target,a,b.
    // Move target to the top: scoped renumber within the band.
    const patches = resolveZOrderReposition(target, [byId.a, byId.b, target]);
    expect(patches).not.toBeNull();
    const z = new Map(patches!.map((p) => [(p.element as HTMLElement).id, p.zIndex]));
    const zOf = (id: string) => z.get(id) ?? 2;
    expect(zOf("a")).toBeLessThan(zOf("b"));
    expect(zOf("b")).toBeLessThan(zOf("target"));
  });

  it("rejects elements that are not painting siblings of the target", () => {
    const { target, byId } = makeFamily("1", [["a", "3"]]);
    const stranger = makeEl("stranger", "2");
    expect(resolveZOrderReposition(target, [stranger, target, byId.a])).toBeNull();
  });

  it("returns null for sets too small to reorder", () => {
    const { target } = makeFamily("1", []);
    expect(resolveZOrderReposition(target, [target])).toBeNull();
  });
});
