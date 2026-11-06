// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  automationLaneLabel,
  automationLaneLabelParts,
  elementAutomation,
  elementAutomationLanes,
  groupAutomationLanes,
  laneGroupKey,
  elementFxChain,
  isCarveLane,
} from "./automationLaneData";
import type { TimelineElement } from "../store/timelineElement";

const el = (over: Partial<TimelineElement> = {}): TimelineElement => ({
  id: "bgm",
  key: "bgm",
  tag: "audio",
  start: 0,
  duration: 10,
  track: 10,
  ...over,
});

/** The chain as the lane code sees it: parsed, not the attribute text. */
const parseChain = (chain: unknown) => elementFxChain(el({ fxChain: JSON.stringify(chain) }))!;

const CHAIN = JSON.stringify({
  version: 1,
  nodes: [{ type: "lowpass", id: "n1", params: { frequency: 400, q: 0.9, poles: "2" } }],
});
const LANE = JSON.stringify({
  version: 1,
  lanes: [{ target: "fx.n1.frequency", points: [{ t: 0, v: 400 }] }],
});

describe("automationLaneData", () => {
  it("returns the same object for the same attributes", () => {
    // The lane compares its drag draft against this identity; a fresh object per
    // playhead tick would drop the drag.
    const a = elementAutomation(el({ automation: LANE, fxChain: CHAIN }));
    const b = elementAutomation(el({ automation: LANE, fxChain: CHAIN }));
    expect(a).toBe(b);
    expect(elementFxChain(el({ fxChain: CHAIN }))).toBe(elementFxChain(el({ fxChain: CHAIN })));
  });

  it("re-parses when the chain changes even though the automation text did not", () => {
    const withChain = elementAutomation(el({ automation: LANE, fxChain: CHAIN }));
    const withoutChain = elementAutomation(el({ automation: LANE }));
    expect(withChain.lanes.map((l) => l.target)).toEqual(["fx.n1.frequency"]);
    // No chain to resolve against, so the fx lane is dropped rather than drawn.
    expect(withoutChain.lanes).toEqual([]);
  });

  it("keeps a hot entry alive when other elements push the cache past its limit", () => {
    // Eviction used to clear the whole map, which changed every lane's identity
    // at once and released any drag in progress.
    const hot = el({ automation: LANE, fxChain: CHAIN });
    const first = elementAutomation(hot);
    for (let i = 0; i < 40; i += 1) {
      elementAutomation(
        el({
          automation: JSON.stringify({
            version: 1,
            lanes: [{ target: "volume", points: [{ t: i, v: 0.5 }] }],
          }),
        }),
      );
      elementAutomation(hot);
    }
    expect(elementAutomation(hot)).toBe(first);
  });

  it("reads an unreadable attribute as nothing rather than throwing", () => {
    expect(elementAutomation(el({ automation: "{nope" })).lanes).toEqual([]);
    expect(elementFxChain(el({ fxChain: "{nope" }))).toBeNull();
  });

  describe("lane order", () => {
    // A stack of EQ bands reads as a spectrum, so it has to be laid out like one:
    // the top of the stack is the top of the audible range. Attribute order is
    // whatever the carve happened to mint, which is the opposite — bands come out
    // ascending.
    const bandChain = JSON.stringify({
      version: 1,
      nodes: [
        { type: "peaking", id: "n1", params: { frequency: 400, gain: -6, q: 1.4 } },
        { type: "peaking", id: "n2", params: { frequency: 1600, gain: -9, q: 1.4 } },
        { type: "peaking", id: "n3", params: { frequency: 1000, gain: -3, q: 1.4 } },
        { type: "gain", id: "n4", params: { gain: -6 } },
      ],
    });
    const bandLanes = JSON.stringify({
      version: 1,
      lanes: [
        { target: "volume", points: [{ t: 0, v: 1 }] },
        { target: "fx.n1.gain", points: [{ t: 0, v: -6 }] },
        { target: "fx.n2.gain", points: [{ t: 0, v: -9 }] },
        { target: "fx.n3.gain", points: [{ t: 0, v: -3 }] },
        { target: "fx.n4.gain", points: [{ t: 0, v: -6 }] },
      ],
    });

    it("puts the highest frequency at the top", () => {
      const lanes = elementAutomation(el({ automation: bandLanes, fxChain: bandChain })).lanes;
      expect(lanes.map((l) => l.target)).toEqual([
        "fx.n2.gain", // 1.6 kHz
        "fx.n3.gain", // 1 kHz
        "fx.n1.gain", // 400 Hz
        // Neither of these is a band, so they sit under the spectrum in the order
        // they were written.
        "volume",
        "fx.n4.gain",
      ]);
    });

    it("keeps the same object identity, so a drag survives the sort", () => {
      const a = elementAutomation(el({ automation: bandLanes, fxChain: bandChain }));
      const b = elementAutomation(el({ automation: bandLanes, fxChain: bandChain }));
      expect(a).toBe(b);
    });
  });

  describe("automationLaneLabel", () => {
    const chain = parseChain({
      version: 1,
      nodes: [
        { type: "peaking", id: "n1", params: { frequency: 1600, gain: -9, q: 1.4 } },
        { type: "peaking", id: "n2", params: { frequency: 400, gain: -6, q: 1.4 } },
        { type: "gain", id: "n3", params: { gain: -6 } },
      ],
    });

    it("names the effect and the band it sits at", () => {
      // Three lanes all reading "Peaking EQ · Gain" say nothing about which band
      // each one is; a bare frequency does not say whether it is a bell or a
      // shelf. Both, then the parameter.
      expect(automationLaneLabel("fx.n1.gain", chain)).toBe("Peaking EQ 1.6 kHz · Gain");
      expect(automationLaneLabel("fx.n2.gain", chain)).toBe("Peaking EQ 400 Hz · Gain");
    });

    it("falls back to the effect's name when it has no frequency", () => {
      expect(automationLaneLabel("fx.n3.gain", chain)).toBe("Gain · Gain");
      expect(automationLaneLabel("volume", chain)).toBe("Volume");
    });

    it("has nothing to say about a target that does not resolve", () => {
      expect(automationLaneLabel("fx.gone.gain", chain)).toBeNull();
      expect(automationLaneLabelParts("fx.gone.gain", chain)).toBeNull();
    });

    it("splits the name from the parameter, which the column stacks", () => {
      expect(automationLaneLabelParts("fx.n1.gain", chain)).toEqual({
        name: "Peaking EQ 1.6 kHz",
        param: "Gain",
      });
      expect(automationLaneLabelParts("fx.n3.gain", chain)).toEqual({
        name: "Gain",
        param: "Gain",
      });
      // Volume is one word with no effect behind it, so there is no second line.
      expect(automationLaneLabelParts("volume", chain)).toEqual({ name: "Volume", param: "" });
    });
  });
});

describe("laneGroupKey", () => {
  // Two clips, each with their OWN chain, both automating a 1 kHz peaking Q. Node
  // ids are minted per chain, so the ids collide across clips while meaning
  // different things — and match across clips while meaning the same thing.
  const clipA = parseChain({
    version: 1,
    nodes: [
      { type: "lowpass", id: "n1", params: { frequency: 8000, q: 0.7, poles: "2" } },
      { type: "peaking", id: "n2", params: { frequency: 1000, gain: -3, q: 1.4 } },
    ],
  });
  const clipB = parseChain({
    version: 1,
    nodes: [{ type: "peaking", id: "n1", params: { frequency: 1000, gain: -6, q: 1.4 } }],
  });

  it("groups the same property of the same effect across clips", () => {
    // The whole point: one row for "Peaking EQ 1 kHz · Q", whichever clip it is on.
    expect(laneGroupKey("fx.n2.q", clipA)).toBe(laneGroupKey("fx.n1.q", clipB));
  });

  it("does not group by lane target, which collides across chains", () => {
    // `fx.n1.q` is a low-pass on one clip and a peaking EQ on the other. Grouping by
    // target would put those two envelopes in one row.
    expect(laneGroupKey("fx.n1.q", clipA)).not.toBe(laneGroupKey("fx.n1.q", clipB));
  });

  it("separates parameters, and the same parameter on different bands", () => {
    expect(laneGroupKey("fx.n2.q", clipA)).not.toBe(laneGroupKey("fx.n2.gain", clipA));
    const twoBands = parseChain({
      version: 1,
      nodes: [
        { type: "peaking", id: "n1", params: { frequency: 400, gain: -6, q: 1.4 } },
        { type: "peaking", id: "n2", params: { frequency: 1600, gain: -6, q: 1.4 } },
      ],
    });
    expect(laneGroupKey("fx.n1.gain", twoBands)).not.toBe(laneGroupKey("fx.n2.gain", twoBands));
  });

  it("groups volume with volume, and nothing with an unresolvable target", () => {
    expect(laneGroupKey("volume", clipA)).toBe(laneGroupKey("volume", clipB));
    expect(laneGroupKey("fx.gone.gain", clipA)).toBeNull();
  });
});

describe("groupAutomationLanes", () => {
  const chainOf = (nodes: unknown[]) => JSON.stringify({ version: 1, nodes });
  const lanesOf = (...targets: string[]) =>
    JSON.stringify({
      version: 1,
      lanes: targets.map((target) => ({ target, points: [{ t: 0, v: 1 }] })),
    });

  // Two narration slices sharing a row. Each mints its own chain, so the node ids
  // collide across them while meaning different things.
  const narration1 = el({
    id: "narration-1",
    key: "narration-1",
    fxChain: chainOf([
      { type: "lowpass", id: "n1", params: { frequency: 8000, q: 0.7, poles: "2" } },
      { type: "peaking", id: "n2", params: { frequency: 1000, gain: -3, q: 1.4 } },
    ]),
    automation: lanesOf("fx.n2.q"),
  });
  const narration2 = el({
    id: "narration-2",
    key: "narration-2",
    fxChain: chainOf([
      { type: "peaking", id: "n1", params: { frequency: 1000, gain: -6, q: 1.4 } },
    ]),
    automation: lanesOf("fx.n1.q", "volume"),
  });

  it("puts the same property of the same effect in one row, one entry per clip", () => {
    const groups = groupAutomationLanes([narration1, narration2]);
    expect(groups.map((g) => g.key)).toEqual(["Peaking EQ 1 kHz · Q", "Volume"]);
    expect(groups[0]?.entries.map((e) => e.element.id)).toEqual(["narration-1", "narration-2"]);
    expect(groups[0]).toMatchObject({ name: "Peaking EQ 1 kHz", param: "Q" });
  });

  it("leaves a clip out of a row it does not automate", () => {
    // The empty stretch is the point: narration-1 has no volume envelope, so it
    // contributes nothing to that row rather than a flat line claiming one exists.
    const groups = groupAutomationLanes([narration1, narration2]);
    expect(groups[1]?.entries.map((e) => e.element.id)).toEqual(["narration-2"]);
  });

  it("does not merge lanes whose targets collide across chains", () => {
    // `fx.n1.*` is a low-pass on one clip and a peaking EQ on the other.
    const lowpass = el({ ...narration1, automation: lanesOf("fx.n1.q") });
    const peaking = el({ ...narration2, automation: lanesOf("fx.n1.q") });
    const groups = groupAutomationLanes([lowpass, peaking]);
    expect(groups.map((g) => g.key)).toEqual(["Low-pass 8 kHz · Q", "Peaking EQ 1 kHz · Q"]);
    expect(groups.map((g) => g.entries.length)).toEqual([1, 1]);
  });

  it("draws lanes for a video element, matching the reserved height", () => {
    // A <video>'s volume can be automated from the property panel same as an
    // audio clip's; gating this on `isAudioTimelineElement` alone hid every
    // keyframe the panel wrote for a video clip.
    const video = el({ id: "titles", key: "titles", tag: "video", automation: lanesOf("volume") });
    expect(groupAutomationLanes([video]).map((g) => g.key)).toEqual(["Volume"]);
  });

  it("ignores a clip that is neither audio nor video, the way the reserved height does", () => {
    const div = el({ id: "titles", key: "titles", tag: "div", automation: lanesOf("volume") });
    expect(groupAutomationLanes([div])).toEqual([]);
  });

  it("skips a target that does not resolve against its clip's chain", () => {
    const stale = el({ ...narration2, automation: lanesOf("fx.gone.q", "volume") });
    expect(groupAutomationLanes([stale]).map((g) => g.key)).toEqual(["Volume"]);
  });
});

// A carve writes its own filter bands AND the lanes that drive them, and
// `withoutCarveLanes` replaces every one of them on each re-run — so a drag on
// one is discarded the next time the carve analyses. The rack also counts the
// carve as ONE module rather than the filters it compiles to, so a lane per
// band reads as "automation on effects I removed", which is exactly how it was
// reported.
describe("carve-generated lanes", () => {
  const carved = (): TimelineElement => ({
    id: "vo",
    tag: "audio",
    start: 0,
    duration: 5,
    track: 0,
    fxChain: JSON.stringify({
      version: 1,
      nodes: [
        {
          type: "peaking",
          id: "n1",
          fromCarve: true,
          params: { frequency: 160, gain: -6, q: 1.4 },
        },
        { type: "peaking", id: "n2", params: { frequency: 900, gain: -3, q: 1 } },
      ],
    }),
    automation: JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "fx.n1.gain",
          points: [
            { t: 0, v: 0 },
            { t: 1, v: -4 },
          ],
        },
        {
          target: "fx.n2.gain",
          points: [
            { t: 0, v: 0 },
            { t: 1, v: -2 },
          ],
        },
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 1, v: 0.5 },
          ],
        },
      ],
    }),
  });

  // These lanes used to be withheld. A bed whose EVERY lane is the carve's —
  // which is what a plain voiceover carve produces — then showed no automation
  // at all and no control to reveal any, so the carve looked like it had done
  // nothing. The ducking curve is what a carve IS; it is shown, and marked
  // read-only because the carve rewrites it on each analysis.
  it("draws the carve's lanes alongside the author's", () => {
    const targets = elementAutomationLanes(carved()).map((lane) => lane.target);
    expect(targets).toContain("fx.n1.gain");
    expect(targets).toContain("fx.n2.gain");
    expect(targets).toContain("volume");
  });

  it("counts a carve band as a timeline row, so the row reserves its height", () => {
    const rows = groupAutomationLanes([carved()]);
    expect(rows).toHaveLength(3);
  });

  it("tells a carve's lane from the author's on the same element", () => {
    const chain = elementFxChain(carved());
    expect(isCarveLane("fx.n1.gain", chain)).toBe(true);
    // n2 is a hand-built peaking band with the same parameter — only the
    // `fromCarve` tag separates them.
    expect(isCarveLane("fx.n2.gain", chain)).toBe(false);
    expect(isCarveLane("volume", chain)).toBe(false);
  });

  it("treats every lane as the author's when nothing is carve-tagged", () => {
    const plain = {
      ...carved(),
      fxChain: JSON.stringify({
        version: 1,
        nodes: [{ type: "peaking", id: "n1", params: { frequency: 160, gain: -6, q: 1.4 } }],
      }),
    };
    expect(elementAutomationLanes(plain).map((l) => l.target)).toContain("fx.n1.gain");
    expect(isCarveLane("fx.n1.gain", elementFxChain(plain))).toBe(false);
  });
});
