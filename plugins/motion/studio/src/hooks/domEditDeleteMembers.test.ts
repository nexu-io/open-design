import { describe, expect, it } from "vitest";
import { timelineElementsForDelete } from "./domEditDeleteMembers";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { TimelineElement } from "../player";

const sel = (id: string, sourceFile = "index.html") => ({ id, sourceFile }) as DomEditSelection;

const clip = (id: string, domId: string, sourceFile = "index.html"): TimelineElement =>
  ({ id, domId, sourceFile, tag: "video", start: 0, duration: 1, track: 0 }) as TimelineElement;

describe("timelineElementsForDelete", () => {
  it("resolves every member to its exact timeline row", () => {
    const elements = [clip("a", "clip-a"), clip("b", "clip-b")];
    const result = timelineElementsForDelete([sel("clip-a"), sel("clip-b")], elements);
    expect(result).toEqual([elements[0], elements[1]]);
  });

  it("returns null when any member has no timeline row of its own", () => {
    const elements = [clip("a", "clip-a")];
    // "plain-child" is not a timeline element — a nested DOM node inside a clip.
    const result = timelineElementsForDelete([sel("clip-a"), sel("plain-child")], elements);
    expect(result).toBeNull();
  });

  it("does not fall back to the ancestor clip for a nested child", () => {
    // A click inside a clip must not resolve to (and so delete) the whole clip.
    const elements = [clip("a", "clip-a")];
    expect(timelineElementsForDelete([sel("nested-text")], elements)).toBeNull();
  });
});
