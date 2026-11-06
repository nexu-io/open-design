/**
 * Pure z-order helpers for the canvas right-click context menu.
 *
 * Layering strategy: z-index + CSS stacking context (position ≠ static).
 * All sibling z-index values are read from the live iframe DOM via
 * element.style.zIndex (inline style, set by the editor) falling back to
 * the computed value. Treat missing / "auto" as 0 for comparison purposes.
 *
 * "Overlapping siblings" = siblings whose bounding rects intersect the
 * target's bounding rect AND are actually visible at the current frame.
 * Forward/backward operate within that set; front/back operate across all
 * siblings (full painting family, visible or not — unchanged semantics).
 *
 * ── Visibility ───────────────────────────────────────────────────────────────
 * In HyperFrames compositions the nearest z-neighbor is often INVISIBLE at the
 * paused frame: the runtime hides time-inactive clips with inline
 * `visibility:hidden` / `display:none` (see core runtime
 * syncTimedElementVisibility), and GSAP timelines park elements at `opacity:0`.
 * Stepping "forward" over such a sibling looks like a silent no-op. The
 * forward/backward comparison set therefore keeps only siblings whose
 * element-level computed style is visible (display ≠ none, visibility ≠
 * hidden, opacity > 0.01) — all runtime hiding signals are inline styles, so
 * computed style covers them. Ancestor-chain checks are unnecessary here:
 * siblings share the target's ancestors. The probe is injectable
 * (ZOrderResolveOptions.isVisible) so the pure-module tests stay meaningful
 * without a real style engine, mirroring how tests stub rect reading.
 *
 * ── Tie-awareness ────────────────────────────────────────────────────────────
 * CSS paint order for elements that share a z-index is DOM document order:
 * the element that comes LATER in the DOM paints ON TOP. The old resolver
 * compared z-index alone, so a target tied with the element visually below it
 * (equal z, target later in DOM) had an empty "below" set and silently
 * no-op'd. This module computes true render order — sort by
 * (zIndex asc, DOM position asc), bottom→top — moves the target one step (or
 * to an end) in that order, then realizes the new order back into z values.
 *
 * The result is a MULTI-element patch: a single-element patch when a
 * strictly-between z value can express the new order given DOM-order
 * tie-breaking, otherwise a minimal renumber of the affected set (emitting
 * patches only for elements whose z actually changes). z is never negative
 * (project convention clamps z ≥ 0).
 */

import { COLOR_GRADING_SOURCE_HIDDEN_ATTR } from "@hyperframes/core/color-grading";
import { readLayerRevealPriorZ } from "../../player/lib/timelineElementHelpers";

export type ZOrderAction = "bring-forward" | "send-backward" | "bring-to-front" | "send-to-back";

/** A resolved change: set `element`'s z-index to `zIndex`. */
export interface ZOrderPatch {
  element: HTMLElement;
  zIndex: number;
}

/** Injectable knobs for the pure resolver (kept mockable like rect reading). */
export interface ZOrderResolveOptions {
  /**
   * Element-level visibility probe used to scope the forward/backward
   * comparison set. Defaults to `isElementVisibleForZOrder` (computed-style
   * display/visibility/opacity). Injectable so tests can run without a real
   * style engine.
   */
  isVisible?: (el: HTMLElement) => boolean;
}

/**
 * Default visibility probe: is this element itself visible at the current
 * frame? Element-level only (siblings share the target's ancestor chain).
 * Covers the runtime's inactive-clip hiding (inline `visibility:hidden` /
 * `display:none`) and animation-parked `opacity:0`, all of which surface
 * through computed style. A color-grading source (hidden at opacity:0 while
 * its canvas paints in its place) still counts as visible, matching
 * isElementVisibleThroughAncestors in domEditingDom.
 */
export function isElementVisibleForZOrder(el: HTMLElement): boolean {
  try {
    const win = el.ownerDocument?.defaultView;
    if (!win) return true;
    const computed = win.getComputedStyle(el);
    if (computed.display === "none") return false;
    if (computed.visibility === "hidden" || computed.visibility === "collapse") return false;
    const opacity = Number.parseFloat(computed.opacity);
    if (
      Number.isFinite(opacity) &&
      opacity <= 0.01 &&
      !el.hasAttribute(COLOR_GRADING_SOURCE_HIDDEN_ATTR)
    ) {
      return false;
    }
    return true;
  } catch {
    /* cross-origin / detached — assume visible (fail open, matches rect fallback) */
    return true;
  }
}

interface RenderEntry {
  element: HTMLElement;
  zIndex: number;
  /** Position within the shared parent's children (DOM document order). */
  domIndex: number;
}

/** Parse a z-index string to a number; treats "auto" / empty as 0. */
export function parseZIndex(value: string | null | undefined): number {
  if (!value || value === "auto") return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Read the effective z-index for an element (inline style preferred).
 *  Reveal-lift transparent: an active Layers-panel lift reports the TRUE z. */
export function readEffectiveZIndex(el: HTMLElement): number {
  const prior = readLayerRevealPriorZ(el);
  if (prior != null) return prior;
  const inline = el.style.zIndex;
  if (inline && inline !== "auto") return parseZIndex(inline);
  try {
    const win = el.ownerDocument?.defaultView;
    if (win) return parseZIndex(win.getComputedStyle(el).zIndex);
  } catch {
    /* cross-origin / detached */
  }
  return 0;
}

/** Any element, asked structurally: the preview's nodes are not this window's. */
function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === 1;
}

/**
 * Tags that never paint pixels and so must be excluded from z-order siblings.
 * `<audio>` is the real offender here: a prior renumber wrote a meaningless
 * z-index onto the qa-clean audio element, and counting it as a sibling skews the
 * renumber for the visible elements. `<script>/<style>/<link>/<meta>` are also
 * non-painting and could otherwise pad the family / eat a z slot.
 * `<template>/<noscript>` never paint either — letting them in meant renumber
 * fallbacks wrote z-index/position into template source markup.
 */
const NON_PAINTING_TAGS = new Set([
  "AUDIO",
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "TEMPLATE",
  "NOSCRIPT",
]);

/** A painting element: an element node whose tag actually renders pixels. */
function isPaintingElement(node: Node): node is HTMLElement {
  return isElementNode(node) && !NON_PAINTING_TAGS.has(node.tagName);
}

/**
 * Collect the target plus every PAINTING HTMLElement sibling (same parent),
 * tagged with DOM document position. Non-painting siblings (audio/script/style/
 * link/meta) are skipped so they neither pad the family nor consume a z slot in
 * the renumber path. Returns the target's own index within the result.
 */
function getFamily(target: HTMLElement): { entries: RenderEntry[]; targetIndex: number } {
  const parent = target.parentElement;
  if (!parent) return { entries: [], targetIndex: -1 };
  const entries: RenderEntry[] = [];
  let targetIndex = -1;
  let domIndex = 0;
  for (const child of Array.from(parent.children)) {
    // The target is always retained even if its own tag is non-painting.
    if (child !== target && !isPaintingElement(child)) continue;
    if (!isElementNode(child)) continue;
    if (child === target) targetIndex = entries.length;
    entries.push({ element: child, zIndex: readEffectiveZIndex(child), domIndex });
    domIndex += 1;
  }
  return { entries, targetIndex };
}

/** True if two DOM bounding rects strictly overlap (rects that merely touch do NOT intersect). */
function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Restrict a family to the target plus siblings that are VISIBLE and whose
 * bounding rect overlaps the target's rect. The target is always retained
 * (even when itself hidden at the current frame — it is the user's explicit
 * selection). If the target's rect is unavailable or empty (headless /
 * happy-dom returns 0×0), the overlap filter is skipped and all VISIBLE
 * entries are kept — matching the prior rect-fallback behavior.
 */
function getOverlappingFamily(
  target: HTMLElement,
  entries: RenderEntry[],
  isVisible: (el: HTMLElement) => boolean,
): RenderEntry[] {
  const visibleEntries = entries.filter(
    (entry) => entry.element === target || isVisible(entry.element),
  );
  let targetRect: DOMRect;
  try {
    targetRect = target.getBoundingClientRect();
  } catch {
    return visibleEntries;
  }
  if (targetRect.width === 0 && targetRect.height === 0) return visibleEntries;
  const tr = {
    left: targetRect.left,
    top: targetRect.top,
    right: targetRect.right,
    bottom: targetRect.bottom,
  };
  return visibleEntries.filter((entry) => {
    if (entry.element === target) return true;
    try {
      const r = entry.element.getBoundingClientRect();
      return rectsIntersect(tr, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    } catch {
      return false;
    }
  });
}

/** Sort a family into render order (bottom→top): z asc, then DOM position asc. */
function toRenderOrder(entries: RenderEntry[]): RenderEntry[] {
  return [...entries].sort((a, b) => a.zIndex - b.zIndex || a.domIndex - b.domIndex);
}

/**
 * A z that lands the target strictly between `below` and `above` in render order,
 * or null when no such value exists (a tie-prone gap, or no room below the floor)
 * and the caller must renumber. Equal-z ties break by DOM order, so a plain
 * equality can flip order unpredictably; require a strict gap and clamp at 0.
 */
function computeBetweenZ(
  below: RenderEntry | undefined,
  above: RenderEntry | undefined,
): number | null {
  if (below && above) {
    return above.zIndex - below.zIndex >= 2 ? below.zIndex + 1 : null;
  }
  if (below) return below.zIndex + 1; // move to top
  if (above) {
    const candidate = Math.max(0, above.zIndex - 1); // move to bottom
    return candidate >= above.zIndex ? null : candidate; // no room below → renumber
  }
  return null;
}

/**
 * Realize a desired render order (bottom→top) into z-index patches for the
 * given family, emitting patches ONLY for elements whose z actually changes.
 *
 * Fast path: if the SCOPED z values are all distinct, the render order is fully
 * determined by z alone — a single-element move can be expressed by placing the
 * target's z strictly between its new neighbours (or at an end), so at most one
 * element changes (and it never disturbs an untouched pair, since only the target
 * moves). When ties exist a between value can be impossible, so renumber — but the
 * scoped set is only a SUBSET of the family (the target's overlapping siblings),
 * so a naive 0..n-1 renumber can drop a scoped sibling below an untouched
 * non-scoped one, reordering an untouched pair (#2202). `renumberScoped` keeps the
 * scoped block inside its original z-band, bounded by the non-scoped siblings.
 */
function realizeOrder(
  currentOrder: RenderEntry[],
  desiredOrder: RenderEntry[],
  target: HTMLElement,
  family: RenderEntry[],
): ZOrderPatch[] | null {
  const targetPos = desiredOrder.findIndex((e) => e.element === target);
  if (targetPos === -1) return null;

  const targetZ = readEffectiveZIndex(target);

  // ── Fast path: distinct z values → a single between-value move suffices.
  const zValues = currentOrder.map((e) => e.zIndex);
  const hasDupes = zValues.some((v, i) => zValues.indexOf(v) !== i);
  if (!hasDupes) {
    const candidate = computeBetweenZ(desiredOrder[targetPos - 1], desiredOrder[targetPos + 1]);
    if (candidate !== null) {
      if (candidate === targetZ) return null;
      return [{ element: target, zIndex: candidate }];
    }
    // else fall through to renumber
  }

  return renumberScoped(currentOrder, desiredOrder, target, family);
}

/**
 * Renumber the SCOPED set (the reordered subset) to distinct z, keeping the whole
 * block within the band its members already occupied so no untouched scoped /
 * non-scoped pair is reordered (#2202). The block is placed near its original base
 * `lo`, but clamped to sit strictly above the highest non-scoped sibling below the
 * band and strictly below the lowest non-scoped sibling above it. Only scoped
 * members are patched; non-scoped siblings keep their authored z.
 *
 * If a non-scoped sibling sits INSIDE or tied to the band (no clean bracket), or
 * the bracket is too narrow to hold `n` distinct integers, fall back to a
 * whole-family renumber — less minimal but still preserves every relative order.
 */
function renumberScoped(
  currentOrder: RenderEntry[],
  desiredOrder: RenderEntry[],
  target: HTMLElement,
  family: RenderEntry[],
): ZOrderPatch[] | null {
  const scoped = new Set(desiredOrder.map((e) => e.element));
  const nonScoped = family.filter((e) => !scoped.has(e.element));
  const n = desiredOrder.length;
  const zs = currentOrder.map((e) => e.zIndex);
  const lo = Math.min(...zs);
  const hi = Math.max(...zs);

  const bracketed = !nonScoped.some((e) => e.zIndex >= lo && e.zIndex <= hi);
  if (bracketed) {
    const below = nonScoped.filter((e) => e.zIndex < lo).map((e) => e.zIndex);
    const above = nonScoped.filter((e) => e.zIndex > hi).map((e) => e.zIndex);
    const minStart = below.length > 0 ? Math.max(...below) + 1 : 0; // z ≥ 0 convention
    const hasUpper = above.length > 0;
    const maxStart = hasUpper ? Math.min(...above) - n : Number.POSITIVE_INFINITY;
    if (minStart <= maxStart) {
      let start = Math.max(lo, minStart);
      if (hasUpper) start = Math.min(start, maxStart);
      const patches: ZOrderPatch[] = [];
      desiredOrder.forEach((entry, i) => {
        if (entry.zIndex !== start + i) patches.push({ element: entry.element, zIndex: start + i });
      });
      return patches.length === 0 ? null : patches;
    }
  }

  // ── Fallback: renumber the whole family so relative order is still preserved.
  const desiredGlobal = buildGlobalOrder(family, desiredOrder, target);
  const patches: ZOrderPatch[] = [];
  desiredGlobal.forEach((entry, i) => {
    if (entry.zIndex !== i) patches.push({ element: entry.element, zIndex: i });
  });
  return patches.length === 0 ? null : patches;
}

/**
 * A whole-family render order (bottom→top) with the non-scoped siblings kept in
 * their current relative order and the target reinserted beside its new SCOPED
 * neighbour (just above the scoped element below it, else just below the scoped
 * element above it). Used only by the renumber fallback.
 */
function buildGlobalOrder(
  family: RenderEntry[],
  desiredOrder: RenderEntry[],
  target: HTMLElement,
): RenderEntry[] {
  const full = toRenderOrder(family);
  const targetEntry = full.find((e) => e.element === target);
  const rest = full.filter((e) => e.element !== target);
  if (!targetEntry) return rest;
  const targetPos = desiredOrder.findIndex((e) => e.element === target);
  const prev = desiredOrder[targetPos - 1];
  const next = desiredOrder[targetPos + 1];
  const prevIdx = prev ? rest.findIndex((e) => e.element === prev.element) : -1;
  const nextIdx = next ? rest.findIndex((e) => e.element === next.element) : -1;
  if (prevIdx >= 0) rest.splice(prevIdx + 1, 0, targetEntry);
  else if (nextIdx >= 0) rest.splice(nextIdx, 0, targetEntry);
  else rest.unshift(targetEntry);
  return rest;
}

/**
 * The shared scoping pipeline: full painting family for front/back, visible
 * overlapping siblings for forward/backward, sorted into render order with the
 * target's position. Null when the family/scope is too small to act on.
 */
function resolveScopedRenderOrder(
  target: HTMLElement,
  action: ZOrderAction,
  options?: ZOrderResolveOptions,
): { entries: RenderEntry[]; order: RenderEntry[]; pos: number } | null {
  const { entries } = getFamily(target);
  // Family always includes the target; fewer than 2 means no siblings at all.
  if (entries.length < 2) return null;

  const isVisible = options?.isVisible ?? isElementVisibleForZOrder;
  const scoped =
    action === "bring-to-front" || action === "send-to-back"
      ? entries
      : getOverlappingFamily(target, entries, isVisible);
  if (scoped.length < 2) return null;

  const order = toRenderOrder(scoped);
  const pos = order.findIndex((e) => e.element === target);
  if (pos === -1) return null;
  return { entries, order, pos };
}

/**
 * Resolve the z-order patches for an action.
 *
 * Returns null when the action is a no-op (target already at the relevant
 * end of its set), otherwise the minimal list of {element, zIndex} changes.
 */
export function resolveZOrderChange(
  target: HTMLElement,
  action: ZOrderAction,
  options?: ZOrderResolveOptions,
): ZOrderPatch[] | null {
  const resolved = resolveScopedRenderOrder(target, action, options);
  if (!resolved) return null;
  const { entries, order, pos } = resolved;

  const desired = [...order];
  const [moved] = desired.splice(pos, 1);
  switch (action) {
    case "bring-forward":
      if (pos >= order.length - 1) return null; // already top of set
      desired.splice(pos + 1, 0, moved);
      break;
    case "send-backward":
      if (pos <= 0) return null; // already bottom of set
      desired.splice(pos - 1, 0, moved);
      break;
    case "bring-to-front":
      if (pos >= order.length - 1) return null;
      desired.push(moved);
      break;
    case "send-to-back":
      if (pos <= 0) return null;
      desired.unshift(moved);
      break;
  }

  return realizeOrder(order, desired, target, entries);
}

/**
 * Realize an ARBITRARY repositioning of `target` within a scoped sibling set —
 * the Layers-panel drag, which can jump several siblings in one drop, unlike
 * the menu's four fixed actions. `desiredOrderBottomToTop` is the scoped set
 * (target included at its new slot) in the intended render order. Reuses the
 * menu's minimal-write realization (realizeOrder): one between-z write when a
 * strict gap exists, band-safe scoped renumber otherwise — replacing the old
 * LayersPanel computeReorderZValues path that stamped EVERY sibling.
 *
 * Null when nothing changes, the set is too small, or an element in the
 * desired order is not actually a painting sibling of `target`.
 */
export function resolveZOrderReposition(
  target: HTMLElement,
  desiredOrderBottomToTop: readonly HTMLElement[],
): ZOrderPatch[] | null {
  const { entries } = getFamily(target);
  if (entries.length < 2) return null;
  const byElement = new Map(entries.map((entry) => [entry.element, entry]));
  const desired: RenderEntry[] = [];
  for (const el of desiredOrderBottomToTop) {
    const entry = byElement.get(el);
    if (!entry) return null;
    desired.push(entry);
  }
  if (desired.length < 2 || !desired.some((entry) => entry.element === target)) return null;
  const currentOrder = toRenderOrder(desired);
  // A drop back into the same slot is a no-op. The menu actions guard this via
  // their position checks before realizeOrder; an arbitrary reposition must
  // compare the orders itself — realizeOrder would otherwise "normalize" an
  // end-of-set target to a fresh z value it doesn't need.
  if (currentOrder.every((entry, i) => entry.element === desired[i].element)) return null;
  return realizeOrder(currentOrder, desired, target, entries);
}

/**
 * The sibling a forward/backward step crosses: the visible overlapping
 * neighbor directly above (bring-forward) or below (send-backward) the target
 * in render order. Null for front/back, for a no-op step, or when the scope is
 * too small. Uses the SAME scoping as resolveZOrderChange, so call it with the
 * same options BEFORE any live styles are applied.
 */
export function resolveCrossedNeighbor(
  target: HTMLElement,
  action: ZOrderAction,
  options?: ZOrderResolveOptions,
): HTMLElement | null {
  if (action !== "bring-forward" && action !== "send-backward") return null;
  const resolved = resolveScopedRenderOrder(target, action, options);
  if (!resolved) return null;
  const { order, pos } = resolved;
  const neighbor = action === "bring-forward" ? order[pos + 1] : order[pos - 1];
  return neighbor?.element ?? null;
}

/**
 * Whether a z-order action is available for the target.
 * "disabled" = the element is already at that limit. Shares the resolver (and
 * its visibility scoping), so enable/disable always matches what the action
 * would actually do.
 */
export function isZOrderActionEnabled(
  target: HTMLElement,
  action: ZOrderAction,
  options?: ZOrderResolveOptions,
): boolean {
  return resolveZOrderChange(target, action, options) !== null;
}

/**
 * One z-order step: the patches plus the sibling it crosses, both read from the
 * same pre-change render order. Null when the action is a no-op.
 */
export function resolveZOrderStep(
  target: HTMLElement,
  action: ZOrderAction,
): { patches: ZOrderPatch[]; crossed: HTMLElement | null } | null {
  const patches = resolveZOrderChange(target, action);
  if (patches === null) return null;
  return { patches, crossed: resolveCrossedNeighbor(target, action) };
}
