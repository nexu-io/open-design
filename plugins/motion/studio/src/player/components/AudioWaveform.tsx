import { useI18n } from "../../i18n/I18n";
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fadeGain } from "@hyperframes/core/audio-fade";
import { useThumbnailLease } from "../../hooks/useThumbnailLease";
import { useThumbnailStripSize } from "../../hooks/useThumbnailStripSize";
import { createThumbnailKey, type ThumbnailPriority } from "../lib/thumbnailScheduler";
import { decimatePeaks, loudnessToOpacity } from "./audioWaveformPeaks";
import { ClipFadesContext, type ClipFadeShape } from "./TimelineClipFades";
import { studioApiFetch } from "../../utils/studioApiFetch";

export interface AudioWaveformProps {
  audioUrl: string;
  waveformUrl?: string;
  label: string;
  labelColor: string;
  trimStartFraction?: number;
  trimEndFraction?: number;
  projectId: string;
  sessionEpoch: number;
  priority: ThumbnailPriority;
  /** `data-hidden` or a muted audio group. Greys the pill; the clip stays. */
  muted?: boolean;
  labelInset?: number;
}

const BAR_STEP = 3;

export const rendersWaveform = (el: { tag: string }) => el.tag === "audio";
const FADE_GHOST_OPACITY = 0.27;
export const WAVEFORM_LAYER_Z = 10;

type BarGeometry = { x: number; width: number; height: number; gain: number };

type ClipSpan = { from: number; to: number };
const WHOLE_CLIP: ClipSpan = { from: 0, to: 1 };
function paintWaveformBars(
  context: CanvasRenderingContext2D,
  bars: readonly BarGeometry[],
  height: number,
  waveformBarRgb: string,
  waveformBaselineRgb: string,
  amplitudes: readonly number[],
) {
  bars.forEach((bar, index) => {
    const opacity = loudnessToOpacity(amplitudes[index] ?? 0);
    context.fillStyle = `rgb(${waveformBaselineRgb})`;
    context.fillRect(bar.x, height - 2, bar.width, 2);
    const paint = (alpha: number, top: number, barHeight: number) => {
      context.fillStyle = `rgba(${waveformBarRgb},${alpha.toFixed(2)})`;
      context.fillRect(bar.x, top, bar.width, barHeight);
    };
    const faded = bar.height * bar.gain;
    if (faded > 0) paint(opacity, height - faded, faded);
    if (faded < bar.height) {
      paint(opacity * FADE_GHOST_OPACITY, height - bar.height, bar.height - faded);
    }
  });
}

export function drawWaveformCanvas(
  canvas: HTMLCanvasElement,
  peaks: readonly number[],
  muted: boolean,
  trimStartFraction: number,
  trimEndFraction: number,
  fades: ClipFadeShape | null = null,
  span: ClipSpan = WHOLE_CLIP,
) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(scale, scale);
  context.clearRect(0, 0, width, height);
  const trim = trimEndFraction - trimStartFraction;
  const amplitudes = decimatePeaks(
    peaks,
    trimStartFraction + trim * span.from,
    trimStartFraction + trim * span.to,
    Math.max(1, Math.ceil(width / BAR_STEP)),
  );
  const clipFraction = (index: number) =>
    span.from + ((index + 0.5) / amplitudes.length) * (span.to - span.from);
  const bars = amplitudes.map((amplitude, index) => ({
    x: (index * width) / amplitudes.length,
    width: Math.max(1, width / amplitudes.length),
    height: Math.max(3, amplitude * height),
    gain: fades ? fadeGain(clipFraction(index) * fades.duration, fades.duration, fades) : 1,
  }));
  const channelToken = muted ? "--timeline-waveform-muted-rgb" : "--timeline-waveform-bar-rgb";
  const waveformBarRgb = getComputedStyle(canvas).getPropertyValue(channelToken);
  const waveformBaselineRgb = getComputedStyle(canvas).getPropertyValue(
    "--timeline-waveform-baseline-rgb",
  );
  paintWaveformBars(context, bars, height, waveformBarRgb, waveformBaselineRgb, amplitudes);
}

function extractPeaks(channelData: Float32Array, barCount: number): number[] {
  const peaks: number[] = [];
  const samplesPerBar = Math.floor(channelData.length / barCount);
  if (samplesPerBar === 0) return Array(barCount).fill(0);
  for (let index = 0; index < barCount; index++) {
    let max = 0;
    const start = index * samplesPerBar;
    const end = Math.min(start + samplesPerBar, channelData.length);
    for (let sample = start; sample < end; sample++) {
      max = Math.max(max, Math.abs(channelData[sample] ?? 0));
    }
    peaks.push(max);
  }
  const maxPeak = Math.max(...peaks, 0.001);
  return peaks.map((peak) => peak / maxPeak);
}

async function loadWaveform(
  audioUrl: string,
  waveformUrl: string | undefined,
  signal: AbortSignal,
): Promise<number[]> {
  // Failures propagate: authors trim and beat-align against this, so made-up peaks beat no gap.
  // The scheduler caches the failure (metadataFailureTtlMs): no refetch loop, no stuck state.
  return waveformUrl
    ? await fetchWaveformPeaks(waveformUrl, signal)
    : await decodeWaveformPeaks(audioUrl, signal);
}

async function fetchWaveformPeaks(url: string, signal: AbortSignal): Promise<number[]> {
  const response = await studioApiFetch(url, { signal });
  if (!response.ok) throw new Error(`Waveform request failed (${response.status})`);
  const data: unknown = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("peaks" in data) ||
    !Array.isArray(data.peaks) ||
    !data.peaks.every((peak) => typeof peak === "number")
  ) {
    throw new Error("Invalid waveform response");
  }
  return data.peaks;
}

async function decodeWaveformPeaks(url: string, signal: AbortSignal): Promise<number[]> {
  const response = await studioApiFetch(url, { signal });
  if (!response.ok) throw new Error(`Audio request failed (${response.status})`);
  const buffer = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(buffer);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return extractPeaks(decoded.getChannelData(0), 4000);
  } finally {
    await context.close();
  }
}

/** Bounded waveform subscriber; cache, cancellation and dedupe live in one scheduler. */
const NEAR_SCREEN: IntersectionObserverInit & { scrollMargin: string } = {
  rootMargin: "50% 100%",
  scrollMargin: "50% 100%",
};
const nearScreenListeners = new Map<Element, (near: boolean) => void>();
let nearScreen: IntersectionObserver | null = null;

function useNearScreen(element: Element | null): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!element || typeof IntersectionObserver === "undefined") return;
    nearScreen ??= new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => nearScreenListeners.get(entry.target)?.(entry.isIntersecting)),
      NEAR_SCREEN,
    );
    nearScreenListeners.set(element, setNear);
    nearScreen.observe(element);
    return () => {
      nearScreenListeners.delete(element);
      nearScreen?.unobserve(element);
    };
  }, [element]);
  return near;
}

export const AudioWaveform = memo(function AudioWaveform({
  audioUrl,
  waveformUrl,
  label,
  labelColor,
  trimStartFraction,
  trimEndFraction,
  projectId,
  sessionEpoch,
  priority,
  muted = false,
  labelInset = 16,
}: AudioWaveformProps) {
  const { t } = useI18n();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheKey = waveformUrl ?? audioUrl;
  const request = useMemo(
    () => ({
      key: createThumbnailKey({ kind: "waveform", source: cacheKey }),
      projectId,
      sessionEpoch,
      kind: "waveform" as const,
      priority,
      rich: false,
      load: async (signal: AbortSignal) => {
        const peaks = await loadWaveform(audioUrl, waveformUrl, signal);
        return {
          value: { kind: "waveform" as const, peaks },
          weight: peaks.length * Float64Array.BYTES_PER_ELEMENT,
        };
      },
    }),
    [audioUrl, cacheKey, priority, projectId, sessionEpoch, waveformUrl],
  );
  const snapshot = useThumbnailLease(cacheKey ? request : null);
  const peaks =
    snapshot.status === "ready" && snapshot.value.kind === "waveform" ? snapshot.value.peaks : null;

  const fades = useContext(ClipFadesContext);
  const [strip, setStripRef, watchGap] = useThumbnailStripSize();
  const from = strip.width > 0 ? strip.inViewStart / strip.width : 0;
  const to = strip.width > 0 ? strip.inViewEnd / strip.width : 1;
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const span = { from, to };
    // Placed in fractions of the clip, so a zoom preview stretches the drawn bars with time.
    canvas.style.left = `${span.from * 100}%`;
    canvas.style.width = `${(span.to - span.from) * 100}%`;
    if (span.to <= span.from) return;
    drawWaveformCanvas(
      canvas,
      peaks,
      muted,
      trimStartFraction ?? 0,
      trimEndFraction ?? 1,
      fades,
      span,
    );
  }, [fades, from, muted, peaks, to, trimEndFraction, trimStartFraction]);
  const near = useNearScreen(root);
  useEffect(() => {
    if (near) draw();
  }, [draw, near, strip.width, strip.height]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(draw);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-chrome", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    const clip = root?.closest(".timeline-clip");
    if (!(clip instanceof HTMLElement)) return;
    if (muted) clip.setAttribute("data-audio-muted", "true");
    else clip.removeAttribute("data-audio-muted");
    return () => clip.removeAttribute("data-audio-muted");
  }, [muted, root]);

  return (
    <div ref={setRoot} className="absolute inset-0">
      <div
        ref={setStripRef}
        className="absolute inset-0 overflow-hidden"
        style={{ zIndex: WAVEFORM_LAYER_Z }}
      >
        {/* The undrawn ends: one coming near the screen, as a move carries the clip, re-measures. */}
        {from > 0 && (
          <div
            ref={watchGap}
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{ width: `${from * 100}%` }}
          />
        )}
        {to < 1 && (
          <div
            ref={watchGap}
            className="pointer-events-none absolute inset-y-0 right-0"
            style={{ left: `${to * 100}%` }}
          />
        )}
        <canvas
          ref={canvasRef}
          className="absolute bottom-0"
          style={{
            left: 0,
            width: "100%",
            top: labelInset,
            height: `calc(100% - ${labelInset}px)`,
          }}
        />
        {snapshot.status === "loading" && (
          <div
            className="absolute inset-x-0 bottom-0 animate-pulse"
            style={{
              top: labelInset,
              background: "var(--timeline-thumbnail-shimmer)",
            }}
          />
        )}
        {/* Degraded state — the decode failed; say so rather than paint a
          waveform the author could edit against. */}
        {snapshot.status === "error" && (
          <div
            className="absolute inset-x-0 flex items-center justify-center gap-1.5"
            style={{ top: labelInset, bottom: 0 }}
          >
            <div
              className="absolute inset-x-0"
              style={{
                bottom: "20%",
                height: 2,
                background: "var(--timeline-waveform-error)",
              }}
            />
            <span className="relative rounded-sm bg-black/50 px-1 text-[8px] text-neutral-500">
              {t("waveform unavailable")}</span>
          </div>
        )}
        {label && (
          <div className="absolute inset-x-0 top-0 z-10 px-1.5 py-0.5">
            <span
              className="block truncate text-[9px] font-semibold leading-tight"
              style={{ color: labelColor, textShadow: "var(--timeline-waveform-label-shadow)" }}
            >
              {label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
