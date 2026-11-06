// @vitest-environment happy-dom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGsapPropertyDebounce } from "./useGsapPropertyDebounce";
import type { DomEditSelection } from "../components/editor/domEditingTypes";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The SDK path is gated on STUDIO_SDK_CUTOVER_ENABLED; keep it OFF so the flush
// routes through commitMutationSafely (the spy we count), keeping the test about
// flush TIMING, not the SDK write path.
vi.mock("../components/editor/manualEditingAvailability", () => ({
  STUDIO_SDK_CUTOVER_ENABLED: false,
}));
vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

const selection = { sourceFile: "index.html" } as unknown as DomEditSelection;

describe("useGsapPropertyDebounce flush stability (finding #7)", () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  it("re-rendering the parent while an edit is pending does NOT flush early or duplicate commits", () => {
    const commitMutationSafely = vi.fn();
    let queueEdit: (() => void) | null = null;
    let forceRerender: (() => void) | null = null;

    function Harness() {
      const [tick, setTick] = useState(0);
      forceRerender = () => setTick((t) => t + 1);
      // A FRESH sdk wrapper literal every render — the exact churn that, before
      // the ref-stabilization fix, re-fired the unmount-flush cleanup effect.
      const ops = useGsapPropertyDebounce(commitMutationSafely, {
        sdkSession: null,
        sdkDeps: null,
        activeCompPath: "index.html",
      });
      queueEdit = () => ops.updateGsapProperty(selection, "tw-1", "x", tick + 1);
      return React.createElement("div", null, String(tick));
    }

    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(Harness));
    });

    // Queue one pending edit.
    act(() => {
      queueEdit?.();
    });
    expect(commitMutationSafely).not.toHaveBeenCalled();

    // Re-render the parent several times BEFORE the debounce elapses. The bug
    // flushed (and recorded a commit) on every re-render via the cleanup effect.
    act(() => {
      forceRerender?.();
    });
    act(() => {
      forceRerender?.();
    });
    act(() => {
      forceRerender?.();
    });
    expect(commitMutationSafely).not.toHaveBeenCalled();

    // The debounce fires exactly once.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(commitMutationSafely).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("reports a rejected debounced flush instead of leaking an unhandled rejection", async () => {
    const error = new Error("save failed");
    const commitMutationSafely = vi.fn().mockRejectedValue(error);
    const onFlushError = vi.fn();
    let queueEdit: (() => void) | null = null;

    function Harness() {
      const ops = useGsapPropertyDebounce(commitMutationSafely, {
        sdkSession: null,
        sdkDeps: null,
        activeCompPath: "index.html",
        onFlushError,
      });
      queueEdit = () => ops.updateGsapProperty(selection, "tw-1", "x", 42);
      return null;
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    act(() => queueEdit?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(onFlushError).toHaveBeenCalledWith(
      error,
      selection,
      { type: "update-property", animationId: "tw-1", property: "x", value: 42 },
      "Edit GSAP x",
    );
    act(() => root.unmount());
  });
});
