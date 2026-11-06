import { useCallback, type MutableRefObject } from "react";
import { usePlayerStore, type TimelineElement } from "../player";
import type { TimelineLinkEdit } from "../player/components/timelineCallbacks";
import { expandToLinkedMembers } from "../player/components/audioClipLink";
import { isLinkedSelectionOn } from "../utils/linkedClipPreferences";
import { saveProjectFilesWithHistory, type RecordEditInput } from "../utils/studioFileHistory";
import { getStudioSaveErrorMessage } from "../utils/studioSaveDiagnostics";
import { readFileContent } from "./timelineEditingHelpers";
import { clipsToUnlink, planLinkEdit } from "./timelineLinkEditPlan";

interface UseTimelineLinkEditingOptions {
  projectIdRef: MutableRefObject<string | null>;
  activeCompPath: string | null;
  editQueueRef: MutableRefObject<Promise<void>>;
  pendingTimelineEditPathRef: MutableRefObject<Set<string>>;
  isRecordingRef?: MutableRefObject<boolean>;
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  reloadPreview: () => void;
  forceReloadSdkSession?: () => void;
  handleTimelineElementsDelete: (
    selection: TimelineElement[],
    alsoUnlink?: readonly TimelineElement[],
  ) => Promise<void>;
}

const keyOf = (el: TimelineElement) => el.key ?? el.id;

/** Every clip a link edit writes, for the edit-permission gate. */
export function linkEditTargets(edit: TimelineLinkEdit): TimelineElement[] {
  switch (edit.kind) {
    case "unlink":
    case "link":
      return [...edit.elements];
    case "detach":
    case "move-into-sync":
    case "slip-into-sync":
      return [edit.element];
    case "merge":
      return [edit.video, edit.audio];
  }
}

export function withLinkPartners(selection: readonly TimelineElement[]): TimelineElement[] {
  const elements = usePlayerStore.getState().elements;
  const keys = expandToLinkedMembers(selection.map(keyOf), elements, isLinkedSelectionOn());
  const known = new Set(selection.map(keyOf));
  return [...selection, ...elements.filter((el) => keys.has(keyOf(el)) && !known.has(keyOf(el)))];
}

function clearSelectionOnUnlink(edit: TimelineLinkEdit): void {
  if (edit.kind === "unlink") usePlayerStore.getState().clearSelection();
}

export function useTimelineLinkEditing({
  projectIdRef,
  activeCompPath,
  editQueueRef,
  pendingTimelineEditPathRef,
  isRecordingRef,
  showToast,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  forceReloadSdkSession,
  handleTimelineElementsDelete,
}: UseTimelineLinkEditingOptions) {
  const handleLinkEdit = useCallback(
    async (edit: TimelineLinkEdit) => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const pid = projectIdRef.current;
      const plan = planLinkEdit(edit, usePlayerStore.getState().elements);
      if (!pid || !plan) return;
      clearSelectionOnUnlink(edit);
      const path = plan.anchor.sourceFile || activeCompPath || "index.html";
      pendingTimelineEditPathRef.current.add(path);
      const queued = editQueueRef.current.then(() =>
        saveProjectFilesWithHistory({
          projectId: pid,
          label: plan.label,
          files: {
            [path]: (current) => {
              const next = plan.transform(current);
              if (next === null || next === current) {
                throw new Error(`Couldn't ${plan.label.toLowerCase()}`);
              }
              return next;
            },
          },
          readFile: (filePath) => readFileContent(pid, filePath),
          writeFile: writeProjectFile,
          recordEdit,
        }),
      );
      editQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      try {
        await queued;
        forceReloadSdkSession?.();
        reloadPreview();
      } catch (error) {
        showToast(getStudioSaveErrorMessage(error), "error");
      }
    },
    [
      activeCompPath,
      editQueueRef,
      forceReloadSdkSession,
      isRecordingRef,
      pendingTimelineEditPathRef,
      projectIdRef,
      recordEdit,
      reloadPreview,
      showToast,
      writeProjectFile,
    ],
  );

  const handleLinkedElementsDelete = useCallback(
    (selection: TimelineElement[]) => {
      if (isLinkedSelectionOn()) return handleTimelineElementsDelete(withLinkPartners(selection));
      const removed = new Set(selection.map(keyOf));
      const orphans = clipsToUnlink(selection, usePlayerStore.getState().elements).filter(
        (el) => !removed.has(keyOf(el)),
      );
      return handleTimelineElementsDelete(selection, orphans);
    },
    [handleTimelineElementsDelete],
  );

  const handleLinkedElementDelete = useCallback(
    (element: TimelineElement) => handleLinkedElementsDelete([element]),
    [handleLinkedElementsDelete],
  );

  const handleDeleteElementOnly = useCallback(
    (element: TimelineElement) => {
      const orphans = clipsToUnlink([element], usePlayerStore.getState().elements).filter(
        (el) => keyOf(el) !== keyOf(element),
      );
      return handleTimelineElementsDelete([element], orphans);
    },
    [handleTimelineElementsDelete],
  );

  return {
    handleLinkEdit,
    handleLinkedElementsDelete,
    handleLinkedElementDelete,
    handleDeleteElementOnly,
  };
}
