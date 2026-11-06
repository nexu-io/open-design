import type { DomSelectionResult } from "../../hooks/useDomSelectionTypes";
import { matchesKey } from "../../player/components/studioShortcuts";
import { trackPreviewFeatureUsed } from "../../utils/previewFeatureUsage";
// fallow-ignore-file code-duplication
import { useCallback, useEffect, useRef, useState } from "react";
import type { DomEditSelection } from "./domEditing";
import { collectDomEditLayerItems, resolveDomEditSelection } from "./domEditingLayers";
import { isElementComputedVisible } from "./domEditingElement";
import { coversComposition } from "../../utils/studioPreviewHelpers";
import { rectsOverlap, type Rect } from "../../utils/marqueeGeometry";
import { toVisibleOverlayRect } from "./domEditOverlayGeometry";
import { movesGesture } from "./domEditOverlayGestures";

interface MarqueeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  pointerId: number;
  pastThreshold: boolean;
  target: Element;
}

function currentMarqueeCandidates(
  cached: MarqueeHit[] | null,
  iframe: HTMLIFrameElement,
  overlay: HTMLDivElement,
  path: string,
): MarqueeHit[] {
  if (cached?.every((hit) => hit.element.ownerDocument === iframe.contentDocument)) return cached;
  return collectMarqueeCandidates(iframe, overlay, path);
}

const MARQUEE_THRESHOLD_PX = 4;

interface MarqueeHit {
  element: HTMLElement;
  rect: Rect;
}

/**
 * Every element the marquee could hit, with the overlay-space rect it would be
 * tested against. Uses the SAME `toOverlayRect` basis as the single-selection /
 * group-selection boxes, so what the marquee highlights and selects is exactly
 * the box the user sees when they click an element.
 *
 * Measured once per drag rather than per pointer-move: this reads layout for
 * every element in the document, and a captured page has enough of them that
 * doing it 60 times a second stalls the tab. The iframe DOM does not mutate
 * mid-drag, so the rects it returns stay true for the whole gesture.
 */
// fallow-ignore-next-line complexity
function collectMarqueeCandidates(
  iframe: HTMLIFrameElement,
  overlayEl: HTMLDivElement,
  activeCompositionPath: string,
): MarqueeHit[] {
  const doc = iframe.contentDocument;
  if (!doc) return [];

  const root = doc.querySelector<HTMLElement>("[data-composition-id]") ?? doc.body;
  const isMasterView = !activeCompositionPath || activeCompositionPath === "index.html";
  const items = collectDomEditLayerItems(root, { activeCompositionPath, isMasterView });

  const rootEl = doc.querySelector<HTMLElement>("[data-composition-id]") ?? doc.documentElement;
  const declW = Number.parseFloat(rootEl?.getAttribute("data-width") ?? "");
  const declH = Number.parseFloat(rootEl?.getAttribute("data-height") ?? "");
  const viewport = {
    width: declW > 0 ? declW : rootEl.getBoundingClientRect().width || 1,
    height: declH > 0 ? declH : rootEl.getBoundingClientRect().height || 1,
  };

  const candidates: MarqueeHit[] = [];
  for (const item of items) {
    const el = item.element;
    if (!isElementComputedVisible(el)) continue;
    if (coversComposition(el.getBoundingClientRect(), viewport)) continue;
    const overlayRect = toVisibleOverlayRect(overlayEl, iframe, el);
    if (!overlayRect) continue;
    candidates.push({
      element: el,
      rect: {
        left: overlayRect.left,
        top: overlayRect.top,
        width: overlayRect.width,
        height: overlayRect.height,
      },
    });
  }

  return candidates;
}

function hitsWithin(rect: Rect, candidates: MarqueeHit[]): MarqueeHit[] {
  return candidates.filter((candidate) => rectsOverlap(rect, candidate.rect));
}

async function resolveDomEditSelections(
  elements: HTMLElement[],
  activeCompositionPath: string,
): Promise<DomEditSelection[]> {
  const isMasterView = !activeCompositionPath || activeCompositionPath === "index.html";
  const hits: DomEditSelection[] = [];
  for (const element of elements) {
    const sel = await resolveDomEditSelection(element, {
      activeCompositionPath,
      isMasterView,
      skipSourceProbe: true,
    });
    if (sel) hits.push(sel);
  }
  return hits;
}

export interface MarqueeGesturesDeps<T = DomEditSelection> {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  activeCompositionPathRef: React.RefObject<string | null>;
  onMarqueeSelectRef: React.RefObject<
    ((selections: T[], additive: boolean) => DomSelectionResult | void) | undefined
  >;
  /** Turns the elements a drag touched into picks; without it, Studio's edit selections. */
  resolveHits?: (elements: HTMLElement[]) => T[] | Promise<T[]>;
  selectionRef?: React.RefObject<DomEditSelection | null>;
  /** Studio's pointer handling, for the events that are not part of a marquee. */
  gestures?: {
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
    clearPointerState: (ref: React.RefObject<DomEditSelection | null>) => void;
  };
}

export interface MarqueeGestures {
  marqueeRect: Rect | null;
  candidateRects: Rect[];
  /** Starts a marquee at this press; the host has decided it landed on empty canvas. */
  begin: (event: React.PointerEvent<HTMLElement>) => void;
  /** Drops an active marquee without selecting anything. */
  cancel: () => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
}

function trackMarqueeSelection(result: DomSelectionResult | void): void {
  if (result?.changed && result.count > 1) trackPreviewFeatureUsed("multi_select", "drag");
}

function releaseCapture(m: MarqueeState): void {
  try {
    m.target.releasePointerCapture(m.pointerId);
  } catch {
    /* already released */
  }
}

export function useMarqueeGestures(deps: MarqueeGesturesDeps): MarqueeGestures;
export function useMarqueeGestures<T>(
  deps: MarqueeGesturesDeps<T> & Required<Pick<MarqueeGesturesDeps<T>, "resolveHits">>,
): MarqueeGestures;
// fallow-ignore-next-line complexity
export function useMarqueeGestures<T>(deps: MarqueeGesturesDeps<T>): MarqueeGestures {
  const marqueeRef = useRef<MarqueeState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  // Live "candidate" highlight: the elements the marquee currently touches,
  // shown before mouse-up so you can see what you're about to select. The
  // iframe DOM doesn't mutate during a drag, so a sync intersection per move
  // is cheap (clean layout → no thrash).
  const [candidateRects, setCandidateRects] = useState<Rect[]>([]);
  // Measured once when the drag passes the threshold and reused until it ends.
  const candidatesRef = useRef<MarqueeHit[] | null>(null);

  const commitMarquee = useCallback(
    async (
      rect: { left: number; top: number; width: number; height: number },
      additive: boolean,
    ) => {
      const iframe = deps.iframeRef.current;
      const overlay = deps.overlayRef.current;
      if (!iframe || !overlay || !deps.onMarqueeSelectRef.current) return;
      const acp = deps.activeCompositionPathRef.current ?? "index.html";
      const candidates = currentMarqueeCandidates(candidatesRef.current, iframe, overlay, acp);
      const elements = hitsWithin(rect, candidates).map((hit) => hit.element);
      const resolveHits = deps.resolveHits;
      const picks = resolveHits
        ? await resolveHits(elements)
        : ((await resolveDomEditSelections(elements, acp)) as T[]);
      const applySelection = deps.onMarqueeSelectRef.current;
      if (!applySelection) return;
      const result = applySelection(picks, additive);
      trackMarqueeSelection(result);
    },
    [
      deps.iframeRef,
      deps.overlayRef,
      deps.onMarqueeSelectRef,
      deps.activeCompositionPathRef,
      deps.resolveHits,
    ],
  );

  const reset = useCallback(() => {
    marqueeRef.current = null;
    setMarqueeRect(null);
    setCandidateRects([]);
    candidatesRef.current = null;
  }, []);

  const begin = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const oRect = deps.overlayRef.current?.getBoundingClientRect();
      if (!oRect) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const x = event.clientX - oRect.left;
      const y = event.clientY - oRect.top;
      marqueeRef.current = {
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        pointerId: event.pointerId,
        pastThreshold: false,
        target: event.currentTarget,
      };
    },
    [deps.overlayRef],
  );

  const cancel = useCallback(() => {
    if (!marqueeRef.current) return;
    releaseCapture(marqueeRef.current);
    reset();
  }, [reset]);

  useEffect(() => {
    const cancelBandBeforeHostEscape = (e: KeyboardEvent) => {
      if (!matchesKey(e, "cancel") || !marqueeRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", cancelBandBeforeHostEscape, { capture: true });
    return () =>
      window.removeEventListener("keydown", cancelBandBeforeHostEscape, { capture: true });
  }, [cancel]);

  const showCandidates = useCallback(
    (rect: Rect) => {
      const iframe = deps.iframeRef.current;
      const overlay = deps.overlayRef.current;
      if (!iframe || !overlay) return;
      const acp = deps.activeCompositionPathRef.current ?? "index.html";
      candidatesRef.current ??= collectMarqueeCandidates(iframe, overlay, acp);
      setCandidateRects(hitsWithin(rect, candidatesRef.current).map((h) => h.rect));
    },
    [deps.overlayRef, deps.iframeRef, deps.activeCompositionPathRef],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const m = marqueeRef.current;
      if (m) {
        if (!movesGesture(m, event)) return;
        const oRect = deps.overlayRef.current?.getBoundingClientRect();
        if (!oRect) return;
        m.currentX = event.clientX - oRect.left;
        m.currentY = event.clientY - oRect.top;
        if (!m.pastThreshold) {
          const dx = m.currentX - m.startX;
          const dy = m.currentY - m.startY;
          if (Math.hypot(dx, dy) < MARQUEE_THRESHOLD_PX) return;
          m.pastThreshold = true;
          candidatesRef.current = null;
        }
        const rect: Rect = {
          left: Math.min(m.startX, m.currentX),
          top: Math.min(m.startY, m.currentY),
          width: Math.abs(m.currentX - m.startX),
          height: Math.abs(m.currentY - m.startY),
        };
        setMarqueeRect(rect);
        showCandidates(rect);
        return;
      }
      deps.gestures?.onPointerMove(event);
    },
    [deps.gestures, deps.overlayRef, showCandidates],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const m = marqueeRef.current;
      if (m) {
        releaseCapture(m);
        if (m.pastThreshold) {
          commitMarquee(
            {
              left: Math.min(m.startX, m.currentX),
              top: Math.min(m.startY, m.currentY),
              width: Math.abs(m.currentX - m.startX),
              height: Math.abs(m.currentY - m.startY),
            },
            event.shiftKey,
          );
        } else {
          deps.onMarqueeSelectRef.current?.([], false);
        }
        reset();
        return;
      }
      deps.gestures?.onPointerUp(event);
    },
    [deps.gestures, commitMarquee, deps.onMarqueeSelectRef, reset],
  );

  const onPointerCancel = useCallback(() => {
    if (marqueeRef.current) return cancel();
    if (deps.selectionRef) deps.gestures?.clearPointerState(deps.selectionRef);
  }, [deps.gestures, deps.selectionRef, cancel]);

  return {
    marqueeRect,
    candidateRects,
    begin,
    cancel,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
