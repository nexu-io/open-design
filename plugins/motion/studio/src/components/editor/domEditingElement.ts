/**
 * Element visibility, visual scoring, layer patch targets, element finders,
 * and the `findElementForSelection` / `findElementForTimelineElement` lookups.
 */
import type {
  DomEditContextOptions,
  DomEditSelection,
  DomEditViewport,
  TimelineElementDomTarget,
  TimelineElementDomTargetOptions,
} from "./domEditingTypes";
import {
  buildStableSelector,
  escapeCssString,
  getSelectorIndex,
  getSourceFileForElement,
  isHtmlElement,
  isElementVisibleThroughAncestors,
  normalizeTimelineCompositionSource,
  querySelectorAllSafely,
} from "./domEditingDom";

// ─── Visibility ──────────────────────────────────────────────────────────────

export function isElementComputedVisible(
  el: HTMLElement,
  memo?: Map<HTMLElement, boolean>,
): boolean {
  return isElementVisibleThroughAncestors(el, memo);
}

const VISUAL_LEAF_TAGS = new Set(["img", "video", "canvas", "svg", "audio"]);

// fallow-ignore-next-line complexity
function hasVisualPresence(el: HTMLElement): boolean {
  const win = el.ownerDocument.defaultView;
  if (!win) return false;
  const cs = win.getComputedStyle(el);
  if (cs.backgroundImage !== "none") return true;
  if (
    cs.backgroundColor &&
    cs.backgroundColor !== "transparent" &&
    cs.backgroundColor !== "rgba(0, 0, 0, 0)"
  )
    return true;
  if (cs.borderWidth && parseFloat(cs.borderWidth) > 0 && cs.borderStyle !== "none") return true;
  if (cs.boxShadow && cs.boxShadow !== "none") return true;
  return false;
}

function isEmptyVisualContainer(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (VISUAL_LEAF_TAGS.has(tag)) return false;
  if (hasVisualPresence(el)) return false;

  const { children } = el;
  if (children.length === 0) {
    return (el.textContent ?? "").trim().length === 0;
  }

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (!isHtmlElement(child)) continue;
    if (VISUAL_LEAF_TAGS.has(child.tagName.toLowerCase())) return false;
    if (isElementComputedVisible(child)) return false;
  }

  return true;
}

function hasRenderedBox(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return false;
  if (!isElementComputedVisible(el)) return false;
  if (isEmptyVisualContainer(el)) return false;
  return true;
}

// ─── Visual scoring ──────────────────────────────────────────────────────────

// ─── Layer patch target ──────────────────────────────────────────────────────

const DOM_LAYER_IGNORED_TAGS = new Set([
  "base",
  "br",
  "canvas",
  "link",
  "meta",
  "script",
  "source",
  "style",
  "template",
  "track",
  "wbr",
]);

/**
 * Is the element rendered at all? The half of `getDomLayerPatchTarget` that a
 * plain style write can flip, and the only half that reads computed style.
 * Exported so a caller memoizing a layer walk can give it its own (short)
 * cache lifetime — see `domEditLayerWalkCache`.
 */
export function isInspectableLayerElement(el: HTMLElement): boolean {
  const tagName = el.tagName.toLowerCase();
  if (DOM_LAYER_IGNORED_TAGS.has(tagName)) return false;

  const computed = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (computed?.display === "none" || computed?.visibility === "hidden") return false;

  return true;
}

/**
 * How the element is ADDRESSED — its selector, that selector's occurrence index
 * within the source file, and the file itself. Independent of whether the
 * element currently renders, so it survives every style write and moves only
 * when an identity attribute changes or the document's population of elements
 * sharing the selector does.
 */
/**
 * The selector an element is addressed by, or undefined when it cannot be a
 * layer at all. Sole owner of that rule: `isDomLayerElement` answers the same
 * question without paying for the occurrence index, and a second copy of the
 * conditions would go stale the first time one of them changed.
 */
function resolveLayerSelector(el: HTMLElement): string | undefined {
  if (el.hasAttribute("data-composition-id")) return undefined;
  return buildStableSelector(el);
}

export function resolveDomLayerIdentity(
  el: HTMLElement,
  activeCompositionPath: string | null,
): Pick<DomEditSelection, "id" | "hfId" | "selector" | "selectorIndex" | "sourceFile"> | null {
  const selector = resolveLayerSelector(el);
  if (!selector) return null;

  const { sourceFile } = getSourceFileForElement(el, activeCompositionPath);
  return {
    id: el.id || undefined,
    hfId: el.getAttribute("data-hf-id") || undefined,
    selector,
    selectorIndex: getSelectorIndex(
      el.ownerDocument,
      el,
      selector,
      sourceFile,
      activeCompositionPath,
    ),
    sourceFile,
  };
}

export function getDomLayerPatchTarget(
  el: HTMLElement,
  activeCompositionPath: string | null,
): Pick<DomEditSelection, "id" | "hfId" | "selector" | "selectorIndex" | "sourceFile"> | null {
  return isInspectableLayerElement(el) ? resolveDomLayerIdentity(el, activeCompositionPath) : null;
}

/**
 * Is `el` a layer at all? Exactly the condition under which
 * `getDomLayerPatchTarget` returns non-null, for callers that want the yes/no
 * and throw the target away.
 *
 * Worth its own function because the target carries the selector's OCCURRENCE
 * INDEX, and resolving that is a whole-document query — which the yes/no does
 * not depend on. Counting an element's layer children asked for one per child.
 */
export function isDomLayerElement(el: HTMLElement): boolean {
  return isInspectableLayerElement(el) && resolveLayerSelector(el) !== undefined;
}

// ─── Clip ancestor / selection candidate ─────────────────────────────────────

function getPreferredClipAncestor(startEl: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = startEl;
  while (current) {
    if (current.classList.contains("clip")) {
      const isCompositionHost =
        current.hasAttribute("data-composition-src") ||
        current.hasAttribute("data-composition-file");
      if (!isCompositionHost || current === startEl) return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function getSelectionCandidate(
  startEl: HTMLElement,
  options: DomEditContextOptions,
): HTMLElement {
  if (options.preferClipAncestor) {
    const clipAncestor = getPreferredClipAncestor(startEl);
    if (clipAncestor) {
      return clipAncestor;
    }
  }

  return startEl;
}

// ─── Visual target resolution ─────────────────────────────────────────────────

export function resolveVisualDomEditSelectionTarget(
  elementsFromPoint: Iterable<Element | null | undefined>,
  options: Pick<DomEditContextOptions, "activeCompositionPath">,
): HTMLElement | null {
  const candidates = resolveAllVisualDomEditTargets(elementsFromPoint, options);
  return candidates[0] ?? null;
}

/**
 * Returns all independently-selectable elements at the given point, in paint
 * order (topmost first). Used for click-cycling through stacked layers.
 *
 * Each entry in the returned array is an independent "layer" — an element
 * that is not an ancestor of an earlier entry. This gives one result per
 * z-stacked element rather than one per DOM node.
 */
export function resolveAllVisualDomEditTargets(
  elementsFromPoint: Iterable<Element | null | undefined>,
  options: Pick<DomEditContextOptions, "activeCompositionPath">,
): HTMLElement[] {
  const raw: HTMLElement[] = [];

  for (const entry of elementsFromPoint) {
    if (!isHtmlElement(entry)) continue;
    if (hasRenderedBox(entry) && getDomLayerPatchTarget(entry, options.activeCompositionPath)) {
      raw.push(entry);
    }
  }

  if (raw.length === 0) return [];

  // First pass: for each contiguous ancestor-descendant run, keep only the
  // deepest (most specific) element, matching the original single-pick logic.
  const layers: HTMLElement[] = [];
  let best = raw[0];
  for (let i = 1; i < raw.length; i++) {
    const el = raw[i];
    if (best.contains(el)) {
      best = el; // go deeper in this subtree
    } else {
      layers.push(best);
      best = el;
    }
  }
  layers.push(best);

  return layers;
}

// ─── Raster detection ────────────────────────────────────────────────────────

function hasRasterBackground(selection: Pick<DomEditSelection, "computedStyles">): boolean {
  const backgroundImage = selection.computedStyles["background-image"]?.trim();
  return Boolean(backgroundImage && backgroundImage !== "none");
}

export function isLargeRasterDomEditSelection(
  selection: Pick<DomEditSelection, "boundingBox" | "computedStyles" | "tagName">,
  viewport?: DomEditViewport | null,
): boolean {
  const tagName = selection.tagName.toLowerCase();
  const isRasterLike = tagName === "img" || hasRasterBackground(selection);
  if (!isRasterLike) return false;

  const { width, height } = selection.boundingBox;
  if (width <= 1 || height <= 1) return false;
  if (!viewport || viewport.width <= 1 || viewport.height <= 1) {
    return width >= 960 && height >= 540;
  }

  const areaRatio = (width * height) / (viewport.width * viewport.height);
  const widthRatio = width / viewport.width;
  const heightRatio = height / viewport.height;
  return areaRatio >= 0.4 || (widthRatio >= 0.7 && heightRatio >= 0.5);
}

// ─── Element finders ──────────────────────────────────────────────────────────

type FindElementSelection = Pick<DomEditSelection, "id" | "hfId" | "selector" | "selectorIndex"> & {
  sourceFile?: string;
};

export function findElementForSelection(
  doc: Document,
  selection: FindElementSelection,
  activeCompositionPath: string | null = null,
): HTMLElement | null {
  const sourceMatches = (candidate: Element): candidate is HTMLElement =>
    isHtmlElement(candidate) &&
    (!selection.sourceFile ||
      getSourceFileForElement(candidate, activeCompositionPath).sourceFile ===
        selection.sourceFile);
  const findAll = (selector: string): HTMLElement[] =>
    querySelectorAllSafely(doc, selector).filter(sourceMatches);

  if (selection.hfId) {
    const byHfId = findAll(`[data-hf-id="${escapeCssString(selection.hfId)}"]`)[0];
    if (byHfId) return byHfId;
  }

  if (selection.id) {
    // Flattened sub-compositions can repeat authored ids. getElementById returns
    // only the first document match, so filter every id match by source first.
    const byId = findAll(`[id="${escapeCssString(selection.id)}"]`)[0];
    if (byId) return byId;
  }

  if (!selection.selector) return null;
  return findAll(selection.selector)[selection.selectorIndex ?? 0] ?? null;
}

// The selected node while mounted, else its copy in the selection's own file (ids repeat across files), else any copy.
export function findPreviewNode(
  doc: Document | null | undefined,
  el: DomEditSelection,
): Element | null {
  if (!doc) return null;
  if (el.element?.isConnected && el.element.ownerDocument === doc) return el.element;
  return (
    findElementForSelection(doc, el) ??
    findElementForSelection(doc, { ...el, sourceFile: undefined })
  );
}

// fallow-ignore-next-line complexity
export function findElementForTimelineElement(
  doc: Document,
  element: TimelineElementDomTarget,
  options: TimelineElementDomTargetOptions,
): HTMLElement | null {
  const elementId = typeof element.id === "string" ? element.id : "";
  const compositionSource =
    normalizeTimelineCompositionSource(element.compositionSrc) ??
    options.compIdToSrc?.get(elementId);
  const sourceFile =
    compositionSource ??
    normalizeTimelineCompositionSource(element.sourceFile) ??
    options.activeCompositionPath ??
    "index.html";
  const escapedElementId = escapeCssString(elementId);
  const escapedCompositionSource = compositionSource ? escapeCssString(compositionSource) : null;
  const selector =
    element.selector ??
    (compositionSource
      ? `[data-composition-src="${escapedCompositionSource}"],[data-composition-file="${escapedCompositionSource}"],[data-composition-id="${escapedElementId}"]`
      : escapedElementId
        ? `[data-composition-id="${escapedElementId}"]`
        : undefined);

  if (selector || element.domId) {
    const targetElement = findElementForSelection(
      doc,
      {
        id: element.domId ?? undefined,
        selector,
        selectorIndex: element.selectorIndex,
        sourceFile,
      },
      options.activeCompositionPath,
    );
    if (targetElement) return targetElement;
  }

  const hasExplicitDomTarget = Boolean(element.domId || element.selector || compositionSource);
  if (options.isMasterView || hasExplicitDomTarget || !options.activeCompositionPath) {
    return null;
  }

  const root = doc.querySelector("[data-composition-id]");
  if (!isHtmlElement(root)) return null;
  return getSourceFileForElement(root, options.activeCompositionPath).sourceFile === sourceFile
    ? root
    : null;
}

// ─── Layer children ───────────────────────────────────────────────────────────

/** `el`'s direct children that are layers. No longer takes the context options:
 *  layer-ness does not depend on the active composition path. */
export function getDirectLayerChildren(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(
    (child): child is HTMLElement => isHtmlElement(child) && isDomLayerElement(child),
  );
}
