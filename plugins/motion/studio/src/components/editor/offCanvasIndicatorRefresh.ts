import type React from "react";
import type { OffCanvasRect } from "./OffCanvasIndicators";
import {
  DOM_EDIT_LAYER_OBSERVER_INIT,
  type DomEditLayerWalkCache,
  createDomEditLayerWalkCache,
  drainPendingLayerMutations,
} from "./domEditLayerWalkCache";
import { recomputeOffCanvasIndicators } from "./offCanvasIndicatorGeometry";
import { requestOverlayFrames, subscribeOverlayFrame } from "./overlayFrameLoop";

interface OffCanvasIndicatorRefreshOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  compRectRef: React.MutableRefObject<{ left: number; top: number; width: number; height: number }>;
  activeCompositionPathRef: React.MutableRefObject<string | null>;
  dirtyRef: React.MutableRefObject<boolean>;
  sigRef: React.MutableRefObject<string>;
  observerRef: React.MutableRefObject<MutationObserver | null>;
  observedDocRef: React.MutableRefObject<Document | null>;
  elementsRef: React.MutableRefObject<Map<string, HTMLElement>>;
  setRects: (rects: OffCanvasRect[]) => void;
}

function compSignature(comp: { left: number; top: number; width: number; height: number }): string {
  return `${Math.round(comp.left)}:${Math.round(comp.top)}:${Math.round(comp.width)}:${Math.round(comp.height)}`;
}

function clearIndicators(options: OffCanvasIndicatorRefreshOptions): void {
  options.dirtyRef.current = false;
  options.sigRef.current = "";
  options.elementsRef.current = new Map();
  options.setRects([]);
}

function observeDoc(
  doc: Document,
  cache: DomEditLayerWalkCache,
  markDirty: () => void,
): MutationObserver | null {
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (!Observer) return null;
  // The same records do two jobs: they say a rebuild is owed, and they say which
  // elements the rebuild may not reuse. Reading them here rather than only
  // marking a boolean is what makes the rebuild cost the edit rather than the
  // document.
  const observer = new Observer((records) => {
    cache.ingest(records);
    markDirty();
  });
  // Unfiltered, unlike the boolean-dirty version this replaces, which watched
  // only ["style", "class", "transform", "width", "height", "data-hidden"]. An
  // attribute the cache never hears about is one it would answer stale for, and
  // the filter omitted `id` and the `data-composition-*` attributes that decide
  // a layer's identity. Widening only makes indicators refresh sooner: a rebuild
  // is a pure read of the DOM and is throttled by RECOMPUTE_INTERVAL_MS either
  // way. See DOM_EDIT_LAYER_OBSERVER_INIT for what each option is load-bearing for.
  observer.observe(doc.documentElement, DOM_EDIT_LAYER_OBSERVER_INIT);
  return observer;
}

/**
 * How often the indicator geometry may be rebuilt.
 *
 * A rebuild walks every element in the preview and reads layout for each —
 * 6.5ms on an 825-element captured page, against a 16.7ms frame. What marks it
 * dirty is a MutationObserver on inline style, which is exactly how animation
 * writes, so playback would pay that on close to every frame. The indicators
 * are a passive affordance: refreshing them a few times a second is
 * indistinguishable on screen and keeps the cost off the frame budget.
 */
export const RECOMPUTE_INTERVAL_MS = 100;

/** Dirty, and far enough past the last rebuild to be worth paying for another. */
export function rebuildDue(dirty: boolean, lastAt: number, now: number): boolean {
  return dirty && now - lastAt >= RECOMPUTE_INTERVAL_MS;
}

export function startOffCanvasIndicatorRefresh(
  options: OffCanvasIndicatorRefreshOptions,
): () => void {
  let lastCompSig = "";
  let lastRecomputeAt = Number.NEGATIVE_INFINITY;
  const walkCache = createDomEditLayerWalkCache();
  const markDirty = () => {
    options.dirtyRef.current = true;
    // A rebuild is owed, so the shared loop has to be running to pay it. The
    // preview's own MutationObserver is the wake source the top frame's
    // pointer and message listeners cannot be: an edit inside the iframe
    // reaches this callback and nothing else.
    requestOverlayFrames();
  };
  const attachObserver = (doc: Document | null) => {
    options.observerRef.current?.disconnect();
    // A new preview document shares no elements with the old one, and nothing
    // reported the old one's teardown.
    walkCache.invalidateAll();
    options.observerRef.current = doc?.documentElement
      ? observeDoc(doc, walkCache, markDirty)
      : null;
    options.observedDocRef.current = doc;
    options.sigRef.current = "";
  };
  const update = () => {
    const iframe = options.iframeRef.current;
    const overlayEl = options.overlayRef.current;
    const doc = iframe?.contentDocument ?? null;
    if (doc !== options.observedDocRef.current) {
      attachObserver(doc);
      markDirty();
    }
    const comp = options.compRectRef.current;
    const nextCompSig = compSignature(comp);
    if (nextCompSig !== lastCompSig) {
      lastCompSig = nextCompSig;
      markDirty();
    }
    if (!iframe || !overlayEl) {
      if (options.dirtyRef.current) clearIndicators(options);
      return;
    }
    // Staying dirty while throttled is what makes the next eligible frame rebuild.
    const now = performance.now();
    if (!rebuildDue(options.dirtyRef.current, lastRecomputeAt, now)) return;
    lastRecomputeAt = now;
    options.dirtyRef.current = false;
    drainPendingLayerMutations(options.observerRef.current, walkCache);
    recomputeOffCanvasIndicators(
      iframe,
      overlayEl,
      doc,
      comp,
      options.activeCompositionPathRef.current,
      options.sigRef,
      options.elementsRef,
      options.setRects,
      walkCache,
    );
  };
  const unsubscribe = subscribeOverlayFrame(update);
  return () => {
    unsubscribe();
    options.observerRef.current?.disconnect();
    options.observerRef.current = null;
    options.observedDocRef.current = null;
  };
}
