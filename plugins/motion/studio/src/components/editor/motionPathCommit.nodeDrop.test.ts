// @vitest-environment happy-dom
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "./domEditing";
import { boxSteps, previewWith, tween } from "../../hooks/gsapParsedTween.test-helpers";
import { usePlayerStore } from "../../player/store/playerStore";
import { GsapEditBlockedError } from "../../hooks/gsapEditOutcome";
import { commitNodeDrop, nodeDropLabel, type CommitFn } from "./motionPathCommit";

it("names a node drop for its undo entry by what it moved", () => {
  const { autoKeyframeEnabled } = usePlayerStore.getState();
  onTestFinished(() => usePlayerStore.setState({ autoKeyframeEnabled }));
  usePlayerStore.setState({ autoKeyframeEnabled: true });
  expect(nodeDropLabel({ type: "keyframe", pct: 50 })).toBe("Move keyframe");
  usePlayerStore.setState({ autoKeyframeEnabled: false });
  expect(nodeDropLabel({ type: "keyframe", pct: 50 })).toBe("Move animation path");
  expect(nodeDropLabel({ type: "waypoint", index: 0 })).toBe("Move waypoint");
});

afterEach(() => {
  usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null, requestedSeekTime: null });
  document.body.innerHTML = "";
});

function box(id = "box") {
  const element = document.body.appendChild(document.createElement("div"));
  element.id = id;
  return { element, selection: { id, selector: `#${id}`, element } as DomEditSelection };
}

type Drop = Parameters<typeof commitNodeDrop>[0];

function drop(fields: Omit<Drop, "animId" | "commitMutation"> & { anim: GsapAnimation }) {
  const commitMutation = vi.fn<CommitFn>(async () => {});
  const done = commitNodeDrop({ ...fields, animId: fields.anim.id, commitMutation });
  const written = () =>
    (commitMutation.mock.calls[0]![0] as { keyframes: { properties: object }[] }).keyframes.map(
      (kf) => kf.properties,
    );
  return { done, commitMutation, written };
}

it("a keyframe node's drop changes that keyframe and keeps a newly animated channel on the others", async () => {
  const { element, selection } = box();
  // Over a CSS translate GSAP reads as y 30.
  const { keys, live } = boxSteps([
    [2, { x: 60 }],
    [1, { x: 120 }],
  ]);
  usePlayerStore.setState({ currentTime: 2, autoKeyframeEnabled: true });

  const { done, commitMutation, written } = drop({
    ref: { type: "keyframe", pct: 100 },
    at: { x: 150, y: 90 },
    anim: keys,
    selection,
    iframe: previewWith(element, [live(element)], { x: 60, y: 30 }),
  });
  await done;

  expect(commitMutation.mock.calls[0]![0].type).toBe("replace-with-keyframes");
  expect(written()).toEqual([
    { x: 60, y: 30 },
    { x: 150, y: 90 },
  ]);
});

it("a drop on an array step's node edits that step, though the path spaces nodes evenly", async () => {
  const { element, selection } = box();
  // Step ends at 2 s and 3 s; the path draws the first node at 0%, the parser and lane at 66.7%.
  const { keys, live } = boxSteps([
    [2, { x: 60, y: 30 }],
    [1, { x: 120, y: 30 }],
  ]);
  usePlayerStore.setState({ currentTime: 1, autoKeyframeEnabled: true, activeKeyframePct: null });

  const { done, written } = drop({
    ref: { type: "keyframe", pct: 0, step: 0 },
    at: { x: 40, y: 90 },
    anim: keys,
    selection,
    iframe: previewWith(element, [live(element)], { x: 60, y: 30 }),
  });
  await done;

  expect(written()).toEqual([
    { x: 40, y: 90 },
    { x: 120, y: 30 },
  ]);
  expect(usePlayerStore.getState().requestedSeekTime).toBe(2);
});

it("a drop the writer refuses rejects with the reason, writes nothing and selects nothing", async () => {
  const [a, b] = [box("a"), box("b")];
  for (const { element } of [a, b]) element.className = "card";
  const shared = tween({
    targetSelector: ".card",
    method: "to",
    properties: {},
    resolvedStart: 0,
    duration: 1,
    keyframes: { format: "percentage", keyframes: [{ percentage: 100, properties: { x: 20 } }] },
  });
  usePlayerStore.setState({ autoKeyframeEnabled: true, activeKeyframePct: null });

  const { done, commitMutation } = drop({
    ref: { type: "keyframe", pct: 100 },
    at: { x: 5, y: 0 },
    anim: shared,
    selection: a.selection,
    iframe: previewWith(b.element, [], { x: 0, y: 0 }),
  });

  await expect(done).rejects.toBeInstanceOf(GsapEditBlockedError);
  expect(commitMutation).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().activeKeyframePct).toBeNull();
});

it.each([true, false])(
  "a drop on a step list with a step delay says the delay blocks it and writes nothing (auto-keyframe %s)",
  async (autoKeyframeEnabled) => {
    const { element, selection } = box();
    const { keys } = boxSteps([
      [1.5, { x: 100, delay: 0.5 }],
      [1.5, { x: 200, delay: 0.5 }],
    ]);
    usePlayerStore.setState({ autoKeyframeEnabled, activeKeyframePct: null });

    const { done, commitMutation } = drop({
      ref: { type: "keyframe", pct: 100 },
      at: { x: 150, y: 0 },
      anim: keys,
      selection,
      iframe: previewWith(element, [], { x: 0, y: 0 }),
    });

    await expect(done).rejects.toThrow(/its own delay.*Code tab/);
    expect(commitMutation).not.toHaveBeenCalled();
  },
);

it("with auto-keyframe off, a step's node shifts the path by its own keyframe's move", async () => {
  const { selection } = box();
  // Steps of 4 s, 1 s and 1 s: drawn at 0/50/100%, parsed at their step ends.
  const { keys } = boxSteps([
    [4, { x: 60, y: 0 }],
    [1, { x: 120, y: 0 }],
    [1, { x: 180, y: 0 }],
  ]);
  usePlayerStore.setState({ autoKeyframeEnabled: false, activeKeyframePct: null });

  const { done, written } = drop({
    ref: { type: "keyframe", pct: 50, step: 1 },
    at: { x: 157, y: 0 },
    anim: keys,
    selection,
    iframe: null,
  });
  await done;

  expect(written().map((props) => (props as { x: number }).x)).toEqual([97, 157, 217]);
});

it("a drop on an inner keyframe of a tween eased as a whole changes that keyframe", async () => {
  const { element, selection } = box();
  const keys = tween({
    id: "#box-to-0-position",
    method: "to",
    properties: {},
    resolvedStart: 0,
    duration: 2,
    ease: "power1.inOut",
    keyframes: {
      format: "percentage",
      keyframes: [0, 100, 200].map((x, i) => ({ percentage: i * 50, properties: { x, y: 0 } })),
    },
  });
  usePlayerStore.setState({ autoKeyframeEnabled: true, activeKeyframePct: null });

  const { done, written } = drop({
    ref: { type: "keyframe", pct: 50 },
    at: { x: 150, y: 0 },
    anim: keys,
    selection,
    iframe: previewWith(element, [], { x: 0, y: 0 }),
  });
  await done;

  expect(written().map((props) => (props as { x: number }).x)).toEqual([0, 150, 200]);
});

it("a drop on a short step under 1% from the one before edits the dragged step", async () => {
  const { element, selection } = box();
  // Parsed at 50, 50.5 and 100%: a 0.05 s pop step in a 10 s list.
  const { keys, live } = boxSteps([
    [5, { x: 0, y: 0 }],
    [0.05, { x: 100, y: 0 }],
    [4.95, { x: 100, y: 0 }],
  ]);
  usePlayerStore.setState({ autoKeyframeEnabled: true, activeKeyframePct: null });

  const { done, written } = drop({
    ref: { type: "keyframe", pct: 50, step: 1 },
    at: { x: 150, y: 0 },
    anim: keys,
    selection,
    iframe: previewWith(element, [live(element)], { x: 0, y: 0 }),
  });
  await done;

  expect(written().map((props) => (props as { x: number }).x)).toEqual([0, 150, 100]);
});
