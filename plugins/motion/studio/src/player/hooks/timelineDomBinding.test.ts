// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { buildTimelineElementsFromClips } from "./timelineSyncHydration";
import { findTimelineDomNodeForClip } from "../lib/timelineElementHelpers";
import { canMoveTimelineElement } from "../components/timelineAuthoredMoveTarget";
import { buildTimelineGroupResizeMembers } from "../components/timelineGroupEditing";
import { getTimelineEditCapabilities } from "../components/timelineEditCapabilities";
import type { ClipManifestClip } from "../lib/playbackTypes";

const clip = (overrides: Partial<ClipManifestClip> = {}): ClipManifestClip => ({
  id: null,
  label: "",
  start: 0,
  duration: 4,
  track: 0,
  kind: "element",
  tagName: "div",
  compositionId: null,
  parentCompositionId: null,
  compositionSrc: null,
  assetUrl: null,
  ...overrides,
});
function documentWith(body: string): Document {
  const window = new Window();
  Object.assign(window, { SyntaxError });
  window.document.body.innerHTML = `<div data-composition-id="main" data-duration="10">${body}</div>`;
  return window.document;
}
describe("live DOM manifest hydration", () => {
  it("carries hfId through authored move and group trim capability callers", () => {
    const elements = ["a", "b"].map((id) => ({
      id,
      key: id,
      tag: "div",
      start: 0,
      duration: 4,
      track: 0,
      hfId: id,
    }));
    expect(canMoveTimelineElement(elements[0])).toBe(true);
    for (const edge of ["start", "end"] as const) {
      expect(
        buildTimelineGroupResizeMembers(elements, new Set(["a", "b"]), "a", edge),
      ).toHaveLength(2);
    }
  });
  it("binds a root clip to its own element when a mounted sub-composition repeats its id", () => {
    // The sub-composition's copy comes first in document order, so a bare id lookup finds it.
    const doc = documentWith(
      '<div id="strip" data-composition-id="strip" data-composition-src="compositions/strip.html" data-start="0" data-duration="4" data-track-index="1">' +
        '<video id="frame-1" data-hf-id="hf-inner" data-start="0"></video></div>' +
        '<video id="frame-1" data-hf-id="hf-root" data-start="6" data-duration="1" data-track-index="7"></video>',
    );
    const [element] = buildTimelineElementsFromClips(
      [
        clip({
          id: "frame-1",
          tagName: "video",
          kind: "video",
          start: 6,
          duration: 1,
          track: 7,
          compositionAncestors: ["main"],
        }),
      ],
      doc,
    );
    expect([element.hfId, element.sourceFile]).toEqual(["hf-root", undefined]);
  });
  it("keeps a unique id bound while its host's composition id is healed after the manifest", () => {
    // The wrapper's data-composition-id arrived after the runtime recorded the clip's chain as ["main"].
    const doc = documentWith(
      '<div id="ho" data-hf-id="ho" data-start="0" data-duration="4"></div>' +
        '<div id="hs-layer" data-composition-id="hs-comp">' +
        '<div id="hs" data-hf-id="hs" data-start="0" data-duration="4"></div></div>',
    );
    const [element] = buildTimelineElementsFromClips(
      [clip({ id: "hs", compositionAncestors: ["main"] })],
      doc,
    );
    expect(element.hfId).toBe("hs");
  });
  it("binds an id-less host by its composition id over a lone id inside that sub-composition", () => {
    const doc = documentWith(
      '<div data-composition-id="card" data-composition-src="compositions/card.html" data-start="0" data-duration="4">' +
        '<div data-hf-inner-root><div id="card" data-start="0" data-duration="4"></div></div></div>',
    );
    const host = doc.querySelector('[data-composition-src="compositions/card.html"]');
    const card = clip({
      id: "card",
      kind: "composition",
      compositionId: "card",
      compositionAncestors: ["main"],
    });
    expect(findTimelineDomNodeForClip(doc, card, 0)).toBe(host);
  });
  it("does not bind a cross-tag direct identity", () => {
    const doc = documentWith('<div id="collision" data-start="0" data-duration="4"></div>');
    expect(
      findTimelineDomNodeForClip(doc, clip({ id: "collision", tagName: "img" }), 0),
    ).toBeNull();
  });
  it("does not let an unmatched image steal the scene's editable identity", () => {
    const doc = documentWith(
      '<div class="clip scene" data-hf-id="scene-hf" data-start="2" data-duration="4"></div>',
    );
    const elements = buildTimelineElementsFromClips(
      [clip({ id: "missing", tagName: "img", kind: "image" }), clip({ start: 2 })],
      doc,
    );
    expect(elements[0].hfId).toBeUndefined();
    expect(elements[1].hfId).toBe("scene-hf");
    expect(getTimelineEditCapabilities(elements[1]).canMove).toBe(true);
  });
  it("allows hfId-only authored clips to move and trim while preserving locks", () => {
    const input = { tag: "div", duration: 4, hfId: "scene-hf" };
    expect(getTimelineEditCapabilities(input)).toEqual({
      canMove: true,
      canTrimStart: true,
      canTrimEnd: true,
    });
    expect(getTimelineEditCapabilities({ ...input, timelineLocked: true }).canMove).toBe(false);
  });
  it("uses at most one fallback candidate snapshot per hydration pass", () => {
    const doc = documentWith(
      Array.from(
        { length: 300 },
        (_, i) => `<div data-hf-id="h${i}" data-start="${i}" data-duration="4"></div>`,
      ).join(""),
    );
    const query = vi.spyOn(doc, "querySelectorAll");
    const clips = Array.from({ length: 300 }, (_, i) => clip({ start: i }));
    expect(new Set(buildTimelineElementsFromClips(clips, doc).map((e) => e.hfId)).size).toBe(300);
    expect(query.mock.calls.filter(([selector]) => selector === "[data-start]")).toHaveLength(1);
  });
  it("avoids candidate scans for hundreds of direct DOM and hf identities", () => {
    const doc = documentWith(
      Array.from(
        { length: 300 },
        (_, i) =>
          `<div ${i % 2 ? "id" : "data-hf-id"}="direct${i}" data-start="${i}" data-duration="4"></div>`,
      ).join(""),
    );
    const query = vi.spyOn(doc, "querySelectorAll");
    const clips = Array.from({ length: 300 }, (_, i) => clip({ id: `direct${i}`, start: i }));
    expect(buildTimelineElementsFromClips(clips, doc)).toHaveLength(300);
    expect(query.mock.calls.filter(([selector]) => selector === "[data-start]")).toHaveLength(0);
  });
  it("resolves hf identities without a fallback scan and refreshes after DOM replacement", () => {
    const doc = documentWith('<div data-hf-id="stable" data-start="2" data-duration="4"></div>');
    const query = vi.spyOn(doc, "querySelectorAll");
    const clips = [clip({ id: "stable", start: 0 })];
    expect(buildTimelineElementsFromClips(clips, doc)[0].hfId).toBe("stable");
    expect(query.mock.calls.filter(([selector]) => selector === "[data-start]")).toHaveLength(0);
    doc.querySelector("[data-composition-id]")!.innerHTML =
      '<div data-hf-id="replacement" data-start="2" data-duration="4"></div>';
    expect(buildTimelineElementsFromClips([clip({ start: 2 })], doc)[0].hfId).toBe("replacement");
  });
  it("preserves DOM-id precedence and same-tag positional recovery after timing drift", () => {
    const doc = documentWith(
      '<div id="stable" data-start="5"></div><div data-hf-id="stable" data-start="0"></div>',
    );
    expect(findTimelineDomNodeForClip(doc, clip({ id: "stable" }), 0)?.id).toBe("stable");
    expect(findTimelineDomNodeForClip(doc, clip({ start: 9 }), 0)?.id).toBe("stable");
  });
});

describe("selector occurrence indexes while hydrating many clips", () => {
  it("queries the document once for a class many clips share, not once per clip", () => {
    const count = 200;
    const spans = Array.from(
      { length: count },
      (_, i) =>
        `<span class="clip w" data-start="${i}" data-duration="1" data-track-index="0"></span>`,
    ).join("");
    const doc = documentWith(spans);
    const query = vi.spyOn(doc, "querySelectorAll");
    const clips = Array.from({ length: count }, (_, i) => clip({ tagName: "span", start: i }));

    const elements = buildTimelineElementsFromClips(clips, doc);

    expect(elements).toHaveLength(count);
    expect(query.mock.calls.filter(([selector]) => selector === ".w").length).toBeLessThanOrEqual(
      1,
    );
  });
});
