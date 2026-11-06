// Public surface — re-exports types, constants, and ops; owns DOM application logic.

export {
  STUDIO_MOTION_PATH,
  STUDIO_MOTION_TIMELINE_ID,
  STUDIO_GSAP_EASE_OPTIONS,
  type StudioMotionTarget,
  type StudioGsapMotionValues,
  type StudioGsapCustomEase,
  type StudioCustomEaseControlPoints,
  type StudioGsapMotion,
  type StudioGsapMotionPreset,
  type StudioGsapMotionDirection,
  type StudioGsapPresetMotionOptions,
  type StudioMotionManifest,
  type StudioGsapTimeline,
  type StudioMotionWindow,
} from "./studioMotionTypes";

export {
  clampStudioCustomEasePoints,
  parseStudioCustomEaseData,
  serializeStudioCustomEaseData,
  controlPointsForGsapEase,
  buildStudioGsapPresetMotion,
  emptyStudioMotionManifest,
  parseStudioMotionManifest,
  serializeStudioMotionManifest,
  isStudioMotionManifestPath,
  upsertStudioGsapMotion,
  removeStudioMotionForSelection,
  getStudioMotionForSelection,
  readStudioMotionFromElement,
  writeStudioMotionToElement,
  clearStudioMotionFromElement,
} from "./studioMotionOps";

import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import { readStudioMotionFromElement as readMotionAttr } from "./studioMotionOps";
import {
  STUDIO_MOTION_ATTR,
  STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR,
  STUDIO_MOTION_ORIGINAL_OPACITY_ATTR,
  STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR,
  STUDIO_MOTION_TIMELINE_ID,
  type StudioGsapMotion,
  type StudioGsapMotionValues,
  type StudioMotionManifest,
  type StudioMotionTarget,
  type StudioMotionWindow,
} from "./studioMotionTypes";

// ── DOM Helpers ──

function sourceFileForElement(element: HTMLElement, activeCompositionPath: string | null): string {
  let current: HTMLElement | null = element;
  while (current) {
    const sourceFile =
      current.getAttribute("data-composition-file") ?? current.getAttribute("data-composition-src");
    if (sourceFile) return sourceFile;
    current = current.parentElement;
  }
  return activeCompositionPath ?? "index.html";
}

function elementMatchesSourceFile(
  element: HTMLElement,
  sourceFile: string,
  activeCompositionPath: string | null,
): boolean {
  return sourceFileForElement(element, activeCompositionPath) === sourceFile;
}

function querySelectorCandidates(document: Document, selector: string): HTMLElement[] {
  const className = selector.match(/^\.([A-Za-z0-9_-]+)$/)?.[1];
  if (className) {
    return Array.from(document.getElementsByTagName("*")).filter(
      (element): element is HTMLElement =>
        isHtmlElement(element) && element.classList.contains(className),
    );
  }
  if (/^[A-Za-z][A-Za-z0-9-]*$/.test(selector)) {
    return Array.from(document.getElementsByTagName(selector)).filter(isHtmlElement);
  }
  return Array.from(document.querySelectorAll(selector)).filter(isHtmlElement);
}

function resolveTarget(
  document: Document,
  target: StudioMotionTarget,
  activeCompositionPath: string | null,
): HTMLElement | null {
  if (target.id) {
    const byId = document.getElementById(target.id);
    if (
      isHtmlElement(byId) &&
      elementMatchesSourceFile(byId, target.sourceFile, activeCompositionPath)
    ) {
      return byId;
    }
  }
  if (!target.selector) return null;
  try {
    const matches = querySelectorCandidates(document, target.selector).filter((element) =>
      elementMatchesSourceFile(element, target.sourceFile, activeCompositionPath),
    );
    return matches[Math.max(0, Math.floor(target.selectorIndex ?? 0))] ?? null;
  } catch {
    return null;
  }
}

function captureOriginalMotionStyles(element: HTMLElement): void {
  if (element.hasAttribute(STUDIO_MOTION_ATTR)) return;
  element.setAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR, element.style.transform);
  element.setAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR, element.style.opacity);
  element.setAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR, element.style.visibility);
}

function restoreStudioMotionElement(element: HTMLElement, gsap: StudioMotionWindow["gsap"]): void {
  if (!element.hasAttribute(STUDIO_MOTION_ATTR)) return;
  gsap?.set?.(element, { clearProps: "transform,opacity,visibility" });
  element.style.transform = element.getAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR) ?? "";
  element.style.opacity = element.getAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR) ?? "";
  element.style.visibility = element.getAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR) ?? "";
  element.removeAttribute(STUDIO_MOTION_ATTR);
  element.removeAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR);
  element.removeAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR);
  element.removeAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR);
}

function restoreStudioMotionElements(document: Document, gsap: StudioMotionWindow["gsap"]): void {
  for (const element of Array.from(document.querySelectorAll(`[${STUDIO_MOTION_ATTR}]`))) {
    if (isHtmlElement(element)) restoreStudioMotionElement(element, gsap);
  }
}

function resolveGsapEase(win: StudioMotionWindow, motion: StudioGsapMotion): string {
  const customEase = motion.customEase;
  if (!customEase) return motion.ease;
  const customEasePlugin = win.CustomEase;
  if (typeof customEasePlugin?.create !== "function") return motion.ease;
  try {
    win.gsap?.registerPlugin?.(customEasePlugin);
    customEasePlugin.create(customEase.id, customEase.data);
    return customEase.id;
  } catch {
    return motion.ease;
  }
}

function readCurrentTime(win: StudioMotionWindow, fallback?: number): number {
  if (typeof fallback === "number" && Number.isFinite(fallback)) return Math.max(0, fallback);
  try {
    const playerTime = win.__player?.getTime?.();
    if (typeof playerTime === "number" && Number.isFinite(playerTime))
      return Math.max(0, playerTime);
  } catch {
    // fall through
  }
  try {
    const timelineTime = win.__timeline?.time?.();
    if (typeof timelineTime === "number" && Number.isFinite(timelineTime)) {
      return Math.max(0, timelineTime);
    }
  } catch {
    // fall through
  }
  return 0;
}

export function applyStudioMotionManifest(
  document: Document,
  manifest: StudioMotionManifest,
  activeCompositionPath: string | null = null,
  currentTime?: number,
): number {
  const win = document.defaultView as StudioMotionWindow | null;
  if (!win) return 0;
  const gsap = win.gsap;
  win.__timelines = win.__timelines ?? {};
  win.__timelines[STUDIO_MOTION_TIMELINE_ID]?.kill?.();
  delete win.__timelines[STUDIO_MOTION_TIMELINE_ID];
  restoreStudioMotionElements(document, gsap);
  if (!gsap?.timeline || manifest.motions.length === 0) return 0;

  const timeline = gsap.timeline({
    paused: true,
    defaults: { overwrite: "auto" },
  });
  let applied = 0;
  for (const motion of manifest.motions) {
    const element = resolveTarget(document, motion.target, activeCompositionPath);
    if (!element || !timeline.fromTo) continue;
    captureOriginalMotionStyles(element);
    element.setAttribute(STUDIO_MOTION_ATTR, "true");
    const fromVars: Record<string, unknown> = { ...motion.from };
    const toVars: Record<string, unknown> = {
      ...motion.to,
      duration: motion.duration,
      ease: resolveGsapEase(win, motion),
      overwrite: "auto",
      immediateRender: false,
    };
    timeline.fromTo(element, fromVars, toVars, motion.start);
    applied += 1;
  }

  if (applied === 0) {
    timeline.kill?.();
    return 0;
  }
  win.__timelines[STUDIO_MOTION_TIMELINE_ID] = timeline;
  timeline.pause?.();
  const safeTime = readCurrentTime(win, currentTime);
  if (timeline.totalTime) timeline.totalTime(safeTime, false);
  else timeline.time?.(safeTime);
  return applied;
}

/**
 * Reads motion data from `data-hf-studio-motion` JSON attributes in the DOM,
 * builds a GSAP timeline, and seeks to the current time.
 * This replaces the manifest-based `applyStudioMotionManifest` for the studio preview.
 */
export function applyStudioMotionFromDom(document: Document, currentTime?: number): number {
  const win = document.defaultView as StudioMotionWindow | null;
  if (!win) return 0;
  const gsap = win.gsap;
  win.__timelines = win.__timelines ?? {};
  win.__timelines[STUDIO_MOTION_TIMELINE_ID]?.kill?.();
  delete win.__timelines[STUDIO_MOTION_TIMELINE_ID];

  // Collect elements that have JSON motion data in their attribute
  const motionElements: Array<{
    element: HTMLElement;
    motion: {
      start: number;
      duration: number;
      ease: string;
      customEase?: { id: string; data: string };
      from: StudioGsapMotionValues;
      to: StudioGsapMotionValues;
    };
  }> = [];

  for (const el of Array.from(document.querySelectorAll(`[${STUDIO_MOTION_ATTR}]`))) {
    if (!isHtmlElement(el)) continue;
    const motionData = readMotionAttr(el);
    if (motionData) {
      motionElements.push({ element: el, motion: motionData });
    }
  }

  if (!gsap?.timeline || motionElements.length === 0) return 0;

  const timeline = gsap.timeline({
    paused: true,
    defaults: { overwrite: "auto" },
  });
  let applied = 0;
  for (const { element, motion } of motionElements) {
    if (!timeline.fromTo) continue;
    // Original styles are already captured when writeStudioMotionToElement was called
    const fromVars: Record<string, unknown> = { ...motion.from };
    const ease = resolveGsapEaseFromPayload(win, motion);
    const toVars: Record<string, unknown> = {
      ...motion.to,
      duration: motion.duration,
      ease,
      overwrite: "auto",
      immediateRender: false,
    };
    timeline.fromTo(element, fromVars, toVars, motion.start);
    applied += 1;
  }

  if (applied === 0) {
    timeline.kill?.();
    return 0;
  }
  win.__timelines[STUDIO_MOTION_TIMELINE_ID] = timeline;
  timeline.pause?.();
  const safeTime = readCurrentTime(win, currentTime);
  if (timeline.totalTime) timeline.totalTime(safeTime, false);
  else timeline.time?.(safeTime);
  return applied;
}

function resolveGsapEaseFromPayload(
  win: StudioMotionWindow,
  motion: { ease: string; customEase?: { id: string; data: string } },
): string {
  const customEase = motion.customEase;
  if (!customEase) return motion.ease;
  const customEasePlugin = win.CustomEase;
  if (typeof customEasePlugin?.create !== "function") return motion.ease;
  try {
    win.gsap?.registerPlugin?.(customEasePlugin);
    customEasePlugin.create(customEase.id, customEase.data);
    return customEase.id;
  } catch {
    return motion.ease;
  }
}

export function installStudioMotionSeekReapply(win: Window, apply: () => void): boolean {
  const studioWin = win as StudioMotionWindow;
  studioWin.__hfStudioMotionApply = () => {
    apply();
    return 0;
  };
  if (studioWin.__hfStudioMotionWrapped) return false;
  const player = studioWin.__player;
  if (!player) return false;

  const wrapPlayerMethod = (key: "renderSeek" | "seek") => {
    const original = player[key];
    if (typeof original !== "function") return;
    player[key] = (time: number) => {
      original.call(player, time);
      studioWin.__hfStudioMotionApply?.();
    };
  };
  wrapPlayerMethod("renderSeek");
  wrapPlayerMethod("seek");
  studioWin.__hfStudioMotionWrapped = true;
  return true;
}
