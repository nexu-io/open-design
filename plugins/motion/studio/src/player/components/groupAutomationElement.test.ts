import { describe, expect, it } from "vitest";
import { groupAutomationElement } from "./groupAutomationElement";
import { groupAutomationLanes } from "./automationLaneData";

const GROUP = {
  id: "voiceover",
  label: "Voiceover",
  anchorKey: 1.5,
  automation: JSON.stringify({
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 1 },
          { t: 5, v: 0.4 },
        ],
      },
    ],
  }),
};

describe("groupAutomationElement", () => {
  // §1.3: "A group's automation clock is COMPOSITION time — decide it, do not
  // inherit it." A clip-local span would land the group's fade at a different
  // moment in preview than the render bakes it.
  it("spans the whole composition from zero, so lane times are composition time", () => {
    const el = groupAutomationElement(GROUP, 60);
    expect(el.start).toBe(0);
    expect(el.duration).toBe(60);
  });

  // The lane machinery filters with `isAudioTimelineElement`; a group that does
  // not pass it renders nothing at all, silently.
  it("is admitted by the lane machinery and yields the group's own lanes", () => {
    const lanes = groupAutomationLanes([groupAutomationElement(GROUP, 60)]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.name).toBeTruthy();
  });

  // The write has to land on `<hf-audio-group>`, not on a member clip.
  it("carries the group's DOM id, so a lane edit addresses the group element", () => {
    expect(groupAutomationElement(GROUP, 60).domId).toBe("voiceover");
  });

  // A group with no automation draws no lanes — and must not throw doing it.
  it("yields no lanes when the group automates nothing", () => {
    const bare = { id: "sfx", label: "SFX", anchorKey: 2.5 };
    expect(groupAutomationLanes([groupAutomationElement(bare, 60)])).toHaveLength(0);
  });
});
