import { describe, expect, it } from "vitest";
import { timelineTrackOrder, trackDisplayNumber, trackDisplaySuffix } from "./timelineTrackDisplay";

describe("timelineTrackOrder", () => {
  it("is the ascending distinct key order, fractional sub-comp keys included", () => {
    const elements = [{ track: 1 }, { track: 0 }, { track: 1 / 6 }, { track: 1 }];

    expect(timelineTrackOrder(elements)).toEqual([0, 1 / 6, 1]);
  });
});

describe("trackDisplayNumber", () => {
  it("is the key's 1-based row, not the fractional key itself", () => {
    const order = timelineTrackOrder([{ track: 0 }, { track: 1 / 6 }, { track: 1 }]);

    expect(trackDisplayNumber(order, 1 / 6)).toBe(2);
    expect(trackDisplayNumber(order, 1)).toBe(3);
  });

  it("is null for a key with no row rather than a plausible-looking one", () => {
    // The old end-row fallback announced "track 4" for a track the user cannot
    // see at row 4, and nothing upstream could tell that apart from a real row.
    expect(trackDisplayNumber([0, 1, 2], 7)).toBeNull();
  });
});

describe("trackDisplaySuffix", () => {
  it("names the row when there is one", () => {
    expect(`Hide track${trackDisplaySuffix(3)}`).toBe("Hide track 3");
  });

  it("drops the number entirely when there is no row", () => {
    expect(`Hide track${trackDisplaySuffix(null)}`).toBe("Hide track");
  });
});
