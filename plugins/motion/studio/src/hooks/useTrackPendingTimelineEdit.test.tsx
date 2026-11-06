// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { flushStudioPendingEdits } from "../utils/studioPendingEdits";
import { useTrackPendingTimelineEdit } from "./useTrackPendingTimelineEdit";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => act(() => root?.unmount()));

function mount() {
  let track!: ReturnType<typeof useTrackPendingTimelineEdit>;
  function Probe() {
    track = useTrackPendingTimelineEdit();
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root!.render(createElement(Probe)));
  return track;
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("useTrackPendingTimelineEdit", () => {
  it("feeds Studio's shared pending-edit registry, so the app-wide flush waits for it", async () => {
    const track = mount();
    const gate = deferred<void>();
    const order: string[] = [];
    const tracked = track(() => gate.promise.then(() => order.push("edit-settled")));
    const call = tracked();
    const flushPromise = flushStudioPendingEdits().then(() => order.push("flushed"));
    // Give the flush's own microtasks a turn: if tracking did nothing, it
    // would already show "flushed" here, before the edit ever settles.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([]);
    gate.resolve();
    await call;
    await flushPromise;
    expect(order).toEqual(["edit-settled", "flushed"]);
  });

  it("returns the same wrapper for the same handler across calls", () => {
    const track = mount();
    const handler = () => Promise.resolve();
    expect(track(handler)).toBe(track(handler));
  });

  it("returns a different wrapper for a different handler", () => {
    const track = mount();
    const a = () => Promise.resolve();
    const b = () => Promise.resolve();
    expect(track(a)).not.toBe(track(b));
  });
});
