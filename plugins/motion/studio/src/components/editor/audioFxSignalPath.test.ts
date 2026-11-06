import { describe, expect, it } from "vitest";
import type { HfAudioGroup } from "@hyperframes/core/audio-groups";
import { audioFxSignalPath } from "./audioFxSignalPath";

const group = (over: Partial<HfAudioGroup> = {}): HfAudioGroup => ({
  id: "voiceover",
  label: "Voiceover",
  memberIds: ["vo-1", "vo-2"],
  volume: 1,
  hidden: false,
  ...over,
});

describe("audioFxSignalPath", () => {
  // The design doc's §5 mockup, both columns.
  // Copy taken from the rendered designs, which are more specific than the
  // ASCII stand-ins in the markdown: "vo-1 and vo-2, together" / "into
  // Voiceover", not "vo-1, vo-2" / "to Voiceover".
  it("names what a group sums, and sends it to the mix", () => {
    expect(audioFxSignalPath("hf-audio-group", "voiceover", [group()])).toEqual({
      inLabel: "vo-1 and vo-2, together",
      outLabel: "to mix",
      subject: "group",
    });
  });

  it("names the group a member feeds, so routing reads from either end", () => {
    expect(audioFxSignalPath("audio", "vo-1", [group()])).toEqual({
      inLabel: "this track",
      outLabel: "into Voiceover",
      subject: "track",
    });
  });

  it("leaves an ungrouped clip on the shipped clip labels", () => {
    expect(audioFxSignalPath("audio", "music-bed", [group()])).toEqual({
      inLabel: "this track",
      outLabel: "to mix",
      subject: "track",
    });
  });

  // The state an author is in the instant after making a group. It must not
  // read as a failure to resolve.
  it("says a memberless group holds nothing yet", () => {
    expect(
      audioFxSignalPath("hf-audio-group", "empty", [group({ id: "empty", memberIds: [] })]),
    ).toMatchObject({ inLabel: "nothing yet", subject: "group" });
  });
});
