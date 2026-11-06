import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import { applyAuthoredTiming } from "@hyperframes/core/studio-preview-mark";
import { type TimelineElement, usePlayerStore } from "../player/store/playerStore";
import { toAuthoredStart } from "../player/store/timelineElement";
import {
  applyPatchByTarget,
  findTagByTarget,
  readAttributeByTarget,
  readTagSnippetByTarget,
  type PatchOperation,
} from "../utils/sourcePatcher";
import {
  formatTimelineAttributeNumber,
  formatTimelineMediaOffset,
  type TimelineStackingReorderIntent,
} from "../player/components/timelineEditing";
import { getElementZIndex } from "../player/lib/layerOrdering";
import {
  furthestClipEndFromDocument,
  getTimelineElementIdentity,
  playbackStartAttributeForElement,
  readPlaybackStartAttributes,
} from "../player/lib/timelineElementHelpers";
import { resolveTimelinePlaybackRate } from "../player/components/timelineGroupEditing";
import {
  saveProjectFilesWithHistory,
  writeProjectFilesWithHistoryInQueue,
  type RecordEditInput,
} from "../utils/studioFileHistory";
import { serializeStudioFileMutations } from "../utils/studioFileMutationCoordinator";
import type { TimelineZIndexReorderCommit } from "./useTimelineEditingTypes";
import { setCompositionDurationToContent } from "../utils/timelineAssetDrop";
import { rootCompositionDurationOf } from "../utils/rootDuration";
import { readFileContent } from "./timelineTimingSync";
import {
  findElementForSelection,
  findElementForTimelineElement,
} from "../components/editor/domEditingElement";
export { deleteSelectedKeyframes } from "./deleteSelectedKeyframes";
export { readFileContent };
/**
 * Resolve a timeline vertical move to a z-index stacking reorder and commit it
 * through the shared layers-panel reorder path. Reads live sibling z-index from
 * the preview DOM, remaps with the dup-preserving reorder math, and writes only
 * z-index (never data-track-index). No-op when the move isn't a reorder, the
 * dragged clip is audio (no visual layer to restack), or the live siblings can't
 * be resolved. Extracted from StudioApp's timeline hook to keep it under the
 * studio 600-LOC cap.
 */
// fallow-ignore-next-line complexity
export function applyTimelineStackingReorder(input: {
  element: TimelineElement;
  stackingReorder: TimelineStackingReorderIntent | null | undefined;
  timelineElements: readonly TimelineElement[];
  iframe: HTMLIFrameElement | null;
  activeCompPath: string | null;
  commit: TimelineZIndexReorderCommit | null | undefined;
  coalesceKey?: string;
}): Promise<void> {
  // Audio has no visual stacking; a vertical drag on it must never write z-index.
  if (input.element.tag === "audio") return Promise.resolve();
  const intent = input.stackingReorder ?? null;
  if (intent == null || intent.zIndexChanges.length === 0) return Promise.resolve();
  // Resolve each change's live element from the change's OWN locator (the intent
  // is self-contained), falling back to the top-level element list. Sub-comp
  // children aren't in `timelineElements`, so a list-only lookup would miss them.
  const siblingByKey = new Map(
    input.timelineElements.map((el) => [getTimelineElementIdentity(el), el]),
  );
  const doc = input.iframe?.contentDocument ?? null;
  const commitEntries: Array<{
    element: HTMLElement;
    zIndex: number;
    id?: string;
    selector?: string;
    selectorIndex?: number;
    sourceFile: string;
    key: string;
  }> = [];
  for (const change of intent.zIndexChanges) {
    const sibling = siblingByKey.get(change.key);
    const domId = change.domId ?? sibling?.domId;
    const selector = change.selector ?? sibling?.selector;
    const selectorIndex = change.selectorIndex ?? sibling?.selectorIndex;
    const sourceFile =
      change.sourceFile ?? sibling?.sourceFile ?? input.activeCompPath ?? "index.html";
    const element = doc
      ? findElementForSelection(
          doc,
          { id: domId, selector, selectorIndex, sourceFile },
          input.activeCompPath,
        )
      : null;
    if (!isHtmlElement(element)) return Promise.resolve();
    if (getElementZIndex(element) === change.zIndex) continue;
    commitEntries.push({
      element,
      zIndex: change.zIndex,
      id: domId ?? sibling?.id ?? change.key,
      selector,
      selectorIndex,
      sourceFile,
      key: change.key,
    });
  }
  if (commitEntries.length === 0) return Promise.resolve();
  // The durability report is for gesture-level callers (z→lane mirror); this
  // lane-drag z-sync path has no dependent follow-up write — swallow it.
  // Promise.resolve-wrapped: a commit implementation may return void.
  return Promise.resolve(input.commit?.(commitEntries, input.coalesceKey)).then(() => undefined);
}
export function extendRootDurationIfNeeded(newEnd: number): boolean {
  const store = usePlayerStore.getState();
  if (newEnd <= store.duration) return false;
  store.setDuration(newEnd);
  return true;
}
// ── Types ──
export type { RecordEditInput } from "../utils/studioFileHistory";
export function buildPatchTarget(element: {
  domId?: string;
  hfId?: string;
  selector?: string;
  selectorIndex?: number;
}) {
  if (element.domId) {
    return {
      id: element.domId,
      hfId: element.hfId,
      selector: element.selector,
      selectorIndex: element.selectorIndex,
    };
  }
  if (element.hfId) {
    return { hfId: element.hfId, selector: element.selector, selectorIndex: element.selectorIndex };
  }
  if (element.selector) {
    return { selector: element.selector, selectorIndex: element.selectorIndex };
  }
  return null;
}
export type PatchTarget = NonNullable<ReturnType<typeof buildPatchTarget>>;
// The runtime re-reads data-start/data-duration from the DOM on each sync tick
// (packages/core/src/runtime/init.ts:1324-1368), so attribute mutations here are
// picked up automatically on the next frame without a rebind call.
export function findTimelineElementInIframe(
  iframe: HTMLIFrameElement | null,
  element: TimelineElement,
  activeCompositionPath: string | null = null,
): Element | null {
  try {
    const doc = iframe?.contentDocument;
    if (!doc) return null;
    if (element.kind === "composition" && element.compositionSrc) {
      return findElementForTimelineElement(doc, element, {
        activeCompositionPath,
        isMasterView: true,
      });
    }
    return findElementForSelection(
      doc,
      {
        hfId: element.hfId,
        id: element.domId,
        selector: element.selector,
        selectorIndex: element.selectorIndex,
        sourceFile: element.sourceFile || activeCompositionPath || "index.html",
      },
      activeCompositionPath,
    );
  } catch {
    return null;
  }
}
export function patchIframeDomTiming(
  iframe: HTMLIFrameElement | null,
  element: TimelineElement,
  attrs: Array<[string, string]>,
  activeCompositionPath: string | null = null,
): void {
  try {
    const el = findTimelineElementInIframe(iframe, element, activeCompositionPath);
    if (!el) return;
    applyAuthoredTiming(el, attrs);
  } catch {
    // Cross-origin or mid-navigation — file save is enqueued; iframe patch is best-effort.
  }
}

/** Takes deleted clips out of the live preview at once: until the reload lands, anything that re-reads the
 *  preview (composition enrichment) would otherwise put them back on the timeline. */
export function removeIframeTimelineElements(
  iframe: HTMLIFrameElement | null,
  elements: TimelineElement[],
  activeCompositionPath: string | null = null,
): void {
  for (const element of elements)
    findTimelineElementInIframe(iframe, element, activeCompositionPath)?.remove();
}

// fallow-ignore-next-line complexity
function resolveResizePlaybackStart(
  original: string,
  target: PatchTarget,
  element: TimelineElement,
  updates: Pick<TimelineElement, "start" | "playbackStart">,
): { attrName: string; value: number } | null {
  if (updates.playbackStart != null) {
    const attrName = playbackStartAttributeForElement(element).slice("data-".length);
    return { attrName, value: updates.playbackStart };
  }
  const trimDelta = updates.start - element.start;
  if (trimDelta === 0) return null;
  const source = readPlaybackStartAttributes((name) =>
    readAttributeByTarget(original, target, name),
  );
  if (source.playbackStart == null) return null;
  const attrName = playbackStartAttributeForElement({ kind: element.kind, ...source }).slice(
    "data-".length,
  );
  return {
    attrName,
    value: Math.max(
      0,
      source.playbackStart + trimDelta * resolveTimelinePlaybackRate(element.playbackRate),
    ),
  };
}

export function applyTimelineMoveAttributes(
  original: string,
  target: PatchTarget,
  start: number,
  duration: number,
  track?: number,
  audioGroup?: null,
): string {
  if (!Number.isFinite(start) || !Number.isFinite(duration)) {
    console.warn(
      `[Timeline] applyTimelineMoveAttributes: non-finite timing (start=${start}, duration=${duration}). Patch skipped`,
    );
    return original;
  }
  let patched = applyPatchByTarget(original, target, {
    type: "attribute",
    property: "start",
    value: formatTimelineAttributeNumber(start),
  });
  if (track != null && Number.isFinite(track)) {
    patched = applyPatchByTarget(patched, target, {
      type: "attribute",
      property: "track-index",
      value: formatTimelineAttributeNumber(track),
    });
  }
  if (audioGroup === null)
    patched = applyPatchByTarget(patched, target, {
      type: "attribute",
      property: "data-audio-group",
      value: null,
    });
  return patched;
}

// Root data-duration follows the furthest clip end in the source; the store's durations are
// truncated to the current length, so reading them would ratchet the duration down every edit.
export function syncCompositionDurationToContent(source: string): string {
  return syncCompositionDurationWithEnd(source).source;
}

/** The synced source and the clip end it was synced to, from one parse of the source. */
export function syncCompositionDurationWithEnd(source: string): {
  source: string;
  contentEnd: number;
} {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const contentEnd = furthestClipEndFromDocument(doc);
  const synced = setCompositionDurationToContent(
    source,
    contentEnd,
    rootCompositionDurationOf(doc),
  );
  return { source: synced, contentEnd };
}

export function buildTimelineMoveTimingPatch(
  original: string,
  target: PatchTarget,
  start: number,
  duration: number,
  track?: number,
  audioGroup?: null,
): string {
  const patched = applyTimelineMoveAttributes(original, target, start, duration, track, audioGroup);
  // A non-finite timing skips the patch above; skip the duration sync with it.
  return !(Number.isFinite(start) && Number.isFinite(duration))
    ? patched
    : syncCompositionDurationToContent(patched);
}

export function applyTimelineResizeAttributes(
  original: string,
  target: PatchTarget,
  element: TimelineElement,
  updates: Pick<TimelineElement, "start" | "duration" | "playbackStart">,
): string {
  const pbs = resolveResizePlaybackStart(original, target, element, updates);
  let patched = applyPatchByTarget(original, target, {
    type: "attribute",
    property: "start",
    value: formatTimelineAttributeNumber(toAuthoredStart(element, updates.start)),
  });
  patched = applyPatchByTarget(patched, target, {
    type: "attribute",
    property: "duration",
    value: formatTimelineAttributeNumber(updates.duration),
  });
  if (pbs) {
    patched = applyPatchByTarget(patched, target, {
      type: "attribute",
      property: pbs.attrName,
      value: formatTimelineMediaOffset(pbs.value),
    });
  }
  return patched;
}

export function buildTimelineResizeTimingPatch(
  ...args: Parameters<typeof applyTimelineResizeAttributes>
): string {
  return syncCompositionDurationToContent(applyTimelineResizeAttributes(...args));
}

export interface PersistTimelineEditInput {
  projectId: string;
  element: TimelineElement;
  activeCompPath: string | null;
  label: string;
  buildPatches: (original: string, target: PatchTarget) => string;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  pendingTimelineEditPathRef: React.MutableRefObject<Set<string>>;
  coalesceKey?: string;
  coalesceMs?: number;
}

export async function persistTimelineEdit(input: PersistTimelineEditInput): Promise<void> {
  const targetPath = input.element.sourceFile || input.activeCompPath || "index.html";
  const patchTarget = buildPatchTarget(input.element);
  if (!patchTarget) {
    throw new Error(`Timeline element ${input.element.id} is missing a patchable target`);
  }

  await saveProjectFilesWithHistory({
    projectId: input.projectId,
    label: input.label,
    coalesceKey: input.coalesceKey,
    coalesceMs: input.coalesceMs,
    files: {
      [targetPath]: (current) => {
        const patched = patchTimelineChangesInSource(current, targetPath, [
          { element: input.element, buildPatches: input.buildPatches },
        ]);
        if (patched !== current) input.pendingTimelineEditPathRef.current.add(targetPath);
        return patched;
      },
    },
    readFile: (path) => readFileContent(input.projectId, path),
    writeFile: input.writeProjectFile,
    recordEdit: input.recordEdit,
  });
}

export interface PersistTimelineBatchChange {
  element: TimelineElement;
  buildPatches: (original: string, target: PatchTarget) => string;
}

/** One batch change per element, each applying the same patch operation. */
export function operationChanges(
  elements: readonly TimelineElement[],
  operation: PatchOperation,
): PersistTimelineBatchChange[] {
  return elements.map((element) => ({
    element,
    buildPatches: (html, target) => applyPatchByTarget(html, target, operation),
  }));
}

const RENAMED_MOUNT = /__hf\d+"?\]?$/;
const lookup = (value: string, kind: string) =>
  RENAMED_MOUNT.test(value) ? `runtime-renamed ${kind}` : kind;
const selectorLookup = (selector: string) =>
  selector.startsWith("[data-composition-id=")
    ? lookup(selector, "composition id")
    : /^\.[\w-]+$/.test(selector) && "class";

function missedLookups(element: Pick<TimelineElement, "sourceFile">, target: PatchTarget): string {
  const kinds = [target.hfId && "hf-id", target.id && lookup(target.id, "id")];
  const by = [...kinds, target.selector && selectorLookup(target.selector)].filter(Boolean);
  return `by ${by.join(", ") || "nothing"}; ${element.sourceFile ? "file from the clip" : "no file on the clip"}`;
}

/** Patches each change into `source`, failing loudly on a target the file does not hold. */
export function patchTimelineChangesInSource(
  source: string,
  targetPath: string,
  changes: readonly PersistTimelineBatchChange[],
): string {
  let current = source;
  for (const { element, buildPatches } of changes) {
    const target = buildPatchTarget(element);
    if (!target) throw new Error(`Timeline element ${element.id} is missing a patchable target`);
    // Resolve first: a member already at its target values patches to the same string, a missing one must throw.
    if (!findTagByTarget(current, target)) {
      throw new Error(
        `Unable to patch timeline element ${element.id} in ${targetPath} (${missedLookups(element, target)})`,
      );
    }
    current = buildPatches(current, target);
  }
  return current;
}

export interface PersistTimelineBatchEditInput {
  projectId: string;
  activeCompPath: string | null;
  label: string;
  changes: PersistTimelineBatchChange[];
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  pendingTimelineEditPathRef: React.MutableRefObject<Set<string>>;
  coalesceKey?: string;
  /** Per-entry undo coalesce window override (ms) — see EditHistoryEntry.coalesceMs. */
  coalesceMs?: number;
}

export async function persistTimelineBatchEdit(
  input: PersistTimelineBatchEditInput,
): Promise<void> {
  const changesByPath = new Map<string, PersistTimelineBatchChange[]>();
  for (const change of input.changes) {
    const targetPath = change.element.sourceFile || input.activeCompPath || "index.html";
    changesByPath.set(targetPath, [...(changesByPath.get(targetPath) ?? []), change]);
  }
  const buildFile = (targetPath: string) => (original: string) => {
    const patched = patchTimelineChangesInSource(
      original,
      targetPath,
      changesByPath.get(targetPath)!,
    );
    const next = syncCompositionDurationToContent(patched);
    if (next !== original) input.pendingTimelineEditPathRef.current.add(targetPath);
    return next;
  };

  await saveProjectFilesWithHistory({
    projectId: input.projectId,
    label: input.label,
    coalesceKey: input.coalesceKey,
    coalesceMs: input.coalesceMs,
    files: Object.fromEntries([...changesByPath.keys()].map((path) => [path, buildFile(path)])),
    readFile: (path) => readFileContent(input.projectId, path),
    writeFile: input.writeProjectFile,
    recordEdit: input.recordEdit,
  });
}

/** What the file holds for `attr` once queued writes to it land; undefined when unreadable. */
export async function readSavedAttribute(
  projectId: string | null,
  targetPath: string,
  patchTarget: PatchTarget | null,
  attr: string,
  writeFile: (path: string, content: string, expectedContent?: string) => Promise<void>,
): Promise<string | null | undefined> {
  if (!projectId || !patchTarget) return undefined;
  const html = await serializeStudioFileMutations(writeFile, [targetPath], () =>
    readFileContent(projectId, targetPath),
  ).catch(() => null);
  return html === null ? undefined : readTargetAttribute(html, patchTarget, attr);
}

/** What `html` holds for `attr` on the target; undefined when the target is not in it. */
export function readTargetAttribute(
  html: string,
  patchTarget: PatchTarget,
  attr: string,
): string | null | undefined {
  if (readTagSnippetByTarget(html, patchTarget) === undefined) return undefined;
  return readAttributeByTarget(html, patchTarget, attr) ?? null;
}

export { formatTimelineAttributeNumber, formatTimelineMediaOffset };

export { patchDocumentRootDuration } from "./timelineEditingGsap";

export interface PersistElementAttributeInput {
  projectId: string;
  targetPath: string;
  patchTarget: PatchTarget;
  attr: string;
  value: string | null;
  label: string;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  pendingTimelineEditPathRef: { current: Set<string> };
  /** Write the attribute directly on the live preview DOM node. */
  patchLive: (value: string | null) => void;
  /** What the file held for the attribute, read inside the queue before this write. */
  onFileRead: (value: string | null) => void;
}

/**
 * One attribute, persisted to source and optimistically patched onto the
 * live preview, with a revert on save failure. The shared core behind
 * `setAudioGroupAttribute` (a group id addressed by its own DOM id) and
 * `useSetElementAttribute` (an arbitrary timeline clip) — same shape, only
 * how the live node is found and where the patch target resolves to differs,
 * which is exactly what `patchLive`/`patchTarget` parameterize.
 */
export async function persistElementAttribute({
  projectId,
  targetPath,
  patchTarget,
  attr,
  value,
  label,
  writeProjectFile,
  recordEdit,
  pendingTimelineEditPathRef,
  patchLive,
  onFileRead,
}: PersistElementAttributeInput): Promise<string[]> {
  // Joins the file's mutation queue before reading, so saves land in the order they start
  // and each patches what the save before it wrote. Resolve the target before patching
  // the live DOM, so an unresolvable target never leaves an unsaved preview.
  return serializeStudioFileMutations(writeProjectFile, [targetPath], async () => {
    const before = await readFileContent(projectId, targetPath);
    if (readTagSnippetByTarget(before, patchTarget) === undefined) {
      throw new Error(`Unable to patch element in ${targetPath}`);
    }
    // Unwind to the file's value: live writers already patched the DOM, so `readLive()`
    // would equal `value` and a failed save would keep a never-saved preview.
    const previousValue = readAttributeByTarget(before, patchTarget, attr) ?? null;
    onFileRead(previousValue);
    patchLive(value);

    const operation: PatchOperation = { type: "attribute", property: attr, value };
    const patched = applyPatchByTarget(before, patchTarget, operation);

    pendingTimelineEditPathRef.current.add(targetPath);
    try {
      return await writeProjectFilesWithHistoryInQueue({
        projectId,
        label,
        files: { [targetPath]: () => patched },
        readFile: async () => before,
        writeFile: writeProjectFile,
        recordEdit,
      });
    } catch (error) {
      // The optimistic live write already ran; unwind it on a save failure so
      // the preview doesn't show a value that never reached disk.
      patchLive(previousValue);
      throw error;
    }
  });
}
