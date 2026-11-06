// Soft-reload-first preview sync for timeline timing edits: server GSAP
// position mutations (shift / scale), folding those rewrites into the timing
// edit's undo history, and swapping the rewritten script into the live preview
// without a full iframe reload when possible.
import { type TimelineElement, usePlayerStore } from "../player/store/playerStore";
import {
  applySoftReload,
  applySoftReloadFinalization,
  extractGsapScriptText,
  readNestedFiles,
  settleNestedReads,
} from "../utils/gsapSoftReload";
import { furthestClipEndFromDocument } from "../player/lib/timelineElementHelpers";
import type { RecordEditInput } from "../utils/studioFileHistory";
import { patchDocumentRootDuration } from "./timelineEditingGsap";
import {
  GsapOwnershipProtocolError,
  GsapPreviewConvergenceError,
  postGsapMutation,
  postGsapMutations,
  requireGsapOwnershipProtocol,
  rollbackOwnedMutation,
  type GsapMutationStatus,
} from "./gsapMutationClient";
import type { CutoverResult } from "../utils/sdkEditTransaction";
import { findTimelineScript } from "@hyperframes/core/gsap-parser-acorn";
import { walkCompositionDescendants } from "@hyperframes/parsers/hf-ids";
import {
  serializeStudioFileMutations,
  type StudioProjectFileWriter,
} from "../utils/studioFileMutationCoordinator";
import { studioApiFetch } from "../utils/studioApiFetch";
import { moveLiveTweens } from "../utils/gsapLiveRetime";

export async function readFileContent(projectId: string, targetPath: string): Promise<string> {
  if (targetPath.includes("\0") || targetPath.includes("..")) {
    throw new Error(`Unsafe path: ${targetPath}`);
  }
  const response = await studioApiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(targetPath)}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to read ${targetPath}`);
  }
  const data = (await response.json()) as { content?: string };
  if (typeof data.content !== "string") {
    throw new Error(`Missing file contents for ${targetPath}`);
  }
  return data.content;
}

/** Best-effort live-iframe wrapper for patchDocumentRootDuration (see timelineEditingGsap). */
function patchIframeRootDuration(iframe: HTMLIFrameElement | null, contentEnd: number): void {
  try {
    patchDocumentRootDuration(iframe?.contentDocument ?? null, contentEnd);
  } catch {
    // Cross-origin or mid-navigation — file save is enqueued; iframe patch is best-effort.
  }
}

/** Keep the duration readout and live root aligned with optimistically patched clips. */
export function syncPreviewContentDuration(iframe: HTMLIFrameElement | null): void {
  const end = furthestClipEndFromDocument(iframe?.contentDocument ?? null);
  if (end > 0) {
    usePlayerStore.getState().setDuration(end);
    patchIframeRootDuration(iframe, end);
  }
}

/** Restore both store and live-root duration when a timing persist fails. */
export function captureDurationRollback(iframe: HTMLIFrameElement | null): () => void {
  const previousDuration = usePlayerStore.getState().duration;
  return () => {
    if (usePlayerStore.getState().duration === previousDuration) return;
    usePlayerStore.getState().setDuration(previousDuration);
    patchIframeRootDuration(iframe, previousDuration);
  };
}

/** Re-derive live timing windows without re-executing composition scripts.
 * Works for zero-GSAP compositions; false asks the caller to full-reload. */
function rebindPreviewTiming(iframe: HTMLIFrameElement | null, currentTime: number): boolean {
  return applySoftReloadFinalization(iframe, currentTime);
}

/**
 * Sync the live preview after a timing-only edit (move / resize): move the live tweens when only
 * their timing changed, else a soft reload rather than the full reload that flashes every clip.
 *
 * Why this is safe WITHOUT re-deriving timeline elements: a move/resize commit has
 * already (a) patched the live DOM timing attributes, (b) updated the store's
 * elements optimistically (the drag commit calls `updateElement` before the
 * persist), and (c) had the server rewrite the GSAP tween positions — which is the
 * `scriptText` we swap in here. `applySoftReload` re-runs that script in the LIVE
 * document (no navigation), re-seeks to the current playhead, and rebinds the
 * timeline, so the runtime matches the already-correct store. Nothing structural
 * changed (no clip added/removed), so `processTimelineMessage` would re-derive the
 * identical element set — skipping it just avoids the flash.
 *
 * Escalates to the full `reloadPreview()` only on the PERMANENT `cannot-soft-reload`
 * result (no gsap runtime / rebind hook / scopable key / script element, or the
 * re-run threw). The TRANSIENT `verify-failed` is NOT escalated — the live re-run
 * already applied the shift; a remount would re-flash for nothing.
 *
 * `mutated` is the canonical decision, regardless of whether the server echoes
 * the unchanged script text:
 * - `mutated: false` — nothing was rewritten because there was NOTHING TO
 *   REWRITE (the clip has no domId so no id-addressed tweens, the delta was
 *   zero, or the server confirmed a no-op). Every script is unchanged and the
 *   timing attributes are already live-patched, so (when `rebindWhenUnmutated`
 *   allows it) `rebindPreviewTiming` re-seeks + rebinds and the runtime
 *   re-derives the clip windows from the live DOM — no script re-execution,
 *   no full-reload blink. This covers comps with zero GSAP scripts too; only
 *   a missing iframe/runtime hook falls back to the full reload.
 * - `mutated: true` with no script — the file on disk WAS rewritten but the
 *   server returned no script (older server, multi-script comp): the live
 *   script is now stale, so a rebind against it would show wrong positions →
 *   full-reload.
 */
async function syncTimingEditPreview(
  iframe: HTMLIFrameElement | null,
  outcome: GsapMutationStatus,
  projectId: string | null,
  reloadPreview: () => void,
  rebindWhenUnmutated: boolean,
): Promise<void> {
  const currentTime = () => usePlayerStore.getState().currentTime;
  if (!outcome.mutated && rebindWhenUnmutated) {
    if (!rebindPreviewTiming(iframe, currentTime())) reloadPreview();
    return;
  }
  const { scriptText } = outcome;
  if (!iframe || !scriptText) {
    reloadPreview();
    return;
  }
  if (moveLiveTweens(iframe, scriptText, currentTime(), reloadPreview)) return;
  const nestedFiles = await settleNestedReads(
    projectId
      ? readNestedFiles(iframe, scriptText, (path) => readFileContent(projectId, path))
      : null,
  );
  const result = applySoftReload(iframe, scriptText, {
    onAsyncFailure: reloadPreview,
    currentTimeOverride: currentTime(),
    authoredHtml: outcome.after,
    nestedFiles,
  });
  if (result === "cannot-soft-reload") reloadPreview();
}

const UNMUTATED: GsapMutationStatus = { mutated: false, scriptText: null };

export async function finishTimelineTimingFallback(input: {
  iframe: HTMLIFrameElement | null;
  projectId: string | null;
  reloadPreview: () => void;
  gsapMutation?: () => Promise<GsapMutationStatus>;
  onGsapError: (error: unknown) => void;
  /**
   * When the mutation produced no rewrite (mutated:false, no scriptText),
   * rebind the runtime timing in place (no script re-execution) instead of
   * full-reloading (see syncTimingEditPreview). Callers pass false when a full
   * reload is the only sync that reflects everything (e.g. a multi-file group
   * edit).
   */
  rebindWhenUnmutated: boolean;
}): Promise<void> {
  let outcome = UNMUTATED;
  if (input.gsapMutation) {
    try {
      outcome = await input.gsapMutation();
    } catch (error) {
      input.onGsapError(error);
      // Protocol and ownership conflicts mean the live iframe may no longer
      // represent the bytes that won on disk. Converge explicitly by reloading.
      if (error instanceof GsapPreviewConvergenceError) input.reloadPreview();
      return;
    }
  }
  await syncTimingEditPreview(
    input.iframe,
    outcome,
    input.projectId,
    input.reloadPreview,
    input.rebindWhenUnmutated,
  );
}

// Held until the next edit: the key is the gesture's own, so only its GSAP fold can join it.
const UNTIL_NEXT_EDIT = Number.POSITIVE_INFINITY;
let timingGestures = 0;

/** One timing gesture's undo step, shared by its timing write and its GSAP fold however long the fold takes. */
export function timingGestureStep(
  kind: string,
  given?: { coalesceKey?: string },
): { coalesceKey: string; coalesceMs: number } {
  return {
    coalesceKey: given?.coalesceKey ?? `${kind}:${++timingGestures}`,
    coalesceMs: UNTIL_NEXT_EDIT,
  };
}

type OwnedMutationStep = {
  path: string;
  before: string;
  after: string;
};

type OwnedMutationRunner = (
  path: string,
  mutation: () => Promise<GsapMutationStatus> | null,
) => Promise<GsapMutationStatus>;

/**
 * Restore successful mutation steps in reverse order through the server's
 * atomic compare-and-restore endpoint. A conflict means a successor owns the
 * file and is deliberately preserved. Conflicts and restore errors require a
 * preview reload; errors are also reported through onError.
 */
async function rollbackMutatedFiles(
  projectId: string,
  ownedSteps: readonly OwnedMutationStep[],
  onError: (error: unknown) => void,
): Promise<"restored" | "convergence-required"> {
  let convergenceRequired = false;
  for (let index = ownedSteps.length - 1; index >= 0; index -= 1) {
    const step = ownedSteps[index];
    if (!step || step.before === step.after) continue;
    try {
      if (
        (await rollbackOwnedMutation(projectId, step.path, step.after, step.before)) === "conflict"
      ) {
        convergenceRequired = true;
      }
    } catch (rollbackError) {
      convergenceRequired = true;
      onError(rollbackError);
    }
  }
  return convergenceRequired ? "convergence-required" : "restored";
}

async function rollbackAfterFailure(
  projectId: string,
  ownedSteps: readonly OwnedMutationStep[],
  onError: (error: unknown) => void,
  originalError: unknown,
): Promise<never> {
  const outcome = await rollbackMutatedFiles(projectId, ownedSteps, onError);
  if (outcome === "convergence-required") {
    throw new GsapPreviewConvergenceError(
      "GSAP rollback could not safely restore every owned write; preview reload required",
      { cause: originalError },
    );
  }
  throw originalError;
}

/**
 * Fold server-owned GSAP rewrites into the preceding timing history entry.
 * Every mutation contributes the atomic before/after pair returned by its
 * endpoint; the first before and last after for each contiguous file chain are
 * the only bytes this transaction may record or roll back.
 */
// The ledger, reverse rollback, final ownership check, and history fold are one
// transaction; extracting phases would obscure which function owns convergence.
// fallow-ignore-next-line complexity
async function foldGsapMutationInQueue(input: {
  projectId: string;
  label: string;
  coalesceKey?: string;
  recordEdit: (edit: RecordEditInput) => Promise<void>;
  gsapMutation: (runOwnedMutation: OwnedMutationRunner) => Promise<GsapMutationStatus>;
  onRollbackError: (error: unknown) => void;
}): Promise<GsapMutationStatus> {
  const ownedSteps: OwnedMutationStep[] = [];
  const runOwnedMutation: OwnedMutationRunner = async (path, mutation) => {
    const pending = mutation();
    if (!pending) return UNMUTATED;
    const status = await pending;
    if (!status.mutated) return status;
    if (status.before === undefined || status.after === undefined) {
      throw new GsapOwnershipProtocolError(
        `GSAP mutation returned no owned before/after pair for ${path}`,
      );
    }
    const previous = [...ownedSteps].reverse().find((step) => step.path === path);
    const step = { path, before: status.before, after: status.after };
    ownedSteps.push(step);
    // A foreign writer landed between two same-file mutation steps. The second
    // step already wrote, so keep it in ownedSteps for reverse rollback, then
    // fail rather than folding foreign bytes into this gesture's history.
    if (previous && previous.after !== step.before) {
      throw new Error(`GSAP mutation ownership chain broke for ${path}`);
    }
    return status;
  };
  let status: GsapMutationStatus;
  try {
    await requireGsapOwnershipProtocol(input.projectId);
    status = await input.gsapMutation(runOwnedMutation);
  } catch (error) {
    return rollbackAfterFailure(input.projectId, ownedSteps, input.onRollbackError, error);
  }
  if (status.mutated) {
    try {
      const ownershipByPath = new Map<string, { before: string; after: string }>();
      for (const step of ownedSteps) {
        const owned = ownershipByPath.get(step.path);
        if (owned) owned.after = step.after;
        else ownershipByPath.set(step.path, { before: step.before, after: step.after });
      }
      const files: Record<string, { before: string; after: string }> = {};
      for (const [path, owned] of ownershipByPath) {
        const finalContent = await readFileContent(input.projectId, path);
        if (finalContent !== owned.after) {
          throw new Error(`GSAP mutation ownership lost for ${path}`);
        }
        if (owned.before !== owned.after) {
          files[path] = owned;
        }
      }
      if (Object.keys(files).length > 0) {
        await input.recordEdit({
          label: input.label,
          coalesceKey: input.coalesceKey,
          coalesceMs: UNTIL_NEXT_EDIT,
          files,
        });
      }
    } catch (error) {
      return rollbackAfterFailure(input.projectId, ownedSteps, input.onRollbackError, error);
    }
  }
  return status;
}

// The mutations, the ownership read and any rollback hold every touched file's queue.
export function foldGsapMutationIntoHistory(
  input: Parameters<typeof foldGsapMutationInQueue>[0] & {
    writeFile: StudioProjectFileWriter;
    paths: readonly string[];
  },
): Promise<GsapMutationStatus> {
  return serializeStudioFileMutations(input.writeFile, input.paths, () =>
    foldGsapMutationInQueue(input),
  );
}

export function shiftGsapMutation(elementId: string | undefined, delta: number) {
  if (delta === 0 || !elementId) return null;
  return { type: "shift-positions", targetSelector: `#${elementId}`, delta };
}

export function scaleGsapMutation(
  elementId: string | undefined,
  oldStart: number,
  oldDuration: number,
  newStart: number,
  newDuration: number,
) {
  if (!elementId || oldDuration <= 0 || newDuration <= 0) return null;
  if (oldStart === newStart && oldDuration === newDuration) return null;
  return {
    type: "scale-positions",
    targetSelector: `#${elementId}`,
    oldStart,
    oldDuration,
    newStart,
    newDuration,
  };
}

/**
 * Shift all GSAP animation positions targeting a given element by a time delta.
 * Calls the server-side GSAP mutation endpoint which uses the AST-based parser.
 * Returns the rewritten script so the caller can soft-reload instead of full-reload.
 */
export async function shiftGsapPositions(
  projectId: string,
  filePath: string,
  elementId: string,
  delta: number,
): Promise<GsapMutationStatus> {
  const mutation = shiftGsapMutation(elementId, delta);
  if (!mutation) return UNMUTATED;
  return postGsapMutation(projectId, filePath, mutation, "shift-positions failed");
}

async function scaleGsapPositions(
  projectId: string,
  filePath: string,
  elementId: string,
  oldStart: number,
  oldDuration: number,
  newStart: number,
  newDuration: number,
): Promise<GsapMutationStatus> {
  const mutation = scaleGsapMutation(elementId, oldStart, oldDuration, newStart, newDuration);
  if (!mutation) return UNMUTATED;
  return postGsapMutation(projectId, filePath, mutation, "scale-positions failed");
}

/** The GSAP sync a committed SDK timing write made, or null when its timeline script is unchanged. */
export function sdkTimingGsapSync(
  result: Extract<CutoverResult, { status: "committed" }>,
): GsapMutationStatus | null {
  const timelineText = (html: string) => {
    const scripts: Element[] = [];
    walkCompositionDescendants(new DOMParser().parseFromString(html, "text/html"), (el) => {
      if (el.tagName.toLowerCase() === "script") scripts.push(el);
    });
    return findTimelineScript(scripts)?.textContent ?? null;
  };
  if (timelineText(result.before) === timelineText(result.after)) return null;
  return { mutated: true, scriptText: extractGsapScriptText(result.after), after: result.after };
}

/** Timing delta a single-clip edit applies to its GSAP tweens. */
export type SingleClipGsapEdit =
  | { kind: "shift"; delta: number }
  | {
      kind: "scale";
      from: { start: number; duration: number };
      to: { start: number; duration: number };
    };

/**
 * Post-persist GSAP sync for a SINGLE-clip timing edit (move / resize): runs the
 * server shift/scale mutation, folds the rewrite into the timing edit's history
 * entry (see foldGsapMutationIntoHistory), then soft-reloads the preview with
 * the rewritten script. When there was nothing to rewrite (no domId — e.g. a
 * selector-addressed caption clip — zero delta, or a server no-op) it rebinds
 * the runtime timing in place instead of full-reloading; full reload remains
 * for genuine rewrites without a returned script and for comps the soft path
 * can't handle (see syncTimingEditPreview).
 */
export function finishClipTimingFallback(input: {
  iframe: HTMLIFrameElement | null;
  reloadPreview: () => void;
  projectId: string | null;
  targetPath: string;
  domId: string | undefined;
  label: string;
  coalesceKey?: string;
  recordEdit: (edit: RecordEditInput) => Promise<void>;
  writeProjectFile: StudioProjectFileWriter;
  edit: SingleClipGsapEdit;
  sdkGsap?: GsapMutationStatus | null;
}): Promise<void> {
  const { projectId, targetPath, domId, edit, sdkGsap } = input;
  const timingChanged =
    edit.kind === "shift"
      ? edit.delta !== 0
      : edit.from.start !== edit.to.start || edit.from.duration !== edit.to.duration;
  const runMutation = (pid: string, id: string): Promise<GsapMutationStatus> =>
    edit.kind === "shift"
      ? shiftGsapPositions(pid, targetPath, id, edit.delta)
      : scaleGsapPositions(
          pid,
          targetPath,
          id,
          edit.from.start,
          edit.from.duration,
          edit.to.start,
          edit.to.duration,
        );
  const onGsapError = (err: unknown) =>
    console.error(`[Timeline] Failed to ${edit.kind} GSAP positions`, err);
  return finishTimelineTimingFallback({
    iframe: input.iframe,
    projectId,
    reloadPreview: input.reloadPreview,
    gsapMutation: sdkGsap
      ? () => Promise.resolve(sdkGsap)
      : timingChanged && domId && projectId
        ? () =>
            foldGsapMutationIntoHistory({
              writeFile: input.writeProjectFile,
              paths: [targetPath],
              projectId,
              label: input.label,
              coalesceKey: input.coalesceKey,
              recordEdit: input.recordEdit,
              gsapMutation: (runOwnedMutation) =>
                runOwnedMutation(targetPath, () => runMutation(projectId, domId)),
              onRollbackError: onGsapError,
            })
        : undefined,
    onGsapError,
    rebindWhenUnmutated: true,
  });
}

/**
 * Shared post-persist GSAP sync for GROUP timing edits (move / resize): runs the
 * per-change server mutation for every changed clip, folds the rewrites into the
 * timing edit's history entry, and soft-reloads the preview when possible.
 *
 * The preview is a SINGLE shared iframe showing the ACTIVE composition, so only
 * the active comp's rewritten script can be soft-reloaded (swapped in place, no
 * all-clips flash). If any OTHER file changed too — e.g. a sub-comp group in a
 * multi-file move — no scriptText is passed, so the fallback does ONE full
 * reload that reflects every changed file.
 */
export async function finishGroupTimingGsapFallback<C extends { element: TimelineElement }>(input: {
  projectId: string;
  iframe: HTMLIFrameElement | null;
  reloadPreview: () => void;
  label: string;
  errorLabel: string;
  coalesceKey?: string;
  recordEdit: (edit: RecordEditInput) => Promise<void>;
  writeProjectFile: StudioProjectFileWriter;
  activeCompPath: string | null;
  changes: readonly C[];
  resolveChangePath: (element: TimelineElement) => string;
  /** The change's GSAP mutation; null skips a change with no timing delta. */
  mutationFor: (change: C) => Record<string, unknown> | null;
  sdkGsap?: GsapMutationStatus | null;
}): Promise<void> {
  const activePath = input.activeCompPath || "index.html";
  const otherFileChanged = input.changes.some(
    (change) => input.resolveChangePath(change.element) !== activePath,
  );
  const onGsapError = (err: unknown) => console.error(`[Timeline] ${input.errorLabel}`, err);
  const { sdkGsap } = input;
  if (sdkGsap) {
    await finishTimelineTimingFallback({
      iframe: input.iframe,
      projectId: input.projectId,
      reloadPreview: input.reloadPreview,
      gsapMutation: () => Promise.resolve(sdkGsap),
      onGsapError,
      rebindWhenUnmutated: !otherFileChanged,
    });
    return;
  }
  await finishTimelineTimingFallback({
    iframe: input.iframe,
    projectId: input.projectId,
    reloadPreview: input.reloadPreview,
    gsapMutation: () =>
      foldGsapMutationIntoHistory({
        writeFile: input.writeProjectFile,
        paths: input.changes.map((change) => input.resolveChangePath(change.element)),
        projectId: input.projectId,
        label: input.label,
        coalesceKey: input.coalesceKey,
        recordEdit: input.recordEdit,
        gsapMutation: async (runOwnedMutation) => {
          let mutated = false;
          let scriptText: GsapMutationStatus["scriptText"] = null;
          let after: string | undefined;
          const byPath = new Map<string, Record<string, unknown>[]>();
          for (const change of input.changes) {
            const mutation = input.mutationFor(change);
            if (!mutation) continue;
            const changePath = input.resolveChangePath(change.element);
            byPath.set(changePath, [...(byPath.get(changePath) ?? []), mutation]);
          }
          for (const [changePath, mutations] of byPath) {
            const status = await runOwnedMutation(changePath, () =>
              postGsapMutations(input.projectId, changePath, mutations, input.errorLabel),
            );
            mutated = mutated || status.mutated;
            if (changePath === activePath) ({ scriptText, after } = status);
          }
          return { mutated, scriptText: otherFileChanged ? null : scriptText, after };
        },
        onRollbackError: onGsapError,
      }),
    onGsapError,
    // A batch where nothing needed rewriting (every change was zero-delta or
    // no-domId, e.g. closing a gap over caption clips) still needs the runtime
    // to re-derive clip windows — the in-place timing rebind covers that. But
    // when another file changed, only a full reload reflects every file.
    rebindWhenUnmutated: !otherFileChanged,
  });
}
