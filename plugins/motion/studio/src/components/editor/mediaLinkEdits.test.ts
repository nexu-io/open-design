// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  canDetachAudio,
  canLinkPair,
  detachAudioInSource,
  linkInSource,
  findMergePair,
  mergeAudioInSource,
  pickDetachedAudioTrack,
  removeElementInSource,
  setLinkInSource,
  sharesSourceFile,
} from "./mediaLinkEdits";

const automation = JSON.stringify({
  version: 1,
  lanes: [
    { target: "volume", points: [{ t: 0, v: 1 }] },
    { target: "rate", points: [{ t: 0, v: 2 }] },
  ],
}).replaceAll('"', "&quot;");

const VIDEO_TAG =
  '<video id="talk" class="clip" src="assets/talk.mp4" data-start="2" data-duration="6" data-media-start="1" data-playback-rate="1" data-track-index="0" data-has-audio="true" data-volume="0.5" data-fade-in="0.3" data-fade-out="0.2" data-fx-chain="eq" data-fx-carve="carve" data-audio-group="voiceover" data-automation="' +
  automation +
  '"></video>';

const SOURCE = [
  '<div data-composition-id="main" data-duration="10">',
  `  ${VIDEO_TAG}`,
  '  <audio id="music" class="clip" src="assets/bgm.mp3" data-start="0" data-duration="10" data-track-index="1"></audio>',
  "</div>",
].join("\n");

const video = { id: "talk" };

function attrsOf(source: string, selector: string): Record<string, string> {
  const el = new DOMParser().parseFromString(source, "text/html").querySelector(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return Object.fromEntries(Array.from(el.attributes, (a) => [a.name, a.value]));
}

describe("detachAudioInSource", () => {
  const result = detachAudioInSource(SOURCE, { target: video, videoId: "talk", track: 2 });

  it("inserts a linked audio with the video's file, window and sound", () => {
    expect(result).not.toBeNull();
    const audio = attrsOf(result?.html ?? "", "audio#talk-audio");
    expect(audio).toMatchObject({
      src: "assets/talk.mp4",
      "data-start": "2",
      "data-duration": "6",
      "data-media-start": "1",
      "data-playback-rate": "1",
      "data-track-index": "2",
      "data-link": result?.linkId,
      "data-sync-origin": result?.linkId,
      "data-volume": "0.5",
      "data-fade-in": "0.3",
      "data-fade-out": "0.2",
      "data-fx-chain": "eq",
      "data-fx-carve": "carve",
      "data-audio-group": "voiceover",
    });
    expect(audio["data-automation"]).toContain("volume");
  });

  it("mutes the video, strips its sound attributes and links it", () => {
    const after = attrsOf(result?.html ?? "", "video#talk");
    expect(after).toHaveProperty("muted");
    expect(after["data-link"]).toBe(result?.linkId);
    expect(after["data-sync-origin"]).toBe(result?.linkId);
    for (const gone of [
      "data-has-audio",
      "data-volume",
      "data-fade-in",
      "data-fade-out",
      "data-fx-chain",
      "data-fx-carve",
      "data-audio-group",
    ]) {
      expect(after).not.toHaveProperty(gone);
    }
    expect(after["data-automation"]).toContain("rate");
    expect(after["data-automation"]).not.toContain("volume");
  });

  it("suffixes the audio id when taken", () => {
    const taken = SOURCE.replace('id="music"', 'id="talk-audio"');
    expect(detachAudioInSource(taken, { target: video, videoId: "talk", track: 2 })?.audioId).toBe(
      "talk-audio-2",
    );
  });
});

describe("mergeAudioInSource", () => {
  it("round-trips detach back to the original attributes", () => {
    const detached = detachAudioInSource(SOURCE, { target: video, videoId: "talk", track: 2 });
    const merged = mergeAudioInSource(detached?.html ?? "", {
      videoTarget: video,
      audioTarget: { id: "talk-audio" },
    });
    const original = attrsOf(SOURCE, "video#talk");
    const roundTrip = attrsOf(merged ?? "", "video#talk");
    const lanes = (raw: string | undefined) =>
      JSON.parse(raw ?? "{}").lanes.map((lane: { target: string }) => lane.target);
    expect(lanes(roundTrip["data-automation"]).sort()).toEqual(
      lanes(original["data-automation"]).sort(),
    );
    delete original["data-automation"];
    delete roundTrip["data-automation"];
    expect(roundTrip).toEqual(original);
    expect(merged).not.toContain('<audio id="talk-audio"');
    expect(merged).toContain('id="music"');
  });

  it("converts a legacy a-roll + a-roll-audio pair into one video", () => {
    const legacy = [
      "<div>",
      '  <video id="a-roll" src="a.mp4" muted data-start="0" data-duration="4"></video>',
      '  <audio id="a-roll-audio" src="a.mp4" data-start="0" data-duration="4" data-volume="0.8"></audio>',
      "</div>",
    ].join("\n");
    const merged = mergeAudioInSource(legacy, {
      videoTarget: { id: "a-roll" },
      audioTarget: { id: "a-roll-audio" },
    });
    expect(merged).toBe(
      [
        "<div>",
        '  <video id="a-roll" src="a.mp4" data-start="0" data-duration="4" data-volume="0.8" data-has-audio="true"></video>',
        "</div>",
      ].join("\n"),
    );
  });
});

describe("mergeAudioInSource refusals", () => {
  const pair = (videoAttrs: string, audioAttrs: string) =>
    [
      "<div>",
      `  <video id="v" src="assets/one/talk.mp4" muted data-start="0" data-duration="4"${videoAttrs}></video>`,
      `  <audio id="a" src="assets/one/talk.mp4" data-start="0" data-duration="4"${audioAttrs}></audio>`,
      "</div>",
    ].join("\n");
  const merge = (source: string) =>
    mergeAudioInSource(source, { videoTarget: { id: "v" }, audioTarget: { id: "a" } });

  it("refuses an audio of a different file with the same name", () => {
    expect(
      merge(
        pair("", "").replace('<audio id="a" src="assets/one/', '<audio id="a" src="assets/two/'),
      ),
    ).toBeNull();
  });

  it("refuses when only one member is hidden, which would change what is heard", () => {
    expect(merge(pair("", " data-hidden"))).toBeNull();
    expect(merge(pair(" data-hidden", ""))).toBeNull();
    expect(merge(pair(" data-hidden", " data-hidden"))).not.toBeNull();
  });
});

describe("detachAudioInSource on a hidden video", () => {
  it("keeps the detached sound silent", () => {
    const hidden = SOURCE.replace('<video id="talk"', '<video id="talk" data-hidden');
    const result = detachAudioInSource(hidden, { target: video, videoId: "talk", track: 2 });
    expect(attrsOf(result?.html ?? "", "audio#talk-audio")).toHaveProperty("data-hidden");
    expect(attrsOf(result?.html ?? "", "video#talk")).toHaveProperty("data-hidden");
  });
});

describe("removeElementInSource", () => {
  it("removes the element and its whole line", () => {
    expect(removeElementInSource('<div>\n  <audio id="a"></audio>\n</div>', { id: "a" })).toBe(
      "<div>\n</div>",
    );
  });
});

describe("linkInSource", () => {
  it("mints an id no element or link already uses", () => {
    const src = '<video id="lk-1" data-link="lk-2"></video><audio id="a"></audio>';
    expect(linkInSource(src, [{ id: "a" }])).toContain(
      '<audio id="a" data-link="lk-3" data-sync-origin="lk-3">',
    );
  });

  it("skips ids already used as a sync origin", () => {
    const src = '<video id="v" data-sync-origin="lk-1"></video><audio id="a"></audio>';
    expect(linkInSource(src, [{ id: "a" }])).toContain('data-link="lk-2"');
  });
});

describe("linkInSource without a sync origin", () => {
  it("writes only data-link", () => {
    const src = '<video id="v"></video><audio id="a"></audio>';
    expect(linkInSource(src, [{ id: "v" }, { id: "a" }], { syncOrigin: false })).toBe(
      '<video id="v" data-link="lk-1"></video><audio id="a" data-link="lk-1"></audio>',
    );
  });
});

describe("setLinkInSource", () => {
  it("writes and removes data-link on every target", () => {
    const src = '<video id="v"></video><audio id="a"></audio>';
    const linked = setLinkInSource(src, [{ id: "v" }, { id: "a" }], "lk-1");
    expect(linked).toBe(
      '<video id="v" data-link="lk-1"></video><audio id="a" data-link="lk-1"></audio>',
    );
    expect(setLinkInSource(linked, [{ id: "v" }, { id: "a" }], null)).toBe(src);
  });

  it("keeps the sync origin when unlinking", () => {
    const linked = linkInSource('<video id="v"></video><audio id="a"></audio>', [
      { id: "v" },
      { id: "a" },
    ]);
    const unlinked = setLinkInSource(linked, [{ id: "v" }, { id: "a" }], null);
    expect(unlinked).toBe(
      '<video id="v" data-sync-origin="lk-1"></video><audio id="a" data-sync-origin="lk-1"></audio>',
    );
  });
});

const el = (id: string, tag: string, extra: Record<string, unknown> = {}) => ({
  id,
  tag,
  src: "assets/talk.mp4",
  start: 2,
  duration: 6,
  track: 0,
  ...extra,
});

describe("predicates", () => {
  it("detaches only an unmuted video with declared audio", () => {
    expect(canDetachAudio(el("v", "video", { hasAudio: true }))).toBe(true);
    expect(canDetachAudio(el("v", "video", { hasAudio: true, muted: true }))).toBe(false);
    expect(canDetachAudio(el("v", "video"))).toBe(false);
    expect(canDetachAudio(el("a", "audio", { hasAudio: true }))).toBe(false);
  });

  it("finds the merge pair from either member, linked or identically timed", () => {
    const v = el("v", "video", { muted: true });
    const a = el("a", "audio");
    expect(findMergePair(v, [v, a])).toEqual({ video: v, audio: a });
    expect(findMergePair(a, [v, a])).toEqual({ video: v, audio: a });
    const drifted = el("a", "audio", { start: 3 });
    expect(findMergePair(v, [v, drifted])).toBeNull();
    const linked = [
      el("v", "video", { muted: true, link: "lk-1" }),
      el("a", "audio", { start: 3, link: "lk-1" }),
    ];
    expect(findMergePair(linked[0] ?? v, linked)?.audio.id).toBe("a");
    expect(findMergePair(el("v", "video"), [el("v", "video"), a])).toBeNull();
    expect(findMergePair(v, [v, el("a", "audio", { src: "other.mp4" })])).toBeNull();
  });

  it("links exactly one unlinked video and one audio, whatever their timing or file", () => {
    expect(canLinkPair([el("v", "video"), el("a", "audio")])).toBe(true);
    expect(canLinkPair([el("v", "video"), el("a", "audio", { start: 3, duration: 2 })])).toBe(true);
    expect(canLinkPair([el("v", "video"), el("a", "audio", { src: "other.mp3" })])).toBe(true);
    expect(canLinkPair([el("v", "video", { link: "x" }), el("a", "audio")])).toBe(false);
    expect(canLinkPair([el("v", "video"), el("a", "audio", { link: "y" })])).toBe(false);
    expect(canLinkPair([el("v", "video"), el("w", "video")])).toBe(false);
    expect(canLinkPair([el("v", "video", { link: "x" }), el("a", "audio", { link: "x" })])).toBe(
      false,
    );
  });
});

describe("predicates compare the whole asset path", () => {
  const one = { src: "assets/one/talk.mp4" };
  const two = { src: "assets/two/talk.mp4" };

  it("does not pair same-named files in different folders", () => {
    const v = el("v", "video", { muted: true, ...one });
    const a = el("a", "audio", two);
    expect(findMergePair(v, [v, a])).toBeNull();
    expect(sharesSourceFile([el("v", "video", one), el("a", "audio", two)])).toBe(false);
  });

  it("resolves each src against its own source file, and links only inside one", () => {
    const v = el("v", "video", { src: "../assets/talk.mp4", sourceFile: "scenes/a.html" });
    const a = el("a", "audio", { src: "./assets/talk.mp4", sourceFile: "index.html" });
    expect(canLinkPair([v, a])).toBe(false);
    expect(sharesSourceFile([v, a])).toBe(false);
    const sameFileAudio = { ...a, src: "../assets/./talk.mp4", sourceFile: "scenes/a.html" };
    expect(sharesSourceFile([v, sameFileAudio])).toBe(true);
  });

  it("does not take a same-id link from another source file as the merge partner", () => {
    const v = el("v", "video", { muted: true, link: "lk-1", sourceFile: "index.html" });
    const a = el("a", "audio", { start: 3, link: "lk-1", sourceFile: "child.html" });
    expect(findMergePair(v, [v, a])).toBeNull();
  });

  it("does not link or merge a pair split across inline compositions", () => {
    const v = el("v", "video", { muted: true, compositionScope: "main" });
    const a = el("a", "audio", { compositionScope: "child" });
    expect(canLinkPair([v, a])).toBe(false);
    expect(findMergePair(v, [v, a])).toBeNull();
  });

  it("does not merge a hidden audio back into a visible video", () => {
    const v = el("v", "video", { muted: true });
    expect(findMergePair(v, [v, el("a", "audio", { hidden: true })])).toBeNull();
  });
});

describe("pickDetachedAudioTrack", () => {
  it("uses the first free audio track below the visual tracks", () => {
    const elements = [el("v", "video", { track: 0 }), el("t", "div", { track: 1 })];
    expect(pickDetachedAudioTrack(elements, { start: 2, duration: 6 })).toBe(2);
  });

  it("reuses an audio track that is free in the clip's window", () => {
    const elements = [
      el("v", "video", { track: 0 }),
      el("m", "audio", { track: 1, start: 0, duration: 2 }),
    ];
    expect(pickDetachedAudioTrack(elements, { start: 2, duration: 6 })).toBe(1);
  });

  it("opens a new bottom track when every audio track is busy", () => {
    const elements = [
      el("v", "video", { track: 0 }),
      el("m", "audio", { track: 1, start: 0, duration: 10 }),
    ];
    expect(pickDetachedAudioTrack(elements, { start: 2, duration: 6 })).toBe(2);
  });
});
