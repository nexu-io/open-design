import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  resolveRepositionLaneMove,
  resolveZMirrorLaneMove,
  type ZMirrorInput,
} from "./timelineZMirror";

function el(
  id: string,
  track: number,
  start: number,
  duration: number,
  extra: Partial<TimelineElement> = {},
): TimelineElement {
  return { id, key: id, tag: "video", start, duration, track, domId: id, ...extra };
}

function audio(id: string, track: number, start: number, duration: number): TimelineElement {
  return el(id, track, start, duration, { tag: "audio" });
}

function resolve(
  action: ZMirrorInput["action"],
  element: TimelineElement,
  elements: TimelineElement[],
  crossedKey?: string | null,
) {
  return resolveZMirrorLaneMove({ action, element, elements, crossedKey });
}

// Target on TOP lane 0; b/c fully occupy the two lanes below over t's span.
const stackBelow = () => {
  const t = el("t", 0, 0, 10);
  const b = el("b", 1, 0, 10);
  const c = el("c", 2, 0, 10);
  return { t, elements: [t, b, c] };
};

// Sparse file: authored tracks 3/5/7 displayed as lanes 0/1/2 (a free over t's span).
const sparseAuthored = () => {
  const a = el("a", 0, 20, 5, { authoredTrack: 3 });
  const b = el("b", 1, 0, 10, { authoredTrack: 5 });
  const t = el("t", 2, 0, 10, { authoredTrack: 7 });
  return { t, elements: [a, b, t] };
};

describe("resolveZMirrorLaneMove — bring-forward / send-backward", () => {
  // Stack: a on lane 0, b on lane 1, target on lane 2 — all overlapping in time.
  const stack = () => {
    const a = el("a", 0, 0, 10);
    const b = el("b", 1, 0, 10);
    const t = el("t", 2, 0, 10);
    return { a, b, t, elements: [a, b, t] };
  };

  it("bring-forward with crossedKey lands on the closest free lane above the neighbor", () => {
    // Free lane 0 exists above the crossed neighbor's lane... make lane 0 free by
    // shifting a out of the span.
    const a = el("a", 0, 20, 5); // lane 0 free over t's span
    const b = el("b", 1, 0, 10);
    const t = el("t", 2, 0, 10);
    expect(resolve("bring-forward", t, [a, b, t], "b")).toEqual({
      kind: "move",
      displayTrack: 0,
      persistTrack: 0,
    });
  });

  it("bring-forward with crossedKey inserts above the neighbor when no lane is free", () => {
    const { t, elements } = stack();
    // Lanes 0 and 1 both occupied over t's span → new lane at the boundary
    // ABOVE the crossed neighbor (row of lane 1 in the ascending order).
    expect(resolve("bring-forward", t, elements, "b")).toEqual({ kind: "insert", insertRow: 1 });
  });

  it("bring-forward without crossedKey uses the closest overlapping neighbor above", () => {
    const { t, elements } = stack();
    // Closest overlapping neighbor above lane 2 is b (lane 1); lanes 0/1 are
    // occupied → insert above b, same as the crossedKey case.
    expect(resolve("bring-forward", t, elements)).toEqual({ kind: "insert", insertRow: 1 });
  });

  it("bring-forward with an unknown crossedKey falls back to the temporal neighbor", () => {
    const { t, elements } = stack();
    expect(resolve("bring-forward", t, elements, "nope")).toEqual({
      kind: "insert",
      insertRow: 1,
    });
  });

  it("bring-forward returns null when nothing overlaps above and no crossedKey", () => {
    const a = el("a", 0, 20, 5); // above but NOT overlapping in time
    const t = el("t", 1, 0, 10);
    expect(resolve("bring-forward", t, [a, t])).toBeNull();
  });

  it("send-backward lands on the closest free lane below the neighbor", () => {
    const t = el("t", 0, 0, 10);
    const b = el("b", 1, 0, 10);
    const c = el("c", 2, 20, 5); // lane 2 free over t's span
    expect(resolve("send-backward", t, [t, b, c], "b")).toEqual({
      kind: "move",
      displayTrack: 2,
      persistTrack: 2,
    });
  });

  it("send-backward inserts below the neighbor when no lane below is free", () => {
    const { t, elements } = stackBelow();
    // Boundary below b's lane (row 1 + 1 = 2).
    expect(resolve("send-backward", t, elements, "b")).toEqual({ kind: "insert", insertRow: 2 });
  });

  it("send-backward returns null when nothing overlaps below and no crossedKey", () => {
    const t = el("t", 0, 0, 10);
    const b = el("b", 1, 20, 5);
    expect(resolve("send-backward", t, [t, b])).toBeNull();
  });

  it("BOUNDED: never steps past the next overlapping element to a farther free lane", () => {
    // Above neighbor b (lane 2): lane 1 holds x — the NEXT temporally-overlapping
    // same-file element in the direction — and lane 0 is free. A single forward
    // step crosses ONE element, so the free lane 0 beyond x is out of reach:
    // insert immediately above b instead (row of lane 2 in the ascending order).
    const a = el("a", 0, 30, 5); // lane 0 free over t's span — but beyond the bound
    const x = el("x", 1, 5, 10); // overlaps t → the exclusive bound
    const b = el("b", 2, 0, 10);
    const t = el("t", 3, 0, 10);
    expect(resolve("bring-forward", t, [a, x, b, t], "b")).toEqual({
      kind: "insert",
      insertRow: 2,
    });
  });

  it("OPEN SPACE: with no second overlapping element, skips an occupied lane to the next free one", () => {
    // Lane 1's occupant is a FOREIGN-file clip: it occupies the lane (freeness is
    // file-agnostic) but is not in the same stacking context, so it does not
    // bound the step — the search continues to free lane 0, as before.
    const a = el("a", 0, 30, 5); // lane 0 free over t's span
    const x = el("x", 1, 5, 10, { sourceFile: "sub.html" });
    const b = el("b", 2, 0, 10);
    const t = el("t", 3, 0, 10);
    expect(resolve("bring-forward", t, [a, x, b, t], "b")).toEqual({
      kind: "move",
      displayTrack: 0,
      persistTrack: 0,
    });
  });

  it("returns null when the closest free lane is the clip's own lane (z/track divergence)", () => {
    // Crossed neighbor sits BELOW the clip in lane space (diverged z): searching
    // up from lane 2 finds lane 1 free — the clip's own lane → already in place.
    const t = el("t", 1, 0, 10);
    const b = el("b", 2, 0, 10);
    expect(resolve("bring-forward", t, [t, b], "b")).toBeNull();
  });
});

describe("resolveZMirrorLaneMove — one-element step bound (forward/backward)", () => {
  // Three stacked back-to-back clips (lanes 0/1/2, all overlapping) plus a free
  // lane BEYOND the far element — the lane the old resolver would overshoot to.
  const threeStackedWithFarFree = () => {
    const a = el("a", 0, 0, 10);
    const b = el("b", 1, 0, 10);
    const c = el("c", 2, 0, 10);
    const d = el("d", 3, 20, 5); // lane 3 free over the span — beyond c
    return { a, b, c, d, elements: [a, b, c, d] };
  };

  it("send-backward from the top inserts between elements 1 and 2 — not past element 2", () => {
    const { a, elements } = threeStackedWithFarFree();
    // Reference = b (lane 1); next overlap below = c (lane 2) bounds the search;
    // no free lane strictly between → insert at the b/c boundary (row 2), NOT
    // the farther free lane 3.
    expect(resolve("send-backward", a, elements, "b")).toEqual({ kind: "insert", insertRow: 2 });
  });

  it("bring-forward from the bottom inserts between elements 1 and 2 (symmetric)", () => {
    const d = el("d", 0, 20, 5); // lane 0 free over the span — beyond a
    const a = el("a", 1, 0, 10);
    const b = el("b", 2, 0, 10);
    const t = el("t", 3, 0, 10);
    // Reference = b (lane 2); next overlap above = a (lane 1) bounds the search;
    // no free lane strictly between → insert at the a/b boundary (row 2), NOT
    // the farther free lane 0.
    expect(resolve("bring-forward", t, [d, a, b, t], "b")).toEqual({
      kind: "insert",
      insertRow: 2,
    });
  });

  it("takes a free lane strictly between the reference and the next overlap", () => {
    const a = el("a", 0, 0, 10); // second element — the exclusive bound
    const gap = el("gap", 1, 20, 5); // lane 1 free over the span, inside the interval
    const b = el("b", 2, 0, 10); // crossed reference
    const t = el("t", 3, 0, 10);
    expect(resolve("bring-forward", t, [a, gap, b, t], "b")).toEqual({
      kind: "move",
      displayTrack: 1,
      persistTrack: 1,
    });
  });

  it("of several free lanes in the interval, takes the one closest to the reference", () => {
    const a = el("a", 0, 0, 10); // bound
    const g1 = el("g1", 1, 20, 5); // free, farther from reference
    const g2 = el("g2", 2, 20, 5); // free, closest to reference
    const b = el("b", 3, 0, 10); // crossed reference
    const t = el("t", 4, 0, 10);
    expect(resolve("bring-forward", t, [a, g1, g2, b, t], "b")).toEqual({
      kind: "move",
      displayTrack: 2,
      persistTrack: 2,
    });
  });

  it("no second overlapping element beyond the reference → the zone edge bounds (as today)", () => {
    const { t, elements } = stackBelow();
    // Only c overlaps below the reference b... remove c's overlap: reference is
    // then the ONLY overlap below; the search runs to the zone edge and takes
    // the free lane beyond the neighbor.
    const spread = elements.map((e) => (e.id === "c" ? { ...e, start: 20 } : e));
    expect(resolve("send-backward", t, spread, "b")).toEqual({
      kind: "move",
      displayTrack: 2,
      persistTrack: 2,
    });
  });

  it("bring-to-front is NOT bounded: still moves past the whole overlap set", () => {
    const { t, elements } = (() => {
      const free = el("free", 0, 20, 5); // free lane beyond the topmost overlap
      const a = el("a", 1, 0, 10);
      const b = el("b", 2, 0, 10);
      const t = el("t", 3, 0, 10);
      return { t, elements: [free, a, b, t] };
    })();
    expect(resolve("bring-to-front", t, elements)).toEqual({
      kind: "move",
      displayTrack: 0,
      persistTrack: 0,
    });
  });
});

describe("resolveZMirrorLaneMove — bring-to-front / send-to-back", () => {
  it("bring-to-front moves above the topmost temporally-overlapping clip", () => {
    const a = el("a", 0, 20, 5); // lane 0 free over t's span
    const b = el("b", 1, 0, 10); // topmost overlap
    const c = el("c", 2, 0, 10);
    const t = el("t", 3, 0, 10);
    expect(resolve("bring-to-front", t, [a, b, c, t])).toEqual({
      kind: "move",
      displayTrack: 0,
      persistTrack: 0,
    });
  });

  it("bring-to-front inserts above the topmost overlap when no lane is free", () => {
    const b = el("b", 0, 0, 10);
    const c = el("c", 1, 0, 10);
    const t = el("t", 2, 0, 10);
    expect(resolve("bring-to-front", t, [b, c, t])).toEqual({ kind: "insert", insertRow: 0 });
  });

  it("bring-to-front is null when already topmost among overlaps (temporal scope)", () => {
    // A clip exists on a higher lane but does NOT overlap in time — with the
    // default temporal-overlap scope the target is already at the front.
    const a = el("a", 0, 20, 5);
    const t = el("t", 1, 0, 10);
    const c = el("c", 2, 0, 10);
    expect(resolve("bring-to-front", t, [a, t, c])).toBeNull();
  });

  it("send-to-back moves below the bottommost temporally-overlapping clip", () => {
    const t = el("t", 0, 0, 10);
    const b = el("b", 1, 0, 10); // bottommost overlap
    const c = el("c", 2, 20, 5); // lane 2 free over t's span
    expect(resolve("send-to-back", t, [t, b, c])).toEqual({
      kind: "move",
      displayTrack: 2,
      persistTrack: 2,
    });
  });

  it("send-to-back inserts below the bottommost overlap when no lane is free", () => {
    const { t, elements } = stackBelow();
    expect(resolve("send-to-back", t, elements)).toEqual({ kind: "insert", insertRow: 3 });
  });

  it("send-to-back is null when already bottommost among overlaps", () => {
    const t = el("t", 1, 0, 10);
    const a = el("a", 0, 0, 10);
    expect(resolve("send-to-back", t, [a, t])).toBeNull();
  });

  it("returns null when nothing overlaps at all", () => {
    const t = el("t", 0, 0, 10);
    const a = el("a", 1, 20, 5);
    for (const action of ["bring-to-front", "send-to-back"] as const) {
      expect(resolve(action, t, [t, a])).toBeNull();
    }
  });
});

describe("resolveZMirrorLaneMove — span freeness", () => {
  it("a lane free at the clip's start but occupied later in the span is NOT free", () => {
    const t = el("t", 2, 0, 10);
    const b = el("b", 1, 0, 10); // crossed neighbor
    // Lane 0: nothing at t=0, but occupied over [6, 9) — inside t's span.
    const late = el("late", 0, 6, 3);
    expect(resolve("bring-forward", t, [late, b, t], "b")).toEqual({
      kind: "insert",
      insertRow: 1,
    });
  });

  it("half-open spans: a clip starting exactly at the moved clip's end does not occupy", () => {
    const t = el("t", 2, 0, 10);
    const b = el("b", 1, 0, 10);
    const adjacent = el("adj", 0, 10, 5); // [10, 15) touches [0, 10) but no overlap
    expect(resolve("bring-forward", t, [adjacent, b, t], "b")).toEqual({
      kind: "move",
      displayTrack: 0,
      persistTrack: 0,
    });
  });

  it("freeness is file-agnostic: an other-file clip occupies the lane", () => {
    const t = el("t", 2, 0, 10);
    const b = el("b", 1, 0, 10);
    const foreign = el("f", 0, 0, 10, { sourceFile: "sub.html" });
    expect(resolve("bring-forward", t, [foreign, b, t], "b")).toEqual({
      kind: "insert",
      insertRow: 1,
    });
  });
});

describe("resolveZMirrorLaneMove — zone boundary (audio untouched)", () => {
  // Visual lanes 0-1, audio lanes 2-3.
  const zoned = () => {
    const t = el("t", 0, 0, 10);
    const b = el("b", 1, 0, 10);
    const m = audio("music", 2, 0, 30);
    const vo = audio("vo", 3, 0, 30);
    return { t, b, m, vo, elements: [t, b, m, vo] };
  };

  it("send-backward never lands on an audio lane — inserts at the zone boundary", () => {
    const { t, elements } = zoned();
    // Lane 2 (audio) is out of bounds even though "below"; boundary row 2 sits
    // between the bottom visual lane and the first audio lane — a visual insert.
    expect(resolve("send-backward", t, elements, "b")).toEqual({ kind: "insert", insertRow: 2 });
  });

  it("send-to-back stops at the visual zone edge", () => {
    const { t, elements } = zoned();
    expect(resolve("send-to-back", t, elements)).toEqual({ kind: "insert", insertRow: 2 });
  });

  it("audio clips never mirror (returns null)", () => {
    const { m, elements } = zoned();
    for (const action of [
      "bring-to-front",
      "bring-forward",
      "send-backward",
      "send-to-back",
    ] as const) {
      expect(resolve(action, m, elements)).toBeNull();
    }
  });

  it("audio clips do not count as overlap references for visual clips", () => {
    // Only audio below the target → send-backward has no visual neighbor → null.
    const t = el("t", 0, 0, 10);
    const m = audio("music", 1, 0, 30);
    expect(resolve("send-backward", t, [t, m])).toBeNull();
    expect(resolve("send-to-back", t, [t, m])).toBeNull();
  });
});

describe("resolveZMirrorLaneMove — authored (persist) space", () => {
  it("persistTrack takes the target lane occupant's authoredTrack, not the display lane", () => {
    // Occupant of the free-over-span target lane 0 (authored 3) anchors the persist value.
    const { t, elements } = sparseAuthored();
    expect(resolve("bring-forward", t, elements, "b")).toEqual({
      kind: "move",
      displayTrack: 0,
      persistTrack: 3,
    });
  });

  it("falls back to nearest-same-file lane offset when the target lane has no same-file occupant", () => {
    // The moved clip is an expanded sub-comp child; the target lane's only
    // occupant belongs to the host file, so the persist value offsets from the
    // nearest same-file lane instead (authored 4 at lane 1 → lane 0 = 3).
    const host = el("h", 0, 20, 5); // host-file clip on the target lane (not overlapping)
    const sib = el("s", 1, 0, 10, { sourceFile: "sub.html", authoredTrack: 4 });
    const t = el("t", 2, 0, 10, { sourceFile: "sub.html", authoredTrack: 5 });
    expect(resolve("bring-forward", t, [host, sib, t], "s")).toEqual({
      kind: "move",
      displayTrack: 0,
      persistTrack: 3,
    });
  });
});

describe("resolveZMirrorLaneMove — stacking-context (source file) scoping", () => {
  it("other-file clips are not overlap references (extremes computed per file)", () => {
    // A host clip overlaps above the sub-comp child, but the child's own file
    // has nothing above it → bring-to-front is null (already at ITS front).
    const host = el("h", 0, 0, 10);
    const t = el("t", 1, 0, 10, { sourceFile: "sub.html" });
    expect(resolve("bring-to-front", t, [host, t])).toBeNull();
  });

  it("same-file overlaps in an expanded sub-comp resolve within the child's lanes", () => {
    const host = el("h", 0, 0, 10);
    const sib = el("s", 1, 0, 10, { sourceFile: "sub.html", authoredTrack: 0 });
    const t = el("t", 2, 0, 10, { sourceFile: "sub.html", authoredTrack: 1 });
    // Topmost same-file overlap is sib (lane 1); lane 0 is occupied by the host
    // over the span (freeness is file-agnostic) → insert above sib's lane.
    expect(resolve("bring-to-front", t, [host, sib, t])).toEqual({
      kind: "insert",
      insertRow: 1,
    });
  });
});

describe("resolveZMirrorLaneMove — degenerate inputs and determinism", () => {
  it("zero-duration element returns null", () => {
    const t = el("t", 1, 0, 0);
    const a = el("a", 0, 0, 10);
    expect(resolve("bring-to-front", t, [a, t])).toBeNull();
  });

  it("single-clip timeline returns null for every action", () => {
    const t = el("t", 0, 0, 10);
    for (const action of [
      "bring-to-front",
      "bring-forward",
      "send-backward",
      "send-to-back",
    ] as const) {
      expect(resolve(action, t, [t])).toBeNull();
    }
  });

  it("identical inputs produce identical outputs (deterministic, input untouched)", () => {
    const first = sparseAuthored();
    const snapshot = structuredClone(first.elements);
    const r1 = resolve("bring-forward", first.t, first.elements, "b");
    const r2 = resolve("bring-forward", first.t, first.elements, "b");
    const fresh = sparseAuthored();
    const r3 = resolve("bring-forward", fresh.t, fresh.elements, "b");
    expect(r1).toEqual(r2);
    expect(r1).toEqual(r3);
    expect(first.elements).toEqual(snapshot); // pure — never mutates its input
  });
});

describe("resolveRepositionLaneMove (Layers-panel equal jump)", () => {
  // Bottom→top render order helper: keys as the panel's reversed order.
  const reposition = (
    element: TimelineElement,
    elements: TimelineElement[],
    desiredOrderKeys: (string | null)[],
  ) => resolveRepositionLaneMove({ element, elements, desiredOrderKeys });

  // Three stacked clips on lanes 0/1/2, all overlapping. Render order matches
  // lanes today: bottom→top = c(2), b(1), t(0)... target starts on lane 2.
  const stack3 = () => {
    const a = el("a", 0, 0, 10);
    const b = el("b", 1, 0, 10);
    const t = el("t", 2, 0, 10);
    return { a, b, t, elements: [a, b, t] };
  };

  it("multi-step jump to the top inserts a new lane above the new below-neighbor", () => {
    const { t, elements } = stack3();
    // t dragged to the TOP of the panel: bottom→top = [b, a, t].
    // New below-neighbor is a (lane 0); lanes above are occupied/none free →
    // insert at a's boundary (order.indexOf(0) = 0).
    expect(reposition(t, elements, ["b", "a", "t"])).toEqual({ kind: "insert", insertRow: 0 });
  });

  it("multi-step jump lands on a free lane between the new neighbors", () => {
    // Lanes 0,1,2,3: a(0), b(1) short-lived, c(2), t(3). Lane 1 is free over
    // t's span. t dragged between a and c in paint order: above-neighbor a
    // (lane 0), below-neighbor c (lane 2) → free lane 1, strictly between.
    const a = el("a", 0, 0, 10);
    const b = el("b", 1, 20, 5);
    const c = el("c", 2, 0, 10);
    const t = el("t", 3, 0, 10);
    // bottom→top: c (bottom), t (middle), a (top); b not in the sibling set.
    expect(reposition(t, [a, b, c, t], ["c", "t", "a"])).toEqual({
      kind: "move",
      displayTrack: 1,
      persistTrack: 1,
    });
  });

  it("drop toward the bottom lands on a free lane below the new above-neighbor", () => {
    // Lanes: t(0), b(1), c(2) short-lived → lane 2 free over t's span.
    const t = el("t", 0, 0, 10);
    const b = el("b", 1, 0, 10);
    const c = el("c", 2, 20, 5);
    // t dragged below b: bottom→top = [t, b]. Above-neighbor b (lane 1) →
    // closest free lane below it is lane 2.
    expect(reposition(t, [t, b, c], ["t", "b"])).toEqual({
      kind: "move",
      displayTrack: 2,
      persistTrack: 2,
    });
  });

  it("drop below the bottom clip inserts a new bottom lane when none is free", () => {
    const x = el("x", 0, 0, 10);
    const y = el("y", 1, 0, 10);
    const z = el("z", 2, 0, 10);
    // x (top lane 0) dragged to the bottom of the panel: bottom→top = [x, z, y].
    // Above-neighbor = z (lane 2); no free lane below it → insert below z
    // (order.indexOf(2) + 1 = 3).
    expect(reposition(x, [x, y, z], ["x", "z", "y"])).toEqual({ kind: "insert", insertRow: 3 });
  });

  it("skips non-clip siblings (null keys) when resolving neighbors", () => {
    // t on TOP lane 0, a below on lane 1. t dragged below a in paint order,
    // with two decorations (null keys) interleaved: the resolver must skip the
    // nulls and find a (lane 1) as the above-neighbor → no free lane below it
    // → insert below a (order.indexOf(1) + 1 = 2).
    const t = el("t", 0, 0, 10);
    const a = el("a", 1, 0, 10);
    expect(reposition(t, [t, a], [null, "t", null, "a"])).toEqual({
      kind: "insert",
      insertRow: 2,
    });
  });

  it("returns null when the drop leaves the clip where it already sits", () => {
    const a = el("a", 0, 20, 5); // lane 0 free over t's span but t stays put
    const b = el("b", 1, 0, 10);
    const t = el("t", 2, 0, 10);
    // bottom→top = [t, b] — t stays below b; nearest above-neighbor b (lane 1),
    // scanning down from lane 1 finds t's own lane 2 first.
    expect(reposition(t, [a, b, t], ["t", "b"])).toBeNull();
  });

  it("returns null for audio, zero-duration, decoration-only sets, and unknown self", () => {
    const t = el("t", 1, 0, 10);
    const a = el("a", 0, 0, 10);
    expect(reposition(audio("s", 3, 0, 10), [t, a], ["s", "t"])).toBeNull();
    expect(reposition(el("z0", 1, 0, 0), [t, a], ["z0", "t"])).toBeNull();
    expect(reposition(t, [t, a], [null, "t", null])).toBeNull(); // no clip neighbor
    expect(reposition(t, [t, a], ["a"])).toBeNull(); // self missing from order
  });

  it("audio lanes are never targeted (insert stays within the visual zone)", () => {
    const a = el("a", 0, 0, 10);
    const t = el("t", 1, 0, 10);
    const music = audio("m", 2, 0, 30);
    // t dropped below a... wait, t already below a. Drag a below t instead:
    // bottom→top = [a, t]. Above-neighbor t (lane 1); no free visual lane below
    // → insert below t (order.indexOf(1) + 1 = 2), never onto the audio lane.
    expect(reposition(a, [a, t, music], ["a", "t"])).toEqual({ kind: "insert", insertRow: 2 });
  });

  it("is pure: identical inputs, identical outputs, input untouched", () => {
    const build = () => {
      const a = el("a", 0, 0, 10);
      const b = el("b", 1, 0, 10);
      const t = el("t", 2, 0, 10);
      return { t, elements: [a, b, t] };
    };
    const first = build();
    const snapshot = structuredClone(first.elements);
    const r1 = reposition(first.t, first.elements, ["b", "a", "t"]);
    const fresh = build();
    const r2 = reposition(fresh.t, fresh.elements, ["b", "a", "t"]);
    expect(r1).toEqual(r2);
    expect(first.elements).toEqual(snapshot);
  });
});

describe("paint scope (source file + stacking context)", () => {
  it("forward never references a same-file clip in a DIFFERENT stacking context", () => {
    // b overlaps t and sits above, but lives in a nested stacking context —
    // leaf z is not comparable, so the mirror must not treat it as a neighbor.
    const b = el("b", 0, 0, 10, { stackingContextId: "ctx-nested" });
    const t = el("t", 1, 0, 10);
    expect(resolve("bring-forward", t, [b, t])).toBeNull();
  });

  it("cross-file clips with matching null root contexts never compare (expanded view)", () => {
    const foreign = el("f", 0, 0, 10, { sourceFile: "scenes/intro.html" });
    const t = el("t", 1, 0, 10);
    expect(resolve("bring-forward", t, [foreign, t])).toBeNull();
    expect(resolve("bring-to-front", t, [foreign, t])).toBeNull();
  });

  it("reposition skips neighbors outside the paint scope when resolving lanes", () => {
    // t (lane 0) dragged below a in paint order; o sits between them in the
    // DESIRED order but lives in a nested stacking context, so it must be
    // skipped: the above-neighbor is a (lane 1). Lane 2 is occupied by o over
    // the span (freeness is scope-agnostic) → insert below a (row 2).
    const t = el("t", 0, 0, 10);
    const a = el("a", 1, 0, 10);
    const other = el("o", 2, 0, 10, { stackingContextId: "ctx-a" });
    expect(
      resolveRepositionLaneMove({
        element: t,
        elements: [t, a, other],
        desiredOrderKeys: ["t", "o", "a"],
      }),
    ).toEqual({ kind: "insert", insertRow: 2 });
  });
});

describe("expanded sub-comp children — lane scoping", () => {
  const child = (id: string, track: number, start: number, duration: number) =>
    el(id, track, start, duration, {
      sourceFile: "scene.html",
      expandedHostKey: "host",
    });

  it("a child mirrors onto a SIBLING's lane and persists the sibling's AUTHORED track", () => {
    // Sibling c1 owns fractional display lane 0.25 (authored track 2 in its own
    // file) but sits elsewhere in time → its lane is free over t's span.
    const c1 = el("c1", 0.25, 20, 3, {
      sourceFile: "scene.html",
      expandedHostKey: "host",
      authoredTrack: 2,
    });
    const c2 = child("c2", 0.5, 5, 5);
    const t = child("t", 0.75, 5, 5);
    expect(resolve("bring-forward", t, [c1, c2, t], "c2")).toEqual({
      kind: "move",
      displayTrack: 0.25,
      persistTrack: 2,
    });
  });

  it("a child NEVER lands on a host-space lane with no same-file occupant", () => {
    // Free integer host lane 0 above the crossed sibling — out of scope for a
    // child; with no sibling lane free either, the mirror refuses (null), it
    // does not insert.
    const host = el("h", 0, 20, 3); // host-space lane, free over the span
    const c2 = child("c2", 0.5, 5, 5);
    const t = child("t", 0.75, 5, 5);
    expect(resolve("bring-forward", t, [host, c2, t], "c2")).toBeNull();
  });

  it("reposition of a child refuses instead of inserting a host lane", () => {
    const c2 = child("c2", 0.5, 5, 5);
    const t = child("t", 0.75, 5, 5);
    // t dragged above c2 in the layers order; no free sibling lane → null.
    expect(
      resolveRepositionLaneMove({
        element: t,
        elements: [c2, t],
        desiredOrderKeys: ["c2", "t"],
      }),
    ).toBeNull();
  });
});
