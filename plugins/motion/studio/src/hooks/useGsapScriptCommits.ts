import { useCallback, useMemo, useRef } from "react";
import { findUnsafeMutationValues } from "@hyperframes/core/studio-api/finite-mutation";
import { readProjectFileContent as readSharedProjectFileContent } from "../utils/studioFileHistory";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import {
  applySoftReload,
  extractGsapScriptText,
  readNestedFiles,
  settleNestedReads,
} from "../utils/gsapSoftReload";
import type { SoftReloadResult } from "../utils/gsapSoftReload";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { trackKeyframeCommit } from "../utils/keyframeUsage";
import { serializeStudioFileMutation } from "../utils/studioFileMutationCoordinator";
import { trackedStudioEdit } from "../utils/studioPendingEdits";
import {
  getStudioSaveErrorMessage,
  isStudioSaveErrorAlreadyToasted,
  markStudioSaveErrorAlreadyToasted,
} from "../utils/studioSaveDiagnostics";
import type { CutoverDeps } from "../utils/sdkCutover";
import { updateKeyframeCacheFromParsed } from "./gsapKeyframeCacheHelpers";
import { patchRuntimeTweenInPlace } from "./gsapRuntimePatch";
import { createKeyedSerializer } from "./serializeByKey";
import {
  GsapMutationHttpError,
  formatGsapMutationRejectionToast,
  readJsonResponseBody,
} from "./gsapScriptCommitHelpers";
import {
  gsapWriteFile,
  type CommitMutation,
  type CommitMutationCall,
  type CommitMutationOptions,
  type GsapScriptCommitsParams,
  type MutationResult,
} from "./gsapScriptCommitTypes";
import { useGsapAnimationOps } from "./useGsapAnimationOps";
import { useGsapArcPathOps } from "./useGsapArcPathOps";
import { useGsapKeyframeOps } from "./useGsapKeyframeOps";
import { useGsapPropertyDebounce } from "./useGsapPropertyDebounce";
import {
  useGsapSaveFailureTelemetry,
  useSafeGsapCommitMutation,
} from "./useSafeGsapCommitMutation";
import { requestGsapMutation } from "./gsapMutationClient";
import { whileScriptWrites } from "../player/previewReloading";

async function mutateGsapScript(
  projectId: string,
  route: "gsap-mutations" | "gsap-mutations-batch",
  sourceFile: string,
  body: unknown,
): Promise<MutationResult> {
  const res = await requestGsapMutation(projectId, route, sourceFile, body);
  if (!res.ok) throw new GsapMutationHttpError(res.status, await readJsonResponseBody(res));
  const result = (await res.json()) as MutationResult;
  if (!result.ok) throw new Error(`Failed to update GSAP in ${sourceFile}`);
  return result;
}

type ShowToast = (message: string, tone?: "error" | "info") => void;

function showUnchangedMutationFeedback(
  mutations: Record<string, unknown>[],
  result: MutationResult,
  showToast: ShowToast | undefined,
): void {
  if (result.changed !== false || mutations.length !== 1) return;
  if (mutations[0]?.type === "move-keyframe") {
    showToast?.("A keyframe already exists at that time", "info");
  }
}

async function runMutationRequest(
  mutations: Record<string, unknown>[],
  options: CommitMutationOptions,
  showToast: ShowToast | undefined,
  request: () => Promise<MutationResult>,
): Promise<MutationResult | undefined> {
  const unsafeFields = mutations.flatMap((mutation) => findUnsafeMutationValues(mutation));
  if (unsafeFields.length > 0) {
    showToast?.("Couldn't read element layout. Try again at a different playhead time", "error");
    if (options.skipReload) return;
    throw markStudioSaveErrorAlreadyToasted(
      new Error(
        `Mutation contains unsafe values: ${unsafeFields.map((field) => field.path).join(", ")}`,
      ),
    );
  }
  try {
    const result = await request();
    showUnchangedMutationFeedback(mutations, result, showToast);
    return result;
  } catch (error) {
    if (error instanceof GsapMutationHttpError) {
      showToast?.(formatGsapMutationRejectionToast(error), "error");
      markStudioSaveErrorAlreadyToasted(error);
    }
    if (options.skipReload) return;
    throw error;
  }
}

function finishUnchangedMutation(
  iframe: HTMLIFrameElement | null,
  result: MutationResult,
  options: CommitMutationOptions,
  reloadPreview: () => void,
): boolean {
  if (result.changed !== false) return false;
  if (
    !options.skipReload &&
    (instantPatchesFor(options).length > 0 || options.previewFallbackLatch?.pending)
  ) {
    redrawUnlessPaintedBack(options, () =>
      applyPreviewSync(iframe, result, options, reloadPreview),
    );
  }
  return true;
}

function redrawUnlessPaintedBack(options: CommitMutationOptions, redraw: () => void): void {
  if (options.pendingEdit) options.pendingEdit.drawUnlessUndone(redraw);
  else redraw();
}

function refreshMutationPreview(
  iframe: HTMLIFrameElement | null,
  result: MutationResult,
  options: CommitMutationOptions,
  reloadPreview: () => void,
  onCacheInvalidate: () => void,
  nestedFiles?: Map<string, string> | null,
): void {
  redrawUnlessPaintedBack(options, () => {
    options.beforeReload?.();
    applyPreviewSync(iframe, result, options, reloadPreview, nestedFiles);
  });
  onCacheInvalidate();
}

function isActiveCommitTarget(
  projectIdRef: { current: string | null },
  activeCompPathRef: { current: string | null },
  projectId: string,
  compositionPath: string | null,
): boolean {
  return projectIdRef.current === projectId && activeCompPathRef.current === compositionPath;
}

function syncCommittedGsapMutation({
  iframe,
  selection,
  mutation,
  targetPath,
  result,
  options,
  onFileContentChanged,
  forceReloadSdkSession,
  reloadPreview,
  onCacheInvalidate,
  nestedFiles,
}: {
  iframe: HTMLIFrameElement | null;
  selection: DomEditSelection;
  mutation: Record<string, unknown>;
  targetPath: string;
  result: MutationResult;
  options: CommitMutationOptions;
  onFileContentChanged?: (path: string, content: string) => void;
  forceReloadSdkSession?: () => void;
  reloadPreview: () => void;
  onCacheInvalidate: () => void;
  nestedFiles?: Map<string, string> | null;
}): void {
  if (result.after != null) onFileContentChanged?.(targetPath, result.after);
  // Server wrote the file; the in-memory SDK doc is now stale. Resync it so a
  // later SDK-routed edit doesn't serialize the pre-write doc and revert this.
  forceReloadSdkSession?.();
  if (options.skipReload) return;
  if (result.parsed?.animations) {
    updateKeyframeCacheFromParsed(
      result.parsed.animations,
      targetPath,
      selection.id ?? undefined,
      mutation,
      // The live preview document is what resolves a class / descendant tween to
      // the elements it really animates; without it only whole-id selectors do.
      iframe?.contentDocument,
    );
  }
  refreshMutationPreview(iframe, result, options, reloadPreview, onCacheInvalidate, nestedFiles);
}

/**
 * Apply a soft reload and enforce the U4 invariant via the richer
 * `SoftReloadResult`, with telemetry on every non-success path so the invariant
 * is observable in production, not just asserted in tests:
 *
 * - `"cannot-soft-reload"` (PERMANENT/STRUCTURAL: no gsap runtime, no rebind
 *   hook, no scopable key, no script element, or the sync re-run threw) →
 *   escalate to a full `reloadPreview()`; the preview is genuinely stale/broken.
 * - `"verify-failed"` (TRANSIENT: re-run happened, `__timelines` momentarily
 *   empty) → do NOT escalate; the live `gsap.set` already shows the correct value
 *   and a remount would re-flash the WebGL context + revert subcomp keyframes.
 * - `"applied"` → success (or deferred to async plugin load; `onAsyncFailure`
 *   covers the CDN-error escalation).
 */
function softReloadOrEscalate(
  iframe: HTMLIFrameElement | null,
  scriptText: string,
  reloadPreview: () => void,
  origin: "preview_sync" | "sdk_refresh",
  authoredHtml?: string,
  nestedFiles?: Map<string, string> | null,
): void {
  // Seek the rebuilt timeline to the studio's own authoritative scrub position,
  // not the iframe's raw `__player.getTime()` — see the comment in
  // applySoftReload for why the two can desync after a keyframe-node drag.
  const currentTime = usePlayerStore.getState().currentTime;
  const result: SoftReloadResult = applySoftReload(iframe, scriptText, {
    onAsyncFailure: reloadPreview,
    currentTimeOverride: currentTime,
    authoredHtml,
    nestedFiles,
  });
  if (result === "applied") return;
  trackStudioEvent("gsap_soft_reload_outcome", {
    origin,
    result,
    escalated: result === "cannot-soft-reload",
  });
  // PERMANENT failure: the preview can't be soft-updated → full reload. TRANSIENT
  // "verify-failed" is suppressed (live state is correct).
  if (result === "cannot-soft-reload") reloadPreview();
}

/**
 * Sync the preview after a persisted commit. For a value-only edit
 * (`options.instantPatch`), try the in-place runtime patch first: on success the
 * preview is already correct, so we skip the reload entirely (instant). On `false`
 * — or when no `instantPatch` is supplied — fall back to the existing soft/full
 * reload. Pure (no React) so `runCommit`'s preview-sync decision is unit-testable.
 */
export function applyPreviewSync(
  iframe: HTMLIFrameElement | null,
  result: MutationResult,
  options: CommitMutationOptions,
  reloadPreview: () => void,
  nestedFiles?: Map<string, string> | null,
): void {
  const patches = instantPatchesFor(options);
  const writtenWithoutPatch = patches.length === 0;
  let needsFallback = options.previewFallbackLatch?.pending === true || writtenWithoutPatch;
  if (patches.length > 0) {
    const deferSeek = options.deferPreviewSync === true;
    const missed = patches.find(
      (patch, index) =>
        !patchRuntimeTweenInPlace(
          iframe,
          patch.selector,
          patch.change,
          undefined,
          deferSeek || index < patches.length - 1,
        ),
    );
    if (missed) {
      // The instant path couldn't patch in place — record the fallback so we can
      // track how often the fast path misses before the soft/full reload below.
      trackStudioEvent("gsap_instant_patch_fallback", { selector: missed.selector });
      needsFallback = true;
    }
    // Patched in place — elements are already correct on screen; no reload needed
    // unless an earlier deferred batch left one member unpatched.
    if (!needsFallback) return;
  }
  // Written, but the caller has more writes to make and will render after the last.
  if (options.deferPreviewSync && options.previewFallbackLatch) {
    options.previewFallbackLatch.pending = needsFallback;
    return;
  }
  if (options.deferPreviewSync && !needsFallback) return;
  if (options.previewFallbackLatch) options.previewFallbackLatch.pending = false;
  if (options.softReload && result.scriptText) {
    // A soft-reloadable edit escalates to a full iframe remount ONLY on the
    // PERMANENT "cannot-soft-reload" result (the preview is genuinely stale/
    // broken). The TRANSIENT "verify-failed" does NOT escalate — the value is
    // already correct on screen, and a remount re-flashes the WebGL context AND
    // re-inlines subcomps (reverting their keyframes). The async MotionPath-plugin
    // load failure escalates separately via `onAsyncFailure`.
    softReloadOrEscalate(
      iframe,
      result.scriptText,
      reloadPreview,
      "preview_sync",
      result.after ?? undefined,
      nestedFiles,
    );
  } else {
    reloadPreview();
  }
}

function instantPatchesFor(
  options: CommitMutationOptions,
): NonNullable<CommitMutationOptions["instantPatches"]> {
  return [
    ...(options.instantPatches ?? []),
    ...(options.instantPatch ? [options.instantPatch] : []),
  ];
}

// oxfmt-ignore
// fallow-ignore-next-line complexity
export function useGsapScriptCommits({ projectIdRef, activeCompPath, previewIframeRef, editHistory, reloadPreview, onCacheInvalidate, onFileContentChanged, showToast, sdkSession, publishSdkSession, writeProjectFile, forceReloadSdkSession }: GsapScriptCommitsParams) {
  const activeProjectId = projectIdRef.current;
  const activeCompPathRef = useRef(activeCompPath);
  activeCompPathRef.current = activeCompPath;
  // Serializer for per-key commits (options.serializeKey). Keyed by
  // `gsap:${animationId}:meta`, it chains a meta commit onto the prior one for
  // the same animationId so their POSTs can't interleave. Held in a ref so the
  // chain survives re-renders.
  const serializerRef = useRef(createKeyedSerializer());
  const recordMutationEdit = useCallback(async (targetPath: string, result: MutationResult, options: CommitMutationOptions) => {
    if (result.before == null || result.after == null) return;
    await editHistory.recordEdit({
      label: options.label,
      coalesceKey: options.coalesceKey,
      coalesceMs: options.coalesceMs,
      files: { [targetPath]: { before: result.before, after: result.after } },
    });
  }, [editHistory]);

  const finalizeSuccessfulMutation = useCallback(async (projectId: string, compositionPath: string | null, selection: DomEditSelection, mutation: Record<string, unknown>, targetPath: string, result: MutationResult, options: CommitMutationOptions) => {
    if (projectIdRef.current !== projectId) return;
    const previewIsActive = isActiveCommitTarget(
      projectIdRef,
      activeCompPathRef,
      projectId,
      compositionPath,
    );
    // A no-op file write may still owe the runtime a deferred instant patch.
    if (result.changed === false) {
      if (previewIsActive) {
        finishUnchangedMutation(previewIframeRef.current, result, options, reloadPreview);
      }
      return;
    }
    await recordMutationEdit(targetPath, result, options);
    const nestedFiles = await settleNestedReads(
      result.scriptText
        ? readNestedFiles(previewIframeRef.current, result.scriptText, (path) =>
            readSharedProjectFileContent(projectId, path),
          )
        : null,
    );
    // The durable mutation belongs to the project captured when it was queued.
    // A later project must never receive its file state or preview refresh.
    if (!isActiveCommitTarget(projectIdRef, activeCompPathRef, projectId, compositionPath)) return;
    syncCommittedGsapMutation({
      iframe: previewIframeRef.current,
      selection,
      mutation,
      targetPath,
      result,
      options,
      onFileContentChanged,
      forceReloadSdkSession,
      reloadPreview,
      onCacheInvalidate,
      nestedFiles,
    });
  }, [projectIdRef, previewIframeRef, reloadPreview, onCacheInvalidate, onFileContentChanged, forceReloadSdkSession, recordMutationEdit]);

  const runCommit = useCallback((pid: string, compositionPath: string | null, targetPath: string, selection: DomEditSelection, mutation: Record<string, unknown>, options: CommitMutationOptions) => whileScriptWrites(async () => {
    const result = await runMutationRequest([mutation], options, showToast, () =>
      mutateGsapScript(pid, "gsap-mutations", targetPath, mutation),
    );
    if (!result) return;
    trackKeyframeCommit([mutation], result, options);
    options.onResult?.(result);
    await finalizeSuccessfulMutation(pid, compositionPath, selection, mutation, targetPath, result, options);
  }), [showToast, finalizeSuccessfulMutation]);

  const runBatchCommit = useCallback((pid: string, compositionPath: string | null, targetPath: string, calls: CommitMutationCall[], options: CommitMutationOptions) => whileScriptWrites(async () => {
    const first = calls[0];
    const last = calls.at(-1);
    if (!first || !last) return;
    const mutations = calls.map(({ mutation }) => mutation);
    const result = await runMutationRequest(mutations, options, showToast, () =>
      mutateGsapScript(pid, "gsap-mutations-batch", targetPath, { mutations }),
    );
    if (!result) return;
    trackKeyframeCommit(mutations, result, options, calls.map((call) => call.options));
    options.onResult?.(result);
    // The batch wrote every call, so patch in place only when every call brought a patch; one
    // without (a resize's size write) needs the reload, or the preview keeps the old value.
    const instantPatches = calls.flatMap(({ options: callOptions }) =>
      callOptions.instantPatch ? [callOptions.instantPatch] : [],
    );
    const { instantPatch: _instantPatch, ...batchOptions } = options;
    const allPatched = instantPatches.length === calls.length;
    await finalizeSuccessfulMutation(pid, compositionPath, last.selection, last.mutation, targetPath, result, allPatched ? { ...batchOptions, instantPatches } : batchOptions);
  }), [showToast, finalizeSuccessfulMutation]);

  // Every GSAP-script commit is a read-modify-write of one file. Overlapping
  // commits to the SAME file (any op type, any animation) interleave server-side,
  // so every legacy request takes the same project/file lock as SDK writes. An
  // explicit key adds ordering for related calls but never replaces the file lock.
  const commitMutation = useMemo<CommitMutation>(() => {
    const serializeFile = <T,>(file: string, task: () => Promise<T>): Promise<T> => {
      if (writeProjectFile) {
        return serializeStudioFileMutation(writeProjectFile, file, task);
      }
      return serializerRef.current(`gsap-file:${file}`, task);
    };
    const serializeCommit = <T,>(
      file: string,
      serializeKey: string | undefined,
      task: () => Promise<T>,
    ): Promise<T> => {
      const fileKey = `gsap-file:${file}`;
      const run = () => serializeFile(file, task);
      if (serializeKey && (writeProjectFile || serializeKey !== fileKey)) {
        return serializerRef.current(serializeKey, run);
      }
      return run();
    };
    const commit: CommitMutation = trackedStudioEdit((selection, mutation, options) => {
      if (!activeProjectId) return Promise.resolve();
      const file = gsapWriteFile(selection, activeCompPath);
      return serializeCommit(file, options.serializeKey, () =>
        runCommit(activeProjectId, activeCompPath, file, selection, mutation, options),
      );
    }) as CommitMutation;
    commit.batch = trackedStudioEdit((calls: CommitMutationCall[], options: CommitMutationOptions) => {
      if (!activeProjectId) return Promise.resolve();
      const file = calls[0] ? gsapWriteFile(calls[0].selection, activeCompPath) : "index.html";
      return serializeCommit(file, options.serializeKey, () =>
        runBatchCommit(activeProjectId, activeCompPath, file, calls, options),
      );
    });
    return commit;
  }, [runCommit, runBatchCommit, activeCompPath, activeProjectId, writeProjectFile]);
  const trackGsapSaveFailure = useGsapSaveFailureTelemetry(activeCompPath);
  const handleGsapSaveFailure = useCallback(
    (
      error: unknown,
      selection: DomEditSelection,
      mutation: Record<string, unknown>,
      label?: string,
    ) => {
      trackGsapSaveFailure(error, selection, mutation, label);
      if (!isStudioSaveErrorAlreadyToasted(error)) {
        showToast?.(`Couldn't save animation: ${getStudioSaveErrorMessage(error)}`, "error");
      }
    },
    [showToast, trackGsapSaveFailure],
  );
  const commitMutationSafely = useSafeGsapCommitMutation(commitMutation, handleGsapSaveFailure);

  // One stable SDK-deps object shared by all GSAP child hooks. Memoized so the
  // hooks' callbacks keep a stable identity (an inline literal here re-fired the
  // property-debounce flush on every render). refresh() soft-reloads (preserving
  // the playhead) and invalidates the panel cache, matching the server path.
  const sdkRefresh = useCallback(
    (after: string) => {
      // extractGsapScriptText returns null when zero/multiple GSAP scripts are
      // present — that's an ambiguous/structural change that genuinely needs a full
      // reload. But a SINGLE-script soft-reloadable edit must not escalate to a full
      // remount even if applySoftReload reports failure (same U4 invariant as
      // applyPreviewSync): the live state is already correct, and a remount re-inlines
      // subcomps + reverts their keyframes.
      const script = extractGsapScriptText(after);
      if (script) {
        // Soft-reload in place. reloadPreview is the ASYNC-failure escalation — a
        // plugin-CDN load error genuinely breaks the iframe → full reload. Per U4, a
        // synchronous "verify-failed" (transient empty __timelines) does NOT escalate,
        // but a "cannot-soft-reload" (structural failure) does.
        softReloadOrEscalate(previewIframeRef.current, script, reloadPreview, "sdk_refresh", after);
      } else {
        reloadPreview();
      }
      onCacheInvalidate();
    },
    [previewIframeRef, reloadPreview, onCacheInvalidate],
  );
  // Read the on-disk bytes of targetPath so the SDK GSAP persist captures the
  // exact prior content as its undo `before` (matching the style/delete paths),
  // instead of a normalized full-DOM re-emit that would reformat the whole file.
  const readProjectFileContent = useCallback(
    (path: string): Promise<string> => {
      if (!activeProjectId) throw new Error("No active project");
      return readSharedProjectFileContent(activeProjectId, path);
    },
    [activeProjectId],
  );
  const sdkDeps = useMemo<CutoverDeps | null>(
    () =>
      writeProjectFile
        ? {
            editHistory: { recordEdit: editHistory.recordEdit },
            writeProjectFile,
            reloadPreview,
            refresh: sdkRefresh,
            compositionPath: activeCompPath,
            readProjectFile: readProjectFileContent,
            publishSession: publishSdkSession,
          }
        : null,
    [
      editHistory.recordEdit,
      writeProjectFile,
      reloadPreview,
      sdkRefresh,
      activeCompPath,
      readProjectFileContent,
      publishSdkSession,
    ],
  );

  const propertyOps = useGsapPropertyDebounce(commitMutationSafely, {
    sdkSession,
    sdkDeps,
    activeCompPath,
    onFlushError: handleGsapSaveFailure,
  });
  const animationOps = useGsapAnimationOps({
    projectIdRef,
    activeCompPath,
    commitMutation,
    commitMutationSafely,
    showToast,
    sdkSession,
    sdkDeps,
    writeProjectFile,
  });
  const keyframeOps = useGsapKeyframeOps({
    activeCompPath,
    commitMutation,
    commitMutationSafely,
    trackGsapSaveFailure: handleGsapSaveFailure,
    sdkSession,
    sdkDeps,
  });
  const arcPathOps = useGsapArcPathOps(commitMutationSafely);
  return { commitMutation, ...propertyOps, ...animationOps, ...keyframeOps, ...arcPathOps };
}
