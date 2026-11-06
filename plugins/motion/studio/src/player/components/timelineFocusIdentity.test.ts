import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { resolveTimelineFocusIdentity } from "./timelineFocusIdentity";

describe("timeline focus identity", () => {
  const elements: TimelineElement[] = [
    { id: "clip/a", key: "stable:key", tag: "div", start: 0, duration: 1, track: 7.5 },
  ];

  it("resolves a stable element id and fractional display row from model identity", () => {
    expect(resolveTimelineFocusIdentity(elements, "stable:key")).toEqual({
      elementId: "stable:key",
      rowKey: 7.5,
    });
  });

  it("does not invent focus for a missing or cleared identity", () => {
    expect(resolveTimelineFocusIdentity(elements, "missing")).toBeNull();
    expect(resolveTimelineFocusIdentity(elements, null)).toBeNull();
  });
});
