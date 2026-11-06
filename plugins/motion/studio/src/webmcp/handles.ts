/**
 * Opaque element handles: the one thing reads mint and writes consume.
 *
 * `TimelineElement.id` cannot do this job. It is a SYNTHESISED identity built
 * from label, index, selector and source file when the clip has no authored id
 * (`timelineElementHelpers.buildTimelineElementIdentity`), so
 * `getElementById(element.id)` misses most elements. The real addressing fields
 * are separate: `hfId` (the `data-hf-id` the codebase calls the stable primary
 * patch target), `domId`, and a `selector` plus occurrence index.
 *
 * Handles are strings so they survive a JSON round trip through the agent
 * untouched. The agent never builds one; it passes back what a read gave it.
 */

import type { TimelineElement } from "../player/store/timelineElement";
import { findElementForSelection } from "../components/editor/domEditingElement";
import type { PatchTarget } from "../utils/sourcePatcher";

const SEPARATOR = ":";
const INDEX_SEPARATOR = "#";

/**
 * How to find one element. `TimelineElement` calls the DOM id `domId` and
 * `PatchTarget` calls it `id`, so both adapt into this rather than the minter
 * knowing about either.
 */
export interface ElementAddress {
  projectId?: string | null;
  hfId?: string;
  domId?: string | null;
  selector?: string;
  selectorIndex?: number;
  sourceFile?: string;
  activeCompositionPath?: string | null;
}

/**
 * Address an element the same way Studio's own patcher does, most stable first.
 * `data-hf-id` survives edits that renumber or reorder; a bare selector does not.
 */
export function mintElementHandle(address: ElementAddress): string | null {
  const scoped = (value: string) => {
    if (!address.sourceFile || !address.activeCompositionPath) return value;
    if (address.projectId) {
      return [
        "v2",
        encodeURIComponent(address.projectId),
        encodeURIComponent(address.activeCompositionPath),
        encodeURIComponent(address.sourceFile),
        encodeURIComponent(value),
      ].join(SEPARATOR);
    }
    return [
      "v1",
      encodeURIComponent(address.activeCompositionPath),
      encodeURIComponent(address.sourceFile),
      encodeURIComponent(value),
    ].join(SEPARATOR);
  };

  if (address.hfId) return `hf${SEPARATOR}${scoped(address.hfId)}`;
  if (address.domId) return `dom${SEPARATOR}${scoped(address.domId)}`;
  if (address.selector) {
    const index = address.selectorIndex ?? 0;
    return `sel${SEPARATOR}${scoped(address.selector)}${INDEX_SEPARATOR}${index}`;
  }
  return null;
}

export function timelineElementAddress(
  element: TimelineElement,
  activeCompositionPath: string | null = "index.html",
  projectId?: string | null,
): ElementAddress {
  const rootFile = activeCompositionPath ?? "index.html";
  return {
    projectId,
    hfId: element.hfId,
    domId: element.domId,
    selector: element.selector,
    selectorIndex: element.selectorIndex,
    sourceFile: element.sourceFile ?? rootFile,
    activeCompositionPath: rootFile,
  };
}

export function patchTargetAddress(
  target: PatchTarget & { sourceFile?: string },
  activeCompositionPath?: string | null,
  projectId?: string | null,
): ElementAddress {
  return {
    projectId,
    hfId: target.hfId,
    domId: target.id,
    selector: target.selector,
    selectorIndex: target.selectorIndex,
    sourceFile: target.sourceFile,
    activeCompositionPath,
  };
}

export interface ParsedHandle {
  scheme: "hf" | "dom" | "sel";
  version: 0 | 1 | 2;
  value: string;
  index: number;
  projectId?: string;
  sourceFile?: string;
  activeCompositionPath?: string;
}

function decodeScopedParts(rest: string, version: "v1" | "v2", count: number) {
  const parts = rest.split(SEPARATOR);
  if (parts[0] !== version || parts.length !== count + 1) return null;
  return parts.slice(1).map(decodeHandlePart);
}

function parseV1ScopedValue(rest: string): Omit<ParsedHandle, "scheme" | "index"> | null {
  const [activeCompositionPath, sourceFile, value] = decodeScopedParts(rest, "v1", 3) ?? [];
  if (!activeCompositionPath || !sourceFile || !value) return null;
  return { version: 1, value, sourceFile, activeCompositionPath };
}

function parseV2ScopedValue(rest: string): Omit<ParsedHandle, "scheme" | "index"> | null {
  const [projectId, activeCompositionPath, sourceFile, value] =
    decodeScopedParts(rest, "v2", 4) ?? [];
  if (!projectId || !activeCompositionPath || !sourceFile || !value) return null;
  return { version: 2, projectId, value, sourceFile, activeCompositionPath };
}

function parseScopedValue(rest: string): Omit<ParsedHandle, "scheme" | "index"> | null {
  if (rest.startsWith(`v1${SEPARATOR}`)) return parseV1ScopedValue(rest);
  if (rest.startsWith(`v2${SEPARATOR}`)) return parseV2ScopedValue(rest);
  return { value: rest, version: 0 };
}

function decodeHandlePart(value: string): string | null {
  try {
    return decodeURIComponent(value) || null;
  } catch {
    return null;
  }
}

export function parseElementHandle(handle: string): ParsedHandle | null {
  const separatorAt = handle.indexOf(SEPARATOR);
  if (separatorAt <= 0) return null;
  const scheme = handle.slice(0, separatorAt);
  const rest = handle.slice(separatorAt + 1);
  if (!rest) return null;
  if (scheme === "hf" || scheme === "dom") {
    const scoped = parseScopedValue(rest);
    return scoped ? { scheme, ...scoped, index: 0 } : null;
  }
  if (scheme !== "sel") return null;

  // Only the LAST `#` splits the index off: CSS selectors contain `#` themselves.
  const indexAt = rest.lastIndexOf(INDEX_SEPARATOR);
  if (indexAt <= 0) {
    const scoped = parseScopedValue(rest);
    return scoped ? { scheme, ...scoped, index: 0 } : null;
  }
  const index = Number(rest.slice(indexAt + 1));
  if (!Number.isInteger(index) || index < 0) {
    const scoped = parseScopedValue(rest);
    return scoped ? { scheme, ...scoped, index: 0 } : null;
  }
  const scoped = parseScopedValue(rest.slice(0, indexAt));
  return scoped ? { scheme, ...scoped, index } : null;
}

/**
 * Resolve a handle against the preview document.
 *
 * Always re-resolve per call rather than holding an element across calls: a
 * preview reload replaces the document, and a node from the destroyed one is
 * detached but still looks like an element.
 */
export function resolveElementHandle(doc: Document, handle: string): HTMLElement | null {
  const parsed = parseElementHandle(handle);
  if (!parsed) return null;
  return findElementForSelection(
    doc,
    {
      hfId: parsed.scheme === "hf" ? parsed.value : undefined,
      id: parsed.scheme === "dom" ? parsed.value : undefined,
      selector: parsed.scheme === "sel" ? parsed.value : undefined,
      selectorIndex: parsed.scheme === "sel" ? parsed.index : undefined,
      sourceFile: parsed.sourceFile,
    },
    parsed.activeCompositionPath ?? null,
  );
}

/** Legacy read handles remain valid, but a scoped handle must name the active project. */
export function elementHandleMatchesProject(handle: string, projectId: string | null): boolean {
  const parsed = parseElementHandle(handle);
  if (!parsed) return false;
  return parsed.version !== 2 || (!!projectId && parsed.projectId === projectId);
}

export type LiveHandleResolution<T extends { element: HTMLElement }> =
  | { status: "ready"; selection: T }
  | { status: "preview-unavailable" }
  | { status: "not-found" }
  | { status: "unsupported" }
  | { status: "changed" };

/**
 * Resolve and build a selection across one possible preview reload.
 *
 * Building a selection can await a source probe. A thumbnail refresh may
 * replace the preview document during that await, leaving an otherwise valid
 * selection attached to the old document with a truthful-looking 0x0 box.
 * Reacquire once from the current document, then refuse if it moves again.
 */
export async function resolveLiveHandleSelection<T extends { element: HTMLElement }>(
  getPreviewDocument: () => Document | null,
  handle: string,
  buildSelection: (element: HTMLElement) => Promise<T | null>,
): Promise<LiveHandleResolution<T>> {
  let reloadObserved = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const doc = getPreviewDocument();
    if (!doc) return { status: "preview-unavailable" };
    const element = resolveElementHandle(doc, handle);
    if (!element) return { status: reloadObserved ? "changed" : "not-found" };

    const selection = await buildSelection(element);
    const currentDoc = getPreviewDocument();
    const previewChanged =
      currentDoc !== doc ||
      element.ownerDocument !== doc ||
      !element.isConnected ||
      (selection !== null &&
        (selection.element.ownerDocument !== doc || !selection.element.isConnected));
    if (previewChanged) {
      reloadObserved = true;
      continue;
    }
    if (!selection) return { status: "unsupported" };
    return { status: "ready", selection };
  }
  return { status: "changed" };
}
