import { buildProjectApiPath } from "../utils/projectRouting";
import { resolvePreviewRelative } from "../utils/previewRelativePath";
import { useCallback, type ReactNode } from "react";
import { createElement } from "react";
import { CompositionThumbnail, VideoThumbnail } from "../player";
import {
  compositionPathOfPreviewUrl,
  resolveThumbnailSeekTime,
} from "../player/components/CompositionThumbnail";
import type { TimelineElement } from "../player";
import type { TimelineClipRenderContext } from "../player/components/TimelineTypes";
import { audioPillFlags } from "../player/components/audioClipLink";
import { AudioWaveform, rendersWaveform } from "../player/components/AudioWaveform";
import { ImageThumbnail } from "../player/components/ImageThumbnail";
import { TextClipContent } from "../player/components/TextClipContent";
import { AudibleVideoClipContent } from "../player/components/AudibleVideoClipContent";
import { ClipPeakMarks } from "../player/components/ClipPeakMarks";
import { clipPeaksUrl, clipSourceWindow } from "../player/components/clipPeakMap";
import { clipHasSound } from "../player/components/clipMenuNormalize";
import {
  authoredSrcPath,
  encodePreviewPath,
  resolveMediaPreviewUrl,
} from "../player/components/thumbnailUtils";
import { usePlayerStore } from "../player/store/playerStore";
import { thumbnailRevisionOf } from "../player/store/thumbnailSlice";
import { effectiveThumbnailMode } from "../player/lib/thumbnailPolicy";

export function normalizeCompositionSrc(
  compSrc: string,
  projectId: string,
  origin: string,
): string {
  try {
    const parsed = new URL(compSrc, origin);
    const previewPrefix = buildProjectApiPath(projectId, `/preview/`);
    if (parsed.pathname.startsWith(previewPrefix)) {
      return parsed.pathname.slice(previewPrefix.length);
    }
  } catch {
    // already relative
  }
  return compSrc;
}

/**
 * The trimmed source slice as start/end fractions (0–1) of the source, so the
 * waveform can window its peaks to the clip edges. Undefined when the source
 * length is unknown (renders full).
 */
function trimFractions(el: TimelineElement): { start?: number; end?: number } {
  const sourceDur = el.sourceDuration;
  if (sourceDur == null || sourceDur <= 0) return {};
  const mediaStart = el.playbackStart ?? 0;
  const rate = el.playbackRate ?? 1;
  const start = Math.max(0, Math.min(1, mediaStart / sourceDur));
  const end = Math.max(start, Math.min(1, (mediaStart + el.duration * rate) / sourceDur));
  return { start, end };
}

/**
 * Build the waveform element for an audio clip, windowing the rendered peaks to
 * the trimmed source slice so the bars track the clip edges.
 */
function renderAudioClip(
  el: TimelineElement,
  pid: string,
  sessionEpoch: number,
  labelColor: string,
  context: TimelineClipRenderContext,
  labelInset?: number,
): ReactNode {
  const audioUrl = resolveMediaPreviewUrl(
    authoredSrcPath(el.src ?? ""),
    pid,
    window.location.origin,
  );
  const srcRelative = resolvePreviewRelative(audioUrl, pid, window.location.origin);
  // Encode each path segment (spaces, parens, U+202F, unicode) so the URL matches
  // what the assets panel loads — a raw segment 404s. resolvePreviewRelative
  // returns the DECODED path, so it must be re-encoded here.
  const encodedRelative = srcRelative ? encodePreviewPath(srcRelative) : null;
  const waveformUrl = encodedRelative
    ? buildProjectApiPath(pid, `/waveform/${encodedRelative}`)
    : undefined;
  const { start, end } = trimFractions(el);
  const waveform = createElement(AudioWaveform, {
    audioUrl,
    waveformUrl,
    label: "",
    labelColor,
    trimStartFraction: start,
    trimEndFraction: end,
    projectId: pid,
    sessionEpoch,
    priority: context.priority,
    labelInset,
    ...audioPillFlags(el),
  });
  return createElement(
    ClipPeakMarks,
    {
      peaksUrl: clipPeaksUrl(el.src, pid),
      sourceWindow: clipSourceWindow(el),
      gain: el.volume ?? 1,
    },
    waveform,
  );
}

function withSoundStrip(
  el: TimelineElement,
  thumbnail: ReactNode,
  waveform: (labelInset: number) => ReactNode,
): ReactNode {
  if (el.tag !== "video" || !clipHasSound(el)) return thumbnail;
  return createElement(AudibleVideoClipContent, { thumbnail, waveform: waveform(0) });
}

export interface UseRenderClipContentOptions {
  projectIdRef: { current: string | null };
  compIdToSrc: Map<string, string>;
  activePreviewUrl: string | null;
  effectiveTimelineDuration: number;
}

export function useRenderClipContent({
  projectIdRef,
  compIdToSrc,
  activePreviewUrl,
  effectiveTimelineDuration,
}: UseRenderClipContentOptions) {
  // Self-sourced so the adaptive policy gates thumbnail generation without App plumbing.
  const thumbnailMode = usePlayerStore((s) => s.thumbnailMode);
  const effectiveMode = effectiveThumbnailMode(thumbnailMode);
  const sessionEpoch = usePlayerStore((s) => s.timelineSessionEpoch);
  const thumbnailRevisions = usePlayerStore((s) => s.thumbnailRevisions);
  return useCallback(
    // Pre-existing clip-content dispatcher; reduced by extracting renderAudioClip.
    // fallow-ignore-next-line complexity
    (
      el: TimelineElement,
      style: { clip: string; label: string },
      context: TimelineClipRenderContext = { priority: "visible", rich: false },
    ): ReactNode => {
      const pid = projectIdRef.current;
      if (!pid) return null;

      // Thumbnail generation disabled (perf) -> plain clip bars. Audio still shows
      // its waveform (cheap, not a frame thumbnail). Toggle: timeline toolbar.
      const waveform = (labelInset?: number) =>
        renderAudioClip(el, pid, sessionEpoch, style.label, context, labelInset);
      if (effectiveMode === "hidden") {
        return rendersWaveform(el) ? waveform() : withSoundStrip(el, null, waveform);
      }

      let compSrc = el.compositionSrc;
      if (compSrc) {
        compSrc = normalizeCompositionSrc(compSrc, pid, window.location.origin);
      }
      if (compSrc && compIdToSrc.size > 0) {
        const resolved =
          compIdToSrc.get(el.id) ||
          compIdToSrc.get(compSrc.replace(/^compositions\//, "").replace(/\.html$/, ""));
        if (resolved) compSrc = resolved;
      }

      // Composition clips — always use the comp's own preview URL for thumbnails.
      // This renders the composition in isolation so we get clean frames
      // instead of capturing the master at a time when the comp is fading in.
      if (compSrc) {
        return createElement(CompositionThumbnail, {
          previewUrl: buildProjectApiPath(pid, `/preview/comp/${encodePreviewPath(compSrc)}`),
          label: "",
          labelColor: style.label,

          seekTime: resolveThumbnailSeekTime(el.duration),
          duration: 0,
          projectId: pid,
          sessionEpoch,
          contentRevision: thumbnailRevisionOf(thumbnailRevisions, compSrc),
          priority: context.priority,
          rich: context.rich,
        });
      }

      // Audio clips — waveform visualization. Resolve these before the generic
      // activePreviewUrl thumbnail branch; audio rows need waveform data, not a
      // captured frame from the currently drilled composition preview.
      if (rendersWaveform(el)) {
        return renderAudioClip(el, pid, sessionEpoch, style.label, context);
      }

      if (el.text) return createElement(TextClipContent, { text: el.text });

      // When drilled into a composition, render all inner elements via
      // CompositionThumbnail at their start time — most accurate visual.
      if (activePreviewUrl && el.duration > 0) {
        return createElement(CompositionThumbnail, {
          previewUrl: activePreviewUrl,
          label: "",
          labelColor: style.label,

          selector: el.selector,
          selectorIndex: el.selectorIndex,
          seekTime: el.start,
          duration: el.duration,
          projectId: pid,
          sessionEpoch,
          contentRevision: thumbnailRevisionOf(
            thumbnailRevisions,
            compositionPathOfPreviewUrl(activePreviewUrl),
          ),
          priority: context.priority,
          rich: context.rich,
        });
      }

      const htmlPreviewEligible = el.duration > 0 && effectiveTimelineDuration > 0;

      if ((el.tag === "video" || el.tag === "img") && el.src) {
        const mediaSrc = resolveMediaPreviewUrl(
          authoredSrcPath(el.src),
          pid,
          window.location.origin,
        );
        // Still images can't be decoded by VideoThumbnail's <video> extractor
        // (the error event fires and the shimmer never resolves) — render the
        // image itself as the strip.
        if (el.tag === "img") {
          return createElement(ImageThumbnail, {
            imageSrc: mediaSrc,
            label: "",
            labelColor: style.label,
            projectId: pid,
            sessionEpoch,
            priority: context.priority,
            rich: context.rich,
          });
        }
        const thumbnail = createElement(VideoThumbnail, {
          videoSrc: mediaSrc,
          label: "",
          labelColor: style.label,
          duration: el.duration,
          sourceStart: el.playbackStart,
          sourceRangeDuration: el.duration * (el.playbackRate ?? 1),
          projectId: pid,
          sessionEpoch,
          priority: context.priority,
        });
        return withSoundStrip(el, thumbnail, waveform);
      }

      if (htmlPreviewEligible) {
        return createElement(CompositionThumbnail, {
          previewUrl: buildProjectApiPath(pid, `/preview`),
          label: "",
          labelColor: style.label,

          selector: el.selector,
          selectorIndex: el.selectorIndex,
          seekTime: el.start,
          duration: el.duration,
          projectId: pid,
          sessionEpoch,
          contentRevision: thumbnailRevisionOf(thumbnailRevisions, "index.html"),
          priority: context.priority,
          rich: context.rich,
        });
      }

      return null;
    },
    [
      projectIdRef,
      compIdToSrc,
      activePreviewUrl,
      effectiveTimelineDuration,
      effectiveMode,
      sessionEpoch,
      thumbnailRevisions,
    ],
  );
}
