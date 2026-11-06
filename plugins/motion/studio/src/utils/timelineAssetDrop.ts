import { encodeUrlPath } from "@hyperframes/parsers";
export { buildTimelineAssetId } from "@hyperframes/core/timeline-asset-id";
import { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT } from "./mediaTypes";
import { roundToCenti } from "./rounding";
import { COMPOSITION_ROOT_OPEN_TAG_RE } from "./compositionPatterns";
import { patchRootCompositionDuration, readRootCompositionDuration } from "./rootDuration";

export const TIMELINE_ASSET_MIME = "application/x-hyperframes-asset";
export const TIMELINE_BLOCK_MIME = "application/x-hyperframes-block";
const FALLBACK_TIMELINE_FILE_DROP_DURATION = 5;

export type TimelineAssetKind = "image" | "video" | "audio";

export function getTimelineAssetKind(assetPath: string): TimelineAssetKind | null {
  if (IMAGE_EXT.test(assetPath)) return "image";
  if (VIDEO_EXT.test(assetPath)) return "video";
  if (AUDIO_EXT.test(assetPath)) return "audio";
  return null;
}

export function resolveTimelineAssetSrc(targetPath: string, assetPath: string): string {
  const targetDir = targetPath.includes("/")
    ? targetPath.slice(0, targetPath.lastIndexOf("/"))
    : "";
  if (!targetDir) return assetPath;

  const fromParts = targetDir.split("/").filter(Boolean);
  const toParts = assetPath.split("/").filter(Boolean);
  while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }

  const up = fromParts.map(() => "..");
  const relative = [...up, ...toParts].join("/");
  return relative || assetPath.split("/").pop() || assetPath;
}

/**
 * Sequence one or more dropped files end-to-end starting at the drop point, all on
 * the track the user dropped onto. The clip lands where the ghost showed it — we do
 * NOT bump to a different track on overlap (that produced surprise "new tracks" and,
 * because it jumped past high indices like a grain-overlay track, wild numbers).
 * HyperFrames allows time-overlap on a track; the user can nudge if they want a gap.
 */
export function buildTimelineFileDropPlacements(
  placement: { start: number; track: number },
  durations: number[],
): Array<{ start: number; track: number }> {
  let nextStart = roundToCenti(Math.max(0, placement.start));
  return durations.map((rawDuration) => {
    const duration =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : FALLBACK_TIMELINE_FILE_DROP_DURATION;
    const start = nextStart;
    nextStart = roundToCenti(nextStart + duration);
    return { start, track: placement.track };
  });
}

export function resolveTimelineAssetCompositionSize(source: string): {
  width: number;
  height: number;
} {
  const width = Number.parseFloat(source.match(/\bdata-width=(["'])([^"']+)\1/i)?.[2] ?? "");
  const height = Number.parseFloat(source.match(/\bdata-height=(["'])([^"']+)\1/i)?.[2] ?? "");
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : 640,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : 360,
  };
}

/**
 * CapCut-style placement: natural size when it fits, scaled-to-fit when
 * oversized, always centered. Unknown natural size → full-frame.
 */
export function fitTimelineAssetGeometry(
  natural: { width: number; height: number } | null,
  comp: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  if (!natural || natural.width <= 0 || natural.height <= 0) {
    return { left: 0, top: 0, width: comp.width, height: comp.height };
  }
  const scale = Math.min(1, comp.width / natural.width, comp.height / natural.height);
  const width = Math.round(natural.width * scale);
  const height = Math.round(natural.height * scale);
  return {
    left: Math.round((comp.width - width) / 2),
    top: Math.round((comp.height - height) / 2),
    width,
    height,
  };
}

export function buildTimelineAssetInsertHtml(input: {
  id: string;
  hfId: string;
  assetPath: string;
  kind: TimelineAssetKind;
  start: number;
  duration: number;
  track: number;
  zIndex: number;
  geometry?: { left: number; top: number; width: number; height: number };
  /** Video only: true inserts `data-has-audio="true"` with no `muted`. Unknown or false stays muted. */
  hasAudio?: boolean;
}): string {
  const sharedAttrs = `id="${input.id}" data-hf-id="${input.hfId}" class="clip" src="${encodeUrlPath(input.assetPath)}" data-start="${input.start}" data-duration="${input.duration}" data-track-index="${input.track}"`;
  const geometry = input.geometry ?? { left: 0, top: 0, width: 640, height: 360 };
  const visualStyles = `position: absolute; left: ${geometry.left}px; top: ${geometry.top}px; width: ${geometry.width}px; height: ${geometry.height}px; object-fit: contain; z-index: ${input.zIndex}`;

  if (input.kind === "image") {
    return `<img ${sharedAttrs} style="${visualStyles}" />`;
  }

  if (input.kind === "video") {
    // `muted` and `data-has-audio="true"` are mutually exclusive by the lint
    // contract (video_has_audio_but_muted): an audible drop takes the latter.
    const audio = input.hasAudio ? 'data-has-audio="true"' : "muted";
    return `<video ${sharedAttrs} ${audio} playsinline style="${visualStyles}"></video>`;
  }

  return `<audio ${sharedAttrs} data-volume="1" style="z-index: ${input.zIndex}"></audio>`;
}

/**
 * A clip inserted past the composition end would exist in the HTML but never
 * appear on the timeline or in playback. Extend the root's data-duration to
 * cover it (mirrors blockInstaller's behavior for installed blocks).
 */
export function extendCompositionDurationIfNeeded(source: string, requiredEnd: number): string {
  const rootDur = readRootCompositionDuration(source);
  if (rootDur == null || !Number.isFinite(rootDur) || requiredEnd <= rootDur) return source;
  return patchRootCompositionDuration(source, String(roundToCenti(requiredEnd)));
}

/**
 * Set the composition root's `data-duration` to `contentEnd` (grow OR shrink) so the
 * timeline length tracks content — the content-driven counterpart to
 * extendCompositionDurationIfNeeded's grow-only ratchet. Used after edits that can
 * reduce the furthest clip end (delete/trim). No-op when `contentEnd` is not > 0, so
 * an empty timeline keeps its declared duration instead of collapsing to 0.
 */
export function setCompositionDurationToContent(
  source: string,
  contentEnd: number,
  rootDuration?: number | null,
): string {
  if (!Number.isFinite(contentEnd) || contentEnd <= 0) return source;
  const rootDur = rootDuration === undefined ? readRootCompositionDuration(source) : rootDuration;
  if (rootDur == null) return source;
  const next = roundToCenti(contentEnd);
  if (rootDur === next) return source;
  return patchRootCompositionDuration(source, String(next));
}

export function insertTimelineAssetIntoSource(source: string, assetHtml: string): string {
  const match = COMPOSITION_ROOT_OPEN_TAG_RE.exec(source);
  if (!match || match.index == null) {
    throw new Error("No composition root found in target source");
  }
  const insertAt = match.index + match[0].length;
  const lineStart = source.lastIndexOf("\n", match.index);
  const leadingWhitespace = source.slice(lineStart + 1, match.index).match(/^(\s*)/)?.[1] ?? "";
  const childIndent = leadingWhitespace + "  ";
  const indented = assetHtml
    .split("\n")
    .map((line, i) => (i === 0 ? line : childIndent + line))
    .join("\n");
  return `${source.slice(0, insertAt)}\n${childIndent}${indented}${source.slice(insertAt)}`;
}
