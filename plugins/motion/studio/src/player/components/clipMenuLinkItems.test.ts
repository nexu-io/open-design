import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { resolveLinkMenuItems } from "./clipMenuLinkItems";

const clip = (id: string, tag: string, extra: Partial<TimelineElement> = {}): TimelineElement => ({
  id,
  tag,
  src: "talk.mp4",
  start: 0,
  duration: 4,
  track: 0,
  ...extra,
});

function labels(element: TimelineElement, elements: TimelineElement[], selected: string[] = []) {
  return resolveLinkMenuItems({
    element,
    elements,
    selectedKeys: new Set(selected),
    onLinkEdit: vi.fn(),
    onDeleteElementOnly: vi.fn(),
  }).map((item) => item.label);
}

describe("resolveLinkMenuItems", () => {
  it("offers Detach audio on a video with sound (frame 4)", () => {
    const talk = clip("talk", "video", { hasAudio: true });
    expect(labels(talk, [talk])).toEqual(["Detach audio"]);
  });

  it("offers Unlink, Merge back and Delete this clip only on a linked pair (frame 6)", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-1" });
    const audio = clip("talk-audio", "audio", { link: "lk-1" });
    expect(labels(audio, [video, audio])).toEqual([
      "Unlink from video",
      "Merge audio back into video",
      "Delete this clip only",
    ]);
  });

  it("offers Link instead of Unlink for a selected unlinked pair", () => {
    const video = clip("talk", "video", { muted: true });
    const audio = clip("talk-audio", "audio");
    expect(labels(video, [video, audio], ["talk", "talk-audio"])).toEqual([
      "Link to audio",
      "Merge audio back into video",
    ]);
    expect(labels(audio, [video, audio], ["talk", "talk-audio"])[0]).toBe("Link to video");
  });

  it("offers Link to the lone same-file partner on another track when one clip is right-clicked", () => {
    const video = clip("talk", "video", { track: 0 });
    const audio = clip("talk-audio", "audio", { track: 1, start: 2 });
    expect(labels(audio, [video, audio], ["talk-audio"])[0]).toBe("Link to video");
    expect(labels(video, [video, audio])[0]).toBe("Link to audio");
  });

  it("dispatches the convenience link with the clip and its partner", () => {
    const onLinkEdit = vi.fn();
    const video = clip("talk", "video", { track: 0 });
    const audio = clip("talk-audio", "audio", { track: 1 });
    const [link] = resolveLinkMenuItems({
      element: audio,
      elements: [video, audio],
      selectedKeys: new Set(["talk-audio"]),
      onLinkEdit,
    });
    link?.run();
    expect(onLinkEdit).toHaveBeenCalledWith({ kind: "link", elements: [audio, video] });
  });

  it("offers no convenience Link when the partner is ambiguous, linked, another file or the same track", () => {
    const audio = clip("talk-audio", "audio", { track: 1 });
    const video = clip("talk", "video", { track: 0 });
    const twin = clip("talk-2", "video", { track: 2 });
    expect(labels(audio, [video, twin, audio], ["talk-audio"])).not.toContain("Link to video");
    const linked = clip("talk", "video", { track: 0, link: "lk-9" });
    expect(labels(audio, [linked, audio], ["talk-audio"])).not.toContain("Link to video");
    const other = clip("other", "video", { track: 0, src: "other.mp4" });
    expect(labels(audio, [other, audio], ["talk-audio"])).not.toContain("Link to video");
    const sameTrack = clip("talk", "video", { track: 1 });
    expect(labels(audio, [sameTrack, audio], ["talk-audio"])).not.toContain("Link to video");
  });

  it("offers no convenience Link while other clips are also selected", () => {
    const audio = clip("talk-audio", "audio", { track: 1 });
    const video = clip("talk", "video", { track: 0 });
    const title = clip("title", "div", { track: 2 });
    expect(
      labels(audio, [video, audio, title], ["talk-audio", "title"]).some((l) =>
        l.startsWith("Link"),
      ),
    ).toBe(false);
  });

  it("names the audio partner when unlinking from the video side", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-1" });
    const audio = clip("talk-audio", "audio", { link: "lk-1" });
    expect(labels(video, [video, audio])[0]).toBe("Unlink from audio");
  });

  it("falls back to plain Unlink for groups of three or same-kind partners", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-1" });
    const audio = clip("talk-audio", "audio", { link: "lk-1" });
    const second = clip("talk-audio2", "audio", { link: "lk-1" });
    expect(labels(video, [video, audio, second])[0]).toBe("Unlink");
    const twin = clip("talk2", "video", { muted: true, link: "lk-2" });
    const twin2 = clip("talk3", "video", { muted: true, link: "lk-2" });
    expect(labels(twin, [twin, twin2])[0]).toBe("Unlink");
  });

  it("offers nothing for a silent video or without a link handler", () => {
    const broll = clip("broll", "video", { muted: true, src: "b.mp4" });
    expect(labels(broll, [broll])).toEqual([]);
    expect(
      resolveLinkMenuItems({
        element: clip("t", "video", { hasAudio: true }),
        elements: [],
        selectedKeys: new Set(),
      }),
    ).toEqual([]);
  });

  it("each item dispatches its link edit", () => {
    const onLinkEdit = vi.fn();
    const talk = clip("talk", "video", { hasAudio: true });
    resolveLinkMenuItems({
      element: talk,
      elements: [talk],
      selectedKeys: new Set(),
      onLinkEdit,
    })[0]?.run();
    expect(onLinkEdit).toHaveBeenCalledWith({ kind: "detach", element: talk });
  });

  it("offers Link for a trimmed audio and its video (timing does not matter)", () => {
    const video = clip("talk", "video", { muted: true });
    const audio = clip("talk-audio", "audio", { start: 1, duration: 2, playbackStart: 1 });
    expect(labels(video, [video, audio], ["talk", "talk-audio"])[0]).toBe("Link to audio");
  });

  it("offers Link for a pair of different files", () => {
    const video = clip("talk", "video", { muted: true });
    const music = clip("bgm", "audio", { src: "bgm.mp3" });
    expect(labels(music, [video, music], ["talk", "bgm"])).toEqual(["Link to video"]);
  });

  it("offers no Link when one selected clip is already linked elsewhere", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-9" });
    const audio = clip("bgm", "audio", { src: "bgm.mp3" });
    const partner = clip("talk-audio", "audio", { link: "lk-9" });
    expect(labels(audio, [video, audio, partner], ["talk", "bgm"])).toEqual([]);
  });

  it("disables Merge back with a tooltip while the pair is out of sync", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-1" });
    const audio = clip("talk-audio", "audio", { link: "lk-1", start: 0.5 });
    const merge = resolveLinkMenuItems({
      element: audio,
      elements: [video, audio],
      selectedKeys: new Set(),
      onLinkEdit: vi.fn(),
    }).find((item) => item.label === "Merge audio back into video");
    expect(merge?.disabledReason).toBe("Move into Sync first");
    const synced = clip("talk-audio", "audio", { link: "lk-1" });
    const enabled = resolveLinkMenuItems({
      element: synced,
      elements: [video, synced],
      selectedKeys: new Set(),
      onLinkEdit: vi.fn(),
    }).find((item) => item.label === "Merge audio back into video");
    expect(enabled?.disabledReason).toBeUndefined();
  });
});
