// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../player";
import { computeGroupGeometry, resolveGroupChildTracks } from "./useGroupCommits";
import { makeSelection } from "./domSelectionTestHarness";

const timelineElement = (over: Partial<TimelineElement> = {}): TimelineElement => ({
  id: "clip",
  domId: "clip",
  tag: "div",
  start: 0,
  duration: 4,
  track: 0,
  sourceFile: "index.html",
  ...over,
});

describe("computeGroupGeometry — track threading", () => {
  it("carries each member's authored track onto its rebase entry, so the server can pin it through the wrap", () => {
    const elA = document.createElement("div");
    elA.id = "clip-a";
    const elB = document.createElement("div");
    elB.id = "clip-b";
    const members = [makeSelection("A", elA), makeSelection("B", elB)];
    const timelineElements = [
      timelineElement({ id: "clip-a", domId: "clip-a", authoredTrack: 2 }),
      timelineElement({ id: "clip-b", domId: "clip-b" }),
    ];

    const { rebases } = computeGroupGeometry(members, timelineElements);

    expect(rebases[0]?.track).toBe(2);
    expect(rebases[1]?.track).toBe(0);
  });
});

describe("resolveGroupChildTracks", () => {
  it("resolves each child's authored track by DOM id, so ungroup can pin it through the unwrap", () => {
    const group = document.createElement("div");
    group.id = "group-1";
    const childA = document.createElement("div");
    childA.id = "child-a";
    const childB = document.createElement("div");
    childB.id = "child-b";
    group.append(childA, childB);

    const timelineElements = [
      timelineElement({ id: "child-a", domId: "child-a", authoredTrack: 1 }),
      timelineElement({ id: "child-b", domId: "child-b" }),
    ];

    const result = resolveGroupChildTracks(makeSelection("Group 1", group), timelineElements);

    expect(result).toEqual([
      { target: { id: "child-a", hfId: undefined }, track: 1 },
      { target: { id: "child-b", hfId: undefined }, track: 0 },
    ]);
  });

  it("resolves a child's track by hfId when it has no DOM id, so an unauthored ungroup child can't drift to a new row", () => {
    const group = document.createElement("div");
    group.id = "group-1";
    const child = document.createElement("div");
    child.setAttribute("data-hf-id", "hf-child-a");
    group.append(child);

    const timelineElements = [timelineElement({ hfId: "hf-child-a", authoredTrack: 3 })];

    const result = resolveGroupChildTracks(makeSelection("Group 1", group), timelineElements);

    expect(result).toEqual([{ target: { id: undefined, hfId: "hf-child-a" }, track: 3 }]);
  });

  it("skips a child with neither a DOM id nor an hfId", () => {
    const group = document.createElement("div");
    const anonymous = document.createElement("div");
    group.append(anonymous);

    const result = resolveGroupChildTracks(makeSelection("Group 1", group), []);

    expect(result).toEqual([]);
  });

  it("falls back to the runtime's resolved track for an implicit child with no authoredTrack", () => {
    const group = document.createElement("div");
    group.id = "group-1";
    const child = document.createElement("div");
    child.id = "child-a";
    group.append(child);

    const timelineElements = [timelineElement({ id: "child-a", domId: "child-a", track: 3 })];

    const result = resolveGroupChildTracks(makeSelection("Group 1", group), timelineElements);

    expect(result).toEqual([{ target: { id: "child-a", hfId: undefined }, track: 3 }]);
  });
});
