import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  applyTimelineGroupResizePreview,
  buildTimelineGroupResizeMembers,
  resolveTimelineGroupResize,
  resolveTimelineGroupResizeChanges,
} from "./timelineGroupEditing";

function el(id: string, over: Partial<TimelineElement> = {}): TimelineElement {
  // domId gives a patchable target so getTimelineEditCapabilities().canTrim* is true.
  return { id, key: id, tag: "video", start: 0, duration: 2, track: 0, domId: id, ...over };
}

function keys(...ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

describe("buildTimelineGroupResizeMembers (legacy 36413da7f semantics)", () => {
  it("returns null for a single-clip selection (no group forms)", () => {
    const a = el("a");
    expect(buildTimelineGroupResizeMembers([a], keys("a"), "a", "end")).toBeNull();
    expect(buildTimelineGroupResizeMembers([a], new Set(), "a", "end")).toBeNull();
  });

  it("returns null when the grabbed clip is not part of the selection", () => {
    const a = el("a");
    const b = el("b");
    expect(buildTimelineGroupResizeMembers([a, b], keys("a", "b"), "c", "end")).toBeNull();
  });

  it("degrades to single-clip (null) when ANY member is locked — locked clip never patched", () => {
    const a = el("a");
    const locked = el("b", { timelineLocked: true });
    expect(buildTimelineGroupResizeMembers([a, locked], keys("a", "b"), "a", "end")).toBeNull();
  });

  it("degrades when a member has no patch target", () => {
    const a = el("a");
    const noTarget = el("c", { domId: undefined, selector: undefined });
    expect(buildTimelineGroupResizeMembers([a, noTarget], keys("a", "c"), "a", "end")).toBeNull();
  });

  it("snapshots members and seeds start-edge media playbackStart to 0", () => {
    const grabbed = el("a", { start: 2, duration: 2 });
    const audio = el("b", { tag: "audio", start: 5, duration: 3 }); // playbackStart undefined
    const members = buildTimelineGroupResizeMembers([grabbed, audio], keys("a", "b"), "a", "start");
    expect(members).not.toBeNull();
    expect(members!.map((m) => [m.key, m.start, m.duration, m.playbackStart])).toEqual([
      ["a", 2, 2, 0], // start-edge media seeds playbackStart to 0
      ["b", 5, 3, 0],
    ]);
  });

  it("seeds legacy composition offsets and advances them at playback rate", () => {
    const a = el("a", { kind: "composition", tag: "div", start: 2, playbackRate: 2 });
    const b = el("b", { kind: "composition", tag: "div", start: 5, playbackRate: 0.5 });
    const members = buildTimelineGroupResizeMembers([a, b], keys("a", "b"), "a", "start")!;

    expect(members.map((member) => member.playbackStart)).toEqual([0, 0]);
    const changes = resolveTimelineGroupResizeChanges(members, "start", 1);
    expect(changes.map((change) => change.playbackStart)).toEqual([2, 0.5]);
  });

  it("does not seed playbackStart on the END edge", () => {
    const grabbed = el("a", { tag: "audio", start: 0, duration: 2 });
    const b = el("b", { tag: "audio", start: 3, duration: 2 });
    const members = buildTimelineGroupResizeMembers([grabbed, b], keys("a", "b"), "a", "end");
    expect(members!.every((m) => m.playbackStart === undefined)).toBe(true);
  });
});

describe("resolveTimelineGroupResizeChanges (rigid group patch set)", () => {
  it("END edge: extends every member's duration by the shared delta", () => {
    const members = buildTimelineGroupResizeMembers(
      [el("a", { duration: 2 }), el("b", { duration: 3 })],
      keys("a", "b"),
      "a",
      "end",
    )!;
    const changes = resolveTimelineGroupResizeChanges(members, "end", 0.5);
    expect(changes.map((c) => [c.key, c.start, c.duration])).toEqual([
      ["a", 0, 2.5],
      ["b", 0, 3.5],
    ]);
  });

  it("END edge: rigid — the most-constrained member clamps the whole group", () => {
    // b (0.2s) can only shrink 0.1 before hitting min duration, so the group as a
    // whole shrinks 0.1 even though the grabbed clip asked for -0.5.
    const members = buildTimelineGroupResizeMembers(
      [el("a", { duration: 2 }), el("b", { duration: 0.2 })],
      keys("a", "b"),
      "a",
      "end",
    )!;
    const changes = resolveTimelineGroupResizeChanges(members, "end", -0.5);
    expect(changes.map((c) => c.duration)).toEqual([1.9, 0.1]);
  });

  it("START edge: shifts start + duration together across the group", () => {
    const members = buildTimelineGroupResizeMembers(
      [
        el("a", { tag: "text", start: 2, duration: 2 }),
        el("b", { tag: "text", start: 5, duration: 3 }),
      ],
      keys("a", "b"),
      "a",
      "start",
    )!;
    const changes = resolveTimelineGroupResizeChanges(members, "start", -0.5);
    expect(changes.map((c) => [c.key, c.start, c.duration])).toEqual([
      ["a", 1.5, 2.5],
      ["b", 4.5, 3.5],
    ]);
  });

  it("produces exactly the resolveTimelineGroupResize output, keyed per member", () => {
    const members = buildTimelineGroupResizeMembers(
      [el("a", { duration: 2 }), el("b", { duration: 4 })],
      keys("a", "b"),
      "a",
      "end",
    )!;
    const raw = resolveTimelineGroupResize(members, "end", 0.75);
    const changes = resolveTimelineGroupResizeChanges(members, "end", 0.75);
    expect(
      changes.map((c) => ({
        start: c.start,
        duration: c.duration,
        playbackStart: c.playbackStart,
      })),
    ).toEqual(raw.members);
  });
});

describe("applyTimelineGroupResizePreview", () => {
  it("keeps each slowed member's media clock through the group preview", () => {
    const a = el("a", { start: 2, duration: 3, playbackStart: 1, playbackRate: 0.8 });
    const b = el("b", { start: 6, duration: 3, playbackStart: 2, playbackRate: 1.25 });
    const members = buildTimelineGroupResizeMembers([a, b], keys("a", "b"), "a", "start")!;
    const session = {
      grabbedKey: "a",
      edge: "start" as const,
      members,
      changes: [],
      hasChanged: false,
    };

    applyTimelineGroupResizePreview(session, { previewStart: 2.373, previewDuration: 2.627 });

    for (const [i, member] of [a, b].entries()) {
      const change = session.changes[i]!;
      const rate = member.playbackRate!;
      expect(change.start - change.playbackStart! / rate).toBeCloseTo(
        member.start - member.playbackStart! / rate,
        9,
      );
    }
  });
});
