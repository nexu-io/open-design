import { parseCssColor, type ParsedColor } from "./colorValue";
import { COMMON_LOCAL_FONT_FAMILIES } from "./fontCatalog";
import type { DomEditSelection } from "./domEditing";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import type { TimelineElement } from "../../player";
import { roundToCenti } from "../../utils/rounding";
import { findPreviewNode } from "./domEditingElement";
import {
  playbackStartAttributeForElement,
  readPlaybackStartAttributes,
} from "../../player/lib/timelineElementHelpers";
import { editsPlainCss, GSAP_TRANSFORM_KEYS } from "../../hooks/gsapRuntimeKeyframes";

export type {
  BackgroundRemovalProgress,
  BackgroundRemovalResult,
  PropertyPanelProps,
} from "./propertyPanelTypes";

export function stripQueryAndHash(value: string): string {
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  if (queryIndex < 0) return hashIndex < 0 ? value : value.slice(0, hashIndex);
  if (hashIndex < 0) return value.slice(0, queryIndex);
  return value.slice(0, Math.min(queryIndex, hashIndex));
}

export function isSelectedElementHidden(
  elements: readonly TimelineElement[],
  selectedElementId: string | null,
): boolean {
  if (!selectedElementId) return false;
  return (
    elements.find((element) => (element.key ?? element.id) === selectedElementId)?.hidden === true
  );
}

/**
 * 5-part element identity for keying panel remounts on selection change —
 * id or selector alone collides for id-less same-selector siblings, leaving
 * mount-initialized state pointed at the previous element. sourceFile is
 * required too: the same local id/selector can legitimately recur across
 * different composition files (host vs. an inlined sub-composition, or two
 * unrelated sub-comps), and without it those collide onto the same key.
 */
export function selectionIdentityKey(
  element: Pick<DomEditSelection, "id" | "hfId" | "selector" | "selectorIndex" | "sourceFile">,
): string {
  return [
    element.id ?? "",
    element.hfId ?? "",
    element.selector ?? "",
    String(element.selectorIndex ?? ""),
    element.sourceFile ?? "",
  ].join("|");
}

/* ------------------------------------------------------------------ */
/*  Font types & constants (shared by font and section modules)        */
/* ------------------------------------------------------------------ */

export const GENERIC_FONT_FAMILIES = new Set([
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

export const DEFAULT_FONT_FAMILIES = [
  ...COMMON_LOCAL_FONT_FAMILIES,
  "Inter",
  "system-ui",
  "sans-serif",
  "serif",
  "monospace",
];

export interface LocalFontData {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
  blob?: () => Promise<Blob>;
}

export type FontSource = "Current" | "Document" | "Imported" | "Local" | "Google" | "System";

export interface FontOption {
  family: string;
  source: FontSource;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

export function sanitizeFontFilePart(value: string): string {
  return value
    .replace(/[^\w .-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function localFontSortScore(font: LocalFontData): number {
  const style = font.style?.toLowerCase() ?? "";
  const fullName = font.fullName?.toLowerCase() ?? "";
  if (style === "regular" || fullName.endsWith(" regular")) return 0;
  if (style === "normal" || fullName.endsWith(" normal")) return 1;
  if (style === "medium" || fullName.endsWith(" medium")) return 2;
  return 3;
}

export function uniqueFontFamilies(values: string[], seen = new Set<string>()): string[] {
  return values.reduce<string[]>((result, value) => {
    const family = value.trim();
    if (!family) return result;
    const key = family.toLowerCase();
    if (seen.has(key)) return result;
    seen.add(key);
    result.push(family);
    return result;
  }, []);
}

export function uniqueFontOptions(values: FontOption[]): FontOption[] {
  const seen = new Set<string>();
  return values.reduce<FontOption[]>((result, value) => {
    const family = value.family.trim();
    if (!family) return result;
    const key = family.toLowerCase();
    if (seen.has(key)) return result;
    seen.add(key);
    result.push({ family, source: value.source });
    return result;
  }, []);
}

export function sortFontOptions(options: FontOption[]): FontOption[] {
  return [...options].sort((a, b) => {
    const rankDelta = fontSourceRank(a.source) - fontSourceRank(b.source);
    if (rankDelta !== 0) return rankDelta;
    const commonA = COMMON_LOCAL_FONT_FAMILIES.findIndex(
      (f) => f.toLowerCase() === a.family.toLowerCase(),
    );
    const commonB = COMMON_LOCAL_FONT_FAMILIES.findIndex(
      (f) => f.toLowerCase() === b.family.toLowerCase(),
    );
    const commonDelta =
      (commonA === -1 ? Number.MAX_SAFE_INTEGER : commonA) -
      (commonB === -1 ? Number.MAX_SAFE_INTEGER : commonB);
    return commonDelta === 0 ? a.family.localeCompare(b.family) : commonDelta;
  });
}

function fontSourceRank(source: FontSource): number {
  if (source === "Current") return 0;
  if (source === "Document") return 1;
  if (source === "Imported") return 2;
  if (source === "Google") return 3;
  if (source === "Local") return 4;
  return 5;
}

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

export const FIELD =
  "min-w-0 rounded-md bg-panel-input px-3 py-[7px] text-panel-text-1 transition-colors focus-within:ring-1 focus-within:ring-panel-accent/30";
export const LABEL = "text-[11px] font-medium text-panel-text-3";
export const RESPONSIVE_GRID = "grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-3";
export const EMPTY_STYLES: Record<string, string> = {};

const EMPTY_FILTER_VALUE = "none";
const BOX_SHADOW_PRESETS = {
  none: "none",
  soft: "0 12px 36px rgba(0, 0, 0, 0.28)",
  lift: "0 18px 54px rgba(0, 0, 0, 0.38)",
  glow: "0 0 0 1px rgba(60, 230, 172, 0.34), 0 18px 56px rgba(60, 230, 172, 0.2)",
} as const;

export type BoxShadowPreset = keyof typeof BOX_SHADOW_PRESETS | "custom";

export {
  buildClipPathValue,
  buildInsetClipPathSides,
  buildInsetClipPathValue,
  getClipPathInsetPx,
  inferClipPathPreset,
  parseInsetClipPathSides,
  type ClipPathInsetSides,
} from "./clipPathHelpers";

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export interface ParsedNumericToken {
  value: number;
  unit: string;
}

/* ------------------------------------------------------------------ */
/*  Pure utility functions                                             */
/* ------------------------------------------------------------------ */

export function colorFromCss(value: string): ParsedColor {
  return parseCssColor(value) ?? { red: 0, green: 0, blue: 0, alpha: 1 };
}

export function parseNumericValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readClipInPoint(dataAttributes: Record<string, string> | undefined): {
  mediaStart: number;
  mediaStartAttr: string;
} {
  const inPoint = readPlaybackStartAttributes((name) => dataAttributes?.[name.slice(5)]);
  return {
    mediaStart: inPoint.playbackStart ?? 0,
    mediaStartAttr: playbackStartAttributeForElement(inPoint).slice(5),
  };
}

export function formatTimingValue(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0.00s";
  return `${seconds.toFixed(2)}s`;
}

export function formatNumericValue(value: number): string {
  const rounded = roundToCenti(value);
  return Number.isInteger(rounded)
    ? `${rounded}`
    : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function parseNumericToken(value: string | undefined): ParsedNumericToken | null {
  if (!value) return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)([a-z%]*)$/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return { value: parsed, unit: match[2] ?? "" };
}

export function parsePxMetricValue(value: string): number | null {
  const token = parseNumericToken(value);
  if (!token) return null;
  if (token.unit && token.unit.toLowerCase() !== "px") return null;
  return token.value;
}

function clampPanelNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function normalizePanelPxValue(
  value: string,
  options: { min?: number; max?: number; fallback?: number } = {},
): string | null {
  const token = parseNumericToken(value.trim());
  if (!token) return null;
  if (token.unit && token.unit.toLowerCase() !== "px") return null;
  const next = clampPanelNumber(
    token.value,
    options.min ?? Number.NEGATIVE_INFINITY,
    options.max ?? Number.POSITIVE_INFINITY,
    options.fallback ?? 0,
  );
  return `${formatNumericValue(next)}px`;
}

export function formatPxMetricValue(value: number): string {
  return `${formatNumericValue(value)}px`;
}

export function normalizeTextMetricValue(
  property: "letter-spacing" | "line-height",
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "normal") return trimmed || "normal";
  const token = parseNumericToken(trimmed);
  if (!token) return trimmed;
  if (property === "letter-spacing") {
    return token.unit ? trimmed : `${formatNumericValue(token.value)}px`;
  }
  if (token.unit) return trimmed;
  return token.value > 4 ? `${formatNumericValue(token.value)}px` : formatNumericValue(token.value);
}

function splitCssFunctions(value: string): string[] {
  const source = value.trim();
  const functions: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (/\s/.test(char) && depth === 0) {
      const part = source.slice(start, index).trim();
      if (part) functions.push(part);
      start = index + 1;
    }
  }

  const lastPart = source.slice(start).trim();
  if (lastPart) functions.push(lastPart);
  return functions;
}

export function getCssFilterFunctionPx(value: string | undefined, name: string): number {
  const normalized = value?.trim();
  if (!normalized || normalized === EMPTY_FILTER_VALUE) return 0;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}\\((-?\\d+(?:\\.\\d+)?)px\\)`, "i").exec(
    normalized,
  );
  if (!match) return 0;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function setCssFilterFunctionPx(
  value: string | undefined,
  name: string,
  nextPx: number,
): string {
  const nextValue = clampPanelNumber(nextPx, 0, 200, 0);
  const functions = splitCssFunctions(value && value.trim() !== EMPTY_FILTER_VALUE ? value : "");
  const lowerName = name.toLowerCase();
  const filtered = functions.filter((entry) => !entry.toLowerCase().startsWith(`${lowerName}(`));
  if (nextValue > 0) filtered.push(`${name}(${formatNumericValue(nextValue)}px)`);
  return filtered.length > 0 ? filtered.join(" ") : EMPTY_FILTER_VALUE;
}

export function inferBoxShadowPreset(value: string | undefined): BoxShadowPreset {
  const normalized = value?.trim() || "none";
  for (const [preset, shadow] of Object.entries(BOX_SHADOW_PRESETS)) {
    if (normalized === shadow) return preset as BoxShadowPreset;
  }
  return normalized === "none" ? "none" : "custom";
}

export function buildBoxShadowPresetValue(
  preset: BoxShadowPreset,
  fallback: string | undefined,
): string {
  if (preset === "custom") return fallback?.trim() || "none";
  return BOX_SHADOW_PRESETS[preset];
}

export function buildStrokeWidthStyleUpdates(
  nextWidth: string,
  currentBorderStyle: string | undefined,
): Array<[property: string, value: string]> {
  const updates: Array<[property: string, value: string]> = [["border-width", nextWidth]];
  const token = parseNumericToken(nextWidth);
  const style = currentBorderStyle?.trim().toLowerCase() || "none";
  if (token && token.value > 0 && (style === "none" || style === "hidden")) {
    updates.push(["border-style", "solid"]);
  }
  return updates;
}

export function buildStrokeStyleUpdates(
  nextStyle: string,
  currentBorderWidth: string | undefined,
): Array<[property: string, value: string]> {
  const updates: Array<[property: string, value: string]> = [["border-style", nextStyle]];
  const style = nextStyle.trim().toLowerCase();
  if (!style || style === "none" || style === "hidden") return updates;

  const token = parseNumericToken(currentBorderWidth?.trim() || "0");
  if (!token || token.value <= 0) {
    updates.push(["border-width", "1px"]);
  }
  return updates;
}

export function adjustNumericToken(
  value: string,
  direction: 1 | -1,
  modifiers?: { shiftKey?: boolean; altKey?: boolean },
): string | null {
  const token = parseNumericToken(value);
  if (!token) return null;

  const baseStep = modifiers?.altKey ? 0.1 : modifiers?.shiftKey ? 10 : 1;
  const nextValue = token.value + baseStep * direction;
  return `${formatNumericValue(nextValue)}${token.unit}`;
}

export function extractBackgroundImageUrl(value: string | undefined): string {
  if (!value) return "";
  const lowerValue = value.toLowerCase();
  const urlStart = lowerValue.indexOf("url(");
  if (urlStart < 0) return "";

  let index = urlStart + 4;
  while (
    index < value.length &&
    (value[index] === " " ||
      value[index] === "\n" ||
      value[index] === "\r" ||
      value[index] === "\t" ||
      value[index] === "\f")
  ) {
    index += 1;
  }

  const quote = value[index] === '"' || value[index] === "'" ? value[index] : null;
  if (quote) {
    index += 1;
    const endQuote = value.indexOf(quote, index);
    return endQuote >= index ? value.slice(index, endQuote) : "";
  }

  const endParen = value.indexOf(")", index);
  if (endParen < index) return "";
  return value.slice(index, endParen).trim();
}

// ── GSAP runtime value readers (used by PropertyPanel) ────────────────────

// Core transform channels the panel ALWAYS reads live — even before a just-set
// value (e.g. rotationX) has re-parsed into `gsapAnimations`. Without this the
// cube + fields drop the prop and flicker to 0 on every commit; gsap.getProperty
// reflects the in-place instant patch, so it's the true current value.
// fallow-ignore-next-line complexity
const ALWAYS_READ_CHANNELS = [
  "x",
  "y",
  "rotation",
  "rotationX",
  "rotationY",
  "rotationZ",
  "z",
  "scale",
  "transformPerspective",
  "opacity",
];

/** Every property key the panel should read for an element: animated props + the
 * always-read transform channels. */
function collectPanelPropKeys(gsapAnimations: GsapAnimation[]): Set<string> {
  const keys = new Set<string>(ALWAYS_READ_CHANNELS);
  for (const anim of gsapAnimations) {
    if (anim.keyframes) {
      for (const kf of anim.keyframes.keyframes) {
        for (const p of Object.keys(kf.properties)) keys.add(p);
      }
    }
    for (const p of Object.keys(anim.properties)) keys.add(p);
  }
  return keys;
}

export function readGsapRuntimeValuesForPanel(
  gsapAnimId: string | null,
  gsapAnimations: GsapAnimation[],
  element: DomEditSelection,
  previewIframeRef: React.RefObject<HTMLIFrameElement | null>,
): Record<string, number> | null {
  if (!gsapAnimId || gsapAnimations.length === 0) return null;
  const iframe = previewIframeRef?.current;
  if (!iframe?.contentWindow) return null;
  try {
    const gsap = (
      iframe.contentWindow as unknown as {
        gsap?: { getProperty: (el: Element, prop: string) => number | string };
      }
    ).gsap;
    if (!gsap?.getProperty) return null;
    const el = findPreviewNode(iframe.contentDocument, element);
    if (!el) return null;
    const propKeys = collectPanelPropKeys(gsapAnimations);
    const readsTransform = !editsPlainCss(el, "move");
    const result: Record<string, number> = {};
    for (const prop of propKeys) {
      if (!readsTransform && GSAP_TRANSFORM_KEYS.has(prop)) continue;
      const v = Number(gsap.getProperty(el, prop));
      if (Number.isFinite(v)) result[prop] = roundToCenti(v);
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

export function readGsapBorderRadiusForPanel(
  gsapRuntimeValues: Record<string, number> | null,
  gsapAnimations: GsapAnimation[],
  element: DomEditSelection,
  previewIframeRef: React.RefObject<HTMLIFrameElement | null>,
): { tl: number; tr: number; br: number; bl: number } | null {
  if (!gsapRuntimeValues || !("borderRadius" in gsapRuntimeValues)) {
    const hasBRProp = gsapAnimations.some(
      (a) =>
        "borderRadius" in a.properties ||
        a.keyframes?.keyframes.some((kf) => "borderRadius" in kf.properties),
    );
    if (!hasBRProp) return null;
  }
  const iframe = previewIframeRef?.current;
  if (!iframe?.contentDocument) return null;
  try {
    const el = findPreviewNode(iframe.contentDocument, element);
    if (!el || !iframe.contentWindow) return null;
    const cs = iframe.contentWindow.getComputedStyle(el);
    const parse = (v: string) => Number.parseFloat(v) || 0;
    return {
      tl: parse(cs.borderTopLeftRadius),
      tr: parse(cs.borderTopRightRadius),
      br: parse(cs.borderBottomRightRadius),
      bl: parse(cs.borderBottomLeftRadius),
    };
  } catch {
    return null;
  }
}

/**
 * Builds the multi-line "element info" text copied to the clipboard for an AI
 * agent. Shared by both the legacy and flat inspector headers (the flat split
 * needs the same string), so it lives here rather than as a PropertyPanel
 * closure. Pure — the caller owns the clipboard write, toast, and copied state.
 */
// fallow-ignore-next-line complexity
export function buildElementInfoText(
  element: DomEditSelection,
  sourceLabel: string,
  gsapAnimations: GsapAnimation[],
  previewIframeRef?: React.RefObject<HTMLIFrameElement | null>,
): string {
  const file = element.sourceFile ?? "index.html";
  let lineNum: number | null = null;
  try {
    const src = previewIframeRef?.current?.contentDocument?.documentElement?.outerHTML ?? "";
    if (src && element.id) {
      const idx = src.indexOf(`id="${element.id}"`);
      if (idx > -1) lineNum = src.slice(0, idx).split("\n").length;
    }
    if (!lineNum && element.selector) {
      const tag = element.tagName.toLowerCase();
      const cls = element.selector.startsWith(".") ? element.selector.slice(1).split(".")[0] : null;
      const search = cls ? `class="${cls}` : `<${tag}`;
      const idx = src.indexOf(search);
      if (idx > -1) lineNum = src.slice(0, idx).split("\n").length;
    }
  } catch {}
  const fileLoc = lineNum ? `${file}:${lineNum}` : file;
  const lines = [
    `Element: ${element.label} (${sourceLabel})`,
    `File: ${fileLoc}`,
    `Position: x=${Math.round(element.boundingBox.x)}, y=${Math.round(element.boundingBox.y)}`,
    `Size: ${Math.round(element.boundingBox.width)}×${Math.round(element.boundingBox.height)}`,
    `Tag: <${element.tagName}>`,
  ];
  if (element.computedStyles["z-index"] && element.computedStyles["z-index"] !== "auto") {
    lines.push(`Z-index: ${element.computedStyles["z-index"]}`);
  }
  if (gsapAnimations.length > 0) {
    const anim = gsapAnimations[0];
    lines.push(
      `Animation: ${anim.method}() ${anim.duration}s at ${anim.position}s, ease: ${anim.ease ?? "default"}`,
    );
    const props = Object.entries(anim.properties)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    if (props) lines.push(`Properties: ${props}`);
  }
  return lines.join("\n");
}
