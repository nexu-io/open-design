import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../player";
import { holdScenesOf } from "./sceneHold";

const previewWith = (hold?: (names: string[]) => Promise<void>) =>
  ({ contentWindow: { __hfHoldScenes: hold } }) as unknown as HTMLIFrameElement;

describe("holdScenesOf", () => {
  it("has the preview mount the scenes holding the element, and releases them for no element", async () => {
    const hold = vi.fn(async () => {});
    const element = {
      id: "word",
      tag: "span",
      start: 700,
      duration: 1,
      track: 0,
      compositionAncestors: ["main", "s23"],
      parentCompositionId: "s23",
    } as TimelineElement;
    await holdScenesOf(previewWith(hold), element);
    await holdScenesOf(previewWith(hold), null);
    expect(hold.mock.calls).toEqual([[["main", "s23", "s23"]], [[]]]);
  });

  it("gives nothing to wait for in a preview that mounts every scene", () => {
    expect(holdScenesOf(previewWith(), null)).toBeUndefined();
    expect(holdScenesOf(null, null)).toBeUndefined();
  });
});
