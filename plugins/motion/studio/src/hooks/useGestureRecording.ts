import { revealClip } from "@hyperframes/core/runtime/clip-reveal";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore, liveTime } from "../player/store/playerStore";
import { frameToSeconds, secondsToFrame } from "../player/lib/time";
import { useLinkedClipPreferences } from "../utils/linkedClipPreferences";

export interface GestureSample {
  time: number;
  properties: Record<string, number>;
}

interface Modifiers {
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

interface AccumulatedState {
  opacity: number;
  scale: number;
  z: number;
}

interface BasePosition {
  baseX: number;
  baseY: number;
  baseOpacity: number;
  baseScale: number;
  cssOffX: number;
  cssOffY: number;
}

interface GsapRuntime {
  timeline: { seek: (t: number) => void };
  gsap: { set: (target: Element, vars: Record<string, number | string>) => void };
  element: HTMLElement;
  startTime: number;
  maxSeekTime: number;
  savedVisibility: string;
  savedTranslate: string;
  putMarkBack: (() => void) | null;
}

// ---------------------------------------------------------------------------
// Extracted helpers — pure functions, no refs, no React.
// ---------------------------------------------------------------------------

function readBasePosition(element: HTMLElement, iframeEl: HTMLIFrameElement): BasePosition {
  let baseOpacity = 1;
  let baseScale = 1;
  let baseX = 0;
  let baseY = 0;

  try {
    const gsap = (
      iframeEl.contentWindow as Window & {
        gsap?: { getProperty: (el: Element, prop: string) => number };
      }
    ).gsap;
    if (gsap?.getProperty) {
      baseOpacity = Number(gsap.getProperty(element, "opacity")) || 1;
      baseScale = Number(gsap.getProperty(element, "scaleX")) || 1;
      baseX = Number(gsap.getProperty(element, "x")) || 0;
      baseY = Number(gsap.getProperty(element, "y")) || 0;
    }
  } catch {
    /* cross-origin guard */
  }

  // Path-offset CSS vars live on the element regardless of whether
  // translate is currently var-based or "none" (GSAP-baked).
  const cssOffX = Number.parseFloat(element.style.getPropertyValue("--hf-studio-offset-x")) || 0;
  const cssOffY = Number.parseFloat(element.style.getPropertyValue("--hf-studio-offset-y")) || 0;
  const translateVal = element.style.translate ?? "";
  if (translateVal.includes("var(")) {
    baseX += cssOffX;
    baseY += cssOffY;
  }

  return { baseX, baseY, baseOpacity, baseScale, cssOffX, cssOffY };
}

function connectGsapRuntime(
  element: HTMLElement,
  iframeEl: HTMLIFrameElement,
  elementEndTime: number | undefined,
): GsapRuntime | null {
  try {
    const win = iframeEl.contentWindow as Window & {
      gsap?: { set: (t: Element, v: Record<string, number | string>) => void };
      __timelines?: Record<string, { seek: (t: number) => void; duration: () => number }>;
      __player?: { getTime: () => number };
    };
    // Pick the first REAL timeline. `__timelines` also carries the studio's
    // `__proxied` marker (a boolean, no `.seek`); `Object.values(...)[0]` would grab
    // it and fail the connect — the cause of the no-live-preview gesture bug.
    const tl = win?.__timelines
      ? (Object.entries(win.__timelines).find(
          ([key, value]) => key !== "__proxied" && typeof value?.seek === "function",
        )?.[1] ?? null)
      : null;
    if (win?.gsap?.set && tl?.seek && element.id) {
      const tlDuration = tl.duration();
      return {
        timeline: tl,
        gsap: win.gsap,
        element,
        startTime: win.__player?.getTime() ?? 0,
        maxSeekTime:
          elementEndTime != null && elementEndTime < tlDuration ? elementEndTime : tlDuration,
        savedVisibility: element.style.visibility,
        savedTranslate: element.style.getPropertyValue("translate"),
        putMarkBack: null,
      };
    }
  } catch {
    /* connect failed */
  }
  return null;
}

function applyRuntimePreview(
  runtime: GsapRuntime,
  time: number,
  properties: Record<string, number>,
): void {
  const seekTime = Math.min(runtime.startTime + time, runtime.maxSeekTime);
  runtime.timeline.seek(seekTime);
  runtime.element.style.setProperty("translate", "none");
  runtime.gsap.set(runtime.element, { ...properties });
  const putMarkBack = revealClip(runtime.element);
  runtime.putMarkBack ??= putMarkBack;
  liveTime.notify(seekTime);
  usePlayerStore.getState().setCurrentTime(seekTime);
}

function recordSample(r: RecordingRefs, time: number, properties: Record<string, number>): void {
  // Record the FULL position the live preview shows (element centered on the
  // pointer, with any manual path offset folded into basePosition). Do NOT
  // subtract the path offset: when this gesture commits as a position tween the
  // server strips the element's --hf-studio-offset (the tween owns position — see
  // stripStudioEditsFromTarget in studio-api), so the keyframes must already
  // include it. Subtracting it made the committed gesture play shoved off by the
  // offset (the offset was removed twice).
  const fps = useLinkedClipPreferences.getState().compositionFps;
  const frame = secondsToFrame(time, fps);
  const sample = { time: frameToSeconds(frame, fps), properties: { ...properties } };
  const lastIndex = r.samples.length - 1;
  const lastSample = r.samples[lastIndex];
  // Gesture events follow the display refresh rate (often 60/120Hz), but the
  // composition has its own frame rate. Keep the latest pointer state for each
  // output frame so recording cannot create visually indistinguishable piles.
  if (lastSample?.time === sample.time) {
    r.samples[lastIndex] = sample;
  } else {
    r.samples.push(sample);
  }
  r.trail.push({ x: r.pointer.x, y: r.pointer.y });
}

function computeIframeScale(iframeEl: HTMLIFrameElement): number {
  const iframeRect = iframeEl.getBoundingClientRect();
  const doc = iframeEl.contentDocument;
  const root = doc?.querySelector<HTMLElement>("[data-composition-id]") ?? doc?.documentElement;
  const declaredWidth = Number(root?.getAttribute("data-width")) || 1920;
  return declaredWidth > 0 ? iframeRect.width / declaredWidth : 1;
}

function resolveGestureProperties(
  dx: number,
  dy: number,
  scrollDelta: number,
  modifiers: Modifiers,
  accumulatedState: AccumulatedState,
): {
  properties: Record<string, number>;
  nextState: AccumulatedState;
} {
  const properties: Record<string, number> = {};
  let nextOpacity = accumulatedState.opacity;
  let nextScale = accumulatedState.scale;
  let nextZ = accumulatedState.z;

  if (modifiers.meta) {
    // Opacity derived from total vertical displacement (absolute, not accumulated).
    // Dragging down reduces opacity; dragging back up restores it.
    nextOpacity = Math.max(0, Math.min(1, 1 - dy * 0.005));
    properties.opacity = nextOpacity;
    if (scrollDelta !== 0) {
      nextScale = Math.max(0.01, accumulatedState.scale + scrollDelta * 0.01);
      properties.scale = nextScale;
    }
  } else if (modifiers.shift) {
    properties.rotationX = dy * 0.5;
    properties.rotationY = dx * 0.5;
  } else if (modifiers.alt) {
    properties.rotation = dx * 0.5;
  } else {
    properties.x = dx;
    properties.y = dy;
  }

  if (!modifiers.meta && scrollDelta !== 0) {
    nextZ = accumulatedState.z + scrollDelta;
    properties.z = nextZ;
  }

  return {
    properties,
    nextState: { opacity: nextOpacity, scale: nextScale, z: nextZ },
  };
}

// ---------------------------------------------------------------------------
// Grouped mutable state carried across the recording session.
// Replaces 14 individual useRef calls with a single ref object.
// ---------------------------------------------------------------------------

interface RecordingRefs {
  pointer: { x: number; y: number };
  startPointer: { x: number; y: number };
  hasMoved: boolean;
  scrollDelta: number;
  modifiers: Modifiers;
  accumulated: AccumulatedState;
  basePosition: { x: number; y: number };
  cssVarOffset: { x: number; y: number };
  scale: number;
  runtime: GsapRuntime | null;
  rafId: number;
  samples: GestureSample[];
  trail: Array<{ x: number; y: number }>;
  cleanup: (() => void) | null;
}

function createRecordingRefs(): RecordingRefs {
  return {
    pointer: { x: 0, y: 0 },
    startPointer: { x: 0, y: 0 },
    hasMoved: false,
    scrollDelta: 0,
    modifiers: { shift: false, alt: false, meta: false },
    accumulated: { opacity: 1, scale: 1, z: 0 },
    basePosition: { x: 0, y: 0 },
    cssVarOffset: { x: 0, y: 0 },
    scale: 1,
    runtime: null,
    rafId: 0,
    samples: [],
    trail: [],
    cleanup: null,
  };
}

function releaseRuntimePreview(r: RecordingRefs): void {
  const runtime = r.runtime;
  if (!runtime) return;
  const { element, savedVisibility, savedTranslate } = runtime;
  element.style.visibility = savedVisibility;
  runtime.putMarkBack?.();
  element.style.setProperty("translate", savedTranslate || "");
  try {
    runtime.gsap.set(runtime.element, {
      clearProps: "x,y,scale,scaleX,scaleY,rotation,rotationX,rotationY,opacity,z",
    });
  } catch {
    /* runtime gone */
  }
  if (r.cssVarOffset.x || r.cssVarOffset.y) {
    element.style.setProperty("--hf-studio-offset-x", `${r.cssVarOffset.x}px`);
    element.style.setProperty("--hf-studio-offset-y", `${r.cssVarOffset.y}px`);
  }
  r.runtime = null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGestureRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Synchronous guard — immune to React's async state batching.
  // startRecording and stopRecording check this ref, not the useState value.
  const isRecordingRef = useRef(false);

  const refs = useRef<RecordingRefs>(createRecordingRefs());

  // Stable reference aliases for the return value — consumers read these directly.
  const samplesRef = useRef<GestureSample[]>(refs.current.samples);
  const trailRef = useRef<Array<{ x: number; y: number }>>(refs.current.trail);

  // Unmount safety: cancel RAF + remove listeners if component tears down mid-recording.
  useEffect(() => {
    const r = refs.current;
    return () => {
      isRecordingRef.current = false;
      releaseRuntimePreview(r);
      r.cleanup?.();
      r.cleanup = null;
    };
  }, []);

  const startRecording = useCallback(
    (element: HTMLElement, iframeEl: HTMLIFrameElement, elementEndTime?: number) => {
      if (isRecordingRef.current) return;
      isRecordingRef.current = true;

      const r = refs.current;
      r.samples = [];
      r.trail = [];
      r.hasMoved = false;
      r.scrollDelta = 0;
      samplesRef.current = r.samples;
      trailRef.current = r.trail;
      setRecordingDuration(0);

      // --- Phase 1: Read base position from GSAP + CSS vars ---
      const base = readBasePosition(element, iframeEl);
      r.cssVarOffset = { x: base.cssOffX, y: base.cssOffY };
      r.accumulated = { opacity: base.baseOpacity, scale: base.baseScale, z: 0 };
      r.basePosition = { x: base.baseX, y: base.baseY };

      // --- Phase 2: iframe → studio scale, measured BEFORE clearing the path offset ---
      // The pointer deltas in the RAF loop are in studio-viewport pixels; divide by
      // this scale to convert them to the iframe's composition pixels.
      r.scale = computeIframeScale(iframeEl);

      // --- Phase 3: Connect to the iframe GSAP runtime ---
      r.runtime = connectGsapRuntime(element, iframeEl, elementEndTime);
      // Clear the optimistic path offset only while a live runtime owns the
      // preview. releaseRuntimePreview restores it on every exit path.
      if (r.runtime && (base.cssOffX || base.cssOffY)) {
        element.style.setProperty("--hf-studio-offset-x", "0px");
        element.style.setProperty("--hf-studio-offset-y", "0px");
      }

      // --- Phase 5: Attach event listeners ---
      const handlePointerMove = (e: PointerEvent) => {
        r.pointer = { x: e.clientX, y: e.clientY };
        r.modifiers = { shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey };
      };

      const handleWheel = (e: WheelEvent) => {
        // Capture startPointer on first wheel if no pointermove has fired yet,
        // preventing an enormous bogus first keyframe from stale startPointer.
        if (!r.hasMoved) {
          r.startPointer = { x: r.pointer.x, y: r.pointer.y };
          r.hasMoved = true;
        }
        r.scrollDelta += e.deltaY;
        r.modifiers = { shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey };
      };

      const handleKeyChange = (e: KeyboardEvent) => {
        r.modifiers = { shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey };
      };

      document.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("wheel", handleWheel, { passive: true });
      document.addEventListener("keydown", handleKeyChange, { passive: true });
      document.addEventListener("keyup", handleKeyChange, { passive: true });

      const startMs = performance.now();

      r.startPointer = { ...r.pointer };
      const captureStart = (e: PointerEvent) => {
        if (!r.hasMoved) {
          // Anchor the delta at the grab point — the element then moves by the
          // pointer's *movement* from its actual position (preserving both the
          // manual-drag start position and the grab offset). Do NOT snap the
          // element's center to the pointer: that discarded the manual position
          // and made the recorded 0% keyframe wrong.
          r.startPointer = { x: e.clientX, y: e.clientY };
          r.hasMoved = true;
        }
      };
      document.addEventListener("pointermove", captureStart, { passive: true, once: true });

      // --- Phase 6: RAF tick loop ---
      const tick = () => {
        if (!isRecordingRef.current) return;
        const now = performance.now();
        const time = (now - startMs) / 1000;

        const scale = r.scale || 1;
        const dx = (r.pointer.x - r.startPointer.x) / scale;
        const dy = (r.pointer.y - r.startPointer.y) / scale;
        const scrollDelta = r.scrollDelta;

        if (!r.hasMoved && dx === 0 && dy === 0 && scrollDelta === 0) {
          r.rafId = requestAnimationFrame(tick);
          return;
        }
        r.hasMoved = true;

        const { properties, nextState } = resolveGestureProperties(
          dx,
          dy,
          scrollDelta,
          r.modifiers,
          r.accumulated,
        );
        if ("x" in properties) properties.x = Math.round(r.basePosition.x + properties.x);
        if ("y" in properties) properties.y = Math.round(r.basePosition.y + properties.y);

        r.accumulated = nextState;
        r.scrollDelta = 0;

        if (r.runtime) {
          try {
            applyRuntimePreview(r.runtime, time, properties);
          } catch {
            // Preview failed — disable it for the rest of the gesture (recording
            // continues). `r.runtime` is nulled so we don't retry on every frame.
            releaseRuntimePreview(r);
          }
        }

        recordSample(r, time, properties);

        setRecordingDuration(time);
        r.rafId = requestAnimationFrame(tick);
      };

      setIsRecording(true);
      r.rafId = requestAnimationFrame(tick);

      r.cleanup = () => {
        cancelAnimationFrame(r.rafId);
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("wheel", handleWheel);
        document.removeEventListener("keydown", handleKeyChange);
        document.removeEventListener("keyup", handleKeyChange);
        document.removeEventListener("pointermove", captureStart);
      };
    },
    [], // No deps — uses refs only for all mutable state
  );

  const stopRecording = useCallback((): GestureSample[] => {
    if (!isRecordingRef.current) return [];
    isRecordingRef.current = false;
    const r = refs.current;
    releaseRuntimePreview(r);
    r.cleanup?.();
    r.cleanup = null;
    const frozen = r.samples.slice();
    setRecordingDuration(frozen.length > 0 ? (frozen[frozen.length - 1]?.time ?? 0) : 0);
    setIsRecording(false);
    return frozen;
  }, []); // No deps — uses refs only

  const clearSamples = useCallback(() => {
    const r = refs.current;
    r.samples = [];
    r.trail = [];
    samplesRef.current = r.samples;
    trailRef.current = r.trail;
    setRecordingDuration(0);
    r.accumulated = { opacity: 1, scale: 1, z: 0 };
    r.scrollDelta = 0;
  }, []);

  return {
    startRecording,
    stopRecording,
    isRecording,
    samplesRef,
    trailRef,
    recordingDuration,
    clearSamples,
  };
}
