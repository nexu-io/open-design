/**
 * C1's clip-level FX write: persist one attribute directly on a specific
 * timeline clip, addressed by the clip itself rather than the current
 * selection — so applying a preset from the timeline FX popover doesn't
 * depend on that clip already being selected in the property panel.
 * Built on `persistElementAttribute` (`timelineEditingHelpers.ts`), the
 * shared core `setAudioGroupAttribute` also uses.
 */

import { useCallback } from "react";
import type { TimelineElement } from "../player";
import {
  buildPatchTarget,
  findTimelineElementInIframe,
  persistElementAttribute,
  readSavedAttribute,
} from "./timelineEditingHelpers";
import { useLiveLanes, type LiveLaneRestore, type LiveLaneSource } from "./liveLanes";
import type {
  MutableRef,
  UseTimelineElementVisibilityEditingInput,
} from "./timelineTrackVisibility";
import {
  failedTimelineSave,
  projectForTimelineSave,
  type TimelineEditOutcome,
} from "./timelineEditPermission";
import { syncStoredElementAttribute } from "../player/lib/automationStoreSync";

function patchLiveElementAttribute(
  iframe: HTMLIFrameElement | null,
  element: TimelineElement,
  attr: string,
  value: string | null,
  activeCompPath: string | null,
): void {
  const target = findTimelineElementInIframe(iframe, element, activeCompPath);
  if (!target) return;
  if (value === null) target.removeAttribute(attr);
  else target.setAttribute(attr, value);
}

function elementAttributeLiveKey(
  element: TimelineElement,
  activeCompPath: string | null,
  attr: string,
): string {
  return `${element.sourceFile || activeCompPath || "index.html"}\0${element.key ?? element.domId ?? element.id}\0${attr}`;
}

function elementSaveTarget(element: TimelineElement, activeCompPath: string | null) {
  return {
    targetPath: element.sourceFile || activeCompPath || "index.html",
    patchTarget: buildPatchTarget(element),
  };
}

function elementLiveSource(
  element: TimelineElement,
  activeCompPath: string | null,
  attr: string,
): LiveLaneSource {
  const { targetPath, patchTarget } = elementSaveTarget(element, activeCompPath);
  return { path: targetPath, target: patchTarget, attr };
}

interface SetElementAttributeInput {
  projectId: string;
  activeCompPath: string | null;
  element: TimelineElement;
  attr: string;
  value: string | null;
  label: string;
  patchLive: (value: string | null) => void;
  onFileRead: (value: string | null) => void;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: Parameters<typeof persistElementAttribute>[0]["recordEdit"];
  pendingTimelineEditPathRef: MutableRef<Set<string>>;
}

async function setElementAttribute({
  projectId,
  activeCompPath,
  element,
  attr,
  value,
  label,
  patchLive,
  onFileRead,
  writeProjectFile,
  recordEdit,
  pendingTimelineEditPathRef,
}: SetElementAttributeInput): Promise<string[] | null> {
  const { targetPath, patchTarget } = elementSaveTarget(element, activeCompPath);
  if (!patchTarget) return null;

  return persistElementAttribute({
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
  });
}

export function useSetElementAttribute({
  projectIdRef,
  activeCompPath,
  showToast,
  writeProjectFile,
  recordEdit,
  previewIframeRef,
  pendingTimelineEditPathRef,
  isRecordingRef,
}: UseTimelineElementVisibilityEditingInput): {
  setLive: (element: TimelineElement, attr: string, value: string | null) => void;
  setQuiet: (
    element: TimelineElement,
    attr: string,
    value: string | null,
    label: string,
  ) => Promise<TimelineEditOutcome>;
  revertLive: (element: TimelineElement, attr: string) => void;
  restoreLive: (restore: LiveLaneRestore) => void;
} {
  const liveLanes = useLiveLanes(projectIdRef, activeCompPath);
  const setLive = useCallback(
    (element: TimelineElement, attr: string, value: string | null) => {
      const key = elementAttributeLiveKey(element, activeCompPath, attr);
      const target = findTimelineElementInIframe(previewIframeRef.current, element, activeCompPath);
      liveLanes.preview(
        key,
        () => target?.getAttribute(attr) ?? null,
        elementLiveSource(element, activeCompPath, attr),
      );
      patchLiveElementAttribute(previewIframeRef.current, element, attr, value, activeCompPath);
    },
    [liveLanes, previewIframeRef, activeCompPath],
  );
  const laneApply = useCallback(
    (element: TimelineElement, attr: string) => ({
      preview: (value: string | null) =>
        patchLiveElementAttribute(previewIframeRef.current, element, attr, value, activeCompPath),
      store: (value: string | null) => syncStoredElementAttribute(element, attr, value),
    }),
    [previewIframeRef, activeCompPath],
  );
  const claimLive = useCallback(
    (element: TimelineElement, attr: string) =>
      liveLanes.claim(
        elementAttributeLiveKey(element, activeCompPath, attr),
        laneApply(element, attr),
        elementLiveSource(element, activeCompPath, attr),
      ),
    [liveLanes, laneApply, activeCompPath],
  );
  const revertLive = useCallback(
    (element: TimelineElement, attr: string) =>
      liveLanes.revert(
        elementAttributeLiveKey(element, activeCompPath, attr),
        laneApply(element, attr),
      ),
    [liveLanes, laneApply, activeCompPath],
  );
  const setQuiet = useCallback(
    async (
      element: TimelineElement,
      attr: string,
      value: string | null,
      label: string,
    ): Promise<TimelineEditOutcome> => {
      const project = projectIdRef.current;
      const pid = projectForTimelineSave(isRecordingRef?.current, project, showToast);
      const live = claimLive(element, attr);
      const unsaved = async (outcome: TimelineEditOutcome): Promise<TimelineEditOutcome> => {
        const { targetPath, patchTarget } = elementSaveTarget(element, activeCompPath);
        live.settle(
          await readSavedAttribute(project, targetPath, patchTarget, attr, writeProjectFile),
        );
        return outcome;
      };
      if (typeof pid !== "string") return unsaved(pid);
      try {
        const written = await setElementAttribute({
          projectId: pid,
          activeCompPath,
          element,
          attr,
          value,
          label,
          patchLive: live.preview,
          onFileRead: live.read,
          writeProjectFile,
          recordEdit,
          pendingTimelineEditPathRef,
        });
        if (!written)
          return unsaved(failedTimelineSave("This clip has no id to save it by", showToast));
        live.settle(value);
        return { status: "saved" };
      } catch (error) {
        console.error("[Timeline] Failed to set element attribute", error);
        const message = error instanceof Error ? error.message : "Failed to update effect";
        return unsaved(failedTimelineSave(message, showToast));
      }
    },
    [
      claimLive,
      activeCompPath,
      writeProjectFile,
      recordEdit,
      pendingTimelineEditPathRef,
      isRecordingRef,
      showToast,
      projectIdRef,
    ],
  );
  return { setLive, setQuiet, revertLive, restoreLive: liveLanes.restore };
}
