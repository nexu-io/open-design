import { describe, expect, it } from "vitest";
import { AUDIO_EXT, IMAGE_EXT, isMediaFile, MEDIA_EXT, VIDEO_EXT } from "./mediaTypes";
import { getTimelineAssetKind } from "./timelineAssetDrop";

describe("media types", () => {
  it.each([
    ["clip.m4v", "video"],
    ["assets/Take 2.M4V", "video"],
    ["song.flac", "audio"],
    ["voice.FLAC", "audio"],
    ["clip.mp4", "video"],
    ["music.mp3", "audio"],
    ["still.png", "image"],
  ] as const)("the timeline takes %s as %s", (path, kind) => {
    expect(getTimelineAssetKind(path)).toBe(kind);
    expect(isMediaFile(path)).toBe(true);
  });

  it("still refuses files that are not media", () => {
    for (const path of ["notes.pdf", "font.woff2", "grade.cube", "clip.m4v.txt", "flac"]) {
      expect(getTimelineAssetKind(path)).toBeNull();
      expect(isMediaFile(path)).toBe(false);
    }
  });

  it("counts a file as media exactly when it is an image, video or audio file", () => {
    const paths = ["a.mp4", "a.m4v", "a.flac", "a.png", "a.ico", "a.woff", "a.pdf", "a.cube"];
    for (const path of paths) {
      const kinds = [IMAGE_EXT, VIDEO_EXT, AUDIO_EXT].filter((re) => re.test(path)).length;
      expect(MEDIA_EXT.test(path)).toBe(kinds > 0);
    }
  });
});
