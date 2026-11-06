import { useRef } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import {
  trackStudioTimelinePerformance,
  type StudioTimelinePerformanceSample,
} from "../../telemetry/events";

const SCROLL_IDLE_MS = 400;
const MIN_EVENT_INTERVAL_MS = 60_000;

interface TimelinePerformanceState {
  frameRequest: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  pendingScrollStartedAt: number;
  previousFrameAt: number | null;
  frameLatencies: number[];
  frameIntervals: number[];
  lastEmittedAt: number;
}

interface TimelinePerformanceContext {
  totalClipCount: number;
  totalRowCount: number;
  zoomMode: string;
}

function percentile(values: readonly number[], fraction: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(2));
}

export function summarizeTimelinePerformance(
  scroll: HTMLElement,
  context: TimelinePerformanceContext,
  frameLatencies: readonly number[],
  frameIntervals: readonly number[],
): StudioTimelinePerformanceSample | null {
  const latencyP95 = percentile(frameLatencies, 0.95);
  if (latencyP95 === undefined) return null;

  const frameIntervalP95 = percentile(frameIntervals, 0.95);
  return {
    total_clip_count: context.totalClipCount,
    mounted_clip_count: scroll.querySelectorAll('[data-clip="true"]').length,
    total_row_count: context.totalRowCount,
    timeline_dom_node_count: scroll.querySelectorAll("*").length,
    viewport_width: scroll.clientWidth,
    viewport_height: scroll.clientHeight,
    zoom_mode: context.zoomMode,
    scroll_sample_count: frameLatencies.length,
    scroll_frame_latency_p95_ms: latencyP95,
    scroll_frame_latency_max_ms: Number(Math.max(...frameLatencies).toFixed(2)),
    ...(frameIntervalP95 === undefined ? {} : { frame_interval_p95_ms: frameIntervalP95 }),
  };
}

function resetMeasurements(state: TimelinePerformanceState): void {
  state.previousFrameAt = null;
  state.frameLatencies = [];
  state.frameIntervals = [];
}

/**
 * Samples one event per timeline scroll burst, capped at one event per minute.
 * The event contains only aggregate counts and timings—never project content.
 */
export function useTimelinePerformanceTelemetry(context: TimelinePerformanceContext): {
  recordTimelineScroll: (scroll: HTMLDivElement) => void;
} {
  const stateRef = useRef<TimelinePerformanceState>({
    frameRequest: 0,
    idleTimer: null,
    pendingScrollStartedAt: 0,
    previousFrameAt: null,
    frameLatencies: [],
    frameIntervals: [],
    lastEmittedAt: Number.NEGATIVE_INFINITY,
  });

  const recordTimelineScroll = (scroll: HTMLDivElement) => {
    const state = stateRef.current;
    const now = performance.now();

    if (state.frameRequest === 0) {
      state.pendingScrollStartedAt = now;
      state.frameRequest = requestAnimationFrame((frameAt) => {
        state.frameRequest = 0;
        state.frameLatencies.push(performance.now() - state.pendingScrollStartedAt);
        if (state.previousFrameAt !== null) {
          state.frameIntervals.push(frameAt - state.previousFrameAt);
        }
        state.previousFrameAt = frameAt;
      });
    }

    if (state.idleTimer !== null) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      state.idleTimer = null;
      if (state.frameRequest !== 0) {
        cancelAnimationFrame(state.frameRequest);
        state.frameRequest = 0;
        resetMeasurements(state);
        return;
      }

      const emittedAt = performance.now();
      if (emittedAt - state.lastEmittedAt >= MIN_EVENT_INTERVAL_MS) {
        const sample = summarizeTimelinePerformance(
          scroll,
          context,
          state.frameLatencies,
          state.frameIntervals,
        );
        if (sample) {
          trackStudioTimelinePerformance(sample);
          state.lastEmittedAt = emittedAt;
        }
      }
      resetMeasurements(state);
    }, SCROLL_IDLE_MS);
  };

  useMountEffect(() => () => {
    const state = stateRef.current;
    if (state.frameRequest !== 0) cancelAnimationFrame(state.frameRequest);
    if (state.idleTimer !== null) clearTimeout(state.idleTimer);
  });

  return { recordTimelineScroll };
}
