import { useCallback, useRef } from "react";
import { parseTimelineFromDOM } from "../lib/timelineDOM";
import { readTimelineDurationFromDocument } from "../lib/timelineElementHelpers";
import type { PreviewIframeSlot } from "./useTimelineSyncCallbacks";
import { trackPreviewFirstFrame } from "../../telemetry/events";
import { getBrowserSystemMeta } from "../../telemetry/system";

export function readPreviewComplexity(doc: Document | null | undefined): {
  clip_count: number;
  media_clip_count: number;
} {
  if (!doc) return { clip_count: 0, media_clip_count: 0 };
  const elements = parseTimelineFromDOM(doc, readTimelineDurationFromDocument(doc));
  return {
    clip_count: elements.length,
    media_clip_count: elements.filter(({ tag }) => tag === "video" || tag === "audio").length,
  };
}

export function usePreviewFirstFrameTelemetry(previewSlots: PreviewIframeSlot[]) {
  const previewSlotsRef = useRef(previewSlots);
  previewSlotsRef.current = previewSlots;
  const reportedPaintsRef = useRef(new Set<string>());

  return useCallback(
    (
      slot: PreviewIframeSlot,
      {
        iframe,
        startedAt,
        loadId,
      }: { iframe: HTMLIFrameElement; startedAt: number; loadId: number },
    ) => {
      const currentSlot = previewSlotsRef.current.find(
        (candidate) => candidate.gen === slot.gen && candidate.role === slot.role,
      );
      if (!currentSlot) return;
      const reportKey = `${slot.role}:${slot.gen}:${loadId}`;
      if (reportedPaintsRef.current.has(reportKey)) return;
      reportedPaintsRef.current.add(reportKey);
      const complexity = readPreviewComplexity(iframe.contentDocument);
      trackPreviewFirstFrame({
        duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        composition_seconds: readTimelineDurationFromDocument(iframe.contentDocument),
        ...complexity,
        studio_version: getBrowserSystemMeta().studio_version,
      });
    },
    [],
  );
}
