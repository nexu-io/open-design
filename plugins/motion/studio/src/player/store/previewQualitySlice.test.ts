// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { usePlayerStore } from "./playerStore";
import { readStudioUiPreferences } from "../../utils/studioUiPreferences";
import { parsePlaybackHealth, parsePreviewCopies } from "./previewQualitySlice";

describe("preview quality in the player store", () => {
  it("starts at full quality with no copies, and counts retries", () => {
    const state = usePlayerStore.getState();
    expect(state.previewQuality).toBe(1);
    expect(state.previewCopies).toBeNull();

    const before = state.previewCopiesRetry;
    state.retryPreviewCopies();
    expect(usePlayerStore.getState().previewCopiesRetry).toBe(before + 1);
  });

  it("keeps a person's pick over the app's, and does not save the app's", () => {
    usePlayerStore.setState({ previewQuality: 1, previewQualityChosenBy: null });
    usePlayerStore.getState().setPreviewQuality(0.25, { by: "app" });
    expect(usePlayerStore.getState()).toMatchObject({
      previewQuality: 0.25,
      previewQualityChosenBy: "app",
    });
    expect(readStudioUiPreferences().previewQuality).toBeUndefined();

    usePlayerStore.getState().setPreviewQuality(0.5);
    expect(usePlayerStore.getState()).toMatchObject({
      previewQuality: 0.5,
      previewQualityChosenBy: "person",
    });
    expect(readStudioUiPreferences().previewQuality).toBe(0.5);

    usePlayerStore.getState().setPreviewQuality(0.125, { by: "app" });
    expect(usePlayerStore.getState().previewQuality).toBe(0.5);
    usePlayerStore.getState().setPreviewQuality(1);
  });

  it("drops the health reading measured at the old level when the level changes", () => {
    const choppy = {
      droppedShare: 0.5,
      seconds: 3,
      choppy: true,
      fps: 14,
      worstFrameMs: 180,
      mode: "play",
    } as const;
    usePlayerStore.setState({ previewQuality: 1, previewQualityChosenBy: null });
    usePlayerStore.getState().setPlaybackHealth(choppy);
    usePlayerStore.getState().setPreviewQuality(1);
    expect(usePlayerStore.getState().playbackHealth).toEqual(choppy);

    usePlayerStore.getState().setPreviewQuality(0.5);
    expect(usePlayerStore.getState().playbackHealth).toBeNull();

    usePlayerStore.setState({ previewQualityChosenBy: null });
    usePlayerStore.getState().setPlaybackHealth(choppy);
    usePlayerStore.getState().setPreviewQuality(0.25, { by: "app" });
    expect(usePlayerStore.getState().playbackHealth).toBeNull();
    usePlayerStore.getState().setPreviewQuality(1);
  });

  it("reads a report of the copies only when it has the shape of one", () => {
    expect(
      parsePreviewCopies({ total: 2, ready: 1, failed: 1, progress: 0.75, error: "failed" }),
    ).toEqual({ total: 2, ready: 1, failed: 1, progress: 0.75, error: "failed" });
    expect(parsePreviewCopies(null)).toBeNull();
    expect(parsePreviewCopies({ total: "2", ready: 1, failed: 0, progress: 0 })).toBeNull();
    expect(parsePreviewCopies({ total: 2, ready: 1, failed: 0 })).toBeNull();
  });

  it("keeps the clock the runtime names, and only a clock it knows", () => {
    const health = {
      droppedShare: 0.4,
      seconds: 3,
      choppy: true,
      fps: 40,
      worstFrameMs: 90,
      mode: "play",
    };
    expect(parsePlaybackHealth({ ...health, clockSource: "webaudio" })?.clockSource).toBe(
      "webaudio",
    );
    expect(
      parsePlaybackHealth({ ...health, clockSource: "/Users/a/film.mp3" })?.clockSource,
    ).toBeUndefined();
    expect(parsePlaybackHealth(health)?.clockSource).toBeUndefined();
  });
});
