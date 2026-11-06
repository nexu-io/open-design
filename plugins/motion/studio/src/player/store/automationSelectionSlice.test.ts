import { describe, expect, it } from "vitest";
import { usePlayerStore } from "./playerStore";

describe("automationSelectionSlice", () => {
  it("stores one ordered selection box and clears it", () => {
    const store = usePlayerStore.getState();
    // Dragged up and to the left: both axes arrive backwards.
    store.setAutomationSelection({
      elementKey: "bgm",
      target: "volume",
      t0: 2,
      t1: 1,
      v0: 0.8,
      v1: 0.3,
    });
    const sel = usePlayerStore.getState().automationSelection;
    // Ordered on write, so every consumer can assume t0 <= t1 and v0 <= v1 —
    // which is what lets a point test be two range checks rather than four.
    expect(sel).toEqual({
      elementKey: "bgm",
      target: "volume",
      t0: 1,
      t1: 2,
      v0: 0.3,
      v1: 0.8,
    });
    usePlayerStore.getState().clearAutomationSelection();
    expect(usePlayerStore.getState().automationSelection).toBeNull();
  });
});
