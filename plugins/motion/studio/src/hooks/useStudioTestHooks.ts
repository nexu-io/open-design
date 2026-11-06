import { useEffect } from "react";
import type { DomEditSelection } from "../components/editor/domEditing";
import { createTimelineResetState, usePlayerStore } from "../player/store/playerStore";
import {
  readTimelinePerformanceDiagnostics,
  type TimelinePerformanceDiagnostics,
} from "../player/lib/timelinePerformanceDiagnostics";
import {
  createTimelinePerformanceFixture,
  setTimelinePerformanceFixtureLease,
  type TimelinePerformanceFixtureSpec,
  type TimelinePerformanceFixtureSummary,
} from "../player/lib/timelinePerformanceFixture";
import { TIMELINE_VIEWPORT_BUDGETS } from "../player/lib/timelineViewportBudgets";
import { STUDIO_RUNTIME_MODE, STUDIO_TEST_HOOKS_ENABLED } from "./studioTestMode";

interface StudioTestHookDeps {
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  buildDomSelectionFromTarget: (target: HTMLElement) => Promise<DomEditSelection | null>;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: { revealPanel?: boolean },
  ) => void;
}

interface StudioTestApi {
  runtimeMode: typeof STUDIO_RUNTIME_MODE;
  selectByDomId: (id: string) => Promise<boolean>;
  loadTimelinePerformanceFixture: (
    spec: TimelinePerformanceFixtureSpec,
  ) => TimelinePerformanceFixtureSummary;
  resetTimelinePerformanceFixture: () => void;
  readTimelinePerformanceDiagnostics: () => Readonly<TimelinePerformanceDiagnostics>;
  timelineViewportBudgets: typeof TIMELINE_VIEWPORT_BUDGETS;
}

declare global {
  interface Window {
    __studioTest?: StudioTestApi;
  }
}

/**
 * Dev-only headless-QA shortcut. Selecting an element normally requires a
 * pixel-precise click inside the preview iframe, which automated verification
 * can't reliably land. `window.__studioTest.selectByDomId(id)` resolves the
 * DomEditSelection for a preview element by id and reveals the inspector —
 * exactly what a click does — so a driver can open the property/ease panels and
 * then focus a segment via `__playerStore.getState().setFocusedEaseSegment`.
 * No-op in production builds.
 */
export function useStudioTestHooks({
  previewIframeRef,
  buildDomSelectionFromTarget,
  applyDomSelection,
}: StudioTestHookDeps): void {
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!STUDIO_TEST_HOOKS_ENABLED || typeof window === "undefined") return;
    const api: StudioTestApi = {
      runtimeMode: STUDIO_RUNTIME_MODE,
      selectByDomId: async (id: string): Promise<boolean> => {
        const element = previewIframeRef.current?.contentDocument?.getElementById(id) ?? null;
        if (!element) return false;
        const selection = await buildDomSelectionFromTarget(element);
        if (!selection) return false;
        applyDomSelection(selection, { revealPanel: true });
        return true;
      },
      loadTimelinePerformanceFixture: (spec) => {
        const fixture = createTimelinePerformanceFixture(spec);
        setTimelinePerformanceFixtureLease(true);
        usePlayerStore.setState({
          ...createTimelineResetState(),
          currentTime: 0,
          duration: fixture.summary.duration,
          timelineReady: true,
          loopEnabled: false,
          zoomMode: "manual",
          manualZoomPercent: 2_000,
          elements: fixture.elements,
          selectedElementId: null,
          selectedElementIds: new Set(),
          selectedKeyframes: new Set(),
          keyframeCache: fixture.keyframeCache,
          gsapAnimations: fixture.gsapAnimations,
          expandedClipIds: fixture.expandedClipIds,
        });
        return fixture.summary;
      },
      resetTimelinePerformanceFixture: () => {
        usePlayerStore.getState().reset();
      },
      readTimelinePerformanceDiagnostics: () => readTimelinePerformanceDiagnostics(),
      timelineViewportBudgets: TIMELINE_VIEWPORT_BUDGETS,
    };
    window.__studioTest = api;
    return () => {
      // The lease is deliberately NOT released here. Loading a fixture writes
      // player state, which changes this effect's dependency identities and
      // tears the effect down on the very next frame. Releasing on teardown
      // therefore revoked the lease moments after it was taken, and live iframe
      // discovery overwrote the fixture the loader had just installed. The
      // lease belongs to the fixture, and a page reload clears it.
      // delete, not `= undefined`: an own key holding undefined keeps
      // `"__studioTest" in window` true, which defeats feature detection.
      delete window.__studioTest;
    };
  }, [applyDomSelection, buildDomSelectionFromTarget, previewIframeRef]);
}
