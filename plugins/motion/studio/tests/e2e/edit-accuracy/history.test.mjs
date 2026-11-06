import { describe, expect, it } from "vitest";
import { historyGroups } from "./sequences.mjs";

const claim = (id, status = 200) => ({ claim: id, status, readable: true });
const undid = (undoes, status = 200) => ({ id: `u-${undoes}`, undoes, status });

describe("historyGroups", () => {
  it("counts a resize's size and position writes as one group", () => {
    expect(historyGroups([claim("g1"), claim("g1"), claim("g2")])).toEqual({
      stack: ["g1", "g2"],
      faults: [],
    });
  });

  it("keeps a resize split across two groups as two, which one gesture cannot owe", () => {
    expect(historyGroups([claim("g1"), claim("g2")]).stack).toEqual(["g1", "g2"]);
  });

  it("pops the newest group on undo, and faults an undo of any other", () => {
    expect(historyGroups([claim("g1"), undid("g1"), claim("g2")])).toEqual({
      stack: ["g2"],
      faults: [],
    });
    expect(historyGroups([claim("g1"), claim("g2"), undid("g1")]).faults).toEqual([
      "undid g1, not the newest group g2",
    ]);
  });

  it("faults two gestures sharing a group, a refused claim, and an unreadable reply", () => {
    expect(historyGroups([claim("g1"), claim("g2"), claim("g1")]).faults).toEqual([
      "two gestures share a group",
    ]);
    expect(historyGroups([claim(null, 409)]).faults).toEqual(["history reply 409"]);
    expect(historyGroups([{ claim: null, status: 200, readable: false }]).faults).toEqual([
      "history reply 200",
    ]);
  });

  it("opens no group for a claim with nothing to keep", () => {
    expect(historyGroups([claim(null)])).toEqual({ stack: [], faults: [] });
  });
});
