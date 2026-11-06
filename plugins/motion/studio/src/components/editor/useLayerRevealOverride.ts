import { useCallback, useEffect, useRef } from "react";
import { revealClip } from "@hyperframes/core/runtime/clip-reveal";
import {
  LAYER_REVEAL_PRIOR_POSITION_ATTR,
  LAYER_REVEAL_PRIOR_Z_ATTR,
} from "../../player/lib/timelineElementHelpers";
import { readEffectiveZIndex } from "./canvasContextMenuZOrder";

/** The lifted paint order — far above any authored z. Only the RENDERER sees
 *  it: every studio z reader is reveal-transparent (readLayerRevealPriorZ). */
export const LAYER_REVEAL_LIFT_Z = "2147483000";
export const LAYER_REVEAL_PENDING_COMMIT_ATTR = "data-hf-studio-reveal-pending-commit";

interface RevealedNode {
  element: HTMLElement;
  priors: { display: string; visibility: string; opacity: string };
  /** Values THIS override wrote — restore only while they are still in place. */
  applied: { display?: string; visibility?: string; opacity?: string };
  putMarkBack?: () => void;
}

interface RevealLift {
  priors: { zIndex: string; position: string };
  positionLifted: boolean;
}

type PendingRevealCommit = {
  token: string;
  releasedPriors?: RevealLift["priors"];
};

export type LayerRevealCommitOwnership = {
  token: string;
  priorZ: string;
  priorPosition: string | null;
  activeLiftStyles: RevealLift["priors"];
};

let revealCommitSequence = 0;
const zPersistCounts = new WeakMap<HTMLElement, number>();
const REVEAL_RETRY_MS = 16;

/** Prevent delayed reveals from capturing an optimistic z as authored state. */
export function beginLayerZPersist(element: HTMLElement): () => void {
  zPersistCounts.set(element, (zPersistCounts.get(element) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (zPersistCounts.get(element) ?? 1) - 1;
    if (remaining > 0) zPersistCounts.set(element, remaining);
    else zPersistCounts.delete(element);
  };
}

interface RevealState {
  /** The layer element the reveal was applied for (deselect detection). */
  base: HTMLElement;
  nodes: RevealedNode[];
  lift: RevealLift | null;
}

function restoreInline(el: HTMLElement, property: string, prior: string): void {
  if (prior) el.style.setProperty(property, prior);
  else el.style.removeProperty(property);
}

// This decoder owns the complete serialized reveal-commit schema. Splitting
// field checks across helpers would create multiple authorities for validity.
// fallow-ignore-next-line complexity
function readPendingRevealCommit(element: HTMLElement): PendingRevealCommit | null {
  const raw = element.getAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("token" in value)) return null;
    const token = value.token;
    if (typeof token !== "string") return null;
    if (!("releasedPriors" in value) || value.releasedPriors === undefined) return { token };
    const releasedPriors = value.releasedPriors;
    if (
      typeof releasedPriors !== "object" ||
      releasedPriors === null ||
      !("zIndex" in releasedPriors) ||
      !("position" in releasedPriors)
    ) {
      return null;
    }
    const { zIndex, position } = releasedPriors;
    return typeof zIndex === "string" && typeof position === "string"
      ? { token, releasedPriors: { zIndex, position } }
      : null;
  } catch {
    return null;
  }
}

function writePendingRevealCommit(element: HTMLElement, state: PendingRevealCommit): void {
  element.setAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR, JSON.stringify(state));
}

/** Hand an active reveal lift to one pending durable z commit. */
export function beginLayerRevealCommit(element: HTMLElement): LayerRevealCommitOwnership | null {
  const priorZ = element.getAttribute(LAYER_REVEAL_PRIOR_Z_ATTR);
  if (priorZ == null) return null;
  const ownership = {
    token: `reveal-z-${revealCommitSequence++}`,
    priorZ,
    priorPosition: element.getAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR),
    activeLiftStyles: { zIndex: element.style.zIndex, position: element.style.position },
  };
  writePendingRevealCommit(element, { token: ownership.token });
  element.removeAttribute(LAYER_REVEAL_PRIOR_Z_ATTR);
  element.removeAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR);
  return ownership;
}

/** Durable success consumes the reveal regardless of whether selection released it meanwhile. */
export function completeLayerRevealCommit(
  element: HTMLElement,
  ownership: LayerRevealCommitOwnership,
): void {
  if (readPendingRevealCommit(element)?.token === ownership.token) {
    element.removeAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR);
  }
}

/**
 * Roll back only the reveal transaction this commit owns. An active reveal gets
 * its temporary lift back; a reveal released while persistence was pending gets
 * its exact authored inline styles back, with no resurrected metadata.
 */
export function rollbackLayerRevealCommit(
  element: HTMLElement,
  ownership: LayerRevealCommitOwnership,
): void {
  const pending = readPendingRevealCommit(element);
  if (pending?.token !== ownership.token) return;
  element.removeAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR);
  element.removeAttribute(LAYER_REVEAL_PRIOR_Z_ATTR);
  element.removeAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR);
  if (pending.releasedPriors) {
    restoreInline(element, "z-index", pending.releasedPriors.zIndex);
    restoreInline(element, "position", pending.releasedPriors.position);
    return;
  }
  restoreInline(element, "z-index", ownership.activeLiftStyles.zIndex);
  restoreInline(element, "position", ownership.activeLiftStyles.position);
  element.setAttribute(LAYER_REVEAL_PRIOR_Z_ATTR, ownership.priorZ);
  if (ownership.priorPosition != null) {
    element.setAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR, ownership.priorPosition);
  }
}

/** Restore a property ONLY when its current inline value is still the one this
 *  override wrote — a later real edit (commit, animation seek) is the new
 *  truth and must not be clobbered. */
function restoreIfOurs(
  el: HTMLElement,
  property: "display" | "visibility" | "opacity",
  applied: string | undefined,
  prior: string,
): boolean {
  if (applied == null) return false;
  if (el.style.getPropertyValue(property) !== applied) return false;
  restoreInline(el, property, prior);
  return true;
}

/** What hides this node at the current frame, per computed style. */
function readHideSignals(el: HTMLElement, win: Window) {
  const computed = win.getComputedStyle(el);
  const opacity = Number.parseFloat(computed.opacity);
  return {
    display: computed.display === "none",
    visibility: computed.visibility === "hidden" || computed.visibility === "collapse",
    opacity: Number.isFinite(opacity) && opacity <= 0.01,
  };
}

/** Force one hidden node visible with inline styles; returns priors + applied. */
function revealNode(
  el: HTMLElement,
  win: Window,
  needs: ReturnType<typeof readHideSignals>,
): RevealedNode {
  const priors = {
    display: el.style.display,
    visibility: el.style.visibility,
    opacity: el.style.opacity,
  };
  const applied: RevealedNode["applied"] = {};
  let putMarkBack: RevealedNode["putMarkBack"];
  if (needs.display) {
    // Prefer whatever the stylesheet says once the inline hide is lifted;
    // only force block when the sheet itself hides it.
    el.style.removeProperty("display");
    if (win.getComputedStyle(el).display === "none") el.style.display = "block";
    applied.display = el.style.display;
  }
  if (needs.visibility) {
    putMarkBack = revealClip(el);
    applied.visibility = "visible";
  }
  if (needs.opacity) {
    el.style.opacity = "1";
    applied.opacity = "1";
  }
  return { element: el, priors, applied, putMarkBack };
}

/** Walk `element` → body, force-revealing every hiding node; returns the touched nodes. */
function revealHiddenChain(element: HTMLElement): RevealedNode[] {
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  if (!win) return [];
  const nodes: RevealedNode[] = [];
  let el: HTMLElement | null = element;
  while (el && el !== doc.body && el !== doc.documentElement) {
    let needs: ReturnType<typeof readHideSignals>;
    try {
      needs = readHideSignals(el, win);
    } catch {
      break; // detached / cross-realm — leave the rest alone
    }
    if (needs.display || needs.visibility || needs.opacity) nodes.push(revealNode(el, win, needs));
    el = el.parentElement;
  }
  return nodes;
}

/**
 * Lift the selected element to the TOP of the paint order while selected —
 * regardless of its authored z or panel position. The true z is parked in
 * LAYER_REVEAL_PRIOR_Z_ATTR so every studio z reader keeps reporting it (the
 * lift is invisible to menus, badges, the lane mirror, and the panel sort);
 * only the renderer sees the lifted inline value. A static element gets a
 * temporary position:relative (layout-preserving) so the z applies, with the
 * prior position parked in LAYER_REVEAL_PRIOR_POSITION_ATTR for the z-commit's
 * static check. Exported for direct unit testing.
 */
export function liftElementToTop(element: HTMLElement): RevealLift | null {
  const win = element.ownerDocument.defaultView;
  if (!win) return null;
  const priors = { zIndex: element.style.zIndex, position: element.style.position };
  let positionLifted = false;
  try {
    element.setAttribute(LAYER_REVEAL_PRIOR_Z_ATTR, String(readEffectiveZIndex(element)));
    if (win.getComputedStyle(element).position === "static") {
      element.setAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR, "static");
      element.style.position = "relative";
      positionLifted = true;
    }
  } catch {
    element.removeAttribute(LAYER_REVEAL_PRIOR_Z_ATTR);
    return null; // detached / cross-realm — no lift
  }
  element.style.zIndex = LAYER_REVEAL_LIFT_Z;
  return { priors, positionLifted };
}

/**
 * Undo an active lift. Skipped entirely when the prior-z attribute is gone —
 * a z-reorder commit consumed the lift (handleDomZIndexReorderCommit removes
 * the attributes and writes the new real z), and that commit is the truth.
 * Exported for direct unit testing.
 */
export function restoreLiftedElement(element: HTMLElement, lift: RevealLift): void {
  if (!element.hasAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)) {
    const pending = readPendingRevealCommit(element);
    if (pending && !pending.releasedPriors) {
      // Persistence temporarily owns the live z. Hand it the exact authored
      // priors so a later rejection can restore them after this hook lets go.
      writePendingRevealCommit(element, { ...pending, releasedPriors: lift.priors });
    }
    return;
  }
  const positionStillLifted = element.hasAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR);
  element.removeAttribute(LAYER_REVEAL_PRIOR_Z_ATTR);
  element.removeAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR);
  if (element.style.zIndex === LAYER_REVEAL_LIFT_Z) {
    restoreInline(element, "z-index", lift.priors.zIndex);
  }
  if (lift.positionLifted && positionStillLifted && element.style.position === "relative") {
    restoreInline(element, "position", lift.priors.position);
  }
}

/**
 * Temporary "show me this element" override for the Layers panel
 * (Webflow-navigator style): clicking a layer forces it (and every hiding
 * ancestor up to the body) visible with LIVE inline styles, and paints it on
 * TOP of the stack while selected (see liftElementToTop).
 *
 * Strictly ephemeral by construction:
 * - Exact prior inline values are recorded per touched node and restored on
 *   every exit path — reveal of a different layer, deselect, playback start,
 *   unmount. Nothing is ever sent to a persist path, and each property is
 *   restored only while it still holds the value this override wrote.
 * - A post-edit iframe reload replaces the DOM; detached nodes are skipped on
 *   restore (the fresh document never had the override).
 * - Scrubbing/playing lets the runtime and GSAP rewrite these same inline
 *   styles — that is the animation showing reality, and the override is
 *   dropped on play for exactly that reason.
 */
export function useLayerRevealOverride({
  isPlaying,
  selectedElement,
}: {
  isPlaying: boolean;
  selectedElement: HTMLElement | null;
}): {
  scheduleReveal: (element: HTMLElement, delayMs: number) => void;
} {
  const stateRef = useRef<RevealState | null>(null);
  const pendingRevealRef = useRef<{ timer: number; element: HTMLElement } | null>(null);
  const currentRef = useRef({ isPlaying, selectedElement });
  currentRef.current = { isPlaying, selectedElement };

  const restoreReveal = useCallback(() => {
    const state = stateRef.current;
    stateRef.current = null;
    if (!state) return;
    for (const { element, priors, applied, putMarkBack } of state.nodes) {
      if (!element.isConnected) continue;
      restoreIfOurs(element, "display", applied.display, priors.display);
      if (restoreIfOurs(element, "visibility", applied.visibility, priors.visibility))
        putMarkBack?.();
      restoreIfOurs(element, "opacity", applied.opacity, priors.opacity);
    }
    if (state.lift && state.base.isConnected) restoreLiftedElement(state.base, state.lift);
  }, []);

  const reveal = useCallback(
    (element: HTMLElement) => {
      restoreReveal();
      const nodes = revealHiddenChain(element);
      const lift = liftElementToTop(element);
      if (nodes.length > 0 || lift) stateRef.current = { base: element, nodes, lift };
    },
    [restoreReveal],
  );

  const cancelScheduledReveal = useCallback(() => {
    const pending = pendingRevealRef.current;
    pendingRevealRef.current = null;
    if (pending) window.clearTimeout(pending.timer);
  }, []);

  const scheduleReveal = useCallback(
    (element: HTMLElement, delayMs: number) => {
      cancelScheduledReveal();
      const current = currentRef.current;
      if (current.isPlaying) return;
      const attemptReveal = () => {
        const latest = currentRef.current;
        if (latest.isPlaying || latest.selectedElement !== element || !element.isConnected) {
          pendingRevealRef.current = null;
          return;
        }
        if (zPersistCounts.has(element)) {
          const timer = window.setTimeout(attemptReveal, REVEAL_RETRY_MS);
          pendingRevealRef.current = { timer, element };
          return;
        }
        pendingRevealRef.current = null;
        reveal(element);
      };
      const timer = window.setTimeout(attemptReveal, delayMs);
      pendingRevealRef.current = { timer, element };
    },
    [cancelScheduledReveal, reveal],
  );

  // Selection and playback jointly own eligibility for both pending and active
  // reveals. Cancel first; playback or a different selection then restores the
  // animation/authored styles.
  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (isPlaying || (pending && pending.element !== selectedElement)) cancelScheduledReveal();
    const base = stateRef.current?.base;
    if (isPlaying || (base && selectedElement !== base)) restoreReveal();
  }, [cancelScheduledReveal, isPlaying, restoreReveal, selectedElement]);

  // Unmount: never leave a timer or override behind.
  useEffect(
    () => () => {
      cancelScheduledReveal();
      restoreReveal();
    },
    [cancelScheduledReveal, restoreReveal],
  );

  return { scheduleReveal };
}
