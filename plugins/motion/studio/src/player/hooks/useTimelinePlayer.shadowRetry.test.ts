// @vitest-environment happy-dom
// A reload that ran out its budgets is tried once more, so an edit is not left unseen behind the old preview.

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHADOW_READY_BUDGETS, SHADOW_READY_TIMEOUT_MS } from "./useShadowPreviewReload";
import { SHADOW_RETRY_DELAY_MS } from "./useShadowReloadRetry";
import {
  makeAdapterWindow,
  makeFakeIframe,
  renderTimelinePlayerHarness,
  resetPlayerStore,
} from "./timelinePlayerTestHarness";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FULL_WAIT_MS = SHADOW_READY_TIMEOUT_MS * SHADOW_READY_BUDGETS;

vi.mock("../../utils/gsapSoftReload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/gsapSoftReload")>()),
  ensureMotionPathPluginLoaded: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  resetPlayerStore();
});

function beginReload(onPreviewReloadFailed = vi.fn()) {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const harness = renderTimelinePlayerHarness({ onPreviewReloadFailed });
  const live = makeFakeIframe(makeAdapterWindow().win);
  act(() => {
    harness.getApi().iframeRef.current = live;
    harness.getApi().onIframeLoad();
  });
  act(() => harness.getApi().refreshPlayer());
  return { ...harness, onPreviewReloadFailed };
}

const shadows = (slots: { role: string; url?: string; gen: number }[]) =>
  slots.filter((slot) => slot.role === "shadow");

describe("a shadow reload that timed out", () => {
  it("is loaded once more after a short wait, with a fresh address", () => {
    const { getApi, onPreviewReloadFailed } = beginReload();
    const first = shadows(getApi().previewSlots)[0]!;

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));
    expect(onPreviewReloadFailed).toHaveBeenCalledTimes(1);
    expect(shadows(getApi().previewSlots)).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(SHADOW_RETRY_DELAY_MS));
    const again = shadows(getApi().previewSlots);
    expect(again).toHaveLength(1);
    expect(again[0]!.gen).toBeGreaterThan(first.gen);
    expect(new URL(again[0]!.url!, "http://x").pathname).toBe(
      new URL(first.url!, "http://x").pathname,
    );
  });

  it("is not tried a third time when the retry also runs out its budgets", () => {
    const { getApi, onPreviewReloadFailed } = beginReload();
    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS + SHADOW_RETRY_DELAY_MS));
    expect(shadows(getApi().previewSlots)).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS + SHADOW_RETRY_DELAY_MS * 3));
    expect(onPreviewReloadFailed).toHaveBeenCalledTimes(2);
    expect(shadows(getApi().previewSlots)).toHaveLength(0);
  });

  it("is not retried when a newer reload has taken over during the wait", () => {
    const { getApi } = beginReload();
    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));
    act(() => getApi().refreshPlayer());
    const newer = shadows(getApi().previewSlots);
    expect(newer).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(SHADOW_RETRY_DELAY_MS));
    expect(shadows(getApi().previewSlots)).toEqual(newer);
  });
});
