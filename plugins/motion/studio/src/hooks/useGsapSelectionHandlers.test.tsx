// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { useGsapSelectionHandlers } from "./useGsapSelectionHandlers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Params = Parameters<typeof useGsapSelectionHandlers>[0];
type Handlers = ReturnType<typeof useGsapSelectionHandlers>;

function makeSelection(): DomEditSelection {
  return {
    id: "box",
    hfId: "hf-box",
    selector: "#box",
    sourceFile: "index.html",
    element: document.createElement("div"),
  } as unknown as DomEditSelection;
}

function makeParams(overrides: Partial<Params> = {}): Params {
  const resolved = () => vi.fn().mockResolvedValue(undefined);
  return {
    domEditSelection: makeSelection(),
    updateGsapProperty: vi.fn(),
    updateGsapMeta: resolved(),
    deleteGsapAnimation: resolved(),
    deleteAllForSelector: resolved(),
    addGsapAnimation: resolved(),
    addGsapProperty: resolved(),
    removeGsapProperty: resolved(),
    updateGsapFromProperty: resolved(),
    addGsapFromProperty: resolved(),
    removeGsapFromProperty: resolved(),
    addKeyframe: vi.fn(),
    addKeyframeBatch: resolved(),
    removeKeyframe: vi.fn(),
    moveKeyframe: vi.fn().mockResolvedValue(true),
    resizeKeyframedTween: vi.fn().mockResolvedValue(true),
    convertToKeyframes: resolved(),
    removeAllKeyframes: vi.fn().mockResolvedValue(true),
    handleDomManualEditsReset: vi.fn(),
    selectedGsapAnimations: [],
    showToast: vi.fn(),
    ...overrides,
  };
}

function renderHandlers(params: Params): { handlers: () => Handlers; unmount: () => void } {
  let current: Handlers | undefined;
  function Probe() {
    current = useGsapSelectionHandlers(params);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  return {
    handlers: () => {
      if (!current) throw new Error("Hook did not render");
      return current;
    },
    unmount: () => act(() => root.unmount()),
  };
}

async function flushRejection(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useGsapSelectionHandlers save failures", () => {
  it("surfaces a rejected animation metadata save", async () => {
    const error = new Error("write failed");
    const showToast = vi.fn();
    const rendered = renderHandlers(
      makeParams({ updateGsapMeta: vi.fn().mockRejectedValue(error), showToast }),
    );

    // Braces, not a bare arrow: the handler returns its settlement promise now,
    // and returning a thenable from act() turns it into an un-awaited async act.
    act(() => {
      void rendered.handlers().handleGsapUpdateMeta("anim-1", { duration: 2 });
    });
    await flushRejection();

    expect(showToast).toHaveBeenCalledWith("Couldn't save animation: write failed", "error");
    rendered.unmount();
  });

  it("surfaces a rejected non-debounced property save", async () => {
    const error = new Error("write failed");
    const showToast = vi.fn();
    const rendered = renderHandlers(
      makeParams({ addGsapProperty: vi.fn().mockRejectedValue(error), showToast }),
    );

    act(() => rendered.handlers().handleGsapAddProperty("anim-1", "opacity"));
    await flushRejection();

    expect(showToast).toHaveBeenCalledWith("Couldn't save animation: write failed", "error");
    rendered.unmount();
  });

  it("does not duplicate a toast already emitted by the mutation request", async () => {
    const error = Object.assign(new Error("write failed"), { alreadyToasted: true });
    const showToast = vi.fn();
    const rendered = renderHandlers(
      makeParams({ addGsapAnimation: vi.fn().mockRejectedValue(error), showToast }),
    );

    act(() => {
      void rendered.handlers().handleGsapAddAnimation("to");
    });
    await flushRejection();

    expect(showToast).not.toHaveBeenCalled();
    rendered.unmount();
  });
});

describe("useGsapSelectionHandlers selection override", () => {
  it("aborts on an explicit null override instead of writing to the current selection", () => {
    const removeKeyframe = vi.fn();
    const rendered = renderHandlers(makeParams({ removeKeyframe }));

    // Explicit null: the caller resolved a selection for its own element and
    // found none, so the write must not land on the selected element.
    rendered.handlers().handleGsapRemoveKeyframe("anim-1", 50, undefined, null);
    expect(removeKeyframe).not.toHaveBeenCalled();

    // Omitted override: falls back to the current selection as before.
    rendered.handlers().handleGsapRemoveKeyframe("anim-1", 50);
    expect(removeKeyframe).toHaveBeenCalledOnce();
    rendered.unmount();
  });

  it("computes the playhead percentage from the passed animation, not the selection's", () => {
    const moveKeyframe = vi.fn();
    const selection = makeSelection();
    // The passed tween runs 2s→6s, so the playhead at 3s is 25% into IT. Without
    // the animation the handler falls back to the selection's own element window
    // (0s→1s here), which reads the same playhead as 100%. Asserting the exact
    // 25 is what separates the two; `expect.any(Number)` even accepts the NaN a
    // missing window would produce.
    const animation = {
      id: "anim-1",
      position: 2,
      resolvedStart: 2,
      duration: 4,
      keyframes: { keyframes: [] },
    } as unknown as GsapAnimation;
    usePlayerStore.setState({ currentTime: 3 });
    const rendered = renderHandlers(makeParams({ moveKeyframe, selectedGsapAnimations: [] }));

    rendered.handlers().handleGsapMoveKeyframeToPlayhead("anim-1", 50, selection, animation);

    expect(moveKeyframe).toHaveBeenCalledWith(selection, "anim-1", 50, 25);
    rendered.unmount();
  });
});

describe("useGsapSelectionHandlers retime settlement", () => {
  it("returns false without a selection and forwards the mutation result with one", async () => {
    const moveKeyframe = vi.fn().mockResolvedValue(true);
    const withoutSelection = renderHandlers(makeParams({ domEditSelection: null, moveKeyframe }));
    await expect(
      withoutSelection.handlers().handleGsapMoveKeyframe("anim-1", 50, 75),
    ).resolves.toBe(false);
    expect(moveKeyframe).not.toHaveBeenCalled();
    withoutSelection.unmount();

    const withSelection = renderHandlers(makeParams({ moveKeyframe }));
    await expect(withSelection.handlers().handleGsapMoveKeyframe("anim-1", 50, 75)).resolves.toBe(
      true,
    );
    expect(moveKeyframe).toHaveBeenCalledOnce();
    withSelection.unmount();
  });
});
