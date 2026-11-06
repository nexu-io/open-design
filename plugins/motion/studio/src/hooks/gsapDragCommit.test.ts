// @vitest-environment happy-dom

import { describe, expect, it, beforeEach, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { commitGsapPositionFromDrag } from "./gsapDragPositionCommit";
import {
  commitStaticGsapPosition,
  commitStaticGsapRotation,
  commitStaticGsapSize,
  findExistingPositionWrite,
  materializeIfDynamic,
  parkPlayheadOnKeyframe,
  type GsapDragCommitCallbacks,
} from "./gsapDragCommit";
import { usePlayerStore } from "../player/store/playerStore";
import { liveTween, previewWith } from "./gsapParsedTween.test-helpers";

// Minimal selection whose element has no drag-baseline attributes (origX/Y = 0).
const selection = (): DomEditSelection =>
  ({
    id: "puck-a",
    selector: "#puck-a",
    element: {
      style: { getPropertyValue: () => "", setProperty: () => {} },
      getAttribute: () => null,
      removeAttribute: () => {},
      getBoundingClientRect: () => ({ top: 0, left: 0 }),
    },
  }) as unknown as DomEditSelection;

function selectorlessSelection(): DomEditSelection {
  return {
    selector: ".shared",
    element: document.createElement("div"),
  } as unknown as DomEditSelection;
}

describe("lower GSAP commit helpers fail closed", () => {
  it("rejects instead of silently dropping a static position write without a stable selector", async () => {
    const commitMutation = vi.fn();
    await expect(
      commitStaticGsapPosition(
        selectorlessSelection(),
        { x: 10, y: 20 },
        { x: 0, y: 0 },
        ".shared",
        null,
        { commitMutation },
      ),
    ).rejects.toMatchObject({ name: "GsapEditBlockedError", reason: "no-selector" });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("rejects runtime-dynamic materialization instead of rewriting source during a gesture", async () => {
    const commitMutation = vi.fn();
    await expect(
      materializeIfDynamic(
        { ...flatTween(), hasUnresolvedKeyframes: true },
        null,
        commitMutation,
        selection(),
      ),
    ).rejects.toMatchObject({ name: "GsapEditBlockedError", reason: "source-uneditable" });
    expect(commitMutation).not.toHaveBeenCalled();
  });
});

const flatTween = (): GsapAnimation =>
  ({
    id: "#puck-a-to",
    targetSelector: "#puck-a",
    method: "to",
    resolvedStart: 1.2,
    duration: 2.2,
    properties: { x: -260 },
  }) as unknown as GsapAnimation;

// What the flat tween becomes after convert-to-keyframes (returned by fetchAnimations).
const convertedTween = (): GsapAnimation =>
  ({
    id: "#puck-a-converted",
    targetSelector: "#puck-a",
    method: "to",
    resolvedStart: 1.2,
    duration: 2.2,
    keyframes: {
      keyframes: [
        { percentage: 0, properties: { x: 0, y: 0 } },
        { percentage: 100, properties: { x: -260, y: 0 } },
      ],
    },
  }) as unknown as GsapAnimation;

function recordingCallbacks(): {
  types: string[];
  mutations: Array<Record<string, unknown>>;
  callbacks: GsapDragCommitCallbacks;
} {
  const types: string[] = [];
  const mutations: Array<Record<string, unknown>> = [];
  return {
    types,
    mutations,
    callbacks: {
      commitMutation: async (_sel, mutation) => {
        types.push(mutation.type as string);
        mutations.push(mutation);
      },
      fetchAnimations: async () => [convertedTween()],
    },
  };
}

describe("commitGsapPositionFromDrag — at a selected keyframe or past the tween", () => {
  beforeEach(() => usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null }));
  const puck = () => {
    const element = document.createElement("div");
    element.id = "puck-a";
    return { id: "puck-a", selector: "#puck-a", element } as unknown as DomEditSelection;
  };
  const preview = (
    sel: DomEditSelection,
    anim: GsapAnimation,
    ends: Record<string, [number, number]>,
    from = false,
  ) =>
    previewWith(sel.element, [
      liveTween(
        sel.element,
        { start: anim.resolvedStart!, duration: anim.duration!, vars: anim.properties, ends },
        { from },
      ),
    ]);

  it("changes the selected keyframe without extending, even with the playhead past the end", async () => {
    usePlayerStore.setState({ currentTime: 6, activeKeyframePct: 100 }); // outside [1.2, 3.4]
    const { mutations, callbacks } = recordingCallbacks();
    const sel = puck();
    await commitGsapPositionFromDrag(
      sel,
      flatTween(),
      { x: -100, y: 0 },
      { x: 0, y: 0 },
      preview(sel, flatTween(), { x: [0, -260] }),
      callbacks,
    );
    expect(mutations).toEqual([
      expect.objectContaining({
        type: "replace-with-keyframes",
        position: 1.2,
        duration: 2.2,
        easeEach: "power1.out",
        keyframes: [{ percentage: 100, properties: { x: -100, y: 0 } }],
      }),
    ]);
    expect(usePlayerStore.getState().activeKeyframePct).toBeNull();
    expect(usePlayerStore.getState().requestedSeekTime).toBe(3.4);
  });

  it("extends a from() tween to the playhead, keeping its parsed end as the old end", async () => {
    usePlayerStore.setState({ currentTime: 2.2 }); // outside [0.4, 1.3]
    const fromTween = {
      id: "#title-from-400-position",
      targetSelector: "#title",
      method: "from",
      propertyGroup: "position",
      resolvedStart: 0.4,
      duration: 0.9,
      ease: "none",
      properties: { y: 70 },
    } as unknown as GsapAnimation;
    const { types, mutations, callbacks } = recordingCallbacks();
    const sel = puck();
    await commitGsapPositionFromDrag(
      sel,
      fromTween,
      { x: 0, y: -333 },
      { x: 0, y: 0 },
      preview(sel, fromTween, { y: [70, 0] }, true),
      callbacks,
    );
    expect(types).toEqual(["replace-with-keyframes"]);
    expect(mutations[0]).toMatchObject({
      animationId: "#title-from-400-position",
      position: 0.4,
      duration: 1.8,
      easeEach: "none",
      keyframes: [
        { percentage: 0, properties: { y: 70, x: 0 } },
        { percentage: 50, properties: { y: 0, x: 0 } },
        { percentage: 100, properties: { y: -333, x: 0 } },
      ],
    });
  });
});

// Captures the OPTIONS each commit carries (not just the mutation) so we can
// assert which value-only commits attach the `instantPatch` fast path.
type RecordedCommit = { mutation: Record<string, unknown>; options: Record<string, unknown> };
function optionRecordingCallbacks(): {
  commits: RecordedCommit[];
  callbacks: GsapDragCommitCallbacks;
} {
  const commits: RecordedCommit[] = [];
  return {
    commits,
    callbacks: {
      commitMutation: async (_sel, mutation, options) => {
        commits.push({ mutation, options: options as Record<string, unknown> });
      },
      fetchAnimations: async () => [convertedTween()],
    },
  };
}

const existingPositionSet = (): GsapAnimation =>
  ({
    id: "#puck-a-set",
    targetSelector: "#puck-a",
    method: "set",
    properties: { x: 10, y: 20 },
  }) as unknown as GsapAnimation;

const existingRotationSet = (): GsapAnimation =>
  ({
    id: "#puck-a-rot-set",
    targetSelector: "#puck-a",
    method: "set",
    properties: { rotation: 15 },
  }) as unknown as GsapAnimation;

describe("commitStaticGsapPosition — instantPatch (value-only set)", () => {
  beforeEach(() => usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null }));

  it("updates an existing set atomically and derives its instantPatch from that mutation", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapPosition(
      selection(),
      { x: -50, y: 30 }, // studioOffset → newX/newY off a zero base
      { x: 0, y: 0 },
      "#puck-a",
      existingPositionSet(),
      callbacks,
    );

    expect(commits).toHaveLength(1);
    expect(commits[0].mutation).toEqual({
      type: "update-properties",
      animationId: "#puck-a-set",
      properties: { x: -50, y: 30 },
    });
    expect(commits[0].options.softReload).toBe(true);
    expect(commits[0].options.instantPatch).toEqual({
      selector: "#puck-a",
      change: { kind: "set", props: { x: -50, y: 30 } },
    });
    const mutation = commits[0].mutation as { properties: Record<string, number> };
    const patch = commits[0].options.instantPatch as {
      change: { props: Record<string, number> };
    };
    expect(patch.change.props).toEqual(mutation.properties);
  });

  it("ADDS a global gsap.set with a global-set instantPatch (off-timeline, no flash)", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapPosition(
      selection(),
      { x: -50, y: 30 },
      // fallow-ignore-next-line code-duplication
      { x: 0, y: 0 },
      "#puck-a",
      null, // no existing set → `add` a new base gsap.set
      callbacks,
    );

    expect(commits).toHaveLength(1);
    expect(commits[0].mutation.type).toBe("add");
    expect((commits[0].mutation as { global?: boolean }).global).toBe(true);
    const patch = commits[0].options.instantPatch as { change: { kind: string } } | undefined;
    expect(patch?.change.kind).toBe("global-set");
  });

  it("creates one undo entry when updating an existing static position set", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapPosition(
      selection(),
      { x: -50, y: 30 },
      { x: 0, y: 0 },
      "#puck-a",
      existingPositionSet(),
      callbacks,
    );

    expect(commits).toHaveLength(1);
  });
});

const existingSizeSet = (): GsapAnimation =>
  ({
    id: "#puck-a-size-set",
    targetSelector: "#puck-a",
    method: "set",
    properties: { width: 100, height: 80 },
  }) as unknown as GsapAnimation;

describe("commitStaticGsapSize", () => {
  it("updates an existing set with one update-properties mutation", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapSize(
      selection(),
      { width: 300.4, height: 199.6 },
      "#puck-a",
      existingSizeSet(),
      callbacks,
    );

    expect(commits).toHaveLength(1);
    expect(commits[0].mutation).toEqual({
      type: "update-properties",
      animationId: "#puck-a-size-set",
      properties: { width: 300, height: 200 },
    });
    expect(commits.map((commit) => commit.mutation.type)).not.toContain("delete");
    expect(commits.map((commit) => commit.mutation.type)).not.toContain("add");
  });

  it("adds exactly one set when no existing size set exists", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapSize(
      selection(),
      { width: 300, height: 200 },
      "#puck-a",
      null,
      callbacks,
    );

    expect(commits).toHaveLength(1);
    expect(commits[0].mutation).toMatchObject({
      type: "add",
      targetSelector: "#puck-a",
      method: "set",
      properties: { width: 300, height: 200 },
    });
  });

  it("creates one undo entry for an existing static size set", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapSize(
      selection(),
      { width: 300, height: 200 },
      "#puck-a",
      existingSizeSet(),
      callbacks,
    );

    expect(commits).toHaveLength(1);
  });
});

// A degenerate `tl.to("#el",{keyframes:{...},duration:0})` — what a pre-fix drag
// left behind when it routed a STATIC position hold (sitting beside a keyframed
// rotation) into the keyframe branch. A duration-0 keyframed tween renders its
// final keyframe at every playhead, so the element froze and "couldn't move".
const keyframedZeroDurationHold = (): GsapAnimation =>
  ({
    id: "#puck-a-frozen",
    targetSelector: "#puck-a",
    method: "to",
    propertyGroup: "position",
    duration: 0,
    keyframes: {
      keyframes: [
        { percentage: 0, properties: { x: 100, y: 50 } },
        { percentage: 100, properties: { x: -260, y: -70 } },
      ],
    },
    properties: {},
  }) as unknown as GsapAnimation;

describe("static position hold recognition + heal (frozen duration-0 keyframed tween)", () => {
  beforeEach(() => usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null }));

  it("findExistingPositionWrite recognizes a keyframed zero-duration position hold", () => {
    const found = findExistingPositionWrite([keyframedZeroDurationHold()], "#puck-a");
    expect(found?.id).toBe("#puck-a-frozen");
  });

  it("heals a keyframed hold with one transaction ordered add before delete", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapPosition(
      selection(),
      { x: -50, y: 30 },
      { x: 0, y: 0 },
      "#puck-a",
      keyframedZeroDurationHold(),
      callbacks,
    );

    const types = commits.map((c) => c.mutation.type);
    expect(types).toEqual(["add", "delete"]);
    expect(types).not.toContain("update-properties");
    expect((commits[0].mutation as { method?: string }).method).toBe("set");
    expect(commits[0].options.coalesceKey).toBe(commits[1].options.coalesceKey);
    expect(commits[0].options.coalesceKey).toMatch(/^tx:Move layer:\d+$/);
  });

  it("keeps the original hold when the replacement add fails", async () => {
    const mutationTypes: string[] = [];
    const callbacks: GsapDragCommitCallbacks = {
      commitMutation: async (_selection, mutation) => {
        mutationTypes.push(mutation.type as string);
        throw new Error("add failed");
      },
    };

    await expect(
      commitStaticGsapPosition(
        selection(),
        { x: -50, y: 30 },
        { x: 0, y: 0 },
        "#puck-a",
        keyframedZeroDurationHold(),
        callbacks,
      ),
    ).rejects.toThrow("add failed");
    expect(mutationTypes).toEqual(["add"]);
  });

  it("leaves a recoverable duplicate when delete fails after the replacement add", async () => {
    let holdCount = 1;
    const callbacks: GsapDragCommitCallbacks = {
      commitMutation: async (_selection, mutation) => {
        if (mutation.type === "add") holdCount += 1;
        if (mutation.type === "delete") throw new Error("delete failed");
      },
    };

    await expect(
      commitStaticGsapPosition(
        selection(),
        { x: -50, y: 30 },
        { x: 0, y: 0 },
        "#puck-a",
        keyframedZeroDurationHold(),
        callbacks,
      ),
    ).rejects.toThrow("delete failed");
    expect(holdCount).toBe(2);
  });
});

describe("commitStaticGsapRotation — instantPatch (value-only set)", () => {
  beforeEach(() => usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null }));

  it("attaches instantPatch {kind:set, props:{rotation}} when updating an existing rotation set", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    await commitStaticGsapRotation(selection(), 42, "#puck-a", existingRotationSet(), callbacks);

    expect(commits).toHaveLength(1);
    expect(commits[0].mutation.type).toBe("update-property");
    expect(commits[0].options.instantPatch).toEqual({
      selector: "#puck-a",
      change: { kind: "set", props: { rotation: 42 } },
    });
    // Patch value derived from the SAME mutation that's POSTed (one source).
    const m = commits[0].mutation as { property: string; value: number };
    const patch = commits[0].options.instantPatch as {
      change: { props: Record<string, number> };
    };
    expect(patch.change.props[m.property]).toBe(m.value);
  });

  it("ADDS a global gsap.set with a global-set instantPatch (off-timeline, no flash)", async () => {
    const { commits, callbacks } = optionRecordingCallbacks();

    // fallow-ignore-next-line code-duplication
    await commitStaticGsapRotation(selection(), 42, "#puck-a", null, callbacks);

    expect(commits).toHaveLength(1);
    expect(commits[0].mutation.type).toBe("add");
    expect((commits[0].mutation as { global?: boolean }).global).toBe(true);
    const patch = commits[0].options.instantPatch as { change: { kind: string } } | undefined;
    expect(patch?.change.kind).toBe("global-set");
  });
});

describe("commitGsapPositionFromDrag — keyframe commits omit instantPatch", () => {
  beforeEach(() => usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null }));

  it("a keyframe drag relies on the soft reload, not the instant patch", async () => {
    usePlayerStore.setState({ currentTime: 2 }); // inside [1.2, 3.4]
    const { commits, callbacks } = optionRecordingCallbacks();
    const element = document.createElement("div");
    const sel = { id: "puck-a", selector: "#puck-a", element } as unknown as DomEditSelection;
    const live = liveTween(element, {
      start: 1.2,
      duration: 2.2,
      vars: { x: -260 },
      ends: { x: [0, -260] },
    });
    await commitGsapPositionFromDrag(
      sel,
      flatTween(),
      { x: -100, y: 0 },
      { x: 0, y: 0 },
      previewWith(element, [live]),
      callbacks,
    );
    expect(commits.map((c) => c.mutation.type)).toEqual(["replace-with-keyframes"]);
    expect(commits[0]!.options.instantPatch).toBeUndefined();
    expect(commits[0]!.options.softReload).toBe(true);
  });
});

describe("parkPlayheadOnKeyframe", () => {
  beforeEach(() => usePlayerStore.setState({ requestedSeekTime: null }));

  const tween = (): GsapAnimation =>
    ({
      id: "#x",
      targetSelector: "#x",
      method: "to",
      resolvedStart: 1.2,
      duration: 2.2,
    }) as unknown as GsapAnimation;

  it("seeks to the keyframe's absolute time so the element previews AT it, not at base", () => {
    parkPlayheadOnKeyframe(tween(), 0); // tween start
    expect(usePlayerStore.getState().requestedSeekTime).toBe(1.2);
    parkPlayheadOnKeyframe(tween(), 100); // tween end
    expect(usePlayerStore.getState().requestedSeekTime).toBe(3.4);
    parkPlayheadOnKeyframe(tween(), 50); // midpoint
    expect(usePlayerStore.getState().requestedSeekTime).toBe(2.3);
  });
});
