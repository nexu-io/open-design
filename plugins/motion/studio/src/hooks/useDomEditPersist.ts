import { useCallback, useRef } from "react";
import { findUnsafeDomPatchValues } from "@hyperframes/core/studio-api/finite-mutation";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { buildDomEditPatchTarget, type DomEditSelection } from "../components/editor/domEditing";
import type { PersistDomEditOperations } from "./domEditCommitTypes";
import type { PatchOperation } from "../utils/sourcePatcher";
import {
  DomEditPersistUnsafeValueError,
  DomEditPersistPreparedWriteError,
  DomEditPersistUnresolvableError,
  warnDomEditPersistNoOp,
} from "./domEditPersistFailure";
import {
  formatUnsafeFieldList,
  postPatchElement,
  writePreparedContent,
} from "./useDomEditCommitsHelpers";
import { importedFontFaceCssFor } from "../utils/studioFontHelpers";
import { countStudioManualEditSave } from "../components/editor/manualEditsDom";
import type { CutoverResult } from "../utils/sdkCutover";
import { reseekPreviewRuntime } from "./timelineTrackVisibility";
import { serializeStudioFileMutations } from "../utils/studioFileMutationCoordinator";
import { readProjectFileContent } from "../utils/studioFileHistory";

import type { RecordEditInput } from "../utils/studioFileHistory";
export type { RecordEditInput } from "../utils/studioFileHistory";

export interface UseDomEditPersistParams {
  activeCompPath: string | null;
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  queueDomEditSave: <T>(save: () => Promise<T>) => Promise<T>;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  editHistory: { recordEdit: (entry: RecordEditInput) => Promise<void> };
  projectIdRef: React.MutableRefObject<string | null>;
  reloadPreview: () => void;
  forceReloadSdkSession?: () => void;
  onTrySdkPersist?: (
    selection: DomEditSelection,
    operations: PatchOperation[],
    originalContent: string,
    targetPath: string,
    options?: { label?: string; coalesceKey?: string; skipRefresh?: boolean },
  ) => Promise<CutoverResult>;
}

/** Studio's one DOM-edit writer: patches the source file, records history, then reloads or reseeks the preview. */
export function useDomEditPersist({
  activeCompPath,
  previewIframeRef,
  showToast,
  queueDomEditSave,
  writeProjectFile,
  editHistory,
  projectIdRef,
  reloadPreview,
  forceReloadSdkSession,
  onTrySdkPersist,
}: UseDomEditPersistParams): PersistDomEditOperations {
  const reportedUnresolvableRef = useRef(new Set<string>());

  // fallow-ignore-next-line complexity
  const performPersistDomEditOperations = useCallback(
    // fallow-ignore-next-line complexity
    async (
      selection: DomEditSelection,
      operations: PatchOperation[],
      options: Parameters<PersistDomEditOperations>[2],
      expectedProjectId: string,
    ) => {
      if (projectIdRef.current !== expectedProjectId) {
        throw new Error("Active project changed before the edit could be saved");
      }
      const pid = expectedProjectId;
      if (options?.shouldSave && !options.shouldSave()) return;

      const targetPath = selection.sourceFile || activeCompPath || "index.html";
      const completePersistence = <T>(result: T, changed: boolean): T => {
        if (options?.skipRefresh && changed && !options.deferRender)
          reseekPreviewRuntime(previewIframeRef.current);
        return result;
      };

      const readTarget = async (): Promise<string | null> => {
        const content = await readProjectFileContent(pid, targetPath);
        if (projectIdRef.current !== expectedProjectId) {
          throw new Error("Active project changed before the edit could be saved");
        }
        return options?.shouldSave && !options.shouldSave() ? null : content;
      };

      // Validate layout values BEFORE any persist path runs. The SDK cutover
      // path (onTrySdkPersist) returns early on success, so leaving this check
      // after it let invalid numeric values bypass the guard whenever the
      // cutover flag was on.
      const patchTarget = buildDomEditPatchTarget(selection);
      const font = options?.importedFont;
      const patchBody = {
        target: patchTarget,
        operations,
        ...(font ? { fontFaceCss: importedFontFaceCssFor(font, targetPath) } : {}),
      };
      const unsafeFields = findUnsafeDomPatchValues(patchBody);
      if (unsafeFields.length > 0) {
        const fields = formatUnsafeFieldList(unsafeFields);
        showToast("Couldn't save edit because it contains invalid layout values", "error");
        throw new DomEditPersistUnsafeValueError(`DOM patch contains unsafe values: ${fields}`, {
          alreadyToasted: true,
        });
      }

      // An imported font or prepareContent takes the server patch; the SDK serializes only the patched
      // DOM. The SDK re-reads in the file queue; this read is its fallback.
      if (onTrySdkPersist && !font && !options?.prepareContent && !options?.validateContent) {
        const originalContent = await readTarget();
        if (originalContent === null) return;
        const cutover = await onTrySdkPersist(selection, operations, originalContent, targetPath, {
          label: options?.label,
          coalesceKey: options?.coalesceKey,
          skipRefresh: options?.skipRefresh,
        });
        if (cutover.status === "failed") throw cutover.error;
        if (cutover.status === "committed") {
          // SDK handled it — its in-memory doc is already current, so do NOT
          // forceReload (that would echo-reload the session we just wrote).
          return completePersistence(
            { sourceFile: targetPath, version: cutover.version, changed: true },
            true,
          );
        }
      }

      const history = {
        label: options?.label ?? "Edit layer",
        coalesceKey: options?.coalesceKey,
        coalesceMs: options?.coalesceMs,
      };
      const prepare = options?.prepareContent;
      let preparedWriteFailed = false;
      // Read, server patch, follow-up write and history hold the file's queue, so no save lands between them.
      const saved = await serializeStudioFileMutations(writeProjectFile, [targetPath], async () => {
        const originalContent = await readTarget();
        if (originalContent === null) return null;
        options?.validateContent?.(originalContent);
        const patchData = await postPatchElement(pid, targetPath, patchBody, showToast);
        if (!patchData.changed) return { patchData, patchedContent: null, finalContent: null };

        const patchedContent =
          typeof patchData.content === "string" ? patchData.content : originalContent;
        const prepared = prepare
          ? await writePreparedContent(
              targetPath,
              patchedContent,
              prepare,
              writeProjectFile,
              showToast,
            )
          : { content: patchedContent, failed: false };
        preparedWriteFailed = prepared.failed;
        const finalContent = prepared.content;

        await editHistory.recordEdit({
          ...history,
          targets: [
            {
              file: targetPath,
              ...(selection.id && { id: selection.id }),
              ...(selection.hfId && { hfId: selection.hfId }),
              ...(selection.selector && { selector: selection.selector }),
              ...(selection.selectorIndex !== undefined && {
                selectorIndex: selection.selectorIndex,
              }),
            },
          ],
          files: { [targetPath]: { before: originalContent, after: finalContent } },
        });
        return { patchData, patchedContent, finalContent };
      });
      if (saved === null) return;
      const { patchData, patchedContent, finalContent } = saved;

      if (finalContent === null) {
        if (patchData.matched === false) {
          const targetKey = selection.selector ?? selection.id ?? "selection";
          if (!reportedUnresolvableRef.current.has(targetKey)) {
            reportedUnresolvableRef.current.add(targetKey);
            trackStudioEvent("save_skipped_unresolvable", {
              target_id: selection.id ?? undefined,
              target_selector: selection.selector ?? undefined,
              target_source_file: selection.sourceFile ?? undefined,
              composition: activeCompPath ?? undefined,
            });
          }
          throw new DomEditPersistUnresolvableError(targetPath);
        }
        warnDomEditPersistNoOp(selection, operations);
        return completePersistence(
          typeof patchData.path === "string" && typeof patchData.version === "string"
            ? { sourceFile: patchData.path, version: patchData.version, changed: false }
            : undefined,
          false,
        );
      }
      forceReloadSdkSession?.();

      if (!options?.skipRefresh) {
        reloadPreview();
      }
      const outcome = completePersistence(
        finalContent === patchedContent &&
          typeof patchData.path === "string" &&
          typeof patchData.version === "string"
          ? { sourceFile: patchData.path, version: patchData.version, changed: true }
          : undefined,
        true,
      );
      if (preparedWriteFailed) throw new DomEditPersistPreparedWriteError(targetPath);
      return outcome;
    },
    [
      activeCompPath,
      editHistory,
      writeProjectFile,
      projectIdRef,
      reloadPreview,
      showToast,
      forceReloadSdkSession,
      onTrySdkPersist,
      previewIframeRef,
    ],
  );

  const persistDomEditOperations: PersistDomEditOperations = useCallback(
    (selection, operations, options) => {
      const expectedProjectId = projectIdRef.current;
      if (!expectedProjectId) return Promise.reject(new Error("No active project"));
      // Counted, so a preview reload requested before this save settles is not shown over it.
      const save = () =>
        queueDomEditSave(() =>
          performPersistDomEditOperations(selection, operations, options, expectedProjectId),
        );
      return selection.element ? countStudioManualEditSave(selection.element, save) : save();
    },
    [performPersistDomEditOperations, projectIdRef, queueDomEditSave],
  );

  return persistDomEditOperations;
}
