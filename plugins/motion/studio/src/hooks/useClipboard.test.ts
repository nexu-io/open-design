// @vitest-environment jsdom
import { ensureHfIds } from "@hyperframes/parsers";
import { describe, expect, it } from "vitest";
import {
  pasteElementHtml,
  pasteTimelineClips,
  resolveFreeTrack,
  type PlacedClip,
} from "./useClipboard";
import { extendRootDurationInSource } from "../utils/rootDuration";
import type { TimelineClipboardClip } from "../utils/clipboardPayload";
import type { TimelineElement } from "../player";

const ROOT =
  '<div id="claude-paper" data-composition-id="claude-paper" data-start="0" data-duration="10"></div>';

const hfIdsIn = (html: string) =>
  Array.from(html.matchAll(/data-hf-id=["']([^"']+)/g), (m) => m[1]);

function clip(id: string, start: number, duration: number, track: number): TimelineClipboardClip {
  return {
    html: `<audio id="${id}" src="typenew.mp3" data-start="${start}" data-duration="${duration}" data-track-index="${track}"></audio>`,
    start,
    duration,
    track,
  };
}

function liveElement(track: number, start: number, duration: number): TimelineElement {
  return { id: `x-${track}`, tag: "audio", start, duration, track, authoredTrack: track };
}

describe("resolveFreeTrack", () => {
  it("keeps the preferred track when nothing occupies it", () => {
    const track = resolveFreeTrack({ track: 5, start: 10, duration: 1 }, []);
    expect(track).toBe(5);
  });

  it("bumps to a new track when the preferred one overlaps in time", () => {
    const taken: PlacedClip[] = [{ track: 5, start: 10.2, duration: 0.5 }];
    const track = resolveFreeTrack({ track: 5, start: 10, duration: 1 }, taken);
    expect(track).toBe(6);
  });

  it("keeps the preferred track when an occupant on it does not overlap in time", () => {
    const taken: PlacedClip[] = [{ track: 5, start: 50, duration: 1 }];
    const track = resolveFreeTrack({ track: 5, start: 10, duration: 1 }, taken);
    expect(track).toBe(5);
  });

  it("picks the next track above the highest taken one, not just +1 from preferred", () => {
    const taken: PlacedClip[] = [
      { track: 5, start: 10, duration: 1 },
      { track: 9, start: 30, duration: 1 },
    ];
    const track = resolveFreeTrack({ track: 5, start: 10.1, duration: 1 }, taken);
    expect(track).toBe(10);
  });
});

describe("pasteTimelineClips", () => {
  it("anchors a single clip's data-start at the anchor time and keeps its track", () => {
    const { content, ids } = pasteTimelineClips(ROOT, [clip("sfx-23", 21.61, 0.57, 132)], 40, []);
    expect(content).toContain('data-start="40"');
    expect(content).toContain('data-track-index="132"');
    expect(ids).toEqual(["sfx-23"]);
  });

  it("preserves each clip's relative offset from the group's earliest clip", () => {
    const clips = [
      clip("sfx-23", 21.61, 0.57, 132),
      clip("sfx-24", 21.73, 0.57, 133),
      clip("sfx-25", 21.84, 0.57, 134),
    ];
    const { content } = pasteTimelineClips(ROOT, clips, 40, []);
    // Offsets from the earliest clip (21.61): 0, 0.12, 0.23 -> 40, 40.12, 40.23
    expect(content).toContain('id="sfx-23" src="typenew.mp3" data-start="40"');
    expect(content).toContain('id="sfx-24" src="typenew.mp3" data-start="40.12"');
    expect(content).toContain('id="sfx-25" src="typenew.mp3" data-start="40.23"');
  });

  it("moves a clip to a new track when its original track is occupied at the target time", () => {
    const live = [liveElement(132, 40, 0.57)];
    const { content } = pasteTimelineClips(ROOT, [clip("sfx-23", 21.61, 0.57, 132)], 40, live);
    expect(content).not.toContain('data-track-index="132"');
    expect(content).toMatch(/data-track-index="133"/);
  });

  it("gives a pasted clip a fresh data-hf-id, never the copied one", () => {
    const clipWithHfId: TimelineClipboardClip = {
      html: '<audio data-hf-id="hf-75o7" id="sfx-type-0" src="typenew.mp3" data-start="7.8" data-duration="0.57" data-track-index="109"></audio>',
      start: 7.8,
      duration: 0.57,
      track: 109,
    };
    const { content } = pasteTimelineClips(ROOT, [clipWithHfId], 40, []);
    expect(content).not.toContain("hf-75o7");
    expect(hfIdsIn(content)).toHaveLength(1);
  });

  it("leaves nothing for the server to stamp, so the file undo recorded is what stays on disk", () => {
    const stamped = ensureHfIds(
      ROOT.replace("</div>", `${clip("sfx-1", 1, 2, 0).html}${clip("sfx-2", 3, 2, 0).html}</div>`),
    );
    const copies = hfIdsIn(stamped).length;
    const original = (id: string) => ({
      ...clip(id, 1, 2, 0),
      html: stamped.match(new RegExp(`<audio[^>]*id="${id}"[^>]*></audio>`))![0],
    });
    const { content } = pasteTimelineClips(stamped, [original("sfx-1"), original("sfx-2")], 11, []);
    const ids = hfIdsIn(content);
    expect(ids).toHaveLength(copies + 2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(hfIdsIn(ensureHfIds(content))).toHaveLength(ids.length);
  });

  it("remints a nested clip's descendants clear of their originals already in the file", () => {
    const nested =
      '<div id="comp-1" data-start="1" data-duration="2" data-track-index="0"><span>a</span><span>b</span></div>';
    const stamped = ensureHfIds(ROOT.replace("</div>", `${nested}</div>`));
    const copied = stamped.match(/<div[^>]*id="comp-1"[^>]*>.*?<\/div>/)![0];
    const { content } = pasteTimelineClips(
      stamped,
      [{ html: copied, start: 1, duration: 2, track: 0 }],
      11,
      [],
    );
    const ids = hfIdsIn(content);
    expect(ids).toHaveLength(hfIdsIn(stamped).length + 3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(hfIdsIn(ensureHfIds(content))).toHaveLength(ids.length);
  });

  it("remints a nested descendant's data-hf-id too, not just the root's", () => {
    // A composition-instance clip's descendants carry their own hf-ids; a
    // clone must remint all of them, not just the root, or the descendants
    // collide with their originals the same way the root would.
    const nested: TimelineClipboardClip = {
      html: '<div data-hf-id="hf-root" id="comp-1" data-start="7.8" data-duration="0.57" data-track-index="109"><span data-hf-id="hf-child"></span></div>',
      start: 7.8,
      duration: 0.57,
      track: 109,
    };
    const { content } = pasteTimelineClips(ROOT, [nested], 40, []);
    expect(content).not.toContain("hf-root");
    expect(content).not.toContain("hf-child");
    expect(hfIdsIn(content)).toHaveLength(2);
  });

  it("does not strip text content that happens to contain the data-hf-id string", () => {
    const withText: TimelineClipboardClip = {
      html: '<div id="cap-1" data-start="7.8" data-duration="0.57" data-track-index="109"><span>talking about data-hf-id="hf-xyz" in my video</span></div>',
      start: 7.8,
      duration: 0.57,
      track: 109,
    };
    const { content } = pasteTimelineClips(ROOT, [withText], 40, []);
    expect(content).toContain('talking about data-hf-id="hf-xyz" in my video');
  });

  it("bumps the second clip in a batch off the first clip's own new track when their offsets collide", () => {
    // Both clips start life a track apart but paste to overlapping times on
    // the SAME track, so the second must dodge the first's placement, not
    // just the live elements it was checked against.
    const clips = [clip("sfx-23", 21.61, 0.57, 132), clip("sfx-24", 21.7, 0.57, 132)];
    const { content } = pasteTimelineClips(ROOT, clips, 40, []);
    expect(content).toContain(
      'id="sfx-23" src="typenew.mp3" data-start="40" data-duration="0.57" data-track-index="132"',
    );
    expect(content).toContain(
      'id="sfx-24" src="typenew.mp3" data-start="40.09" data-duration="0.57" data-track-index="133"',
    );
  });

  it("dedupes an id that already exists in the target file", () => {
    const withExisting = ROOT.replace(
      "</div>",
      '<audio id="sfx-23" data-start="1" data-duration="1" data-track-index="0"></audio></div>',
    );
    const { content, ids } = pasteTimelineClips(
      withExisting,
      [clip("sfx-23", 21.61, 0.57, 132)],
      40,
      [],
    );
    expect(ids[0]).not.toBe("sfx-23");
    expect(ids[0]).toMatch(/^sfx-23-\d+$/);
    expect(content).toContain(`id="${ids[0]}"`);
  });

  it("remints a single-quoted data-hf-id, not just a double-quoted one", () => {
    const singleQuoted: TimelineClipboardClip = {
      html: '<audio data-hf-id=\'hf-75o7\' id="sfx-type-0" src="typenew.mp3" data-start="7.8" data-duration="0.57" data-track-index="109"></audio>',
      start: 7.8,
      duration: 0.57,
      track: 109,
    };
    const { content } = pasteTimelineClips(ROOT, [singleQuoted], 40, []);
    expect(content).not.toContain("hf-75o7");
    expect(hfIdsIn(content)).toHaveLength(1);
  });

  it("remints data-hf-id even when an earlier attribute value contains a literal >", () => {
    // A `>` inside title's value would close a bracket-scoped tag regex
    // early, leaving data-hf-id (which comes after it) outside the matched
    // span and unstripped. A real parser doesn't have this failure mode.
    const gtInAttr: TimelineClipboardClip = {
      html: '<div title="a > b" id="cap-1" data-hf-id="hf-xyz" data-start="7.8" data-duration="0.57" data-track-index="109"></div>',
      start: 7.8,
      duration: 0.57,
      track: 109,
    };
    const { content } = pasteTimelineClips(ROOT, [gtInAttr], 40, []);
    expect(content).not.toContain("hf-xyz");
    expect(hfIdsIn(content)).toHaveLength(1);
  });

  it("still strips data-hf-id from bare text with no element root", () => {
    const noRoot: TimelineClipboardClip = {
      html: 'text mentioning data-hf-id="hf-leak" with no tag at all',
      start: 0,
      duration: 1,
      track: 0,
    };
    const { content } = pasteTimelineClips(ROOT, [noRoot], 0, []);
    expect(content).not.toContain("data-hf-id");
  });

  it("still strips data-hf-id from a tag the HTML parser hoists out of body (e.g. title)", () => {
    // A <title> never reaches DOMParser's body, so remintHfIds's DOM walk sees
    // no root element here -- this exercises the regex fallback, not the walk.
    const hoisted: TimelineClipboardClip = {
      html: '<title data-hf-id="hf-leak">x</title>',
      start: 0,
      duration: 1,
      track: 0,
    };
    const { content } = pasteTimelineClips(ROOT, [hoisted], 0, []);
    expect(content).not.toContain("data-hf-id");
  });

  it("captures the root's own id, not a data-id that happens to precede it", () => {
    const withDataId: TimelineClipboardClip = {
      html: '<audio data-id="not-the-id" id="sfx-23" src="typenew.mp3" data-start="21.61" data-duration="0.57" data-track-index="132"></audio>',
      start: 21.61,
      duration: 0.57,
      track: 132,
    };
    const { ids } = pasteTimelineClips(ROOT, [withDataId], 40, []);
    expect(ids).toEqual(["sfx-23"]);
  });

  it("reports the furthest clip end across the whole batch as requiredEnd, not just the last clip's", () => {
    // The batch is placed in order sfx-23, sfx-24, sfx-25, but sfx-24 ends up
    // the furthest forward once offsets are applied; requiredEnd must track
    // the max across all placed clips, not whichever one the loop saw last.
    const clips = [
      clip("sfx-23", 21.61, 0.57, 132),
      clip("sfx-24", 21.9, 5, 133),
      clip("sfx-25", 21.73, 0.1, 134),
    ];
    const { requiredEnd } = pasteTimelineClips(ROOT, clips, 40, []);
    expect(requiredEnd).toBeCloseTo(40.29 + 5, 2);
  });
});

describe("pasteTimelineClips + extendRootDurationInSource", () => {
  it("grows the root composition's duration when a paste lands past its current end", () => {
    const pasted = pasteTimelineClips(ROOT, [clip("sfx-23", 21.61, 0.57, 132)], 40, []);
    const extended = extendRootDurationInSource(pasted.content, pasted.requiredEnd);
    expect(extended).toContain('data-duration="40.57"');
  });

  it("leaves the root composition's duration unchanged when the paste fits inside it", () => {
    const pasted = pasteTimelineClips(ROOT, [clip("sfx-23", 1, 0.5, 132)], 2, []);
    const extended = extendRootDurationInSource(pasted.content, pasted.requiredEnd);
    expect(extended).toContain('data-duration="10"');
  });
});

describe("pasteElementHtml", () => {
  it("gives a pasted element and its children ids of their own, so an edit to the copy stays on it", () => {
    const stamped = ensureHfIds(
      ROOT.replace("</div>", '<p id="title" class="t">Hello <b>there</b></p></div>'),
    );
    const copied = stamped.match(/<p[^>]*id="title"[^>]*>.*?<\/p>/)![0];
    const content = pasteElementHtml(stamped, { html: copied, originSelector: "#title" });
    const ids = hfIdsIn(content);
    expect(ids).toHaveLength(hfIdsIn(stamped).length + 2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(hfIdsIn(ensureHfIds(content))).toHaveLength(ids.length);
  });
});
