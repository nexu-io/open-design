// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineTimeRange } from "../store/rangeSelectionSlice";
import type { TimelineRangeSelection } from "./timelineEditing";
import { usePublishRangeSelection } from "./usePublishRangeSelection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(onRangeSelect: (range: TimelineTimeRange | null) => void) {
  const host = document.createElement("div");
  const root = createRoot(host);
  const Harness = ({ selection }: { selection: TimelineRangeSelection | null }) => {
    usePublishRangeSelection(selection, onRangeSelect);
    return null;
  };
  const render = (selection: TimelineRangeSelection | null) =>
    act(() => root.render(<Harness selection={selection} />));
  return { render, unmount: () => act(() => root.unmount()) };
}

const selection = (start: number, end: number): TimelineRangeSelection => ({
  start,
  end,
  anchorX: 0,
  anchorY: 0,
});

describe("usePublishRangeSelection", () => {
  afterEach(() => usePlayerStore.setState({ rangeSelection: null }));

  it("publishes an ordered range to the store and the host, and clears with null", () => {
    const onRangeSelect = vi.fn();
    const view = mount(onRangeSelect);

    view.render(selection(3, 1));
    expect(usePlayerStore.getState().rangeSelection).toEqual({ t0: 1, t1: 3 });
    expect(onRangeSelect).toHaveBeenLastCalledWith({ t0: 1, t1: 3 });

    view.render(null);
    expect(usePlayerStore.getState().rangeSelection).toBeNull();
    expect(onRangeSelect).toHaveBeenLastCalledWith(null);
    view.unmount();
  });

  it("does not re-notify for an unchanged range and preserves a newer store value on unmount", () => {
    const onRangeSelect = vi.fn();
    const view = mount(onRangeSelect);

    view.render(selection(1, 3));
    view.render(selection(3, 1));
    expect(onRangeSelect).toHaveBeenCalledTimes(1);

    usePlayerStore.setState({ rangeSelection: { t0: 9, t1: 10 } });
    view.unmount();
    expect(usePlayerStore.getState().rangeSelection).toEqual({ t0: 9, t1: 10 });
  });
});
