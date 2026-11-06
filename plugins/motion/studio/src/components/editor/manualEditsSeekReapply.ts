// Puts Studio's committed edits back after a timeline seek has rendered over them.
import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import {
  STUDIO_BOX_SIZE_ATTR,
  STUDIO_HEIGHT_PROP,
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_PATH_OFFSET_ATTR,
  STUDIO_ROTATION_ATTR,
  STUDIO_ROTATION_PROP,
  STUDIO_WIDTH_PROP,
} from "./manualEditsTypes";
import { applyStudioBoxSize, applyStudioPathOffset, applyStudioRotation } from "./manualEditsDom";
import { applyStudioMotionFromDom } from "./studioMotion";
import { STUDIO_MOTION_ATTR, STUDIO_MOTION_TIMELINE_ID } from "./studioMotionTypes";
import { gsapWritesChannels } from "../../hooks/gsapRuntimeKeyframes";

function queryStudioElements(doc: Document, attr: string): HTMLElement[] {
  const elements = Array.from(doc.querySelectorAll(`[${attr}="true"]`)).filter(isHtmlElement);
  // Handle legacy HTML files where attributes were persisted with a double data- prefix
  const legacyAttr = `data-${attr}`;
  for (const el of doc.querySelectorAll(`[${legacyAttr}="true"]`)) {
    if (isHtmlElement(el) && !el.hasAttribute(attr)) {
      el.setAttribute(attr, "true");
      el.removeAttribute(legacyAttr);
      elements.push(el);
    }
  }
  return elements;
}

function reapplyPathOffsets(doc: Document): void {
  for (const el of queryStudioElements(doc, STUDIO_PATH_OFFSET_ATTR)) {
    // Unlike size below, the offset channels add up: applying both doubles the move.
    if (gsapWritesChannels(el, ["x", "y"])) continue;
    const x = el.style.getPropertyValue(STUDIO_OFFSET_X_PROP);
    const y = el.style.getPropertyValue(STUDIO_OFFSET_Y_PROP);
    if (!x && !y) continue;
    const offset = { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
    applyStudioPathOffset(el, offset, { updateBase: false });
  }
}

/**
 * Put the committed size back after a seek, GSAP-sized elements included: both write width and height,
 * so the later write wins. Standing aside let a soft reload revert to the stylesheet size for a frame.
 */
function reapplyBoxSizes(doc: Document): void {
  for (const el of queryStudioElements(doc, STUDIO_BOX_SIZE_ATTR)) {
    const w = Number.parseFloat(el.style.getPropertyValue(STUDIO_WIDTH_PROP));
    const h = Number.parseFloat(el.style.getPropertyValue(STUDIO_HEIGHT_PROP));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      applyStudioBoxSize(el, { width: w, height: h });
    }
  }
}
function reapplyRotations(doc: Document): void {
  for (const el of queryStudioElements(doc, STUDIO_ROTATION_ATTR)) {
    const angle = Number.parseFloat(el.style.getPropertyValue(STUDIO_ROTATION_PROP));
    if (Number.isFinite(angle)) {
      applyStudioRotation(el, { angle });
    }
  }
}

// Every mark a reapply below acts on, the legacy double-prefixed ones included.
export const STUDIO_EDIT_ATTRS = [
  STUDIO_PATH_OFFSET_ATTR,
  STUDIO_BOX_SIZE_ATTR,
  STUDIO_ROTATION_ATTR,
]
  .flatMap((attr) => [attr, `data-${attr}`])
  .concat(STUDIO_MOTION_ATTR);
// One selector each: Chrome answers a lone attribute selector without walking the DOM, a comma list it walks.
const STUDIO_EDIT_SELECTORS = STUDIO_EDIT_ATTRS.map((attr) =>
  attr === STUDIO_MOTION_ATTR ? `[${attr}]` : `[${attr}="true"]`,
);

interface EditMarkCache {
  observer: MutationObserver;
  stale: boolean;
  has: boolean;
}
const editMarkCaches = new WeakMap<Document, EditMarkCache>();

function scanForEditMarks(doc: Document): boolean {
  return STUDIO_EDIT_SELECTORS.some((selector) => doc.querySelector(selector) !== null);
}

// Rescans only after a mark attribute or the tree changed, so a seek on a steady film does no lookup.
function hasEditMarks(doc: Document): boolean {
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer) return scanForEditMarks(doc);
  let cache = editMarkCaches.get(doc);
  if (!cache) {
    const entry: EditMarkCache = {
      observer: new Observer(() => {
        entry.stale = true;
      }),
      stale: true,
      has: false,
    };
    entry.observer.observe(doc, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: STUDIO_EDIT_ATTRS,
    });
    editMarkCaches.set(doc, entry);
    cache = entry;
  }
  // A mark set earlier in this task has not reached the observer callback yet.
  if (cache.observer.takeRecords().length > 0) cache.stale = true;
  if (cache.stale) {
    cache.has = scanForEditMarks(doc);
    cache.stale = false;
  }
  return cache.has;
}

function hasStudioEdits(doc: Document): boolean {
  const timelines = (doc.defaultView as { __timelines?: Record<string, unknown> } | null)
    ?.__timelines;
  // A motion timeline outlives its marks until the next reapply kills it.
  return Boolean(timelines?.[STUDIO_MOTION_TIMELINE_ID]) || hasEditMarks(doc);
}

export function reapplyPositionEditsAfterSeek(doc: Document): void {
  // Runs after every seek, so several times per playback frame.
  if (!hasStudioEdits(doc)) return;
  reapplyPathOffsets(doc);
  reapplyBoxSizes(doc);
  reapplyRotations(doc);
  applyStudioMotionFromDom(doc);
  // The reapply rewrites the marks it read; the film still has them, so no rescan is due.
  editMarkCaches.get(doc)?.observer.takeRecords();
}
