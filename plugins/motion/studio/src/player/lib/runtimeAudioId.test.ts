// @vitest-environment jsdom

/**
 * The studio → runtime boundary, which nothing else crosses.
 *
 * Studio addresses rows by `buildTimelineElementKey`'s composite
 * `<sourceFile>#<domId>`; every audio predicate in `@hyperframes/core` keys off
 * the live document instead. Both halves have their own passing tests — one
 * with composite keys, one with bare ids — and the mismatch between them lived
 * in the gap. These parse a real document, take the ids the way the UI does,
 * and hand them to the real core predicates.
 */

import { describe, expect, it } from "vitest";
import { resolveAudioGroups } from "@hyperframes/core/audio-groups";
import { parseTimelineFromDOM } from "./timelineDOM";
import { runtimeAudioId } from "./timelineElementHelpers";

function docWith(body: string): Document {
  const doc = document.implementation.createHTMLDocument("comp");
  doc.body.innerHTML = body;
  return doc;
}

const COMPOSITION = `
  <div data-composition-id="root" data-duration="30"></div>
  <audio id="voice-1" data-start="0" data-duration="10" data-audio-group="voiceover"></audio>
  <audio id="voice-2" data-start="10" data-duration="10" data-audio-group="voiceover"></audio>
  <audio id="music-bed" data-start="0" data-duration="30"></audio>
  <hf-audio-group id="voiceover"></hf-audio-group>
`;

describe("group membership ids cross into the runtime", () => {
  it("the ids the timeline hands to onGroupClips are the ids resolveAudioGroups reads back", () => {
    const doc = docWith(COMPOSITION);
    const trackElements = parseTimelineFromDOM(doc, 30).filter(
      (el) => el.tag.toLowerCase() === "audio",
    );
    const clipIds = trackElements.map(runtimeAudioId).filter((id): id is string => id !== null);
    expect(clipIds).toEqual(["voice-1", "voice-2", "music-bed"]);

    // Same space membership is read back in — a composite key here produces a
    // group whose members nothing can find.
    const memberIds = resolveAudioGroups(doc).flatMap((g) => g.memberIds);
    expect(memberIds.every((id) => doc.getElementById(id) !== null)).toBe(true);
    for (const id of memberIds) expect(clipIds).toContain(id);
  });

  it("an element with no DOM id is not groupable", () => {
    const doc = docWith(`
      <div data-composition-id="root" data-duration="10"></div>
      <audio data-start="0" data-duration="5"></audio>
    `);
    const [clip] = parseTimelineFromDOM(doc, 10);
    expect(clip).toBeDefined();
    expect(runtimeAudioId(clip)).toBeNull();
  });
});
