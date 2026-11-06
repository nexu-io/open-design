// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeHfColorGrading } from "@hyperframes/core/color-grading";
import { runtimeProtocolMetadata } from "@hyperframes/core/runtime/protocol";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";
import { useColorGradingController } from "./useColorGradingController";
import { sceneSwapFor } from "../../player/sceneSwap";
import type { DomEditSelection } from "./domEditing";

function brightPopGrading() {
  const next = normalizeHfColorGrading({ preset: "bright-pop", intensity: 1 });
  if (!next) throw new Error("expected bright-pop preset to normalize");
  return next;
}

function cleanStudioGrading() {
  const next = normalizeHfColorGrading({ preset: "clean-studio", intensity: 1 });
  if (!next) throw new Error("expected clean-studio preset to normalize");
  return next;
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  usePreviewIframeStore.setState({ iframe: null });
  document.body.innerHTML = "";
});

function makeElement(overrides: Partial<DomEditSelection> = {}): DomEditSelection {
  return {
    element: document.createElement("video"),
    id: "s1-bg",
    selector: "#s1-bg",
    label: "S1 Background",
    tagName: "video",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
    textContent: "",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
    ...overrides,
  } as DomEditSelection;
}

type ApplyScope = (
  scope: "source-file" | "project",
  value: string | null,
) => Promise<{ changedFiles: number; changedElements: number }>;

function HookHost({
  onState,
  onSetAttributeLive,
  element,
  previewIframeRef,
  onApplyScope,
  projectId = "proj",
}: {
  projectId?: string;
  onState: (state: ReturnType<typeof useColorGradingController>) => void;
  onSetAttributeLive: (attr: string, value: string | null) => void;
  element: DomEditSelection;
  previewIframeRef?: React.RefObject<HTMLIFrameElement | null>;
  onApplyScope?: ApplyScope;
}) {
  const state = useColorGradingController({
    projectId,
    element,
    previewIframeRef,
    onSetAttributeLive,
    onApplyScope,
  });
  onState(state);
  return null;
}

function renderHook(
  onSetAttributeLive: (attr: string, value: string | null) => void,
  initialElement: DomEditSelection = makeElement(),
  previewIframeRef?: React.RefObject<HTMLIFrameElement | null>,
  onApplyScope?: ApplyScope,
  projectId?: string,
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let latest: ReturnType<typeof useColorGradingController> | undefined;
  const renderWith = (element: DomEditSelection) => {
    act(() => {
      root.render(
        React.createElement(HookHost, {
          onState: (s: ReturnType<typeof useColorGradingController>) => (latest = s),
          onSetAttributeLive,
          element,
          previewIframeRef,
          onApplyScope,
          projectId,
        }),
      );
    });
  };
  renderWith(initialElement);
  return {
    root,
    rerenderWithElement: renderWith,
    // A method, not a getter — `const { state } = renderHook(...)` would
    // destructure a getter into a one-time snapshot, silently going stale
    // after the first state change. Call `.getState()` fresh every time.
    getState(): ReturnType<typeof useColorGradingController> {
      if (!latest) throw new Error("hook did not render");
      return latest;
    },
  };
}

type PreviewWindow = Window & {
  __hf?: {
    colorGrading?: {
      renderPreviews?: ReturnType<typeof vi.fn>;
      startPreviewPlayback?: ReturnType<typeof vi.fn>;
    };
  };
  __player?: { play: ReturnType<typeof vi.fn> };
};

function createPreviewFrame() {
  const iframe = document.body.appendChild(document.createElement("iframe"));
  const contentWindow = iframe.contentWindow as PreviewWindow | null;
  if (!contentWindow) throw new Error("expected iframe contentWindow");
  return { contentWindow, iframe };
}

function installPreviewRenderer(contentWindow: PreviewWindow) {
  const renderPreviews = vi
    .fn()
    .mockImplementation(async (_target: unknown, candidates: Array<{ id: string }>) => ({
      width: 160,
      height: 90,
      images: candidates.map(({ id }) => ({
        id,
        dataUrl: `data:image/png;base64,${id}`,
      })),
    }));
  contentWindow.__hf = { colorGrading: { renderPreviews } };
  return renderPreviews;
}

async function flushPreviewRequest() {
  act(() => vi.advanceTimersByTime(0));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function colorGradingMessages(calls: ReadonlyArray<ReadonlyArray<unknown>>) {
  return calls
    .map(([message]) => message)
    .filter(
      (message): message is { action: string; grading: unknown } =>
        typeof message === "object" &&
        message !== null &&
        "action" in message &&
        message.action === "set-color-grading",
    );
}

describe("useColorGradingController", () => {
  it("starts with the neutral (inactive) grading and idle compare state", () => {
    const { root, getState } = renderHook(vi.fn());
    expect(getState().grading.preset).toBe("neutral");
    expect(getState().compareEnabled).toBe(false);
    act(() => root.unmount());
  });

  it("requests one exact preset batch from the selected media runtime", async () => {
    vi.useFakeTimers();
    const devicePixelRatio = vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const { contentWindow, iframe } = createPreviewFrame();
    const renderPreviews = installPreviewRenderer(contentWindow);
    const initialElement = makeElement({
      dataAttributes: {
        "color-grading": JSON.stringify({
          wheels: { shadows: { hue: 210, amount: 0.2 } },
          effects: { pixelate: 0.4 },
          palette: ["#112233", "#ffffff"],
        }),
      },
    });
    const { root, getState } = renderHook(vi.fn(), initialElement, { current: iframe });

    act(() => getState().requestPresetPreviews());
    await flushPreviewRequest();

    expect(renderPreviews).toHaveBeenCalledTimes(1);
    expect(renderPreviews.mock.calls[0]?.[1]).toHaveLength(18);
    expect(renderPreviews.mock.calls[0]?.[1]).toContainEqual({
      id: "bright-pop",
      grading: expect.objectContaining({
        wheels: expect.objectContaining({
          shadows: expect.objectContaining({ amount: 0 }),
        }),
        effects: expect.objectContaining({ pixelate: 0.4 }),
        palette: ["#112233", "#ffffff"],
      }),
    });
    expect(renderPreviews.mock.calls[0]?.[2]).toEqual({ maxDimension: 320 });
    expect(getState().presetPreviews).toEqual({
      status: "ready",
      images: expect.objectContaining({ "bright-pop": "data:image/png;base64,bright-pop" }),
      width: 160,
      height: 90,
    });
    act(() => root.unmount());
    devicePixelRatio.mockRestore();
    vi.useRealTimers();
  });

  it("retains partial preset previews and exposes retry after the batch times out", async () => {
    vi.useFakeTimers();
    const { contentWindow, iframe } = createPreviewFrame();
    const renderPreviews = vi.fn().mockResolvedValue({
      width: 160,
      height: 90,
      images: [{ id: "bright-pop", dataUrl: "data:image/png;base64,bright" }],
    });
    contentWindow.__hf = { colorGrading: { renderPreviews } };
    const { root, getState } = renderHook(vi.fn(), makeElement(), { current: iframe });

    act(() => getState().requestPresetPreviews());
    await flushPreviewRequest();
    expect(getState().presetPreviews).toMatchObject({
      status: "loading",
      images: { "bright-pop": "data:image/png;base64,bright" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700);
    });
    expect(getState().presetPreviews).toMatchObject({
      status: "unavailable",
      images: { "bright-pop": "data:image/png;base64,bright" },
    });
    expect(renderPreviews.mock.calls.length).toBeGreaterThan(1);
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("persists a disabled secondary even though it does not render pixels", () => {
    vi.useFakeTimers();
    const onSetAttributeLive = vi.fn();
    const grading = normalizeHfColorGrading({
      secondaries: [
        {
          enabled: false,
          key: { hue: { center: 215, range: 25 } },
          correction: { saturation: 0.15 },
        },
      ],
    });
    if (!grading) throw new Error("expected secondary grading");
    const { root, getState } = renderHook(onSetAttributeLive);

    act(() => getState().commitColorGrading(grading));
    act(() => vi.advanceTimersByTime(400));

    expect(onSetAttributeLive.mock.calls[0]?.[0]).toBe("color-grading");
    expect(onSetAttributeLive.mock.calls[0]?.[1]).toContain('"enabled":false');
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("copies a disabled authored secondary to a broader scope", async () => {
    const onApplyScope = vi.fn<ApplyScope>().mockResolvedValue({
      changedFiles: 1,
      changedElements: 1,
    });
    const grading = {
      secondaries: [
        {
          enabled: false,
          key: { hue: { center: 215, range: 25 } },
          correction: { saturation: 0.15 },
        },
      ],
    };
    const { root, getState } = renderHook(
      vi.fn(),
      makeElement({ dataAttributes: { "color-grading": JSON.stringify(grading) } }),
      undefined,
      onApplyScope,
    );

    await act(async () => getState().applyToScope());

    expect(onApplyScope).toHaveBeenCalledWith(
      "source-file",
      expect.stringContaining('"enabled":false'),
    );
    act(() => root.unmount());
  });

  it("requests exact effect families and retains earlier family images", async () => {
    vi.useFakeTimers();
    const { contentWindow, iframe } = createPreviewFrame();
    const renderPreviews = installPreviewRenderer(contentWindow);
    const { root, getState } = renderHook(vi.fn(), makeElement(), { current: iframe });

    act(() => getState().requestEffectPreviews(["blur", "pixelate", "bloom"]));
    await flushPreviewRequest();

    expect(renderPreviews).toHaveBeenCalledTimes(1);
    expect(renderPreviews.mock.calls[0]?.[1].map(({ id }: { id: string }) => id)).toEqual([
      "blur",
      "pixelate",
      "bloom",
    ]);

    act(() => getState().requestEffectPreviews(["kuwahara"]));
    await flushPreviewRequest();

    expect(renderPreviews).toHaveBeenCalledTimes(2);
    expect(getState().effectPreviews).toEqual({
      status: "ready",
      images: {
        blur: "data:image/png;base64,blur",
        pixelate: "data:image/png;base64,pixelate",
        bloom: "data:image/png;base64,bloom",
        kuwahara: "data:image/png;base64,kuwahara",
      },
      width: 160,
      height: 90,
    });
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("commitColorGrading updates grading state synchronously and schedules a debounced persist", async () => {
    vi.useFakeTimers();
    const onSetAttributeLive = vi.fn();
    const { root, getState } = renderHook(onSetAttributeLive);
    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    expect(getState().grading.preset).toBe("bright-pop");
    expect(onSetAttributeLive).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSetAttributeLive).toHaveBeenCalledTimes(1);
    const [attr, value] = onSetAttributeLive.mock.calls[0] as [string, string];
    expect(attr).toBe("color-grading");
    expect(value).toContain("bright-pop");
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("previews through the runtime only and restores the committed grade without persisting", () => {
    vi.useFakeTimers();
    const onSetAttributeLive = vi.fn();
    const { contentWindow, iframe } = createPreviewFrame();
    const postMessage = vi.spyOn(contentWindow, "postMessage");
    const { root, getState } = renderHook(onSetAttributeLive, makeElement(), {
      current: iframe,
    });

    act(() => getState().previewColorGrading(brightPopGrading()));
    act(() => getState().previewColorGrading(null));
    const gradingMessages = colorGradingMessages(postMessage.mock.calls);
    expect(gradingMessages).toHaveLength(2);
    expect(gradingMessages[0]?.grading).toMatchObject({ preset: "bright-pop" });
    expect(gradingMessages[1]?.grading).toBeNull();
    expect(getState().grading.preset).toBe("neutral");
    act(() => vi.advanceTimersByTime(500));
    expect(onSetAttributeLive).not.toHaveBeenCalled();

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("re-sends the grade to the preview after edited scenes are swapped in", async () => {
    vi.useFakeTimers();
    const { contentWindow, iframe } = createPreviewFrame();
    (contentWindow as unknown as { __hfSwapScenes: () => Promise<void> }).__hfSwapScenes =
      async () => {};
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html></html>"));
    const postMessage = vi.spyOn(contentWindow, "postMessage");
    const { root, getState } = renderHook(vi.fn(), makeElement(), { current: iframe });
    act(() => getState().commitColorGrading(brightPopGrading()));
    await act(async () => {
      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();
    });
    postMessage.mockClear();

    await act(() => sceneSwapFor(iframe)!("/preview", () => true));
    const replayed = colorGradingMessages(postMessage.mock.calls);
    expect(replayed.at(-1)?.grading).toMatchObject({ preset: "bright-pop" });

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("animates only the selected video card without starting the project player", async () => {
    vi.useFakeTimers();
    const { contentWindow, iframe } = createPreviewFrame();
    const stopPlayback = vi.fn();
    const renderPreviews = vi.fn().mockResolvedValue({
      width: 320,
      height: 180,
      images: [{ id: "bright-pop", dataUrl: "data:image/png;base64,animated" }],
    });
    const startPreviewPlayback = vi.fn(() => stopPlayback);
    contentWindow.__hf = { colorGrading: { renderPreviews, startPreviewPlayback } };
    contentWindow.__player = { play: vi.fn() };
    const { root, getState } = renderHook(vi.fn(), makeElement(), { current: iframe });

    act(() =>
      getState().previewColorGrading(brightPopGrading(), {
        animatedPreview: { kind: "presets", id: "bright-pop" },
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(startPreviewPlayback).toHaveBeenCalledTimes(1);
    expect(renderPreviews).toHaveBeenCalledWith(
      expect.anything(),
      [{ id: "bright-pop", grading: expect.objectContaining({ preset: "bright-pop" }) }],
      { maxDimension: 160, useMediaTime: true },
    );
    expect(contentWindow.__player.play).not.toHaveBeenCalled();
    expect(getState().presetPreviews.images["bright-pop"]).toBe("data:image/png;base64,animated");

    act(() => getState().previewColorGrading(null));
    expect(stopPlayback).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("restores a just-committed look even before React renders the new state", () => {
    vi.useFakeTimers();
    const { contentWindow, iframe } = createPreviewFrame();
    const postMessage = vi.spyOn(contentWindow, "postMessage");
    const { root, getState } = renderHook(vi.fn(), makeElement(), { current: iframe });
    const brightPop = brightPopGrading();

    act(() => {
      getState().commitColorGrading(brightPop);
      getState().previewColorGrading(null);
    });
    const gradingMessages = colorGradingMessages(postMessage.mock.calls);
    expect(gradingMessages.at(-1)?.grading).toMatchObject({ preset: "bright-pop" });

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("reverts to the last confirmed-good grading via the real onSettled(false) signal (matches runDomEditCommit, which never rejects)", async () => {
    // The actual Studio commit runner (runDomEditCommit) catches persist
    // failures internally and always resolves — it reports outcome only
    // through the onSettled callback passed as the 3rd argument. A mock
    // that only rejects would validate a path the real callback never takes.
    vi.useFakeTimers();
    const onSetAttributeLive = vi.fn(
      (_attr: string, _value: string | null, onSettled?: (ok: boolean) => void) => {
        onSettled?.(false);
        return Promise.resolve();
      },
    );
    const { root, getState } = renderHook(onSetAttributeLive);
    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    expect(getState().grading.preset).toBe("bright-pop");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getState().grading.preset).toBe("neutral");
    expect(getState().runtimeStatus.state).toBe("unavailable");
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("reverts to the last confirmed-good grading when a persist rejects (fallback for a non-onSettled implementation)", async () => {
    vi.useFakeTimers();
    const onSetAttributeLive = vi.fn().mockRejectedValue(new Error("disk full"));
    const { root, getState } = renderHook(onSetAttributeLive);
    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    expect(getState().grading.preset).toBe("bright-pop");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // The rejection settles on a microtask, not a timer — flush it.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Reverted to "neutral" (the last confirmed-good value, from before this
    // commit) instead of permanently showing "bright-pop" as if it had saved.
    expect(getState().grading.preset).toBe("neutral");
    expect(getState().runtimeStatus.state).toBe("unavailable");
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("a stale in-flight persist result does not touch state after selection has moved on to a THIRD element", async () => {
    vi.useFakeTimers();
    let resolveA: (() => void) | undefined;
    let capturedOnSettledA: ((ok: boolean) => void) | undefined;
    const onSetAttributeLive = vi.fn(
      (_attr: string, _value: string | null, onSettled?: (ok: boolean) => void) => {
        capturedOnSettledA = onSettled;
        return new Promise<void>((resolve) => {
          resolveA = resolve;
        });
      },
    );
    const { root, getState, rerenderWithElement } = renderHook(
      onSetAttributeLive,
      makeElement({ id: "s1-bg" }),
    );
    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    // Let the debounce fire while still on s1-bg — the persist call is now
    // genuinely in flight (its promise won't settle until resolveA() below).
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSetAttributeLive).toHaveBeenCalledTimes(1);

    // Selection moves twice more while s1-bg's persist is still pending.
    rerenderWithElement(makeElement({ id: "s2-bg" }));
    rerenderWithElement(makeElement({ id: "s3-bg" }));
    expect(getState().grading.preset).toBe("neutral"); // s3-bg's own fresh state

    // NOW the stale s1-bg persist finally settles as a failure.
    act(() => {
      capturedOnSettledA?.(false);
      resolveA?.();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // s3-bg's state must be untouched by a result that belongs to s1-bg.
    expect(getState().grading.preset).toBe("neutral");
    expect(getState().runtimeStatus.state).not.toBe("unavailable");
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("a stale in-flight persist for edit A does not clobber edit B's state — SAME element, no selection change", async () => {
    vi.useFakeTimers();
    let resolveA: (() => void) | undefined;
    let capturedOnSettledA: ((ok: boolean) => void) | undefined;
    const onSetAttributeLive = vi
      .fn()
      // Edit A (bright-pop): captures its onSettled and never resolves until
      // resolveA() is called below — simulates a slow persist.
      .mockImplementationOnce(
        (_attr: string, _value: string | null, onSettled?: (ok: boolean) => void) => {
          capturedOnSettledA = onSettled;
          return new Promise<void>((resolve) => {
            resolveA = resolve;
          });
        },
      )
      // Edit B (clean-studio): settles immediately and successfully.
      .mockImplementationOnce(
        (_attr: string, _value: string | null, onSettled?: (ok: boolean) => void) => {
          onSettled?.(true);
          return Promise.resolve();
        },
      );
    const { root, getState } = renderHook(onSetAttributeLive);

    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSetAttributeLive).toHaveBeenCalledTimes(1); // A's persist now in flight

    // B commits on the SAME element before A's persist has settled.
    act(() => {
      getState().commitColorGrading(cleanStudioGrading());
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSetAttributeLive).toHaveBeenCalledTimes(2); // B's persist has already settled (mock resolves sync)
    expect(getState().grading.preset).toBe("clean-studio");

    // NOW A's stale persist finally settles as a FAILURE — must not revert
    // `grading` (which now correctly shows B's newer edit) back to the
    // pre-A baseline ("neutral"), and must not stamp confirmedGradingRef
    // with A's now-superseded attempt on success either.
    act(() => {
      capturedOnSettledA?.(false);
      resolveA?.();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getState().grading.preset).toBe("clean-studio");
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("resetGrading resets Grade fields without clearing LUT, Effects, or Palette", () => {
    const { root, getState } = renderHook(vi.fn());
    const grading = normalizeHfColorGrading({
      preset: "bright-pop",
      lut: { src: "assets/luts/custom.cube", intensity: 0.6 },
      effects: { pixelate: 0.5 },
      palette: ["#112233", "#ffffff"],
    });
    if (!grading) throw new Error("expected grading to normalize");
    act(() => {
      getState().commitColorGrading(grading);
    });
    act(() => {
      getState().resetGrading();
    });
    expect(getState().grading).toMatchObject({
      preset: "neutral",
      lut: { src: "assets/luts/custom.cube", intensity: 0.6 },
      effects: { pixelate: 0.5 },
      palette: ["#112233", "#ffffff"],
    });
    act(() => root.unmount());
  });

  it("resets grading/compare state when selection changes to a different element", () => {
    const { root, getState, rerenderWithElement } = renderHook(
      vi.fn(),
      makeElement({ id: "s1-bg" }),
    );
    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    expect(getState().grading.preset).toBe("bright-pop");
    // A different element, with no persisted grading of its own — without a
    // reset, this hook (unlike the legacy component it was extracted from,
    // which remounts via a `key={selectionIdentityKey}`) would keep showing
    // the previous element's grading.
    rerenderWithElement(makeElement({ id: "s2-bg" }));
    expect(getState().grading.preset).toBe("neutral");
    act(() => root.unmount());
  });

  it("also resets when the same local id/selector recurs in a different source file", () => {
    // Same id, same selector, same selectorIndex — only sourceFile differs.
    // Without sourceFile in the identity key, this would collide with the
    // first element (e.g. host composition vs. an inlined sub-composition,
    // or two unrelated sub-comps that happen to share a local id).
    const { root, getState, rerenderWithElement } = renderHook(
      vi.fn(),
      makeElement({ id: "bg", sourceFile: "index.html" }),
    );
    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    expect(getState().grading.preset).toBe("bright-pop");
    rerenderWithElement(makeElement({ id: "bg", sourceFile: "sub-comp.html" }));
    expect(getState().grading.preset).toBe("neutral");
    act(() => root.unmount());
  });

  it("flushes — rather than discards — a pending persist for the previous element when selection changes before it fires", () => {
    vi.useFakeTimers();
    const onSetAttributeLive = vi.fn();
    const { root, getState, rerenderWithElement } = renderHook(
      onSetAttributeLive,
      makeElement({ id: "s1-bg" }),
    );
    act(() => {
      getState().commitColorGrading(brightPopGrading());
    });
    // Switch selection before the 350ms debounce fires — the in-flight edit
    // must be written immediately (targeting the OUTGOING element's own
    // commit callback), not silently dropped just because a debounce timer
    // hadn't elapsed yet.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerenderWithElement(makeElement({ id: "s2-bg" }));
    expect(onSetAttributeLive).toHaveBeenCalledTimes(1);
    const [attr, value] = onSetAttributeLive.mock.calls[0] as [string, string];
    expect(attr).toBe("color-grading");
    expect(value).toContain("bright-pop");
    // And it must not ALSO fire again once the (now-cleared) original timer
    // window would have elapsed.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSetAttributeLive).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("does not permanently cache a non-OK media/metadata response — the next mount retries", async () => {
    const videoWithSrc = () => {
      const el = document.createElement("video");
      el.setAttribute("src", "clip.mp4");
      return el;
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ metadata: { kind: "video", color: { dynamicRange: "hdr" } } }),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const first = renderHook(vi.fn(), makeElement({ id: "retry-asset", element: videoWithSrc() }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(first.getState().mediaMetadata).toBeNull();
    act(() => first.root.unmount());

    // A second, independent mount for the SAME asset path — if the failed
    // response had been cached, this would never re-fetch and mediaMetadata
    // would stay null forever.
    const second = renderHook(
      vi.fn(),
      makeElement({ id: "retry-asset-2", element: videoWithSrc() }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.getState().mediaMetadata?.color.dynamicRange).toBe("hdr");
    act(() => second.root.unmount());
    vi.unstubAllGlobals();
  });

  it("keeps media metadata apart for 'p:a' + 'b.mp4' and 'p' + 'a:b.mp4'", async () => {
    const video = (src: string) => {
      const el = document.createElement("video");
      el.setAttribute("src", src);
      return el;
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ metadata: { kind: "video", color: { dynamicRange: "hdr" } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    for (const [projectId, src] of [
      ["p:a", "b.mp4"],
      ["p", "a:b.mp4"],
    ]) {
      const { root } = renderHook(
        vi.fn(),
        makeElement({ element: video(src) }),
        undefined,
        undefined,
        projectId,
      );
      await act(async () => {
        await Promise.resolve();
      });
      act(() => root.unmount());
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe("useColorGradingController after the preview iframe is replaced", () => {
  it("replays the grade to the new iframe on its ready message and ignores the old one", () => {
    vi.useFakeTimers();
    const a = createPreviewFrame();
    const b = createPreviewFrame();
    const ref = { current: a.iframe as HTMLIFrameElement | null };
    usePreviewIframeStore.getState().setIframe(a.iframe);
    const initialElement = makeElement({
      dataAttributes: { "color-grading": JSON.stringify({ preset: "bright-pop", intensity: 1 }) },
    });
    const { root } = renderHook(vi.fn(), initialElement, ref);
    act(() => vi.advanceTimersByTime(100));

    const postToA = vi.spyOn(a.contentWindow, "postMessage");
    const postToB = vi.spyOn(b.contentWindow, "postMessage");
    act(() => {
      ref.current = b.iframe;
      usePreviewIframeStore.getState().setIframe(b.iframe);
    });
    const ready = { source: "hf-preview", type: "ready", ...runtimeProtocolMetadata(30) };
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: ready, source: a.contentWindow }));
    });
    expect(colorGradingMessages(postToB.mock.calls)).toHaveLength(0);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: ready, source: b.contentWindow }));
    });

    expect(colorGradingMessages(postToB.mock.calls)).toHaveLength(1);
    expect(postToA).not.toHaveBeenCalled();
    act(() => root.unmount());
    vi.useRealTimers();
  });
});
