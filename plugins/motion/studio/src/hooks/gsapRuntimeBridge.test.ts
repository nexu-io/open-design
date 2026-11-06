import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { tryGsapDragIntercept, tryGsapRotationIntercept } from "./gsapRuntimeBridge";
import { usePlayerStore } from "../player/store/playerStore";

/**
 * Regression: `selectedGsapAnimations` (and the fetch fallback) is an async
 * server-parse that LAGS a delete-all. A drag in that window would resolve a
 * phantom position tween from the stale cache and re-commit it — resurrecting the
 * just-deleted animation. tryGsapDragIntercept must trust the LIVE runtime: when
 * the runtime has no keyframed/tweened position motion, the element is STATIC
 * (single-source model), so the drag commits a position-hold `tl.set("#el",{x,y})`
 * rather than re-committing the phantom tween. The stale `to` parse is ignored.
 */

// A preview iframe whose runtime timeline holds `children`, resolves the element,
// and exposes a gsap stub — so the drag can reach the commit path (the guard, not
// a missing gsap, must be what stops it).
function fakeIframe(elId: string, children: unknown[]): HTMLIFrameElement {
  const timeline = { getChildren: () => children, duration: () => 14.6 };
  const el = { id: elId };
  return {
    contentWindow: {
      __timelines: { "index.html": timeline },
      gsap: { getProperty: () => 0, defaults: () => ({ ease: "power1.out" }) },
    },
    contentDocument: { querySelector: (sel: string) => (sel === `#${elId}` ? el : null) },
  } as unknown as HTMLIFrameElement;
}

// A selection whose element answers the reads commitGsapPositionFromDrag makes —
// so without the guard the drag would reach commitMutation (resurrecting the tween).
const fakeElement = {
  id: "puck-b",
  style: { getPropertyValue: () => "" },
  getAttribute: () => null,
  getBoundingClientRect: () => ({ top: 100, left: 100, width: 50, height: 50 }),
} as unknown as HTMLElement;

const selection = {
  id: "puck-b",
  selector: "#puck-b",
  element: fakeElement,
} as unknown as DomEditSelection;

// A stale parse-cache entry: a position tween the server still reports post-delete.
const stalePositionAnim = {
  id: "#puck-b-to-1000-position",
  targetSelector: "#puck-b",
  propertyGroup: "position",
  method: "to",
  properties: { x: -180, y: -60 },
  position: 1,
  resolvedStart: 1,
  duration: 2,
} as unknown as GsapAnimation;

afterEach(() => vi.restoreAllMocks());

describe("tryGsapDragIntercept — stale-parse guard (no resurrection after delete-all)", () => {
  async function runHelperOwnedDrag(fetchFallbackAnimations?: () => Promise<GsapAnimation[]>) {
    const helperTween = {
      ...stalePositionAnim,
      provenance: { kind: "helper", fn: "slam", callSite: 1 },
    } as GsapAnimation;
    const commitMutation = vi.fn();
    const result = await tryGsapDragIntercept(
      selection,
      { x: 10, y: 10 },
      [helperTween],
      fakeIframe("puck-b", []),
      commitMutation,
      fetchFallbackAnimations,
    );
    return { result, commitMutation };
  }

  it("blocks a live runtime position tween when no editable source mapping exists", async () => {
    const liveTween = {
      targets: () => [{ id: "puck-b" }],
      vars: { y: 18, duration: 1 },
      duration: () => 1,
      startTime: () => 0,
    };
    const commitMutation = vi.fn();

    const result = await tryGsapDragIntercept(
      selection,
      { x: 25, y: -10 },
      [],
      fakeIframe("puck-b", [liveTween]),
      commitMutation,
      vi.fn().mockResolvedValue([]),
    );

    expect(result).toEqual({
      status: "blocked",
      reason: "source-uneditable",
      detail: "live-position-no-source-tween",
    });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("blocks a selector that cannot safely address one writable element", async () => {
    const selectorless = {
      ...selection,
      id: undefined,
      selector: undefined,
    } as unknown as DomEditSelection;
    const result = await tryGsapDragIntercept(selectorless, { x: 1, y: 1 }, [], null, vi.fn());
    expect(result).toEqual({ status: "blocked", reason: "no-selector" });
  });

  it("requires explicit unroll for helper-authored source and performs no mutation", async () => {
    const { result, commitMutation } = await runHelperOwnedDrag();
    expect(result).toEqual({ status: "blocked", reason: "unroll-required" });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("does not let an empty fallback response bypass cached helper provenance", async () => {
    const { result, commitMutation } = await runHelperOwnedDrag(vi.fn().mockResolvedValue([]));
    expect(result).toEqual({ status: "blocked", reason: "unroll-required" });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("commits a static set (not the stale tween) when the runtime has no live position motion", async () => {
    const commitMutation = vi.fn();
    // Runtime empty (tween deleted) — readRuntimeKeyframes returns null, so the
    // element is treated as STATIC. The stale `to` parse must NOT be re-committed.
    const iframe = fakeIframe("puck-b", []);

    const handled = await tryGsapDragIntercept(
      selection,
      { x: -50, y: 30 },
      [stalePositionAnim],
      iframe,
      commitMutation,
    );

    expect(handled).toEqual({ status: "persisted" });
    // No existing `set` for the selector → one `add` mutation with `method:"set"`.
    expect(commitMutation).toHaveBeenCalledTimes(1);
    const [, mutation] = commitMutation.mock.calls[0];
    expect(mutation).toMatchObject({
      type: "add",
      method: "set",
      targetSelector: "#puck-b",
      position: 0,
    });
    // Drag delta (-50, 30) off a zero base → the committed set holds that position.
    expect(mutation.properties).toEqual({ x: -50, y: 30 });
    // It must NOT resurrect the stale tween via a tween/keyframe mutation.
    expect(mutation.type).not.toBe("update-property");
    expect(mutation.type).not.toBe("add-keyframe");
  });

  it("forwards one complete instantPatch when atomically updating an existing static set", async () => {
    const commitMutation = vi.fn();
    const iframe = fakeIframe("puck-b", []); // runtime empty → STATIC path
    // An existing position-hold `set` for the selector → update-in-place (not add).
    const existingSet = {
      id: "#puck-b-set",
      targetSelector: "#puck-b",
      method: "set",
      // Tagged as a position group so resolveGroupTween returns it directly
      // (no split commit), exercising the in-place update path cleanly.
      propertyGroup: "position",
      properties: { x: 0, y: 0 },
    } as unknown as GsapAnimation;

    const handled = await tryGsapDragIntercept(
      selection,
      { x: -50, y: 30 },
      [existingSet],
      iframe,
      commitMutation,
    );

    expect(handled).toEqual({ status: "persisted" });
    const updates = commitMutation.mock.calls.filter(([, m]) => m.type === "update-properties");
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual({
      type: "update-properties",
      animationId: "#puck-b-set",
      properties: { x: -50, y: 30 },
    });
    expect(updates[0][2].instantPatch).toEqual({
      selector: "#puck-b",
      change: { kind: "set", props: { x: -50, y: 30 } },
    });
  });

  it("updates a degenerate duration:0 hold-`to` in place instead of appending a gsap.set", async () => {
    const commitMutation = vi.fn();
    const iframe = fakeIframe("puck-b", []); // runtime empty → STATIC path
    // What remove-all-keyframes leaves behind: a zero-duration immediateRender
    // `tl.to` hold. A drag must UPDATE it, not append a 2nd (gsap.set) position
    // write that silently overrides it (the duplicate-position-write bug).
    const degenerateHold = {
      id: "#puck-b-to-0-position",
      targetSelector: "#puck-b",
      method: "to",
      propertyGroup: "position",
      properties: { x: -766, y: 314 },
      position: 1.333,
      resolvedStart: 1.333,
      duration: 0,
    } as unknown as GsapAnimation;

    const handled = await tryGsapDragIntercept(
      selection,
      { x: -50, y: 30 },
      [degenerateHold],
      iframe,
      commitMutation,
    );

    expect(handled).toEqual({ status: "persisted" });
    // One atomic in-place update, NOT an `add`/`add-keyframe`.
    const types = commitMutation.mock.calls.map(([, m]) => m.type);
    expect(types).toEqual(["update-properties"]);
    expect(types).not.toContain("add");
    expect(types).not.toContain("add-keyframe");
  });

  it("does not trip the stale-parse guard when the runtime still has the tween", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const liveTween = {
      targets: () => [{ id: "puck-b" }],
      vars: { x: -120, y: 40, duration: 1 },
      duration: () => 1,
      startTime: () => 1,
    };
    // No fake gsap → it returns false later (at the gsapPos read), but the point
    // is the stale-parse guard must NOT be the reason.
    const iframe = fakeIframe("puck-b", [liveTween]);

    await tryGsapDragIntercept(selection, { x: -50, y: 30 }, [stalePositionAnim], iframe, vi.fn());

    const staleLogged = logSpy.mock.calls.some((c) => String(c[1] ?? "").includes("stale parse"));
    expect(staleLogged).toBe(false);
  });
});

describe("tryGsapRotationIntercept — instant holds", () => {
  it("requires explicit unroll for helper-authored rotation before mutating", async () => {
    const helperRotation = {
      id: "#puck-b-to-rotation",
      targetSelector: "#puck-b",
      propertyGroup: "rotation",
      method: "to",
      properties: { rotation: 45 },
      position: 0,
      duration: 1,
      provenance: { kind: "helper", fn: "spin", callSite: 1 },
    } as unknown as GsapAnimation;
    const commitMutation = vi.fn();

    await expect(
      tryGsapRotationIntercept(selection, 75, [helperRotation], null, commitMutation),
    ).resolves.toEqual({ status: "blocked", reason: "unroll-required" });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  // Mirrors resize by design: both geometry routes must reuse one ownership parse.
  // fallow-ignore-next-line code-duplication
  it("reuses the ownership parse instead of fetching a resolved rotation group twice", async () => {
    const rotationHold = {
      id: "#puck-b-set-rotation",
      targetSelector: "#puck-b",
      propertyGroup: "rotation",
      method: "set",
      properties: { rotation: 45 },
    } as unknown as GsapAnimation;
    const fetchAnimations = vi.fn().mockResolvedValue([rotationHold]);
    const commitMutation = vi.fn();

    await expect(
      tryGsapRotationIntercept(selection, 75, [], null, commitMutation, fetchAnimations),
    ).resolves.toEqual({ status: "persisted" });
    expect(fetchAnimations).toHaveBeenCalledTimes(1);
    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({ type: "update-property", animationId: rotationHold.id }),
      expect.anything(),
    );
  });

  it("rejects a selectorless rotation instead of reporting a handled no-op", async () => {
    const selectorless = {
      ...selection,
      id: undefined,
      selector: undefined,
    } as unknown as DomEditSelection;
    const commitMutation = vi.fn();

    await expect(
      tryGsapRotationIntercept(selectorless, 75, [], null, commitMutation),
    ).resolves.toEqual({ status: "blocked", reason: "no-selector" });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("blocks helper-authored 3D rotation channels before mutating the group", async () => {
    const helperRotationX = {
      id: "#puck-b-to-rotation",
      targetSelector: "#puck-b",
      propertyGroup: "rotation",
      method: "to",
      properties: { rotationX: 45 },
      duration: 1,
      provenance: { kind: "helper", fn: "tilt", callSite: 1 },
    } as unknown as GsapAnimation;
    const commitMutation = vi.fn();

    await expect(
      tryGsapRotationIntercept(selection, 75, [helperRotationX], null, commitMutation),
    ).resolves.toEqual({ status: "blocked", reason: "unroll-required" });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("commits the exact angle the draft showed", async () => {
    const commitMutation = vi.fn();

    await tryGsapRotationIntercept(selection, 75.25, [], null, commitMutation);
    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({ type: "add", properties: { rotation: 75.25 } }),
      expect.anything(),
    );
  });

  it("does not let an unrelated helper-authored skew tween block 2D rotation", async () => {
    const helperSkew = {
      id: "#puck-b-to-rotation",
      targetSelector: "#puck-b",
      propertyGroup: "rotation",
      method: "to",
      properties: { skewX: 12 },
      duration: 1,
      provenance: { kind: "helper", fn: "skew", callSite: 1 },
    } as unknown as GsapAnimation;
    const commitMutation = vi.fn();

    await expect(
      tryGsapRotationIntercept(selection, 75, [helperSkew], null, commitMutation),
    ).resolves.toEqual({ status: "persisted" });
    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({ type: "add", properties: { rotation: 75 } }),
      expect.anything(),
    );
  });

  it("blocks when runtime rotation exists but the authored tween cannot be resolved", async () => {
    const liveRotation = {
      targets: () => [{ id: "puck-b" }],
      vars: { rotation: 45, duration: 1 },
      duration: () => 1,
      startTime: () => 0,
    };
    const commitMutation = vi.fn();

    await expect(
      tryGsapRotationIntercept(
        selection,
        75,
        [],
        fakeIframe("puck-b", [liveRotation]),
        commitMutation,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reason: "source-uneditable",
      detail: "live-rotation-no-source-tween",
    });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("updates a duration-zero fromTo hold instead of converting it to keyframes", async () => {
    const rotationHold = {
      id: "#puck-b-fromTo-0-rotation",
      targetSelector: "#puck-b",
      propertyGroup: "rotation",
      method: "fromTo",
      fromProperties: { rotation: 0 },
      properties: { rotation: 30 },
      position: 0,
      resolvedStart: 0,
      duration: 0,
    } as unknown as GsapAnimation;
    const commitMutation = vi.fn();

    const handled = await tryGsapRotationIntercept(
      selection,
      75,
      [rotationHold],
      null,
      commitMutation,
    );

    expect(handled).toEqual({ status: "persisted" });
    expect(commitMutation).toHaveBeenCalledTimes(1);
    expect(commitMutation.mock.calls[0]![1]).toEqual({
      type: "update-property",
      animationId: rotationHold.id,
      property: "rotation",
      value: 75,
    });
    const types = commitMutation.mock.calls.map(([, mutation]) => mutation.type);
    expect(types).not.toContain("convert-to-keyframes");
    expect(types).not.toContain("add-keyframe");
    expect(types).not.toContain("add");
  });
});

// Regression (#1808): with the global auto-keyframe toggle off, dragging an
// element that already has a keyframed position tween must shift the whole
// tween (a "replace-with-keyframes" carrying every original percentage) —
// the same path Alt-drag already takes — instead of inserting a keyframe at
// the playhead.
describe("tryGsapDragIntercept — autoKeyframeEnabled toggle (#1808)", () => {
  afterEach(() => {
    usePlayerStore.setState({ autoKeyframeEnabled: true });
  });

  const keyframedPositionAnim = {
    id: "#puck-b-to-position",
    targetSelector: "#puck-b",
    propertyGroup: "position",
    method: "to",
    properties: {},
    position: 0,
    resolvedStart: 0,
    duration: 2,
    keyframes: {
      keyframes: [
        { percentage: 0, properties: { x: 0, y: 0 } },
        { percentage: 100, properties: { x: 100, y: 0 } },
      ],
    },
  } as unknown as GsapAnimation;

  async function runAutoKeyframeDrag(enabled: boolean) {
    usePlayerStore.setState({ autoKeyframeEnabled: enabled, currentTime: 2 });
    const commitMutation = vi.fn();
    const handled = await tryGsapDragIntercept(
      selection,
      { x: -50, y: 0 },
      [keyframedPositionAnim],
      fakeIframe("puck-b", []),
      commitMutation,
    );
    const mutations = commitMutation.mock.calls.map(([, mutation]) => mutation);
    return { handled, mutations, types: mutations.map((mutation) => mutation.type) };
  }

  it("shifts the whole tween instead of adding a keyframe when the toggle is off", async () => {
    const { handled, types } = await runAutoKeyframeDrag(false);
    expect(handled).toEqual({ status: "persisted" });
    expect(types).toContain("replace-with-keyframes");
    expect(types).not.toContain("add-keyframe");
  });

  it("shifts a linear flat tween as keyframes that stay linear", async () => {
    usePlayerStore.setState({ autoKeyframeEnabled: false, currentTime: 1 });
    const commitMutation = vi.fn();
    const linear = { ...stalePositionAnim, ease: "none" } as GsapAnimation;
    const live = {
      targets: () => [{ id: "puck-b" }],
      vars: { x: -180, y: -60, ease: "none" },
      duration: () => 2,
      startTime: () => 1,
    };
    await tryGsapDragIntercept(
      selection,
      { x: -50, y: 0 },
      [linear],
      fakeIframe("puck-b", [live]),
      commitMutation,
    );
    const [mutation] = commitMutation.mock.calls.map(([, m]) => m);
    expect(mutation).toMatchObject({ type: "replace-with-keyframes", easeEach: "none" });
    expect(mutation).not.toHaveProperty("ease", "none");
  });

  it("still changes only the keyframe at the playhead when the toggle is on (default)", async () => {
    const { handled, mutations } = await runAutoKeyframeDrag(true);
    expect(handled).toEqual({ status: "persisted" });
    expect(mutations).toEqual([
      expect.objectContaining({
        type: "replace-with-keyframes",
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 } },
          { percentage: 100, properties: { x: -50, y: 0 } },
        ],
      }),
    ]);
  });
});

describe("tryGsapDragIntercept — motion paths", () => {
  const motionPathAnim = {
    id: "#puck-b-to-12170-position",
    targetSelector: "#puck-b",
    propertyGroup: "position",
    method: "to",
    position: 12.17,
    resolvedStart: 12.17,
    duration: 16.055,
    ease: "power1.inOut",
    properties: {},
    keyframes: {
      keyframes: [
        { percentage: 0, properties: { x: -184, y: 326 } },
        { percentage: 50, properties: { x: 416, y: 804 } },
        { percentage: 100, properties: { x: 796, y: 237 } },
      ],
    },
    arcPath: {
      enabled: true,
      autoRotate: false,
      segments: [{ curviness: 1 }, { curviness: 1 }],
    },
  } as unknown as GsapAnimation;
  const liveTween = {
    targets: () => [{ id: "puck-b" }],
    vars: { motionPath: { path: [] }, duration: 16.055 },
    duration: () => 16.055,
    startTime: () => 12.17,
  };

  async function dragMotionPath(activeKeyframePct: number | null) {
    usePlayerStore.setState({
      autoKeyframeEnabled: true,
      activeKeyframePct,
      currentTime: 15.9,
    });
    const commitMutation = vi.fn();
    const handled = await tryGsapDragIntercept(
      selection,
      { x: -50, y: 30 },
      [motionPathAnim],
      fakeIframe("puck-b", [liveTween]),
      commitMutation,
    );
    return { commitMutation, handled };
  }

  afterEach(() => {
    usePlayerStore.setState({ activeKeyframePct: null });
  });

  it("creates a temporal keyframe at the exact playhead instead of redistributing path waypoints", async () => {
    const { commitMutation, handled } = await dragMotionPath(null);

    expect(handled).toEqual({ status: "persisted" });
    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      {
        type: "replace-with-keyframes",
        animationId: motionPathAnim.id,
        targetSelector: "#puck-b",
        position: 12.17,
        duration: 16.055,
        keyframes: [
          { percentage: 0, properties: { x: -184, y: 326 } },
          { percentage: 23.233, properties: { x: -50, y: 30 } },
          { percentage: 50, properties: { x: 416, y: 804 } },
          { percentage: 100, properties: { x: 796, y: 237 } },
        ],
        ease: "none",
      },
      expect.objectContaining({
        label: "Move layer (new keyframe)",
        keyframeAction: "add",
        softReload: true,
      }),
    );
    expect(commitMutation.mock.calls.map(([, mutation]) => mutation.type)).not.toContain(
      "add-motion-path-point",
    );
  });

  it("adds a node at a playhead past a duration-less arc, keeping the other nodes' times", async () => {
    usePlayerStore.setState({
      autoKeyframeEnabled: true,
      activeKeyframePct: null,
      currentTime: 15.9,
    });
    const durationless = { ...motionPathAnim, duration: undefined } as GsapAnimation;
    const commitMutation = vi.fn();
    await tryGsapDragIntercept(
      selection,
      { x: -50, y: 30 },
      [durationless],
      fakeIframe("puck-b", [
        { ...liveTween, vars: { motionPath: { path: [] } }, duration: () => 0.5 },
      ]),
      commitMutation,
    );
    // GSAP plays it 12.17-12.67 s; the nodes stay at 12.17, 12.42 and 12.67 s.
    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({
        type: "replace-with-keyframes",
        position: 12.17,
        duration: 3.73,
        keyframes: [
          { percentage: 0, properties: { x: -184, y: 326 } },
          { percentage: 6.7, properties: { x: 416, y: 804 } },
          { percentage: 13.4, properties: { x: 796, y: 237 } },
          { percentage: 100, properties: { x: -50, y: 30 } },
        ],
      }),
      expect.objectContaining({ label: "Move layer (new keyframe)", keyframeAction: "add" }),
    );
  });

  it("keeps an explicitly selected path waypoint as a spatial edit", async () => {
    const { commitMutation, handled } = await dragMotionPath(50);

    expect(handled).toEqual({ status: "persisted" });
    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      {
        type: "update-motion-path-point",
        animationId: motionPathAnim.id,
        pointIndex: 1,
        x: -50,
        y: 30,
      },
      expect.objectContaining({ label: "Move layer (waypoint)", softReload: true }),
    );
    expect(commitMutation.mock.calls.map(([, mutation]) => mutation.type)).not.toContain(
      "replace-with-keyframes",
    );
  });
});

describe("tryGsapDragIntercept — position self-heal", () => {
  const xyTween = {
    ...stalePositionAnim,
    id: "#puck-b-to-0-position",
    position: 0,
    resolvedStart: 0,
  };
  const centringSet = {
    id: "#puck-b-set-0-position",
    targetSelector: "#puck-b",
    propertyGroup: "position",
    method: "set",
    properties: { xPercent: -50, yPercent: -50 },
    position: 0,
    duration: 0,
  } as unknown as GsapAnimation;
  const xySet = { ...centringSet, properties: { x: 10, y: 20 } } as GsapAnimation;
  const liveTween = {
    targets: () => [{ id: "puck-b" }],
    vars: { x: -180, y: -60, duration: 2 },
    duration: () => 2,
    startTime: () => 0,
  };

  async function drag(second: GsapAnimation) {
    usePlayerStore.setState({ currentTime: 1 });
    const animations = [second, xyTween];
    const commitMutation = vi.fn();
    await tryGsapDragIntercept(
      selection,
      { x: -50, y: 30 },
      animations,
      fakeIframe("puck-b", [liveTween]),
      commitMutation,
      async () => animations,
    );
    return commitMutation.mock.calls.map(([, mutation]) => mutation);
  }

  it("keeps an xPercent/yPercent centring set and moves the x/y tween", async () => {
    const mutations = await drag(centringSet);
    expect(mutations.map((m) => m.type)).not.toContain("consolidate-position-writes");
    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations.every((m) => m.animationId === xyTween.id)).toBe(true);
  });

  it("consolidates a second x/y write", async () => {
    const mutations = await drag(xySet);
    expect(mutations[0]).toMatchObject({
      type: "consolidate-position-writes",
      keepAnimationId: xyTween.id,
    });
  });
});
