import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/timelineElement";
import { describeClips, formatTimelineBlock } from "./describeClips";

function audio(id: string, start: number, duration: number, extra: Partial<TimelineElement> = {}) {
  return {
    id,
    domId: id,
    tag: "audio",
    kind: "audio",
    start,
    duration,
    track: 0,
    ...extra,
  } satisfies TimelineElement;
}

// Shaped like claude-paper-launch: two voiceovers, clicks, and dozens of keystroke sounds, each on its own track.
function paperLaunchClips(): TimelineElement[] {
  const clips = [
    audio("vo", 29.6, 2.17, { src: "voiceover.mp3", authoredTrack: 8, volume: 0.009772 }),
    audio("sfx-click-0", 1.6, 0.07, { src: "click.mp3", authoredTrack: 100, volume: 0.85 }),
    audio("sfx-type-0", 7.8, 0.57, { src: "typenew.mp3", authoredTrack: 187, volume: 0.2 }),
  ];
  for (let i = 1; i <= 84; i++) {
    clips.push(audio(`sfx-extra-${i}`, 8 + i * 0.1, 0.5, { authoredTrack: 200 + i, volume: 0.2 }));
  }
  return clips;
}

describe("formatTimelineBlock", () => {
  it("lists every audio clip with its start and volume", () => {
    const block = formatTimelineBlock(paperLaunchClips());
    const audioLines = block.split("\n").filter((line) => line.startsWith("- audio "));
    expect(audioLines).toHaveLength(87);
    expect(
      audioLines.every((line) => /start=[\d.]+/.test(line) && /volume=[\d.]+/.test(line)),
    ).toBe(true);
    expect(block).toContain(
      '- audio "sfx-click-0" src=click.mp3 start=1.6 duration=0.07 end=1.67 track=100 volume=0.85',
    );
    expect(block).toContain(
      '- audio "vo" src=voiceover.mp3 start=29.6 duration=2.17 end=31.77 track=8 volume=0.01',
    );
  });

  it("orders clips by start time", () => {
    const lines = formatTimelineBlock(paperLaunchClips()).split("\n");
    expect(lines[1]).toContain('"sfx-click-0"');
  });

  it("prints volume automation points, rate and group", () => {
    const block = formatTimelineBlock([
      audio("bed", 8, 20, {
        automation:
          '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0.1},{"t":10,"v":0.5}]}]}',
        playbackRate: 0.5,
        audioGroup: "music",
        timelineRole: "music",
      }),
    ]);
    expect(block).toContain("rate=0.5 group=music role=music volume-lane=[0:0.1, 10:0.5]");
  });

  it("prints volume 0 and a project-relative src, and omits rate at normal speed", () => {
    const block = formatTimelineBlock([
      audio("mute", 0, 1, {
        src: "http://localhost:5190/api/projects/p1/preview/assets/a.mp3",
        volume: 0,
        playbackRate: 1,
      }),
    ]);
    expect(block).toContain(
      '- audio "mute" src=assets/a.mp3 start=0 duration=1 end=1 track=0 volume=0',
    );
    expect(block).not.toContain("rate=");
  });

  it("is empty for an empty timeline and caps long ones", () => {
    expect(formatTimelineBlock([])).toBe("");
    const many = Array.from({ length: 250 }, (_, i) => audio(`a${i}`, i, 1));
    expect(formatTimelineBlock(many)).toContain("(50 more clips not listed)");
  });
});

describe("describeClips", () => {
  it("keeps 'not authored' distinct from zero for volume and rate", () => {
    const [plain, silent] = describeClips([
      audio("a", 0, 1),
      audio("b", 1, 1, { volume: 0, playbackRate: 0 }),
    ]);
    expect([plain?.volume, plain?.playbackRate]).toEqual([null, null]);
    expect([silent?.volume, silent?.playbackRate]).toEqual([0, 0]);
  });
});
