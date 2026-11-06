// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { timelineClipFocusId } from "./timelineNavigationIdentity";
import { selectAndRevealTimelineElement } from "./timelineDropReveal";

beforeEach(() => {
  usePlayerStore.getState().reset();
});

describe("selectAndRevealTimelineElement", () => {
  it("selects the element and requests a scroll-to-focus on the same key", () => {
    selectAndRevealTimelineElement("index.html#clip-1");

    expect(usePlayerStore.getState().selectedElementId).toBe("index.html#clip-1");
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(
      timelineClipFocusId("index.html#clip-1"),
    );
  });

  it("moves the focus request to the new element when called again", () => {
    selectAndRevealTimelineElement("index.html#clip-1");
    const firstNonce = usePlayerStore.getState().timelineFocus?.nonce;

    selectAndRevealTimelineElement("index.html#clip-2");

    expect(usePlayerStore.getState().selectedElementId).toBe("index.html#clip-2");
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(
      timelineClipFocusId("index.html#clip-2"),
    );
    expect(usePlayerStore.getState().timelineFocus?.nonce).not.toBe(firstNonce);
  });
});
