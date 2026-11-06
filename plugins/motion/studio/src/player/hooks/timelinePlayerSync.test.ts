import { describe, expect, it } from "vitest";
import { timelineElementsChanged } from "./timelinePlayerSync";

describe("timelineElementsChanged", () => {
  const clip = { id: "v", tag: "video", start: 0, duration: 4, track: 1 };
  it.each([
    ["muted", { muted: true }],
    ["sound", { hasAudio: true }],
    ["volume", { volume: 0 }],
    ["speed", { playbackRate: 2 }],
    ["hidden", { hidden: true }],
    ["audio group volume", { audioGroupVolume: 0 }],
    ["audio group hidden", { audioGroupHidden: true }],
    ["fade in", { fadeIn: 1 }],
    ["fade out", { fadeOut: 1 }],
    ["link", { link: "lk-1" }],
    ["source (re-pointed at its preview copy)", { src: "clip1.mp4?hf-proxy=h264" }],
  ])("sees a clip whose %s changed with no timing change", (_name, change) => {
    expect(timelineElementsChanged([clip], [{ ...clip, ...change }])).toBe(true);
    expect(timelineElementsChanged([{ ...clip, ...change }], [{ ...clip, ...change }])).toBe(false);
  });

  it("sees an unlink: the same clips re-derived without their link", () => {
    const linked = { ...clip, link: "lk-1" };
    expect(timelineElementsChanged([linked], [clip])).toBe(true);
  });

  it("sees restored group membership with identical timing and lane", () => {
    const grouped = { ...clip, audioGroup: "G" };
    expect(timelineElementsChanged([clip], [grouped])).toBe(true);
    expect(timelineElementsChanged([grouped], [clip])).toBe(true);
    expect(timelineElementsChanged([grouped], [{ ...grouped }])).toBe(false);
  });

  it("sees a change to a text row's words, but not an identical re-read", () => {
    const row = { id: "t", tag: "h1", start: 0, duration: 2, track: 0, text: { value: "Old" } };
    expect(timelineElementsChanged([row], [{ ...row, text: { value: "Old" } }])).toBe(false);
    expect(timelineElementsChanged([row], [{ ...row, text: { value: "New" } }])).toBe(true);
  });
});
