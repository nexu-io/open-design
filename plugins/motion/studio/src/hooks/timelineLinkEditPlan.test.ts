// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../player";
import { clipSyncState } from "../player/components/clipSync";
import { clipsToUnlink, planLinkEdit } from "./timelineLinkEditPlan";

const clip = (id: string, tag: string, extra: Partial<TimelineElement> = {}): TimelineElement => ({
  id,
  domId: id,
  tag,
  src: "talk.mp4",
  start: 2,
  duration: 6,
  track: tag === "audio" ? 1 : 0,
  ...extra,
});

const video = clip("talk", "video", { link: "lk-1", muted: true });
const audio = clip("talk-audio", "audio", { link: "lk-1" });
const title = clip("title", "div");

const SOURCE =
  '<div><video id="talk" src="talk.mp4" muted data-link="lk-1" data-start="2" data-duration="6"></video><audio id="talk-audio" src="talk.mp4" data-link="lk-1" data-start="2" data-duration="6" data-volume="0.5"></audio></div>';

describe("clipsToUnlink", () => {
  it("unlinks a lone removed member and its orphaned partner", () => {
    expect(clipsToUnlink([video], [video, audio, title]).map((el) => el.id)).toEqual([
      "talk",
      "talk-audio",
    ]);
  });

  it("keeps a three-member group linked when one leaves", () => {
    const third = clip("talk-2", "audio", { link: "lk-1" });
    expect(clipsToUnlink([video], [video, audio, third]).map((el) => el.id)).toEqual(["talk"]);
  });

  it("ignores unlinked clips", () => {
    expect(clipsToUnlink([title], [video, audio, title])).toEqual([]);
  });

  it("never reaches a same-id link in another source file", () => {
    const childVideo = clip("c", "video", { link: "lk-1", sourceFile: "child.html" });
    const removed = clipsToUnlink([video], [video, audio, childVideo]).map((el) => el.id);
    expect(removed).toEqual(["talk", "talk-audio"]);
  });
});

describe("planLinkEdit", () => {
  const elements = [video, audio, title];

  it("unlink strips data-link from both members", () => {
    const plan = planLinkEdit({ kind: "unlink", elements: [video, audio] }, elements);
    expect(plan?.label).toBe("Unlink clips");
    expect(plan?.transform(SOURCE)).not.toContain("data-link");
  });

  it("link writes one fresh id on both", () => {
    const unlinked = SOURCE.replaceAll(' data-link="lk-1"', "");
    const plan = planLinkEdit({ kind: "link", elements: [video, audio] }, elements);
    expect(plan?.transform(unlinked)?.match(/data-link="lk-1"/g)).toHaveLength(2);
  });

  it("merge folds the audio into the video", () => {
    const plan = planLinkEdit({ kind: "merge", video, audio }, elements);
    const merged = plan?.transform(SOURCE) ?? "";
    expect(merged).not.toContain("<audio");
    expect(merged).toContain('data-volume="0.5"');
    expect(merged).toContain('data-has-audio="true"');
  });

  it("detach puts the audio on the first free audio track", () => {
    const talk = clip("talk", "video", { hasAudio: true });
    const src =
      '<div><video id="talk" src="talk.mp4" data-has-audio="true" data-start="2" data-duration="6"></video></div>';
    const plan = planLinkEdit({ kind: "detach", element: talk }, [talk, title]);
    const out = plan?.transform(src) ?? "";
    expect(out).toContain('id="talk-audio"');
    expect(out).toContain('data-track-index="1"');
  });
});

describe("planLinkEdit into sync", () => {
  const drifted =
    '<div data-composition-id="main" data-duration="10"><video id="talk" src="talk.mp4" muted data-sync-origin="lk-1" data-start="2" data-duration="6"></video><audio id="talk-audio" src="talk.mp4" data-sync-origin="lk-1" data-start="2.5" data-duration="6" data-media-start="0"></audio></div>';
  const late = clip("talk-audio", "audio", { start: 2.5, playbackStart: 0 });

  it("moves one clip's start, leaving its partner and link alone", () => {
    const plan = planLinkEdit({ kind: "move-into-sync", element: late, start: 2 }, [video, late]);
    expect(plan?.label).toBe("Move into Sync");
    const html = plan?.transform(drifted) ?? "";
    expect(html).toContain('id="talk-audio" src="talk.mp4" data-sync-origin="lk-1" data-start="2"');
    expect(html).toContain('id="talk" src="talk.mp4" muted data-sync-origin="lk-1" data-start="2"');
  });

  it("slips one clip's media start in place", () => {
    const plan = planLinkEdit({ kind: "slip-into-sync", element: late, mediaStart: 0.5 }, [
      video,
      late,
    ]);
    expect(plan?.label).toBe("Slip into Sync");
    const html = plan?.transform(drifted) ?? "";
    expect(html).toContain('data-start="2.5" data-duration="6" data-media-start="0.5"');
  });

  it("slips the legacy playback-start attribute when that is what the clip uses", () => {
    const legacy = { ...late, playbackStartAttr: "playback-start" as const };
    const html =
      planLinkEdit({ kind: "slip-into-sync", element: legacy, mediaStart: 0.5 }, [])?.transform(
        '<audio id="talk-audio" data-playback-start="0"></audio>',
      ) ?? "";
    expect(html).toBe('<audio id="talk-audio" data-playback-start="0.5"></audio>');
  });
});

describe("link edit plan", () => {
  const PAIR =
    '<div><video id="talk" src="talk.mp4" muted data-start="2" data-duration="6"></video><audio id="a" src="%SRC%" data-start="3" data-duration="3" data-media-start="1"></audio></div>';
  const linkPlan = (src: string, audioEl: TimelineElement) => {
    const v = clip("talk", "video", { muted: true });
    const plan = planLinkEdit({ kind: "link", elements: [v, audioEl] }, [v, audioEl]);
    return plan?.transform(PAIR.replace("%SRC%", src)) ?? "";
  };

  it("links a trimmed same-file audio with a sync origin that shows a nonzero offset", () => {
    const trimmed = clip("a", "audio", { start: 3, duration: 3, playbackStart: 0 });
    const out = linkPlan("talk.mp4", trimmed);
    expect(out).toMatch(/<video[^>]*data-link="lk-1"[^>]*data-sync-origin="lk-1"/);
    expect(out).toMatch(/<audio[^>]*data-link="lk-1"[^>]*data-sync-origin="lk-1"/);
    const v = clip("talk", "video", { muted: true, syncOrigin: "lk-1" });
    const a = { ...trimmed, syncOrigin: "lk-1" };
    expect(clipSyncState(a, [v, a], 30)?.frames).toBe(30);
  });

  it("links different files without a sync origin", () => {
    const music = clip("a", "audio", { src: "bgm.mp3" });
    const out = linkPlan("bgm.mp3", music);
    expect(out).toContain('data-link="lk-1"');
    expect(out).not.toContain("data-sync-origin");
  });
});
