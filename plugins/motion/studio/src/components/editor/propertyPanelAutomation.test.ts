import { describe, expect, it } from "vitest";
import type { HfAutomation } from "@hyperframes/core/audio-automation";
import {
  automationAttrValue,
  withLane,
  withoutLane,
  withPointAt,
} from "./propertyPanelAutomation.js";

const carved = (): HfAutomation => ({
  version: 1,
  lanes: [
    { target: "fx.n1.gain", points: [{ t: 0, v: -6 }] },
    { target: "fx.n2.gain", points: [{ t: 0, v: -9 }] },
    { target: "volume", points: [{ t: 0, v: 0.8 }] },
  ],
});

/**
 * A script hands back a whole `HfAutomation` that describes only its OWN lane.
 * Writing that to the attribute would take everything else with it — the
 * carve's per-band lanes and the track's volume lane — which is silent, total,
 * and only noticed later when the mix has quietly lost its ducking.
 */
describe("withLane", () => {
  it("keeps every lane it was not asked about", () => {
    const next = withLane(carved(), { target: "fx.n9.gain", points: [{ t: 0, v: 3 }] });
    expect(next.lanes.map((l) => l.target).sort()).toEqual([
      "fx.n1.gain",
      "fx.n2.gain",
      "fx.n9.gain",
      "volume",
    ]);
    expect(next.lanes.find((l) => l.target === "volume")?.points).toEqual([{ t: 0, v: 0.8 }]);
  });

  it("replaces a lane rather than adding a second one for the same target", () => {
    // Re-running a script must not leave two lanes fighting over one parameter.
    const once = withLane(carved(), { target: "fx.n9.gain", points: [{ t: 0, v: 3 }] });
    const twice = withLane(once, { target: "fx.n9.gain", points: [{ t: 0, v: 5 }] });
    expect(twice.lanes.filter((l) => l.target === "fx.n9.gain")).toHaveLength(1);
    expect(twice.lanes.find((l) => l.target === "fx.n9.gain")?.points).toEqual([{ t: 0, v: 5 }]);
    expect(twice.lanes).toHaveLength(4);
  });

  it("does not mutate what it was given", () => {
    const before = carved();
    withLane(before, { target: "fx.n9.gain", points: [{ t: 0, v: 3 }] });
    expect(before.lanes).toHaveLength(3);
  });
});

// A panel control has no drag gesture of its own, so a commit has to land on
// the same point the timeline envelope's double-click would have produced.
describe("withPointAt", () => {
  it("adds a point to an existing lane, keeping the others", () => {
    const next = withPointAt(carved(), "volume", 5, 0.3);
    const volume = next.lanes.find((l) => l.target === "volume");
    expect(volume?.points).toEqual([
      { t: 0, v: 0.8 },
      { t: 5, v: 0.3 },
    ]);
  });

  it("replaces the nearby point instead of stacking a second one on top of it", () => {
    const automation: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 0.8 },
            { t: 5, v: 0.3 },
          ],
        },
      ],
    };
    const next = withPointAt(automation, "volume", 5.01, 0.6);
    const volume = next.lanes.find((l) => l.target === "volume");
    expect(volume?.points).toEqual([
      { t: 0, v: 0.8 },
      { t: 5.01, v: 0.6 },
    ]);
  });

  it("keeps points sorted after an insert earlier than the last one", () => {
    const automation: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 0.2 },
            { t: 10, v: 0.9 },
          ],
        },
      ],
    };
    const next = withPointAt(automation, "volume", 4, 0.5);
    expect(next.lanes.find((l) => l.target === "volume")?.points.map((p) => p.t)).toEqual([
      0, 4, 10,
    ]);
  });

  it("seeds the start when writing to an empty lane away from t=0", () => {
    // A single point would be a constant jump the instant playback crosses it,
    // not the envelope a fresh keyframe should produce.
    const automation: HfAutomation = { version: 1, lanes: [{ target: "volume", points: [] }] };
    const next = withPointAt(automation, "volume", 5, 0.3);
    expect(next.lanes.find((l) => l.target === "volume")?.points).toEqual([
      { t: 0, v: 0.3 },
      { t: 5, v: 0.3 },
    ]);
  });

  it("does not seed a second point when writing at the start of an empty lane", () => {
    const automation: HfAutomation = { version: 1, lanes: [{ target: "volume", points: [] }] };
    const next = withPointAt(automation, "volume", 0, 0.4);
    expect(next.lanes.find((l) => l.target === "volume")?.points).toEqual([{ t: 0, v: 0.4 }]);
  });

  it("leaves sibling lanes untouched", () => {
    const next = withPointAt(carved(), "fx.n1.gain", 3, -2);
    expect(next.lanes.find((l) => l.target === "fx.n2.gain")?.points).toEqual([{ t: 0, v: -9 }]);
    expect(next.lanes.find((l) => l.target === "volume")?.points).toEqual([{ t: 0, v: 0.8 }]);
  });
});

describe("withoutLane", () => {
  it("takes one lane and leaves the rest", () => {
    // A node removed without its lane leaves an orphan driving a parameter that
    // is no longer in the graph.
    const next = withoutLane(carved(), "fx.n1.gain");
    expect(next.lanes.map((l) => l.target)).toEqual(["fx.n2.gain", "volume"]);
  });

  it("empties the attribute when the last lane goes", () => {
    const one: HfAutomation = { version: 1, lanes: [{ target: "fx.n1.gain", points: [] }] };
    expect(automationAttrValue(withoutLane(one, "fx.n1.gain"))).toBe("");
  });
});
