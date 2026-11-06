/**
 * Low-level DOM primitives: type guards, style getters, CSS escaping,
 * selector utilities, and composition source resolution.
 * No imports from other domEditing* modules — safe to import from anywhere.
 */
import { COLOR_GRADING_SOURCE_HIDDEN_ATTR } from "@hyperframes/core/color-grading";
import { getSourceScopedSelectorIndex } from "../../utils/sourceScopedSelectorIndex";
import { CURATED_STYLE_PROPERTIES } from "./domEditingTypes";

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isHtmlElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    typeof (value as { nodeType?: unknown }).nodeType === "number" &&
    (value as { nodeType: number }).nodeType === 1
  );
}

// ─── Style parsing ────────────────────────────────────────────────────────────

// Single source of truth lives in @hyperframes/core/editing so the studio
// callers and the core resolver can't drift. Re-exported here to keep this
// module's public surface (6 studio callers import parsePx from it).
export { parsePx } from "@hyperframes/core/editing";

export function isTextBearingTag(tagName: string): boolean {
  return ["div", "span", "p", "strong", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName);
}

export function isEditableTextLeaf(el: HTMLElement): boolean {
  return isTextBearingTag(el.tagName.toLowerCase()) && el.children.length === 0;
}

/** Does this node render AT ALL, ignoring what it inherits? Sole owner of the
 *  rule; the walk below only decides which nodes to ask it about. */
function elementRendersItself(win: Window, el: HTMLElement): boolean {
  const computed = win.getComputedStyle(el);
  if (computed.display === "none" || computed.visibility === "hidden") return false;
  const opacity = Number.parseFloat(computed.opacity);
  return !(
    Number.isFinite(opacity) &&
    opacity <= 0.01 &&
    !el.hasAttribute(COLOR_GRADING_SOURCE_HIDDEN_ATTR)
  );
}

/**
 * Does `el` render, given everything above it?
 *
 * `memo` is for a caller asking this about MANY elements in one synchronous
 * pass. Answers are a function of the node and its ancestors, and siblings
 * share almost all of their chain, so memoizing per node turns a walk per
 * element into one style read per node in the tree. It is only ever valid for
 * the length of one pass — the DOM cannot change under a pass, and every read
 * here is a read — so the caller creates it and drops it, and nothing survives
 * to be invalidated. Omitted, every call walks the chain itself.
 *
 * The ANSWER is what it always was. Which nodes get a style read is not: this
 * resolves top-down and stops at the first node that is out, where the previous
 * version resolved bottom-up and stopped at the first one that is out going the
 * other way. Same boolean for every input, a different (and, for a subtree
 * hidden near the root, smaller) set of reads.
 */
export function isElementVisibleThroughAncestors(
  el: HTMLElement,
  memo?: Map<HTMLElement, boolean>,
): boolean {
  const win = el.ownerDocument.defaultView;
  if (!win) return true;
  // Up to the first node already answered for, then back down: a node's answer
  // needs its ancestors' first, and the topmost unanswered node is where the
  // chain of unknowns starts.
  const pending: HTMLElement[] = [];
  let inherited = true;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const answered = memo?.get(node);
    if (answered !== undefined) {
      inherited = answered;
      break;
    }
    pending.push(node);
  }
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const node = pending[i]!;
    // Once an ancestor is out, its descendants are out with it, and asking the
    // platform about them would be a style read for an answer already known.
    inherited = inherited && elementRendersItself(win, node);
    memo?.set(node, inherited);
  }
  return inherited;
}

// ─── Style accessors ──────────────────────────────────────────────────────────

export function getCuratedComputedStyles(el: HTMLElement): Record<string, string> {
  const styles: Record<string, string> = {};
  const computed = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!computed) return styles;

  for (const prop of CURATED_STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(prop);
    if (value) styles[prop] = value;
  }

  return styles;
}

export function getInlineStyles(el: HTMLElement): Record<string, string> {
  const styles: Record<string, string> = {};
  for (const property of CURATED_STYLE_PROPERTIES) {
    const value = el.style.getPropertyValue(property);
    if (value) styles[property] = value;
  }
  return styles;
}

export function getDataAttributes(el: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith("data-")) {
      attrs[attr.name.slice(5)] = attr.value;
    }
  }
  return attrs;
}

// ─── DOM traversal ────────────────────────────────────────────────────────────

export function findClosestByAttribute(
  el: HTMLElement,
  attributeNames: string[],
): HTMLElement | null {
  let current: HTMLElement | null = el;
  while (current) {
    const candidate = current;
    if (attributeNames.some((attribute) => candidate.hasAttribute(attribute))) {
      return candidate;
    }
    current = current.parentElement;
  }
  return null;
}
// ─── Composition source resolution ───────────────────────────────────────────

// The runtime INLINES subcompositions and strips the source-file linkage from the
// mounted root (it keeps `data-composition-id` but drops `data-composition-src`/
// `-file`), so a subcomp element's DOM ancestors no longer say which file it came
// from. This project-global map (composition-id → source file, built once from
// index.html's clips — see NLEContext/EditorShell) recovers it. The studio loads one project at a
// time, so module scope is the right lifetime; it's empty until set, in which case
// resolution falls back to the historical attribute-only behavior.
let compositionSourceMap: Map<string, string> = new Map();
// Bumped on every replacement so a consumer that memoizes a resolved source file
// can tell that the map it resolved against is gone. The map is module state
// with no DOM footprint, so nothing else can observe the change.
let compositionSourceMapRevision = 0;

export function setCompositionSourceMap(map: Map<string, string>): void {
  compositionSourceMap = map;
  compositionSourceMapRevision += 1;
}

export function getCompositionSourceMapRevision(): number {
  return compositionSourceMapRevision;
}

function sourceFromCompositionId(ownerRoot: HTMLElement | null): string | undefined {
  if (!ownerRoot || compositionSourceMap.size === 0) return undefined;
  // The runtime may rename the mounted id to a runtime-unique one, preserving the
  // authored id on `data-hf-original-composition-id` — prefer that, then the current id.
  const authored = ownerRoot.getAttribute("data-hf-original-composition-id");
  const current = ownerRoot.getAttribute("data-composition-id");
  return (
    (authored ? compositionSourceMap.get(authored) : undefined) ??
    (current ? compositionSourceMap.get(current) : undefined)
  );
}

export function getSourceFileForElement(
  el: HTMLElement,
  activeCompositionPath: string | null,
): { sourceFile: string; compositionPath: string } {
  const sourceHost = findClosestByAttribute(el, ["data-composition-file", "data-composition-src"]);
  const ownerRoot = findClosestByAttribute(el, ["data-composition-id"]);
  const sourceFile =
    sourceHost?.getAttribute("data-composition-file") ??
    sourceHost?.getAttribute("data-composition-src") ??
    ownerRoot?.getAttribute("data-composition-file") ??
    ownerRoot?.getAttribute("data-composition-src") ??
    sourceFromCompositionId(ownerRoot) ??
    activeCompositionPath ??
    "index.html";

  return {
    sourceFile,
    compositionPath: sourceFile,
  };
}

export function normalizeTimelineCompositionSource(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^([a-z][a-z0-9+.-]*:|\/)/i.test(trimmed)) return trimmed;

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed, "http://studio.local").pathname;
  } catch {
    pathname = trimmed;
  }

  for (const marker of ["/preview/comp/", "/preview/"]) {
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) continue;
    const sourcePath = pathname.slice(markerIndex + marker.length).replace(/^\/+/, "");
    return sourcePath || trimmed;
  }

  return trimmed;
}

// ─── CSS escaping ─────────────────────────────────────────────────────────────

function escapeCssIdentifier(value: string): string {
  const css = globalThis.CSS as { escape?: (input: string) => string } | undefined;
  if (typeof css?.escape === "function") return css.escape(value);

  if (value === "-") return "\\-";

  let escaped = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    const code = char.charCodeAt(0);
    if (code === 0) {
      escaped += "�";
      continue;
    }

    const isDigit = code >= 48 && code <= 57;
    const isUpperAlpha = code >= 65 && code <= 90;
    const isLowerAlpha = code >= 97 && code <= 122;
    const isControl = (code >= 1 && code <= 31) || code === 127;
    const isLeadingDigit = index === 0 && isDigit;
    const isSecondDigitAfterDash = index === 1 && value.startsWith("-") && isDigit;
    if (isControl || isLeadingDigit || isSecondDigitAfterDash) {
      escaped += `\\${code.toString(16)} `;
      continue;
    }
    if (isUpperAlpha || isLowerAlpha || isDigit || char === "-" || char === "_" || code >= 128) {
      escaped += char;
      continue;
    }
    escaped += `\\${char}`;
  }
  return escaped;
}

export function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\a ")
    .replace(/\r/g, "\\d ")
    .replace(/\f/g, "\\c ");
}

export function querySelectorAllSafely(doc: Document, selector: string): Element[] {
  try {
    return Array.from(doc.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function humanizeIdentifier(value: string): string {
  return (
    value
      .replace(/\.html$/i, "")
      .replace(/^compositions\//i, "")
      .split("/")
      .at(-1)
      ?.replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) ?? value
  );
}

// ─── CSS selector building ────────────────────────────────────────────────────

export function buildStableSelector(el: HTMLElement): string | undefined {
  if (el.id) return `#${escapeCssIdentifier(el.id)}`;

  const compositionId = el.getAttribute("data-composition-id");
  if (compositionId) return `[data-composition-id="${escapeCssString(compositionId)}"]`;

  // Group wrappers carry no id/class; their data-hf-group value is the unique,
  // stable handle the source mutations write — use it so the wrapper is
  // selectable, patchable (move/scale), and addressable for ungroup.
  const group = el.getAttribute("data-hf-group");
  if (group) return `[data-hf-group="${escapeCssString(group)}"]`;

  return getPreferredClassSelector(el);
}

function getPreferredClassSelector(el: HTMLElement): string | undefined {
  const classes = Array.from(el.classList)
    .map((value) => value.trim())
    .filter(Boolean);
  if (classes.length === 0) return undefined;
  const preferred =
    classes.find((value) => value !== "clip" && !value.startsWith("__hf-")) ?? classes[0];
  return preferred ? `.${escapeCssIdentifier(preferred)}` : undefined;
}

// fallow-ignore-next-line complexity
export function buildElementLabel(el: HTMLElement): string {
  const compositionId =
    el.getAttribute("data-hf-original-composition-id") ?? el.getAttribute("data-composition-id");
  if (compositionId && compositionId !== "main") {
    return humanizeIdentifier(compositionId);
  }

  const compositionSrc =
    el.getAttribute("data-composition-src") ?? el.getAttribute("data-composition-file");
  if (compositionSrc) {
    return humanizeIdentifier(compositionSrc);
  }

  const group = el.getAttribute("data-hf-group");
  if (group) return group;

  if (el.id) return humanizeIdentifier(el.id);

  const preferredClass = getPreferredClassSelector(el);
  if (preferredClass) {
    return humanizeIdentifier(preferredClass.replace(/^\./, ""));
  }

  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  if (text) return text.length > 40 ? `${text.slice(0, 39)}…` : text;
  return el.tagName.toLowerCase();
}

export function getSelectorIndex(
  doc: Document,
  el: HTMLElement,
  selector: string | undefined,
  sourceFile: string,
  activeCompositionPath: string | null,
): number | undefined {
  if (!selector?.startsWith(".")) return undefined;

  return getSourceScopedSelectorIndex(doc, el, selector, sourceFile, (candidate) =>
    isHtmlElement(candidate)
      ? getSourceFileForElement(candidate, activeCompositionPath).sourceFile
      : undefined,
  );
}
