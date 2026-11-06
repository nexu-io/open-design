// Asset-drop handlers for the timeline: drop an existing project asset at a
// placement, or upload dragged-in OS files and place them sequentially.
// Extracted verbatim from useTimelineEditing.ts to keep it under the studio
// 600-line cap.
import { useCallback, type MutableRefObject, type RefObject } from "react";
import type { TimelineElement } from "../player";
import type { TimelineDropPlacement } from "../player/components/timelineCallbacks";
import { resolveDropTrack } from "../utils/timelineDropTrackInsert";
import {
  buildTimelineAssetId,
  buildTimelineAssetInsertHtml,
  buildTimelineFileDropPlacements,
  fitTimelineAssetGeometry,
  getTimelineAssetKind,
  insertTimelineAssetIntoSource,
  resolveTimelineAssetCompositionSize,
  resolveTimelineAssetSrc,
} from "../utils/timelineAssetDrop";
import { generateId } from "../utils/generateId";
import { saveProjectFilesWithHistory, type RecordEditInput } from "../utils/studioFileHistory";
import {
  collectHtmlIds,
  resolveDroppedAssetDuration,
  resolveDroppedAssetHasAudio,
} from "../utils/studioHelpers";
import { formatTimelineAttributeNumber } from "./timelineEditingHelpers";
import { readFileContent } from "./timelineTimingSync";
import { commitTimelineCompositionInsertion } from "../utils/timelineCompositionInsert";
import { extendRootDurationInSource } from "../utils/rootDuration";
import { deriveTimelineStoreKeyForDomId } from "../player/lib/timelineElementHelpers";
import { selectAndRevealTimelineElement } from "../player/components/timelineDropReveal";

/** The first uploaded file opens the new track (if asked); each next one aims right after the previous. */
function fileDropPlacement(
  index: number,
  next: { start: number; track: number },
  dropped: TimelineDropPlacement | undefined,
  previous: TimelineElement | undefined,
): TimelineDropPlacement {
  if (index === 0) return { ...dropped, ...next };
  return previous ? { start: previous.start + previous.duration, track: previous.track } : next;
}

interface DropGesture {
  placed: TimelineElement[];
  onNewTrack: boolean;
}

function timelineDropTarget(
  sourceFile: string,
  placement: Pick<TimelineElement, "start" | "track">,
): TimelineElement {
  return {
    id: "timeline-drop",
    tag: "div",
    start: placement.start,
    duration: 0,
    track: placement.track,
    sourceFile,
  };
}

interface UseTimelineAssetDropOpsOptions {
  projectIdRef: MutableRefObject<string | null>;
  activeCompPath: string | null;
  timelineElements: TimelineElement[];
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  reloadPreview: () => void;
  uploadProjectFiles: (files: Iterable<File>, dir?: string) => Promise<string[]>;
  isRecordingRef?: RefObject<boolean>;
  forceReloadSdkSession?: () => void;
  observeProjectFileVersion?: (path: string, version: string | null) => void;
  checkEditable?: (targets: readonly TimelineElement[]) => boolean;
}

export function useTimelineAssetDropOps({
  projectIdRef,
  activeCompPath,
  timelineElements,
  showToast,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  uploadProjectFiles,
  isRecordingRef,
  forceReloadSdkSession,
  observeProjectFileVersion,
  checkEditable,
}: UseTimelineAssetDropOpsOptions) {
  // fallow-ignore-next-line complexity
  const dropAssetAt = useCallback(
    // fallow-ignore-next-line complexity
    async (
      assetPath: string,
      placement: TimelineDropPlacement,
      durationOverride?: number,
      gesture: DropGesture = { placed: [], onNewTrack: false },
    ): Promise<TimelineElement | undefined> => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return undefined;
      }
      const targetPath = activeCompPath || "index.html";
      if (checkEditable && !checkEditable([timelineDropTarget(targetPath, placement)])) {
        return undefined;
      }
      const pid = projectIdRef.current;
      if (!pid) throw new Error("No active project");

      const kind = getTimelineAssetKind(assetPath);
      if (!kind) {
        showToast("Only image, video, and audio assets can be dropped onto the timeline.");
        return undefined;
      }

      try {
        const normalizedStart = Number(formatTimelineAttributeNumber(placement.start));
        const duration =
          Number.isFinite(durationOverride) && durationOverride != null && durationOverride > 0
            ? durationOverride
            : await resolveDroppedAssetDuration(pid, assetPath, kind);
        const normalizedDuration = Number(formatTimelineAttributeNumber(duration));
        // A video with an audio stream lands audible; the mixer only hears a
        // <video> marked data-has-audio, and a muted drop was losing the sound.
        const hasAudio = await resolveDroppedAssetHasAudio(pid, assetPath, kind);
        const resolvedAssetSrc = resolveTimelineAssetSrc(targetPath, assetPath);

        const resolvedTargetPath = targetPath || "index.html";
        const fileElements = timelineElements
          .filter((te) => (te.sourceFile || activeCompPath || "index.html") === resolvedTargetPath)
          .map((te) => ({ ...te, sourceFile: resolvedTargetPath }));
        const newElementZIndex = Math.max(1, fileElements.length + gesture.placed.length + 1);
        const tag = kind === "image" ? "img" : kind;

        let newId = "";
        let track = 0;
        let start = normalizedStart;
        const insertAsset = (originalContent: string) => {
          newId = buildTimelineAssetId(assetPath, collectHtmlIds(originalContent));
          const resolved = resolveDropTrack({
            source: originalContent,
            // Rows and insertRow count the rows the timeline shows; a track this drop opened has no others.
            elements: gesture.onNewTrack ? [] : fileElements,
            placed: gesture.placed,
            placement,
            dropped: {
              id: newId,
              tag,
              start: normalizedStart,
              duration: normalizedDuration,
            },
          });
          track = resolved.track;
          start = resolved.start;
          return extendRootDurationInSource(
            insertTimelineAssetIntoSource(
              resolved.source,
              buildTimelineAssetInsertHtml({
                id: newId,
                hfId: `hf-${generateId()}`,
                assetPath: resolvedAssetSrc,
                kind,
                start,
                duration: normalizedDuration,
                track,
                zIndex: newElementZIndex,
                hasAudio,
                geometry: fitTimelineAssetGeometry(
                  null,
                  resolveTimelineAssetCompositionSize(originalContent),
                ),
              }),
            ),
            start + normalizedDuration,
          );
        };

        await saveProjectFilesWithHistory({
          projectId: pid,
          label: "Add timeline asset",
          files: { [targetPath]: insertAsset },
          readFile: (path) => readFileContent(pid, path),
          writeFile: writeProjectFile,
          recordEdit,
        });

        selectAndRevealTimelineElement(deriveTimelineStoreKeyForDomId(newId, targetPath));
        forceReloadSdkSession?.();
        reloadPreview();
        const lane = placement.insertRow == null ? placement.track : track;
        return {
          id: newId,
          tag,
          start,
          duration: normalizedDuration,
          track: lane,
          authoredTrack: track,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to drop asset onto timeline";
        showToast(message);
        return undefined;
      }
    },
    [
      projectIdRef,
      activeCompPath,
      recordEdit,
      showToast,
      timelineElements,
      writeProjectFile,
      reloadPreview,
      isRecordingRef,
      forceReloadSdkSession,
      checkEditable,
    ],
  );

  const handleTimelineAssetDrop = useCallback(
    async (assetPath: string, placement: TimelineDropPlacement, durationOverride?: number, reportFailure = false) => {
      const result = await dropAssetAt(assetPath, placement, durationOverride);
      if (reportFailure && !result) throw new Error('Could not place the asset on the timeline. Check that the composition is editable.');
    },
    [dropAssetAt],
  );

  // fallow-ignore-next-line complexity
  const handleTimelineFileDrop = useCallback(
    // fallow-ignore-next-line complexity
    async (files: File[], placement?: TimelineDropPlacement) => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const targetPath = activeCompPath || "index.html";
      const initialPlacement = placement ?? { start: 0, track: 0 };
      if (checkEditable && !checkEditable([timelineDropTarget(targetPath, initialPlacement)])) {
        return;
      }
      const pid = projectIdRef.current;
      if (!pid) return;
      const uploaded = await uploadProjectFiles(files);
      if (uploaded.length === 0) return;
      const durations: number[] = [];
      for (const assetPath of uploaded) {
        const kind = getTimelineAssetKind(assetPath);
        const duration = kind ? await resolveDroppedAssetDuration(pid, assetPath, kind) : 0;
        durations.push(Number(formatTimelineAttributeNumber(duration)));
      }
      const placements = buildTimelineFileDropPlacements(
        placement ?? { start: 0, track: 0 },
        durations,
      );
      const gesture: DropGesture = { placed: [], onNewTrack: false };
      for (const [index, assetPath] of uploaded.entries()) {
        const next = placements[index] ?? placements[0];
        const clip = await dropAssetAt(
          assetPath,
          fileDropPlacement(index, next, placement, gesture.placed.at(-1)),
          durations[index],
          gesture,
        );
        if (!clip) continue;
        gesture.placed.push(clip);
        if (index === 0 && placement?.insertRow != null) gesture.onNewTrack = true;
      }
    },
    [
      activeCompPath,
      checkEditable,
      dropAssetAt,
      projectIdRef,
      uploadProjectFiles,
      isRecordingRef,
      showToast,
    ],
  );

  const handleTimelineCompositionDrop = useCallback(
    async (sourcePath: string, placement: Pick<TimelineElement, "start" | "track">) => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const targetPath = activeCompPath || "index.html";
      if (checkEditable && !checkEditable([timelineDropTarget(targetPath, placement)])) {
        return;
      }
      const pid = projectIdRef.current;
      if (!pid) throw new Error("No active project");
      try {
        await commitTimelineCompositionInsertion({
          projectId: pid,
          targetPath,
          sourcePath,
          start: placement.start,
          track: placement.track,
          writeFile: writeProjectFile,
          recordEdit,
          observeVersion: observeProjectFileVersion,
          selectHost: selectAndRevealTimelineElement,
          resync: forceReloadSdkSession,
          refresh: reloadPreview,
        });
        showToast("Composition added to the timeline.", "info");
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Failed to add composition to timeline",
          "error",
        );
      }
    },
    [
      activeCompPath,
      checkEditable,
      forceReloadSdkSession,
      isRecordingRef,
      observeProjectFileVersion,
      projectIdRef,
      recordEdit,
      reloadPreview,
      showToast,
      writeProjectFile,
    ],
  );

  return { handleTimelineAssetDrop, handleTimelineFileDrop, handleTimelineCompositionDrop };
}
