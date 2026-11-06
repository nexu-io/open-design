// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyPatchByTarget } from "../../utils/sourcePatcher";
import {
  buildKeepSoundCutoutEdit,
  cutoutOps,
  hasAudioToggleOps,
  mintLinkId,
  mutedToggleOps,
} from "./mediaAudioEdits";

const attr = (property: string, value: string | null) => ({
  type: "attribute" as const,
  property,
  value,
});
const html = (property: string, value: string | null) => ({
  type: "html-attribute" as const,
  property,
  value,
});

describe("mutedToggleOps", () => {
  it("mutes a video and removes has-audio instead of writing an empty marker", () => {
    expect(mutedToggleOps({ isVideo: true, nextMuted: true, probedHasAudio: null })).toEqual([
      html("muted", "true"),
      attr("has-audio", null),
    ]);
  });

  it("unmutes a video the probe hears as audible", () => {
    expect(mutedToggleOps({ isVideo: true, nextMuted: false, probedHasAudio: true })).toEqual([
      html("muted", null),
      attr("has-audio", "true"),
    ]);
  });

  it("unmutes a silent-probe video with an explicit has-audio=false", () => {
    expect(mutedToggleOps({ isVideo: true, nextMuted: false, probedHasAudio: false })).toEqual([
      html("muted", null),
      attr("has-audio", "false"),
    ]);
  });

  it("leaves has-audio absent when the probe fails", () => {
    expect(mutedToggleOps({ isVideo: true, nextMuted: false, probedHasAudio: null })).toEqual([
      html("muted", null),
      attr("has-audio", null),
    ]);
  });

  it("toggles only muted on an audio element", () => {
    expect(mutedToggleOps({ isVideo: false, nextMuted: true, probedHasAudio: null })).toEqual([
      html("muted", "true"),
    ]);
    expect(mutedToggleOps({ isVideo: false, nextMuted: false, probedHasAudio: null })).toEqual([
      html("muted", null),
    ]);
  });
});

describe("hasAudioToggleOps", () => {
  it("turns sound on by stamping has-audio and clearing muted", () => {
    expect(hasAudioToggleOps(true)).toEqual([attr("has-audio", "true"), html("muted", null)]);
  });

  it("turns sound off by removing has-audio rather than writing an empty value", () => {
    expect(hasAudioToggleOps(false)).toEqual([attr("has-audio", null), html("muted", "true")]);
  });
});

describe("cutoutOps", () => {
  it("swaps the src of an image and nothing else", () => {
    expect(cutoutOps({ isVideo: false, cutoutSrc: "assets/cut.png" })).toEqual([
      html("src", "assets/cut.png"),
    ]);
  });

  it("swaps a silent video's src and keeps it muted without a has-audio marker", () => {
    expect(cutoutOps({ isVideo: true, cutoutSrc: "assets/cut.webm" })).toEqual([
      html("src", "assets/cut.webm"),
      html("muted", "true"),
      attr("has-audio", null),
    ]);
  });
});

describe("mintLinkId", () => {
  it("dedupes against element ids and existing links", () => {
    const doc = document.implementation.createHTMLDocument("t");
    expect(mintLinkId(doc)).toBe("lk-1");
    doc.body.innerHTML = '<div id="lk-1"></div><video data-link="lk-2"></video>';
    expect(mintLinkId(doc)).toBe("lk-3");
  });
});

function makeVideo(attrs: Record<string, string>): HTMLVideoElement {
  const doc = document.implementation.createHTMLDocument("t");
  const video = doc.createElement("video");
  for (const [name, value] of Object.entries(attrs)) video.setAttribute(name, value);
  doc.body.append(video);
  return video;
}

function applyEdit(source: string, edit: ReturnType<typeof buildKeepSoundCutoutEdit>): string {
  const target = { id: "clip" };
  const patched = edit.ops.reduce((acc, op) => applyPatchByTarget(acc, target, op), source);
  return edit.prepareContent(patched);
}

function parse(source: string): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

describe("buildKeepSoundCutoutEdit", () => {
  const automation = JSON.stringify({
    version: 1,
    lanes: [
      { target: "volume", points: [{ t: 0, v: 1 }] },
      { target: "rate", points: [{ t: 0, v: 2 }] },
    ],
  });

  const source = [
    '<div data-composition-id="main" data-duration="10">',
    '  <video id="clip" class="clip" src="assets/talk.mp4" data-start="1" data-duration="4" data-media-start="2" data-track-index="0" data-has-audio="true" data-volume="0.5" data-fade-in="0.3" data-audio-group="voiceover"></video>',
    '  <audio id="music" class="clip" src="assets/bgm.mp3" data-start="0" data-duration="10" data-track-index="1"></audio>',
    "</div>",
  ].join("\n");

  const liveVideo = () =>
    makeVideo({
      id: "clip",
      src: "assets/talk.mp4",
      "data-has-audio": "true",
      "data-volume": "0.5",
      "data-fade-in": "0.3",
      "data-audio-group": "voiceover",
      "data-automation": automation,
    });

  it("mutes the video onto the cutout and moves its sound to a linked sibling audio", () => {
    const edit = buildKeepSoundCutoutEdit({
      video: liveVideo(),
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/talk-cutout.webm",
    });
    const doc = parse(applyEdit(source, edit));
    const video = doc.getElementById("clip");
    const audio = doc.getElementById("clip-audio");
    if (!video || !audio) throw new Error("expected both clips");

    expect(video.getAttribute("src")).toBe("assets/talk-cutout.webm");
    expect(video.hasAttribute("muted")).toBe(true);
    expect(video.hasAttribute("data-has-audio")).toBe(false);
    expect(video.hasAttribute("data-volume")).toBe(false);
    expect(video.hasAttribute("data-fade-in")).toBe(false);
    expect(video.hasAttribute("data-audio-group")).toBe(false);
    expect(JSON.parse(video.getAttribute("data-automation") ?? "").lanes).toEqual([
      { target: "rate", points: [{ t: 0, v: 2 }] },
    ]);

    expect(audio.tagName).toBe("AUDIO");
    expect(audio.getAttribute("src")).toBe("assets/talk.mp4");
    expect(audio.getAttribute("data-start")).toBe("1");
    expect(audio.getAttribute("data-duration")).toBe("4");
    expect(audio.getAttribute("data-media-start")).toBe("2");
    expect(audio.hasAttribute("data-playback-rate")).toBe(false);
    expect(audio.getAttribute("data-track-index")).toBe("2");
    expect(audio.getAttribute("data-volume")).toBe("0.5");
    expect(audio.getAttribute("data-fade-in")).toBe("0.3");
    expect(audio.getAttribute("data-audio-group")).toBe("voiceover");
    expect(JSON.parse(audio.getAttribute("data-automation") ?? "").lanes).toEqual([
      { target: "volume", points: [{ t: 0, v: 1 }] },
      { target: "rate", points: [{ t: 0, v: 2 }] },
    ]);
    expect(audio.getAttribute("data-link")).toBe(video.getAttribute("data-link"));
    expect(video.getAttribute("data-link")).toBe("lk-1");
    expect(video.getAttribute("data-sync-origin")).toBe("lk-1");
    expect(audio.getAttribute("data-sync-origin")).toBe("lk-1");
    expect(audio.parentElement).toBe(video.parentElement);
  });

  it("keeps a hidden video's sound silent on the linked audio", () => {
    const video = liveVideo();
    video.setAttribute("data-hidden", "");
    const edit = buildKeepSoundCutoutEdit({
      video,
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/talk-cutout.webm",
    });
    const hidden = source.replace('<video id="clip"', '<video id="clip" data-hidden');
    const doc = parse(applyEdit(hidden, edit));
    expect(doc.getElementById("clip-audio")?.hasAttribute("data-hidden")).toBe(true);
  });

  it("drops the video's automation attribute when it held no rate lane", () => {
    const video = makeVideo({
      id: "clip",
      src: "assets/talk.mp4",
      "data-automation": JSON.stringify({
        version: 1,
        lanes: [{ target: "volume", points: [{ t: 0, v: 1 }] }],
      }),
    });
    const edit = buildKeepSoundCutoutEdit({
      video,
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/cut.webm",
    });
    expect(edit.ops).toContainEqual(attr("automation", null));
  });

  it("suffixes the audio id when <video-id>-audio is taken", () => {
    const edit = buildKeepSoundCutoutEdit({
      video: liveVideo(),
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/cut.webm",
    });
    const taken = source.replace('id="music"', 'id="clip-audio"');
    const doc = parse(applyEdit(taken, edit));
    expect(doc.getElementById("clip-audio-2")?.getAttribute("src")).toBe("assets/talk.mp4");
  });

  it("reads the authored src from the source, not the live element", () => {
    const sub = source.replace('src="assets/talk.mp4"', 'src="../assets/a.mp4"');
    const edit = buildKeepSoundCutoutEdit({
      video: liveVideo(),
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/cut.webm",
    });
    const doc = parse(applyEdit(sub, edit));
    expect(doc.getElementById("clip-audio")?.getAttribute("src")).toBe("../assets/a.mp4");
    expect(doc.getElementById("clip")?.getAttribute("src")).toBe("assets/cut.webm");
  });

  it("preserves an apostrophe in the authored source of the linked audio", () => {
    const authored = source.replace('src="assets/talk.mp4"', `src="assets/it's.mp4"`);
    const edit = buildKeepSoundCutoutEdit({
      video: liveVideo(),
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/cut.webm",
    });
    const doc = parse(applyEdit(authored, edit));
    expect(doc.getElementById("clip-audio")?.getAttribute("src")).toBe("assets/it's.mp4");
  });

  it("takes the first <source> child when the video has no src attribute", () => {
    const withSource = source.replace(
      /<video id="clip"([^>]*?) src="assets\/talk.mp4"([^>]*)><\/video>/,
      '<video id="clip"$1$2><source src="assets/s.mp4" type="video/mp4"></video>',
    );
    const edit = buildKeepSoundCutoutEdit({
      video: liveVideo(),
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/cut.webm",
    });
    const doc = parse(applyEdit(withSource, edit));
    expect(doc.getElementById("clip-audio")?.getAttribute("src")).toBe("assets/s.mp4");
  });

  it("reports when the audio insert did not land", () => {
    const edit = buildKeepSoundCutoutEdit({
      video: liveVideo(),
      videoId: "clip",
      target: { id: "missing" },
      cutoutSrc: "assets/cut.webm",
    });
    edit.prepareContent(source);
    expect(edit.audioInserted()).toBe(false);
    const ok = buildKeepSoundCutoutEdit({
      video: liveVideo(),
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/cut.webm",
    });
    ok.prepareContent(source);
    expect(ok.audioInserted()).toBe(true);
  });

  it("copies loop onto the linked audio", () => {
    const video = makeVideo({ id: "clip", src: "assets/talk.mp4", loop: "" });
    const edit = buildKeepSoundCutoutEdit({
      video,
      videoId: "clip",
      target: { id: "clip" },
      cutoutSrc: "assets/cut.webm",
    });
    const doc = parse(applyEdit(source, edit));
    expect(doc.getElementById("clip-audio")?.hasAttribute("loop")).toBe(true);
  });
});
