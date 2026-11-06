import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIndexes } from "./timelineElementIndexes";

describe("getTimelineElementIndexes", () => {
  const elements: TimelineElement[] = [
    { id: "hero", tag: "img", src: "hero.png", start: 0, duration: 2, track: 0 },
    {
      id: "bgm",
      tag: "audio",
      src: "music.wav",
      start: 0,
      duration: 10,
      track: 3,
      timelineRole: "music",
    },
  ];

  it("indexes media and music identities", () => {
    const indexes = getTimelineElementIndexes(elements);
    expect(indexes.byKey.get("hero")).toBe(elements[0]);
    expect(indexes.musicElement).toBe(elements[1]);
    expect(indexes.mediaElements).toEqual(elements);
    expect(indexes.audioTracks).toEqual(new Set([3]));
  });

  it("reuses one index for the same immutable array snapshot", () => {
    expect(getTimelineElementIndexes(elements)).toBe(getTimelineElementIndexes(elements));
    expect(getTimelineElementIndexes([...elements])).not.toBe(getTimelineElementIndexes(elements));
  });
});
