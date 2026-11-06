import { trackKeyframeUsage } from "../utils/keyframeUsage";
// fallow-ignore-file code-duplication
// Add/remove operation-family transaction shapes stay parallel until SDK graduation.
import { useCallback } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { Composition } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { executeOptimistic } from "../utils/optimisticUpdate";
import {
  sdkGsapKeyframePersist,
  sdkGsapRemoveKeyframePersist,
  sdkGsapRemoveAllKeyframesPersist,
  sdkGsapConvertToKeyframesPersist,
  cutoverCommittedOrThrow,
  type CutoverDeps,
} from "../utils/sdkCutover";
import type { KeyframeCacheEntry } from "../player/store/playerStore";
import { commitKeyframeAtTimeImpl } from "./gsapKeyframeCommit";
import {
  clearKeyframeCacheForElement,
  readKeyframeSnapshot,
  writeKeyframeCache,
} from "./gsapKeyframeCacheHelpers";
import type {
  CommitMutation,
  CommitMutationOptions,
  SafeGsapCommitMutation,
  TrackGsapSaveFailure,
} from "./gsapScriptCommitTypes";

function executeOptimisticKeyframeCacheUpdate(options: {
  sourceFile: string;
  elementId: string | null | undefined;
  apply: (entry: KeyframeCacheEntry) => KeyframeCacheEntry;
  persist: () => Promise<void>;
}): Promise<void> {
  return executeOptimistic<KeyframeCacheEntry | undefined>({
    apply: () => {
      const prev = readKeyframeSnapshot(options.sourceFile, options.elementId);
      if (prev) writeKeyframeCache(options.sourceFile, options.elementId, options.apply(prev));
      return prev;
    },
    persist: options.persist,
    rollback: (prev) => {
      writeKeyframeCache(options.sourceFile, options.elementId, prev);
    },
  });
}

interface SdkKeyframeDeps {
  sdkSession?: Composition | null;
  sdkDeps?: CutoverDeps | null;
}

interface GsapKeyframeOpsParams extends SdkKeyframeDeps {
  activeCompPath: string | null;
  commitMutation: CommitMutation;
  commitMutationSafely: SafeGsapCommitMutation;
  trackGsapSaveFailure: TrackGsapSaveFailure;
}

/**
 * Translate a gesture's commit overrides into the SDK persist options. The
 * server path's `softReload`/`skipReload` maps to the SDK's `skipRefresh`, and
 * `coalesceKey`/`coalesceMs` must ride along so an SDK-routed edit folds into
 * one undo entry the same way the server path does.
 */
function toSdkPersistOptions(label: string, overrides?: Partial<CommitMutationOptions>) {
  return {
    label,
    coalesceKey: overrides?.coalesceKey,
    coalesceMs: overrides?.coalesceMs,
    skipRefresh: overrides?.skipReload,
  };
}

export function useGsapKeyframeOps({
  activeCompPath,
  commitMutation,
  commitMutationSafely,
  trackGsapSaveFailure,
  sdkSession,
  sdkDeps,
}: GsapKeyframeOpsParams) {
  const addKeyframe = useCallback(
    (
      selection: DomEditSelection,
      animationId: string,
      percentage: number,
      property: string,
      value: number | string,
    ) => {
      const sourceFile = selection.sourceFile || activeCompPath || "index.html";
      const mutation = {
        type: "add-keyframe",
        animationId,
        percentage,
        properties: { [property]: value },
      };
      void executeOptimisticKeyframeCacheUpdate({
        sourceFile,
        elementId: selection.id,
        // Merge into an existing keyframe at this percentage rather than
        // appending a duplicate — matches addKeyframeToScript, which writes one
        // keyframe per percentage (merging properties).
        apply: (prev) => {
          // Match addKeyframeToScript's merge tolerance (PCT_TOLERANCE = 2 in
          // gsapWriterAcorn): a keyframe added within 2% of an existing one
          // merges on disk, so the optimistic cache must merge it too — else the
          // UI shows a phantom keyframe that vanishes on the next reload.
          const idx = prev.keyframes.findIndex(
            (kf) => Math.abs((kf.tweenPercentage ?? kf.percentage) - percentage) <= 2,
          );
          if (idx >= 0) {
            const keyframes = prev.keyframes.slice();
            keyframes[idx] = {
              ...keyframes[idx],
              properties: { ...keyframes[idx].properties, [property]: value },
            };
            return { ...prev, keyframes };
          }
          return {
            ...prev,
            keyframes: [...prev.keyframes, { percentage, properties: { [property]: value } }].sort(
              (a, b) => a.percentage - b.percentage,
            ),
          };
        },
        persist: async () => {
          if (sdkSession && sdkDeps) {
            const handled = await sdkGsapKeyframePersist(
              sourceFile,
              animationId,
              percentage,
              { [property]: value },
              sdkSession,
              sdkDeps,
              {
                label: `Add keyframe at ${percentage}%`,
                coalesceKey: `gsap:${animationId}:kf:${percentage}`,
              },
            );
            if (cutoverCommittedOrThrow(handled)) {
              if (handled.before !== handled.after) trackKeyframeUsage("add", property);
              return;
            }
          }
          await commitMutation(selection, mutation, {
            label: `Add keyframe at ${percentage}%`,
            keyframeProperty: property,
            softReload: true,
          });
        },
      }).catch((error) => {
        trackGsapSaveFailure(error, selection, mutation, `Add keyframe at ${percentage}%`);
      });
    },
    [activeCompPath, commitMutation, trackGsapSaveFailure, sdkSession, sdkDeps],
  );

  const addKeyframeBatch = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      percentage: number,
      properties: Record<string, number | string>,
      commitOverrides?: Partial<CommitMutationOptions>,
    ) => {
      if (sdkSession && sdkDeps) {
        const sourceFile = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapKeyframePersist(
          sourceFile,
          animationId,
          percentage,
          properties,
          sdkSession,
          sdkDeps,
          toSdkPersistOptions(`Add keyframe at ${percentage}%`, commitOverrides),
        );
        if (cutoverCommittedOrThrow(handled)) {
          if (handled.before !== handled.after && commitOverrides?.keyframeTelemetry !== false)
            trackKeyframeUsage("add");
          return;
        }
      }
      return commitMutation(
        selection,
        { type: "add-keyframe", animationId, percentage, properties },
        {
          label: `Add keyframe at ${percentage}%`,
          softReload: true,
          ...commitOverrides,
        },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  const removeKeyframe = useCallback(
    (
      selection: DomEditSelection,
      animationId: string,
      percentage: number,
      commitOverrides?: Partial<CommitMutationOptions>,
    ) => {
      const sourceFile = selection.sourceFile || activeCompPath || "index.html";
      const mutation = { type: "remove-keyframe", animationId, percentage };
      void executeOptimisticKeyframeCacheUpdate({
        sourceFile,
        elementId: selection.id,
        apply: (prev) => ({
          ...prev,
          // Match the writer's removal tolerance (PCT_TOLERANCE = 2 in
          // gsapWriterAcorn): removing at e.g. 49% drops a keyframe at 50% on
          // disk, so the optimistic cache must drop it too — else the stranded
          // entry is a phantom that vanishes on the next reload (mirror of the
          // add-path tolerance fix).
          keyframes: prev.keyframes.filter(
            (kf) => Math.abs((kf.tweenPercentage ?? kf.percentage) - percentage) > 2,
          ),
        }),
        persist: async () => {
          const label = `Remove keyframe at ${percentage}%`;
          if (sdkSession && sdkDeps) {
            const handled = await sdkGsapRemoveKeyframePersist(
              sourceFile,
              animationId,
              percentage,
              sdkSession,
              sdkDeps,
              toSdkPersistOptions(label, commitOverrides),
            );
            if (cutoverCommittedOrThrow(handled)) return;
          }
          const commitOptions = commitOverrides?.skipReload
            ? { label, ...commitOverrides }
            : { label, softReload: true, ...commitOverrides };
          await commitMutation(selection, mutation, commitOptions);
        },
      }).catch((error) => {
        trackGsapSaveFailure(error, selection, mutation, `Remove keyframe at ${percentage}%`);
      });
    },
    [activeCompPath, commitMutation, trackGsapSaveFailure, sdkSession, sdkDeps],
  );

  const moveKeyframe = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      fromPercentage: number,
      toPercentage: number,
    ) => {
      const mutation = { type: "move-keyframe", animationId, fromPercentage, toPercentage };
      // No SDK persist helper exists for retime — server path only. The post-commit
      // updateKeyframeCacheFromParsed re-keys the diamond from the fresh parse, so no
      // optimistic cache write is needed (mapping the tween-% to clip-% here would
      // duplicate that math). softReload mirrors remove-keyframe.
      try {
        let changed = false;
        await commitMutation(selection, mutation, {
          label: `Move keyframe to ${toPercentage}%`,
          softReload: true,
          onResult: (result) => {
            changed = result.changed !== false;
          },
        });
        return changed;
      } catch (error) {
        trackGsapSaveFailure(error, selection, mutation, `Move keyframe to ${toPercentage}%`);
        return false;
      }
    },
    [commitMutation, trackGsapSaveFailure],
  );

  const resizeKeyframedTween = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      position: number,
      duration: number,
      pctRemap: Array<{ from: number; to: number }>,
    ) => {
      const mutation = {
        type: "resize-keyframed-tween",
        animationId,
        position,
        duration,
        pctRemap,
      };
      // Boundary drag-to-retime: the server re-keys keyframes in place + grows the
      // tween window, preserving _auto / per-keyframe ease / easeEach / outer ease.
      // softReload re-keys the diamonds from the fresh parse (mirrors moveKeyframe).
      try {
        let changed = false;
        await commitMutation(selection, mutation, {
          label: "Retime keyframe (resize tween)",
          softReload: true,
          onResult: (result) => {
            changed = result.changed !== false;
          },
        });
        return changed;
      } catch (error) {
        trackGsapSaveFailure(error, selection, mutation, "Retime keyframe (resize tween)");
        return false;
      }
    },
    [commitMutation, trackGsapSaveFailure],
  );

  const convertToKeyframes = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      resolvedFromValues?: Record<string, number | string>,
      duration?: number,
      commitOverrides: Partial<CommitMutationOptions> = { softReload: true },
    ) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapConvertToKeyframesPersist(
          targetPath,
          animationId,
          resolvedFromValues,
          sdkSession,
          sdkDeps,
          toSdkPersistOptions("Convert to keyframes", commitOverrides),
        );
        if (cutoverCommittedOrThrow(handled)) {
          if (handled.before !== handled.after && commitOverrides.keyframeTelemetry !== false)
            trackKeyframeUsage("convert");
          return;
        }
      }
      return commitMutation(
        selection,
        // `duration` only applies when the target is a static `set` (which has
        // none) — it spans the converted keyframes across the element's clip.
        { type: "convert-to-keyframes", animationId, resolvedFromValues, duration },
        { label: "Convert to keyframes", ...commitOverrides },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  const removeAllKeyframes = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      action: "remove_all" | "reset" = "remove_all",
      telemetry = true,
    ): Promise<boolean> => {
      const targetPath = selection.sourceFile || activeCompPath || "index.html";
      // A class/descendant selector can resolve a live element whose selection
      // deliberately has no id. The cache is still keyed by that DOM id.
      const clearCache = () => {
        const cacheElementId = selection.id || selection.element?.id;
        if (cacheElementId) clearKeyframeCacheForElement(targetPath, cacheElementId);
      };
      if (sdkSession && sdkDeps) {
        const handled = await sdkGsapRemoveAllKeyframesPersist(
          targetPath,
          animationId,
          sdkSession,
          sdkDeps,
          { label: "Remove all keyframes" },
        );
        if (cutoverCommittedOrThrow(handled)) {
          clearCache();
          const changed = handled.before !== handled.after;
          if (changed && telemetry) trackKeyframeUsage(action);
          return changed;
        }
      }
      let changed = false;
      await commitMutationSafely(
        selection,
        { type: "remove-all-keyframes", animationId },
        {
          label: "Remove all keyframes",
          keyframeAction: action,
          keyframeTelemetry: telemetry,
          softReload: true,
          // The committed result is the single success boundary: clearing
          // before it makes failed saves lie, while waiting for the reload leaves
          // stale diamonds visible during the source round-trip.
          onResult: (result) => {
            changed = result.ok && result.changed === true;
            if (changed) clearCache();
          },
        },
      );
      return changed;
    },
    [commitMutationSafely, activeCompPath, sdkSession, sdkDeps],
  );

  const commitKeyframeAtTime = useCallback(
    (
      selection: DomEditSelection,
      absoluteTime: number,
      animations: GsapAnimation[],
      properties: Record<string, number | string>,
    ) => commitKeyframeAtTimeImpl(selection, absoluteTime, animations, properties, commitMutation),
    [commitMutation],
  );

  return {
    addKeyframe,
    addKeyframeBatch,
    removeKeyframe,
    moveKeyframe,
    resizeKeyframedTween,
    convertToKeyframes,
    removeAllKeyframes,
    commitKeyframeAtTime,
  };
}
