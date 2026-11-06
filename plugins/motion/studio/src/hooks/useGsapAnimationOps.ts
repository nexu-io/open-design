import { useCallback } from "react";
import {
  serializeStudioFileMutation,
  type StudioProjectFileWriter,
} from "../utils/studioFileMutationCoordinator";
import type { Composition } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { roundTo3 } from "../utils/rounding";
import {
  sdkGsapTweenPersist,
  sdkGsapDeleteAllForSelectorPersist,
  sdkAddWithKeyframesPersist,
  sdkReplaceWithKeyframesPersist,
  cutoverCommittedOrThrow,
  type CutoverDeps,
} from "../utils/sdkCutover";
import { ensureElementAddressable } from "./gsapScriptCommitHelpers";
import { idSelector } from "./gsapShared";
import { assignGsapTargetAutoIdIfNeeded } from "./useDomEditCommitsHelpers";
import type { CommitMutation, SafeGsapCommitMutation } from "./gsapScriptCommitTypes";

interface SdkAnimationDeps {
  sdkSession?: Composition | null;
  sdkDeps?: CutoverDeps | null;
}

interface GsapAnimationOpsParams extends SdkAnimationDeps {
  projectIdRef: React.MutableRefObject<string | null>;
  activeCompPath: string | null;
  commitMutation: CommitMutation;
  commitMutationSafely: SafeGsapCommitMutation;
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile?: StudioProjectFileWriter;
}

export function useGsapAnimationOps({
  projectIdRef,
  activeCompPath,
  commitMutation,
  commitMutationSafely,
  showToast,
  sdkSession,
  sdkDeps,
  writeProjectFile,
}: GsapAnimationOpsParams) {
  const updateGsapMeta = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      updates: { duration?: number; ease?: string; easeEach?: string; position?: number },
    ) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          { kind: "set", animationId, properties: updates },
          sdkSession,
          sdkDeps,
          { label: "Edit GSAP animation", coalesceKey: `gsap:${animationId}:meta` },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      return commitMutationSafely(
        selection,
        { type: "update-meta", animationId, updates },
        { label: "Edit GSAP animation", coalesceKey: `gsap:${animationId}:meta`, softReload: true },
      );
    },
    [commitMutationSafely, activeCompPath, sdkSession, sdkDeps],
  );

  const deleteGsapAnimation = useCallback(
    async (selection: DomEditSelection, animationId: string) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          { kind: "remove", animationId },
          sdkSession,
          sdkDeps,
          { label: "Delete GSAP animation" },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      return commitMutationSafely(
        selection,
        { type: "delete", animationId, stripStudioEdits: true },
        { label: "Delete GSAP animation", softReload: true },
      );
    },
    [commitMutationSafely, activeCompPath, sdkSession, sdkDeps],
  );

  const deleteAllForSelector = useCallback(
    async (selection: DomEditSelection, targetSelector: string) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapDeleteAllForSelectorPersist(
          targetPath,
          targetSelector,
          sdkSession,
          sdkDeps,
          { label: "Delete all animations for element" },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      void commitMutation(
        selection,
        { type: "delete-all-for-selector", targetSelector },
        { label: "Delete all animations for element", softReload: true },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  // fallow-ignore-next-line complexity
  const addGsapAnimation = useCallback(
    // fallow-ignore-next-line complexity
    async (
      selection: DomEditSelection,
      method: "to" | "from" | "set" | "fromTo",
      _currentTime?: number,
    ) => {
      const address = ensureElementAddressable(selection);
      const { autoId } = address;
      let selector = address.selector;

      if (autoId) {
        const pid = projectIdRef.current;
        if (!pid) return;
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const assign = () =>
          assignGsapTargetAutoIdIfNeeded({
            projectId: pid,
            targetPath,
            selection,
            autoId,
            showToast,
          });
        const savedId = await (writeProjectFile
          ? serializeStudioFileMutation(writeProjectFile, targetPath, assign)
          : assign());
        if (!savedId) return;
        selection.element.setAttribute("id", savedId);
        selector = idSelector(savedId);
      }

      const elStart = Number.parseFloat(selection.dataAttributes?.start ?? "0") || 0;
      const elDuration = Number.parseFloat(selection.dataAttributes?.duration ?? "1") || 1;
      const position = roundTo3(elStart);
      const duration = roundTo3(elDuration);
      const toDefaults: Record<string, Record<string, number>> = {
        from: { opacity: 0 },
        to: { x: 0, y: 0, opacity: 1 },
        set: { opacity: 1 },
        fromTo: { x: 0, y: 0, opacity: 1 },
      };

      // After an id write (autoId) the SDK session has not reloaded the file yet,
      // so persisting its serialization would drop the new id.
      if (!autoId && selection.hfId && sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const spec = {
          method,
          position,
          ...(method !== "set" ? { duration, ease: "power2.out" as const } : {}),
          properties: toDefaults[method] ?? { opacity: 1 },
          ...(method === "fromTo" ? { fromProperties: { opacity: 0 } } : {}),
        };
        const handled = await sdkGsapTweenPersist(
          targetPath,
          { kind: "add", target: selection.hfId, spec },
          sdkSession,
          sdkDeps,
          { label: `Add GSAP ${method} animation` },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }

      await commitMutation(
        selection,
        {
          type: "add",
          targetSelector: selector,
          method,
          position,
          duration: method === "set" ? undefined : duration,
          ease: method === "set" ? undefined : "power2.out",
          properties: toDefaults[method] ?? { opacity: 1 },
          fromProperties: method === "fromTo" ? { opacity: 0 } : undefined,
        },
        { label: `Add GSAP ${method} animation`, softReload: true },
      );
    },
    [
      activeCompPath,
      commitMutation,
      projectIdRef,
      showToast,
      sdkSession,
      sdkDeps,
      writeProjectFile,
    ],
  );

  type KeyframeEntry = {
    percentage: number;
    properties: Record<string, number | string>;
    ease?: string;
    auto?: boolean;
  };

  const addWithKeyframes = useCallback(
    async (
      selection: DomEditSelection,
      targetSelector: string,
      position: number,
      duration: number,
      keyframes: KeyframeEntry[],
      ease?: string,
      label = "Add animation with keyframes",
    ) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkAddWithKeyframesPersist(
          targetPath,
          targetSelector,
          position,
          duration,
          keyframes,
          ease,
          sdkSession,
          sdkDeps,
          { label },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      void commitMutation(
        selection,
        {
          type: "add-with-keyframes",
          targetSelector,
          position,
          duration,
          keyframes,
          ...(ease ? { ease } : {}),
        },
        { label, softReload: true },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  const replaceWithKeyframes = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      targetSelector: string,
      position: number,
      duration: number,
      keyframes: KeyframeEntry[],
      ease?: string,
      label = "Replace animation with keyframes",
    ) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkReplaceWithKeyframesPersist(
          targetPath,
          animationId,
          targetSelector,
          position,
          duration,
          keyframes,
          ease,
          sdkSession,
          sdkDeps,
          { label },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      void commitMutation(
        selection,
        {
          type: "replace-with-keyframes",
          animationId,
          targetSelector,
          position,
          duration,
          keyframes,
          ...(ease ? { ease } : {}),
        },
        { label, softReload: true },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  return {
    updateGsapMeta,
    deleteGsapAnimation,
    deleteAllForSelector,
    addGsapAnimation,
    addWithKeyframes,
    replaceWithKeyframes,
  };
}
