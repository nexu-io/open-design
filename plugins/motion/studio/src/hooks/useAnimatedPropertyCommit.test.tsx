// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGsapScript, type GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { useAnimatedPropertyCommit } from "./useAnimatedPropertyCommit";
import { mountReactHarness, withInlineLayoutBox } from "./domSelectionTestHarness";
import { writeSizeWithCrop } from "../components/editor/cropResize";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { trackKeyframeCommit } from "../utils/keyframeUsage";
import { xAtTime } from "./gsapPlaybackTestHarness";
import type { CommitMutationOptions, CommitMutation } from "./gsapScriptCommitTypes";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  usePlayerStore.setState({ autoKeyframeEnabled: true, currentTime: 0 });
});

const selection = { id: "box", selector: "#box" } as DomEditSelection;

const keyframedAnim = {
  id: "#box-to-position",
  targetSelector: "#box",
  propertyGroup: "position",
  method: "to",
  properties: {},
  resolvedStart: 0,
  duration: 2,
  keyframes: {
    keyframes: [
      { percentage: 0, properties: { x: 0, y: 0 } },
      { percentage: 100, properties: { x: 100, y: 0 } },
    ],
  },
} as unknown as GsapAnimation;

type Commit = (
  selection: DomEditSelection,
  props: Record<string, number | string>,
) => Promise<void>;

/** Renders the hook and hands its commit function to the caller via a ref callback. */
function renderHookWith(
  animations: GsapAnimation[],
  onMutation: (
    mutation: Record<string, unknown>,
    label: string,
    options: CommitMutationOptions,
  ) => unknown | Promise<unknown>,
  onReady: (commit: Commit) => void,
  bumpGsapCache = vi.fn(),
  onBatch?: (
    calls: Array<{ mutation: Record<string, unknown>; options: { label: string } }>,
    label: string,
  ) => unknown | Promise<unknown>,
) {
  function Harness() {
    const gsapCommitMutation = Object.assign(
      async (
        _sel: DomEditSelection,
        mutation: Record<string, unknown>,
        options: CommitMutationOptions,
      ) => {
        await onMutation(mutation, options.label, options);
      },
      onBatch
        ? {
            batch: async (
              calls: Array<{
                selection: DomEditSelection;
                mutation: Record<string, unknown>;
                options: { label: string };
              }>,
              options: { label: string },
            ) => {
              await onBatch(calls, options.label);
            },
          }
        : {},
    );
    const { commitAnimatedProperties } = useAnimatedPropertyCommit({
      selectedGsapAnimations: animations,
      gsapCommitMutation,
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      previewIframeRef: { current: null },
      bumpGsapCache,
    });
    onReady(commitAnimatedProperties);
    return null;
  }
  return mountReactHarness(<Harness />);
}

describe("useAnimatedPropertyCommit — ownership and rejection propagation", () => {
  it("rejects a helper-authored property before sending a mutation", async () => {
    const helperRotation = {
      id: "#box-to-rotation",
      targetSelector: "#box",
      propertyGroup: "rotation",
      method: "to",
      properties: { rotationX: 10 },
      provenance: { kind: "helper", fn: "spin", callSite: 1 },
    } as unknown as GsapAnimation;
    const mutations: Array<Record<string, unknown>> = [];
    let commit!: Commit;
    const root = renderHookWith(
      [helperRotation],
      (mutation) => mutations.push(mutation),
      (ready) => (commit = ready),
    );

    await expect(commit(selection, { rotationX: 12 })).rejects.toMatchObject({
      name: "GsapEditBlockedError",
      reason: "unroll-required",
    });
    expect(mutations).toHaveLength(0);
    act(() => root.unmount());
  });

  it("rejects runtime-computed property ownership before sending a mutation", async () => {
    const runtimePosition = {
      ...keyframedAnim,
      hasUnresolvedKeyframes: true,
    } as GsapAnimation;
    const mutations: Array<Record<string, unknown>> = [];
    let commit!: Commit;
    const root = renderHookWith(
      [runtimePosition],
      (mutation) => mutations.push(mutation),
      (ready) => (commit = ready),
    );

    await expect(commit(selection, { x: 50 })).rejects.toMatchObject({
      reason: "source-uneditable",
    });
    expect(mutations).toHaveLength(0);
    act(() => root.unmount());
  });

  it("rejects every property before a mixed-group commit can partially persist", async () => {
    const helperOpacity = {
      id: "#box-to-visual",
      targetSelector: "#box",
      propertyGroup: "visual",
      method: "to",
      properties: { opacity: 0.5 },
      provenance: { kind: "helper", fn: "fade", callSite: 1 },
    } as unknown as GsapAnimation;
    const mutations: Array<Record<string, unknown>> = [];
    let commit!: Commit;
    const root = renderHookWith(
      [helperOpacity],
      (mutation) => mutations.push(mutation),
      (ready) => (commit = ready),
    );

    await expect(commit(selection, { x: 50, opacity: 0.8 })).rejects.toMatchObject({
      reason: "unroll-required",
    });
    expect(mutations).toHaveLength(0);
    act(() => root.unmount());
  });

  it("rethrows a persistence failure to the telemetry wrapper", async () => {
    const failure = new Error("save failed");
    const bumpGsapCache = vi.fn();
    let commit!: Commit;
    const root = renderHookWith(
      [keyframedAnim],
      async () => {
        throw failure;
      },
      (ready) => (commit = ready),
      bumpGsapCache,
    );

    await expect(commit(selection, { x: 50 })).rejects.toBe(failure);
    expect(bumpGsapCache).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});

function renderCommitHook(
  mutations: Array<Record<string, unknown>>,
  onReady: (commit: Commit) => void,
) {
  return renderHookWith(
    [keyframedAnim],
    (mutation) => {
      mutations.push(mutation);
    },
    onReady,
  );
}

// Regression (#1808): a "3D transform" / design-panel property edit on an
// element that already has a keyframed tween is the ACTUAL path a manual
// canvas nudge exercises (not the raw drag intercept) — with auto-keyframe
// off, it must shift the whole tween instead of adding/updating a keyframe
// at the playhead.
describe("useAnimatedPropertyCommit — extending a keyframed tween to the playhead", () => {
  it("keeps the tween's eases and each keyframe's own ease", async () => {
    usePlayerStore.setState({ autoKeyframeEnabled: true, currentTime: 3, activeKeyframePct: null });
    const eased = {
      ...keyframedAnim,
      ease: "power2.inOut",
      keyframes: {
        easeEach: "power2.out",
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 }, ease: "expo.in" },
          { percentage: 100, properties: { x: 100, y: 0 } },
        ],
      },
    } as unknown as GsapAnimation;
    const mutations: Array<Record<string, unknown>> = [];
    let commit!: Commit;
    const root = renderHookWith(
      [eased],
      (mutation) => mutations.push(mutation),
      (ready) => (commit = ready),
    );
    await act(async () => commit(selection, { x: 50 }));
    act(() => root.unmount());

    const replace = mutations.find((m) => m.type === "replace-with-keyframes")!;
    expect(replace).toMatchObject({ ease: "power2.inOut", easeEach: "power2.out" });
    expect((replace.keyframes as Array<{ ease?: string }>)[0]!.ease).toBe("expo.in");
    // The old end keyframe still plays at 2 s once the tween runs to the playhead at 3 s.
    expect(xAtTime(replace as unknown as Parameters<typeof xAtTime>[0], 2)).toBeCloseTo(100, 0);
  });
});

describe("useAnimatedPropertyCommit — autoKeyframeEnabled toggle (#1808)", () => {
  async function runCommitWithAutoKeyframe(enabled: boolean) {
    usePlayerStore.setState({ autoKeyframeEnabled: enabled, currentTime: 0 });
    const mutations: Array<Record<string, unknown>> = [];
    let commit: Commit | undefined;
    const root = renderCommitHook(mutations, (fn) => (commit = fn));
    await act(async () => commit!(selection, { x: 50 }));
    act(() => root.unmount());
    return mutations;
  }

  it("shifts the whole tween instead of updating a keyframe when the toggle is off", async () => {
    const mutations = await runCommitWithAutoKeyframe(false);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.type).toBe("replace-with-keyframes");
  });

  it("still updates a keyframe at the playhead when the toggle is on (default)", async () => {
    const mutations = await runCommitWithAutoKeyframe(true);
    expect(mutations.some((m) => m.type === "update-keyframe" || m.type === "add-keyframe")).toBe(
      true,
    );
    expect(mutations.some((m) => m.type === "replace-with-keyframes")).toBe(false);
  });
});

// Regression: commitStaticSet picked the FIRST `set` for the selector with no
// group check — a panel W edit on a static element merged `width` into the
// POSITION set (`tl.set("#el",{x,y,width})`), a mixed-group set the split
// machinery exists to prevent, labeled "Set 3D transform" in undo history.
describe("commitStaticSet group routing", () => {
  const positionSet = {
    id: "#box-set-0-position",
    targetSelector: "#box",
    propertyGroup: "position",
    method: "set",
    properties: { x: 10, y: 20 },
  } as unknown as GsapAnimation;

  function renderStaticHook(
    committed: Array<{ mutation: Record<string, unknown>; label: string }>,
    onReady: (commit: Commit) => void,
  ) {
    return renderHookWith(
      [positionSet],
      (mutation, label) => {
        committed.push({ mutation, label });
      },
      onReady,
    );
  }

  it("width edit creates a size set instead of contaminating the position set", async () => {
    const committed: Array<{ mutation: Record<string, unknown>; label: string }> = [];
    let commit!: Commit;
    renderStaticHook(committed, (c) => (commit = c));
    await act(async () => {
      await commit(selection, { width: 500 });
    });
    const updates = committed.filter((c) => c.mutation.type === "update-properties");
    expect(updates).toHaveLength(0);
    const adds = committed.filter((c) => c.mutation.type === "add");
    expect(adds).toHaveLength(1);
    expect(adds[0]!.mutation.properties).toEqual({ width: 500 });
    expect(adds[0]!.label).toBe("Resize layer");
  });

  it("x edit updates the position set with a Move label", async () => {
    const committed: Array<{ mutation: Record<string, unknown>; label: string }> = [];
    let commit!: Commit;
    renderStaticHook(committed, (c) => (commit = c));
    await act(async () => {
      await commit(selection, { x: 400 });
    });
    const update = committed.find((c) => c.mutation.type === "update-properties");
    expect(update).toBeDefined();
    expect(update!.mutation.animationId).toBe("#box-set-0-position");
    expect(update!.label).toBe("Move layer");
  });

  it("width edit updates its duration-zero size hold instead of appending a set", async () => {
    const instantSizeHold = {
      id: "#box-to-0-size",
      targetSelector: "#box",
      propertyGroup: "size",
      method: "to",
      properties: { width: 150, height: 150 },
      resolvedStart: 0,
      duration: 0,
      extras: { immediateRender: "__raw:true" },
    } as unknown as GsapAnimation;
    const committed: Array<{ mutation: Record<string, unknown>; label: string }> = [];
    let commit!: Commit;
    renderHookWith(
      [positionSet, instantSizeHold],
      (mutation, label) => {
        committed.push({ mutation, label });
      },
      (c) => (commit = c),
    );

    await act(async () => {
      await commit(selection, { width: 344 });
    });

    expect(committed).toHaveLength(1);
    expect(committed[0]!.mutation).toEqual({
      type: "update-properties",
      animationId: instantSizeHold.id,
      properties: { width: 344 },
    });
    expect(committed[0]!.label).toBe("Resize layer");
    expect(committed.some(({ mutation }) => mutation.type === "add")).toBe(false);
    expect(committed[0]!.mutation.animationId).not.toBe(positionSet.id);
  });

  it("persists multiple property groups in one atomic batch", async () => {
    const committed: Array<{ mutation: Record<string, unknown>; label: string }> = [];
    const batches: Array<{
      calls: Array<{ mutation: Record<string, unknown>; options: { label: string } }>;
      label: string;
    }> = [];
    let commit!: Commit;
    const root = renderHookWith(
      [positionSet],
      (mutation, label) => committed.push({ mutation, label }),
      (ready) => (commit = ready),
      vi.fn(),
      (calls, label) => batches.push({ calls, label }),
    );

    await act(async () => {
      await commit(selection, { x: 400, width: 500 });
    });

    expect(committed).toHaveLength(0);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.label).toBe("Set properties");
    expect(batches[0]!.calls.map(({ mutation }) => mutation)).toEqual([
      {
        type: "update-properties",
        animationId: positionSet.id,
        properties: { x: 400 },
      },
      {
        type: "add",
        targetSelector: "#box",
        method: "set",
        position: 0,
        properties: { width: 500 },
        global: true,
      },
    ]);
    act(() => root.unmount());
  });

  it("fails before sending anything when an atomic multi-group batch is unavailable", async () => {
    const committed: Array<{ mutation: Record<string, unknown>; label: string }> = [];
    let commit!: Commit;
    const root = renderStaticHook(committed, (ready) => (commit = ready));

    await expect(commit(selection, { x: 400, width: 500 })).rejects.toThrow(
      "Atomic GSAP property batch is unavailable",
    );
    expect(committed).toHaveLength(0);
    act(() => root.unmount());
  });
});

describe("useAnimatedPropertyCommit — a size write and its crop are one undo step", () => {
  it.each([[{ width: 450 }], [{ x: 10, width: 450 }]])("%o on a static element", async (props) => {
    const element = withInlineLayoutBox(document.createElement("div"));
    element.id = "box";
    element.style.cssText = "width: 300px; height: 200px; clip-path: inset(0px 60px 0px 0px)";
    document.body.append(element);
    const sel = { ...selection, element } as DomEditSelection;
    const keys: unknown[] = [];
    const land = async (options: { coalesceKey?: string }) => {
      keys.push(options.coalesceKey);
      element.style.width = "450px";
    };
    const mutation: CommitMutation = (_s, _m, options) => land(options);
    mutation.batch = (_calls, options) => land(options);
    let raw!: ReturnType<typeof useAnimatedPropertyCommit>["commitAnimatedProperties"];
    function Harness() {
      raw = useAnimatedPropertyCommit({
        selectedGsapAnimations: [],
        gsapCommitMutation: mutation,
        addGsapAnimation: vi.fn(),
        convertToKeyframes: vi.fn(),
        previewIframeRef: { current: null },
        bumpGsapCache: vi.fn(),
      }).commitAnimatedProperties;
      return null;
    }
    const root = mountReactHarness(<Harness />);
    const patch = vi.fn().mockResolvedValue(undefined);
    await writeSizeWithCrop(sel, props, mutation, patch, (keyed) => raw(sel, props, keyed));

    const cropKey = patch.mock.calls[0]![2].coalesceKey;
    expect(patch.mock.calls[0]![1][0]).toMatchObject({ value: "inset(0px 90px 0px 0px)" });
    expect(keys).toEqual([cropKey]);
    act(() => root.unmount());
  });
});

it("counts one add when an inspector edit first converts a flat animation", async () => {
  usePlayerStore.setState({ autoKeyframeEnabled: true, currentTime: 1 });
  const flat = parseGsapScript(
    'const tl = gsap.timeline(); tl.to("#box", { rotationX: 0, duration: 2 }, 0);',
  ).animations[0]!;
  const mutations: Record<string, unknown>[] = [];
  let commit!: Commit;
  const root = renderHookWith(
    [flat, keyframedAnim],
    (mutation, _label, options) => {
      mutations.push(mutation);
      trackKeyframeCommit([mutation], { ok: true, changed: true }, options);
    },
    (value) => {
      commit = value;
    },
  );
  try {
    await act(async () => {
      await commit(selection, { rotationX: 20 });
    });
    expect(mutations.map((mutation) => mutation.type)).toEqual([
      "convert-to-keyframes",
      "add-keyframe",
    ]);
    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledWith("keyframe", { action: "add" });
  } finally {
    act(() => root.unmount());
  }
});
