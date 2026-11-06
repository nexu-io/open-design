import { useEffect, useRef, useState, type RefObject } from "react";
import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import { readRuntimeKeyframes } from "../../hooks/gsapRuntimeKeyframes";
import { readGsapPositionFromIframe } from "../../hooks/gsapPositionDetection";
import { isElementVisibleForOverlay } from "./domEditOverlayGeometry";
import {
  buildMotionPathGeometry,
  type MotionPathGeometry,
  type MotionPathHome,
} from "./motionPathGeometry";
import { elementHome } from "./motionPathHome";
import { subscribeOverlayFrame } from "./overlayFrameLoop";
import { usePlayerStore } from "../../player/store/playerStore";

type Rect = { left: number; top: number; width: number; height: number };

// Perspective foreshortening of the element's OWN transform (matrix3d m44). A
// depth element (translateZ toward the viewer) renders 1/m44× larger, so its
// animated x/y offsets travel 1/m44× further on screen than the flat preview
// scale implies. Returns 1 for 2D transforms. The motion path magnifies its
// offset points by 1/m44 (and de-magnifies pointer→offset) so the drawn path and
// its draggable nodes track the projected element instead of drifting off it.
export function transformWDivisor(el: HTMLElement): number {
  const t = el.ownerDocument?.defaultView?.getComputedStyle(el).transform;
  if (!t || !t.startsWith("matrix3d(")) return 1;
  const v = t.slice("matrix3d(".length, -1).split(",");
  const w = Number.parseFloat(v[15] ?? "");
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function rectsClose(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

export function hasMotionPathPlugin(iframe: HTMLIFrameElement | null): boolean {
  try {
    return Boolean(
      (iframe?.contentWindow as unknown as { MotionPathPlugin?: unknown })?.MotionPathPlugin,
    );
  } catch {
    return false;
  }
}

export function useMotionPathData(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  selector: string | null,
): {
  rect: Rect | null;
  geometry: MotionPathGeometry | null;
  geometryResolved: boolean;
  visibleInPreview: boolean;
  home: MotionPathHome | null;
  pScale: number;
} {
  const [rect, setRect] = useState<Rect | null>(null);
  const [geometry, setGeometry] = useState<MotionPathGeometry | null>(null);
  const resolvedForRef = useRef<string | null>(null);
  const geometryResolved = resolvedForRef.current === selector;
  const [visibleInPreview, setVisibleInPreview] = useState(true);
  const [home, setHome] = useState<MotionPathHome | null>(null);
  // Perspective magnification (1/m44) of the selected element — applied to the
  // path's offset points so depth (translateZ) elements' paths track on screen.
  const [pScale, setPScale] = useState(1);
  const armed = usePlayerStore((s) => s.motionPathArmed);
  const drawn = geometry !== null || armed;

  useEffect(() => {
    if (!selector) {
      setRect(null);
      setHome(null);
      return;
    }
    setHome(null);
    if (!drawn) return;
    const tick = () => {
      const el = iframeRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const surface = el.ownerDocument?.querySelector("[data-preview-pan-surface]");
        const sRect = surface?.getBoundingClientRect();
        const next = {
          left: sRect ? r.left - sRect.left : r.left,
          top: sRect ? r.top - sRect.top : r.top,
          width: r.width,
          height: r.height,
        };
        setRect((prev) => (prev && rectsClose(prev, next) ? prev : next));
        let target: Element | null = null;
        try {
          target = el.contentDocument?.querySelector(selector) ?? null;
        } catch {
          /* cross-origin guard */
        }
        const live = isHtmlElement(target) ? target : null;
        const vis = live ? isElementVisibleForOverlay(live) : true;
        setVisibleInPreview((prev) => (prev === vis ? prev : vis));
        if (live) {
          const h = elementHome(live);
          setHome((prev) =>
            prev &&
            Math.abs(prev.x - h.x) < 0.5 &&
            Math.abs(prev.y - h.y) < 0.5 &&
            prev.w === h.w &&
            prev.h === h.h &&
            prev.ax === h.ax &&
            prev.ay === h.ay
              ? prev
              : h,
          );
          const ps = 1 / transformWDivisor(live);
          setPScale((p) => (Math.abs(p - ps) < 0.001 ? p : ps));
        }
      }
    };
    return subscribeOverlayFrame(tick);
  }, [selector, iframeRef, drawn]);

  useEffect(() => {
    if (!selector) {
      setGeometry(null);
      return;
    }
    const recompute = () => {
      // Position-only: never let a co-located size/scale tween shadow the path.
      const read = readRuntimeKeyframes(iframeRef.current, selector, undefined, ["x", "y"]);
      const base = read ? readGsapPositionFromIframe(iframeRef.current, selector) : null;
      const next = buildMotionPathGeometry(read, base ?? undefined);
      setGeometry((prev) =>
        prev?.kind === next?.kind &&
        JSON.stringify([prev?.nodes, prev?.start]) === JSON.stringify([next?.nodes, next?.start])
          ? prev
          : next,
      );
      resolvedForRef.current = selector;
    };
    recompute();
    const id = window.setInterval(recompute, 250);
    return () => window.clearInterval(id);
  }, [selector, iframeRef]);

  return { rect, geometry, geometryResolved, visibleInPreview, home, pScale };
}
