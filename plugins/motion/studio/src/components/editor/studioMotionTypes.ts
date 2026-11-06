// ── Types and Constants for Studio Motion ──

export const STUDIO_MOTION_PATH = ".hyperframes/studio-motion.json";
export const STUDIO_MOTION_TIMELINE_ID = "studio-motion";

export const STUDIO_MOTION_ATTR = "data-hf-studio-motion";
export const STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR = "data-hf-studio-motion-original-transform";
export const STUDIO_MOTION_ORIGINAL_OPACITY_ATTR = "data-hf-studio-motion-original-opacity";
export const STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR = "data-hf-studio-motion-original-visibility";

export interface StudioMotionTarget {
  sourceFile: string;
  selector?: string;
  selectorIndex?: number;
  id?: string;
}

export interface StudioGsapMotionValues {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  autoAlpha?: number;
}

export interface StudioGsapCustomEase {
  id: string;
  data: string;
}

export interface StudioCustomEaseControlPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface StudioGsapMotion {
  kind: "gsap-motion";
  target: StudioMotionTarget;
  start: number;
  duration: number;
  ease: string;
  customEase?: StudioGsapCustomEase;
  from: StudioGsapMotionValues;
  to: StudioGsapMotionValues;
  updatedAt?: string;
}

export type StudioGsapMotionPreset = "fade-up" | "slide" | "pop";
export type StudioGsapMotionDirection = "up" | "down" | "left" | "right";

export const STUDIO_GSAP_EASE_OPTIONS = [
  "none",
  "power1.in",
  "power1.out",
  "power1.inOut",
  "power2.in",
  "power2.out",
  "power2.inOut",
  "power3.in",
  "power3.out",
  "power3.inOut",
  "power4.in",
  "power4.out",
  "power4.inOut",
  "sine.in",
  "sine.out",
  "sine.inOut",
  "expo.in",
  "expo.out",
  "expo.inOut",
  "circ.in",
  "circ.out",
  "circ.inOut",
  "back.in(1.7)",
  "back.out(1.7)",
  "back.inOut(1.7)",
  "elastic.out(1, 0.45)",
  "bounce.out",
] as const;

export const DEFAULT_CUSTOM_EASE_POINTS: StudioCustomEaseControlPoints = {
  x1: 0.215,
  y1: 0.61,
  x2: 0.355,
  y2: 1,
};

export const GSAP_EASE_CONTROL_POINTS: Record<string, StudioCustomEaseControlPoints> = {
  none: { x1: 0, y1: 0, x2: 1, y2: 1 },
  "power1.in": { x1: 0.55, y1: 0.085, x2: 0.68, y2: 0.53 },
  "power1.out": { x1: 0.25, y1: 0.46, x2: 0.45, y2: 0.94 },
  "power1.inOut": { x1: 0.455, y1: 0.03, x2: 0.515, y2: 0.955 },
  "power2.in": { x1: 0.55, y1: 0.055, x2: 0.675, y2: 0.19 },
  "power2.out": { x1: 0.215, y1: 0.61, x2: 0.355, y2: 1 },
  "power2.inOut": { x1: 0.645, y1: 0.045, x2: 0.355, y2: 1 },
  "power3.in": { x1: 0.895, y1: 0.03, x2: 0.685, y2: 0.22 },
  "power3.out": { x1: 0.165, y1: 0.84, x2: 0.44, y2: 1 },
  "power3.inOut": { x1: 0.77, y1: 0, x2: 0.175, y2: 1 },
  "power4.in": { x1: 0.755, y1: 0.05, x2: 0.855, y2: 0.06 },
  "power4.out": { x1: 0.23, y1: 1, x2: 0.32, y2: 1 },
  "power4.inOut": { x1: 0.86, y1: 0, x2: 0.07, y2: 1 },
  "sine.in": { x1: 0.47, y1: 0, x2: 0.745, y2: 0.715 },
  "sine.out": { x1: 0.39, y1: 0.575, x2: 0.565, y2: 1 },
  "sine.inOut": { x1: 0.445, y1: 0.05, x2: 0.55, y2: 0.95 },
  "expo.in": { x1: 0.95, y1: 0.05, x2: 0.795, y2: 0.035 },
  "expo.out": { x1: 0.19, y1: 1, x2: 0.22, y2: 1 },
  "expo.inOut": { x1: 1, y1: 0, x2: 0, y2: 1 },
  "circ.in": { x1: 0.6, y1: 0.04, x2: 0.98, y2: 0.335 },
  "circ.out": { x1: 0.075, y1: 0.82, x2: 0.165, y2: 1 },
  "circ.inOut": { x1: 0.785, y1: 0.135, x2: 0.15, y2: 0.86 },
  "back.in(1.7)": { x1: 0.6, y1: -0.28, x2: 0.735, y2: 0.045 },
  "back.out(1.7)": { x1: 0.175, y1: 0.885, x2: 0.32, y2: 1.275 },
  "back.inOut(1.7)": { x1: 0.68, y1: -0.55, x2: 0.265, y2: 1.55 },
  "elastic.out(1, 0.45)": { x1: 0.16, y1: 1.32, x2: 0.28, y2: 0.86 },
  "bounce.out": { x1: 0.34, y1: 1.56, x2: 0.64, y2: 0.74 },
};

export const CUSTOM_EASE_DATA_PATTERN =
  /^M\s*0\s*,\s*0\s*C\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+1\s*,\s*1\s*$/i;

export interface StudioGsapPresetMotionOptions {
  start: number;
  duration: number;
  distance: number;
  ease: string;
  direction?: StudioGsapMotionDirection;
  customEase?: StudioGsapCustomEase;
}

export interface StudioMotionManifest {
  version: 1;
  motions: StudioGsapMotion[];
}

export interface StudioGsapTimeline {
  fromTo?: (
    target: HTMLElement,
    from: Record<string, unknown>,
    to: Record<string, unknown>,
    at: number,
  ) => StudioGsapTimeline;
  time?: (time: number) => StudioGsapTimeline;
  totalTime?: (time: number, suppressEvents?: boolean) => StudioGsapTimeline;
  pause?: () => StudioGsapTimeline;
  kill?: () => void;
  duration?: () => number;
}

export type StudioMotionWindow = Window & {
  gsap?: {
    timeline?: (vars?: Record<string, unknown>) => StudioGsapTimeline;
    set?: (target: HTMLElement, vars: Record<string, unknown>) => void;
    registerPlugin?: (...plugins: unknown[]) => void;
  };
  CustomEase?: { create?: (id: string, data: string) => void };
  __player?: {
    getTime?: () => number;
    renderSeek?: (time: number) => void;
    seek?: (time: number) => void;
  };
  __timeline?: { time?: () => number };
  __timelines?: Record<string, StudioGsapTimeline | undefined>;
  __hfStudioMotionApply?: () => number;
  __hfStudioMotionWrapped?: boolean;
};
