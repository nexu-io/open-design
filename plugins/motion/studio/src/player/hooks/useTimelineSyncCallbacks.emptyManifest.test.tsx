// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { useTimelineSyncCallbacks } from "./useTimelineSyncCallbacks";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("processTimelineMessage with an empty manifest", () => {
  it("commits zero rows without adopting the runtime 1s floor as the duration", () => {
    const sync = vi.fn<(els: TimelineElement[], duration?: number) => void>();
    let processTimelineMessage: ReturnType<
      typeof useTimelineSyncCallbacks
    >["processTimelineMessage"];
    function Harness() {
      ({ processTimelineMessage } = useTimelineSyncCallbacks({
        iframeRef: { current: null },
        probeIntervalRef: { current: undefined },
        pendingSeekRef: { current: null },
        isRefreshingRef: { current: false },
        getAdapter: () => null,
        syncTimelineElements: sync,
        setDuration: () => {},
        setCurrentTime: () => {},
        requestTimelineReady: () => {},
        setIsPlaying: () => {},
        attachIframeShortcutListeners: () => {},
        applyPreviewAudioState: () => {},
      }));
      return null;
    }
    const host = document.createElement("div");
    act(() => createRoot(host).render(<Harness />));

    processTimelineMessage!({ clips: [], durationInFrames: 30 });

    expect(sync).toHaveBeenCalledWith([], undefined);
  });
});
