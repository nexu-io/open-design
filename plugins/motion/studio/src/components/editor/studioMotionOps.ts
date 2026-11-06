// ── Manifest parse, serialize, and CRUD operations ──

import type { DomEditSelection } from "./domEditing";
import {
  DEFAULT_CUSTOM_EASE_POINTS,
  GSAP_EASE_CONTROL_POINTS,
  CUSTOM_EASE_DATA_PATTERN,
  STUDIO_MOTION_ATTR,
  STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR,
  STUDIO_MOTION_ORIGINAL_OPACITY_ATTR,
  STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR,
  type StudioCustomEaseControlPoints,
  type StudioGsapCustomEase,
  type StudioGsapMotion,
  type StudioGsapMotionPreset,
  type StudioGsapPresetMotionOptions,
  type StudioGsapMotionValues,
  type StudioMotionManifest,
  type StudioMotionTarget,
} from "./studioMotionTypes";
import { roundTo3 } from "../../utils/rounding";

// ── Private helpers ──

function clampPositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampNonNegativeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sanitizeEase(value: string): string {
  return value.trim() || "none";
}

function roundEaseNumber(value: number): number {
  return roundTo3(value);
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function formatEaseNumber(value: number): string {
  const rounded = roundEaseNumber(value);
  if (Object.is(rounded, -0)) return "0";
  return `${rounded}`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ── Custom ease points ──

export function clampStudioCustomEasePoints(
  points: Partial<StudioCustomEaseControlPoints>,
): StudioCustomEaseControlPoints {
  return {
    x1: roundEaseNumber(clampRange(points.x1 ?? DEFAULT_CUSTOM_EASE_POINTS.x1, 0, 1, 0.215)),
    y1: roundEaseNumber(clampRange(points.y1 ?? DEFAULT_CUSTOM_EASE_POINTS.y1, -0.6, 1.6, 0.61)),
    x2: roundEaseNumber(clampRange(points.x2 ?? DEFAULT_CUSTOM_EASE_POINTS.x2, 0, 1, 0.355)),
    y2: roundEaseNumber(clampRange(points.y2 ?? DEFAULT_CUSTOM_EASE_POINTS.y2, -0.6, 1.6, 1)),
  };
}

export function parseStudioCustomEaseData(
  data: string | undefined,
): StudioCustomEaseControlPoints | null {
  if (!data) return null;
  const match = data.trim().match(CUSTOM_EASE_DATA_PATTERN);
  if (!match) return null;
  const points = {
    x1: Number.parseFloat(match[1] ?? ""),
    y1: Number.parseFloat(match[2] ?? ""),
    x2: Number.parseFloat(match[3] ?? ""),
    y2: Number.parseFloat(match[4] ?? ""),
  };
  if (!Object.values(points).every(Number.isFinite)) return null;
  return clampStudioCustomEasePoints(points);
}

export function serializeStudioCustomEaseData(points: StudioCustomEaseControlPoints): string {
  const clamped = clampStudioCustomEasePoints(points);
  return `M0,0 C${formatEaseNumber(clamped.x1)},${formatEaseNumber(clamped.y1)} ${formatEaseNumber(clamped.x2)},${formatEaseNumber(clamped.y2)} 1,1`;
}

export function controlPointsForGsapEase(ease: string): StudioCustomEaseControlPoints {
  return GSAP_EASE_CONTROL_POINTS[ease] ?? DEFAULT_CUSTOM_EASE_POINTS;
}

// ── Preset motion builder ──

export function buildStudioGsapPresetMotion(
  preset: StudioGsapMotionPreset,
  options: StudioGsapPresetMotionOptions,
): Omit<StudioGsapMotion, "kind" | "target" | "updatedAt"> {
  const start = clampNonNegativeNumber(options.start, 0);
  const duration = clampPositiveNumber(options.duration, 0.6);
  const distance = clampPositiveNumber(options.distance, 32);
  const ease = sanitizeEase(options.ease);
  const direction = options.direction ?? "up";
  const base = { start, duration, ease, customEase: options.customEase };

  if (preset === "pop") {
    return {
      ...base,
      from: { scale: 0.88, autoAlpha: 0 },
      to: { scale: 1, autoAlpha: 1 },
    };
  }

  if (preset === "slide") {
    const x = direction === "right" ? -distance : direction === "left" ? distance : 0;
    const y = direction === "down" ? -distance : direction === "up" ? distance : 0;
    return {
      ...base,
      from: { x, y, autoAlpha: 0 },
      to: { x: 0, y: 0, autoAlpha: 1 },
    };
  }

  return {
    ...base,
    from: { y: direction === "down" ? -distance : distance, autoAlpha: 0 },
    to: { y: 0, autoAlpha: 1 },
  };
}

// ── Manifest parse/serialize ──

function parseMotionValues(value: unknown): StudioGsapMotionValues | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const parsed: StudioGsapMotionValues = {};
  for (const key of ["x", "y", "scale", "rotation", "opacity", "autoAlpha"] as const) {
    const next = finiteNumber(record[key]);
    if (next != null) parsed[key] = next;
  }
  return Object.keys(parsed).length > 0 ? parsed : null;
}

function parseTarget(value: unknown): StudioMotionTarget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sourceFile = typeof record.sourceFile === "string" ? record.sourceFile : "";
  if (!sourceFile) return null;
  const selector = typeof record.selector === "string" ? record.selector : undefined;
  const id = typeof record.id === "string" ? record.id : undefined;
  if (!selector && !id) return null;
  return {
    sourceFile,
    selector,
    selectorIndex: finiteNumber(record.selectorIndex) ?? undefined,
    id,
  };
}

function parseCustomEase(value: unknown): StudioGsapCustomEase | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const data = typeof record.data === "string" ? record.data.trim() : "";
  if (!id || !data) return undefined;
  return { id, data };
}

function parseGsapMotion(value: unknown): StudioGsapMotion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "gsap-motion") return null;
  const target = parseTarget(record.target);
  if (!target) return null;
  const start = finiteNumber(record.start);
  const duration = finiteNumber(record.duration);
  if (start == null || duration == null || start < 0 || duration <= 0) return null;
  const ease = typeof record.ease === "string" && record.ease.trim() ? record.ease.trim() : "none";
  const from = parseMotionValues(record.from);
  const to = parseMotionValues(record.to);
  if (!from || !to) return null;
  return {
    kind: "gsap-motion",
    target,
    start,
    duration,
    ease,
    customEase: parseCustomEase(record.customEase),
    from,
    to,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

export function emptyStudioMotionManifest(): StudioMotionManifest {
  return { version: 1, motions: [] };
}

export function parseStudioMotionManifest(content: string): StudioMotionManifest {
  if (!content.trim()) return emptyStudioMotionManifest();
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyStudioMotionManifest();
    const motions = (parsed as { motions?: unknown }).motions;
    if (!Array.isArray(motions)) return emptyStudioMotionManifest();
    return {
      version: 1,
      motions: motions
        .map(parseGsapMotion)
        .filter((motion): motion is StudioGsapMotion => motion !== null),
    };
  } catch {
    return emptyStudioMotionManifest();
  }
}

export function serializeStudioMotionManifest(manifest: StudioMotionManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// ── Path helpers ──

function normalizeStudioFileChangePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "");
}

export function isStudioMotionManifestPath(path: string | null): boolean {
  if (!path) return false;
  const normalized = normalizeStudioFileChangePath(path);
  return (
    normalized === "." + "/" + ".hyperframes/studio-motion.json".slice(1) ||
    normalized === ".hyperframes/studio-motion.json" ||
    normalized.endsWith("/.hyperframes/studio-motion.json")
  );
}

// ── CRUD helpers ──

function selectionTarget(selection: DomEditSelection): StudioMotionTarget {
  return {
    sourceFile: selection.sourceFile || "index.html",
    selector: selection.selector,
    selectorIndex: selection.selectorIndex,
    id: selection.id ?? undefined,
  };
}

function targetKey(target: StudioMotionTarget): string {
  return [
    target.sourceFile,
    target.id ? `id:${target.id}` : "",
    target.selector ? `selector:${target.selector}` : "",
    target.selectorIndex != null ? `index:${target.selectorIndex}` : "",
  ].join("|");
}

function sameSelectionTarget(motion: StudioGsapMotion, selection: DomEditSelection): boolean {
  const target = selectionTarget(selection);
  if (motion.target.sourceFile !== target.sourceFile) return false;
  if (motion.target.id && target.id && motion.target.id === target.id) return true;
  return targetKey(motion.target) === targetKey(target);
}

export function upsertStudioGsapMotion(
  manifest: StudioMotionManifest,
  selection: DomEditSelection,
  motion: Omit<StudioGsapMotion, "kind" | "target" | "updatedAt">,
): StudioMotionManifest {
  const target = selectionTarget(selection);
  const nextMotion: StudioGsapMotion = {
    kind: "gsap-motion",
    target,
    ...motion,
    updatedAt: new Date().toISOString(),
  };
  return {
    version: 1,
    motions: [
      ...manifest.motions.filter((existing) => targetKey(existing.target) !== targetKey(target)),
      nextMotion,
    ],
  };
}

export function removeStudioMotionForSelection(
  manifest: StudioMotionManifest,
  selection: DomEditSelection,
): StudioMotionManifest {
  return {
    version: 1,
    motions: manifest.motions.filter((motion) => !sameSelectionTarget(motion, selection)),
  };
}

export function getStudioMotionForSelection(
  manifest: StudioMotionManifest,
  selection: DomEditSelection,
): StudioGsapMotion | null {
  return manifest.motions.find((motion) => sameSelectionTarget(motion, selection)) ?? null;
}

// ── HTML-attribute–backed motion storage ──

/** The JSON stored in the attribute omits kind/target/updatedAt — those are derived from context. */
interface StudioMotionAttrPayload {
  start: number;
  duration: number;
  ease: string;
  customEase?: StudioGsapCustomEase;
  from: StudioGsapMotionValues;
  to: StudioGsapMotionValues;
}

export function readStudioMotionFromElement(
  element: HTMLElement,
): Omit<StudioGsapMotion, "kind" | "target" | "updatedAt"> | null {
  const json = element.getAttribute(STUDIO_MOTION_ATTR);
  if (!json || json === "true") return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const start = finiteNumber(record.start);
    const duration = finiteNumber(record.duration);
    if (start == null || duration == null || start < 0 || duration <= 0) return null;
    const ease =
      typeof record.ease === "string" && record.ease.trim() ? record.ease.trim() : "none";
    const from = parseMotionValues(record.from);
    const to = parseMotionValues(record.to);
    if (!from || !to) return null;
    return { start, duration, ease, customEase: parseCustomEase(record.customEase), from, to };
  } catch {
    return null;
  }
}

export function writeStudioMotionToElement(
  element: HTMLElement,
  motion: Omit<StudioGsapMotion, "kind" | "target" | "updatedAt">,
): void {
  // Capture original styles before first write (only if not already captured)
  if (!element.getAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR)) {
    element.setAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR, element.style.transform);
    element.setAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR, element.style.opacity);
    element.setAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR, element.style.visibility);
  }
  const payload: StudioMotionAttrPayload = {
    start: motion.start,
    duration: motion.duration,
    ease: motion.ease,
    from: motion.from,
    to: motion.to,
  };
  if (motion.customEase) payload.customEase = motion.customEase;
  element.setAttribute(STUDIO_MOTION_ATTR, JSON.stringify(payload));
}

export function clearStudioMotionFromElement(
  element: HTMLElement,
  gsap?: { set?: (target: HTMLElement, vars: Record<string, unknown>) => void },
): void {
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
