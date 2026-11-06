// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { TimelineEditCallbacks } from "../player/components/timelineCallbacks";
import { TimelineEditProvider, useTimelineEditContext } from "./TimelineEditContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountProvider() {
  const seen: TimelineEditCallbacks[] = [];
  function Consumer() {
    seen.push(useTimelineEditContext());
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const render = (value: TimelineEditCallbacks) =>
    act(() =>
      root.render(
        <TimelineEditProvider value={value}>
          <Consumer />
        </TimelineEditProvider>,
      ),
    );
  return { seen, render, unmount: () => act(() => root.unmount()) };
}

describe("TimelineEditProvider", () => {
  it("hands consumers the latest multi-clip resize callback", () => {
    const { seen, render, unmount } = mountProvider();
    const onMoveElement = vi.fn();
    const staleResize = vi.fn();
    const currentResize = vi.fn();
    render({ onMoveElement, onResizeElements: staleResize });
    render({ onMoveElement, onResizeElements: currentResize });
    expect(seen.at(-1)!.onResizeElements).toBe(currentResize);
    unmount();
  });

  it("keeps the same bag when the parent passes the same callbacks in a new object", () => {
    const { seen, render, unmount } = mountProvider();
    const onMoveElement = vi.fn();
    const onResizeElements = vi.fn();
    render({ onMoveElement, onResizeElements });
    render({ onMoveElement, onResizeElements });
    expect(seen.at(-1)).toBe(seen[0]);
    unmount();
  });
});
