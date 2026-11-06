// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { carveBedRoles, carverAgainst, collectCarveCandidates } from "./useFxCarveGrouping";

function previewDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument("preview");
  doc.body.innerHTML = html;
  return doc;
}

/** What the panel would offer as sources for `bedId`, the way useFxCarve asks. */
function candidatesFor(doc: Document, bedId: string) {
  const others = Array.from(doc.querySelectorAll<HTMLAudioElement>("audio[id]")).filter(
    (a) => a.id !== bedId,
  );
  return collectCarveCandidates(doc, others, () => true, bedId).map((c) => c.id);
}

const GROUPED_VOICES = `
  <hf-audio-group id="voiceover" data-label="Voiceover"></hf-audio-group>
  <audio id="vo-1" data-audio-group="voiceover"></audio>
  <audio id="vo-2" data-audio-group="voiceover"></audio>
  <audio id="music-bed"></audio>
`;

describe("collectCarveCandidates", () => {
  // The observed bug: selecting vo-2 offered "Voiceover (2)" — the group vo-2 is
  // itself a member of. The caller filters out the bed element, but vo-1 survives
  // that filter and rolls up into exactly that group. Being the only candidate, it
  // was then applied without the author asking: a member ducking the bus it feeds.
  it("never offers a member the group it belongs to", () => {
    expect(candidatesFor(previewDoc(GROUPED_VOICES), "vo-2")).toEqual(["music-bed"]);
  });

  // And the mirror: a group bed's own id matches no <audio> id, so nothing
  // excluded it. Its members rolled up and handed the group back to itself.
  it("never offers a group itself", () => {
    const doc = previewDoc(GROUPED_VOICES);
    expect(candidatesFor(doc, "voiceover")).toEqual(["music-bed"]);
  });

  it("still offers a group the bed has nothing to do with", () => {
    const doc = previewDoc(`
      ${GROUPED_VOICES}
      <hf-audio-group id="sfx" data-label="SFX"></hf-audio-group>
      <audio id="sfx-click" data-audio-group="sfx"></audio>
    `);
    expect(candidatesFor(doc, "music-bed")).toEqual(["voiceover", "sfx"]);
  });

  it("leaves an ungrouped bed's candidates alone", () => {
    const doc = previewDoc(`<audio id="music-bed"></audio><audio id="vo-1"></audio>`);
    expect(candidatesFor(doc, "music-bed")).toEqual(["vo-1"]);
  });
});

describe("collectCarveCandidates with video", () => {
  it("offers an ungrouped audible video, not a muted one", () => {
    const doc = previewDoc(`
      <video id="a-roll"></video>
      <video id="b-roll" muted></video>
      <audio id="bed"></audio>
    `);
    const others = Array.from(doc.querySelectorAll("video[id]"));
    const ids = collectCarveCandidates(doc, others, () => true, "bed").map((c) => c.id);
    expect(ids).toEqual(["a-roll"]);
  });
});

describe("carverAgainst", () => {
  // The far-end guard has to see through a GROUP source. A plural carve names a
  // group — that is what the lint rule pushes authors toward — so matching raw
  // ids never found the member, the carve module was offered on a voice already
  // being ducked against, and switching it on wrote a reciprocal carve.
  it("finds the bed carving a voice through its group", () => {
    const doc = previewDoc(`
      ${GROUPED_VOICES}
      <audio id="bed" data-fx-carve='{"enabled":true,"sources":["voiceover"],"strength":0.3}'></audio>
    `);
    expect(carverAgainst(doc, "vo-1")).toBe("bed");
    expect(carverAgainst(doc, "vo-2")).toBe("bed");
  });

  it("still finds a carve that names the clip directly", () => {
    const doc = previewDoc(`
      ${GROUPED_VOICES}
      <audio id="bed" data-fx-carve='{"enabled":true,"sources":["vo-1"],"strength":0.3}'></audio>
    `);
    expect(carverAgainst(doc, "vo-1")).toBe("bed");
    expect(carverAgainst(doc, "vo-2")).toBeNull();
  });

  it("is null for a track nobody carves against", () => {
    const doc = previewDoc(GROUPED_VOICES);
    expect(carverAgainst(doc, "vo-1")).toBeNull();
  });
});

describe("carveBedRoles", () => {
  const roles = (html: string, id: string) => {
    const doc = previewDoc(html);
    return carveBedRoles(id, doc.getElementById(id));
  };

  // The observed bug: the bus labelled "Music bed" classified as music, so it
  // auto-carved against the same voiceover its own member clip had already
  // carved against — the bed ran through both chains. A bus is never a bed, and
  // `autoBed` matters as much as `couldBeBed`: that is the half that wrote one
  // without being asked.
  it("never makes a bus a bed, however it is labelled", () => {
    expect(
      roles(`<hf-audio-group id="music" data-label="Music bed"></hf-audio-group>`, "music"),
    ).toEqual({ couldBeBed: false, autoBed: false });
    expect(
      roles(`<hf-audio-group id="sfx" data-label="Sound FX"></hf-audio-group>`, "sfx"),
    ).toEqual({ couldBeBed: false, autoBed: false });
  });

  it("still reads a clip's label, id and src", () => {
    expect(roles(`<audio id="a1" data-label="Music bed"></audio>`, "a1")).toEqual({
      couldBeBed: true,
      autoBed: true,
    });
    // A name that says nothing may be offered the control but never carves itself.
    expect(roles(`<audio id="a1"></audio>`, "a1")).toEqual({ couldBeBed: true, autoBed: false });
    expect(roles(`<audio id="vo-2"></audio>`, "vo-2")).toEqual({
      couldBeBed: false,
      autoBed: false,
    });
  });
});
