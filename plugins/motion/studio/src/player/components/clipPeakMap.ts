import { buildProjectApiPath } from "../../utils/projectRouting";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { resolvePreviewRelative } from "../../utils/previewRelativePath";
import type { TimelineElement } from "../store/timelineElement";
import { clipSourcePeak, isPeakMap, type ClipSourceWindow, type PeakMap } from "./clipPeakRuns";
import { authoredSrcPath, encodePreviewPath, resolveMediaPreviewUrl } from "./thumbnailUtils";

const peakMapRequests = new Map<string, Promise<PeakMap | null>>();

/** One fetch per peak-map URL per session; a failed or malformed answer reads as null. */
export function loadPeakMap(url: string): Promise<PeakMap | null> {
  const pending = peakMapRequests.get(url);
  if (pending) return pending;
  const request = studioApiFetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then((body: unknown) => (isPeakMap(body) ? body : null))
    .catch(() => null);
  peakMapRequests.set(url, request);
  return request;
}

/** The studio-server `/peaks/*` URL for a clip's project media, or undefined for outside media. */
export function clipPeaksUrl(src: string | undefined, projectId: string): string | undefined {
  const origin = window.location.origin;
  const relative = resolvePreviewRelative(
    resolveMediaPreviewUrl(authoredSrcPath(src ?? ""), projectId, origin),
    projectId,
    origin,
  );
  return relative
    ? buildProjectApiPath(projectId, `/peaks/${encodePreviewPath(relative)}`)
    : undefined;
}

export function clipSourceWindow(el: TimelineElement): ClipSourceWindow {
  return { mediaStart: el.playbackStart ?? 0, sourceSpan: el.duration * (el.playbackRate ?? 1) };
}

/** The clip's source peak, linear, over the part it plays; null when it cannot be measured. */
export async function measureClipSourcePeak(
  el: TimelineElement,
  projectId: string,
): Promise<number | null> {
  const url = clipPeaksUrl(el.src, projectId);
  const map = url ? await loadPeakMap(url) : null;
  return map ? clipSourcePeak(map, clipSourceWindow(el)) : null;
}
