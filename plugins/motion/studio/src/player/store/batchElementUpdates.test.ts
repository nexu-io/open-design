// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { batchElementUpdates } from "./batchElementUpdates";
import { usePlayerStore, type TimelineElement } from "./playerStore";

const clips = (n: number): TimelineElement[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    tag: "div",
    start: i,
    duration: 1,
    track: 0,
  }));

describe("batchElementUpdates", () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
    usePlayerStore.getState().setElements(clips(4));
  });

  it("lands every update of a batch as one store change, as the same calls one by one would", () => {
    const { updateElement } = usePlayerStore.getState();
    let notified = 0;
    const stop = usePlayerStore.subscribe(() => notified++);
    batchElementUpdates(() => {
      updateElement("c0", { start: 10 });
      batchElementUpdates(() => updateElement("c2", { start: 12 }));
      updateElement("c0", { track: 3 });
    });
    stop();

    expect(notified).toBe(1);
    const byId = new Map(usePlayerStore.getState().elements.map((el) => [el.id, el]));
    expect(byId.get("c0")).toMatchObject({ start: 10, track: 3 });
    expect(byId.get("c1")?.start).toBe(1);
    expect(byId.get("c2")?.start).toBe(12);
  });

  it("applies updates outside a batch at once", () => {
    usePlayerStore.getState().updateElement("c1", { start: 7 });
    expect(usePlayerStore.getState().elements[1]?.start).toBe(7);
  });
});
