// @vitest-environment happy-dom
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import {
  applyArcKeyframeAtPlayhead,
  animatedProps,
  isPlayheadWithinTween,
  promoteSetToKeyframes,
  resolveNewTweenRange,
  useEnableKeyframes,
  type EnableKeyframesSession,
} from "./useEnableKeyframes";
import { buildExtendedKeyframes } from "./gsapDragPositionCommit";
import { usePlayerStore } from "../player/store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function anim(overrides: Partial<GsapAnimation>): GsapAnimation {
  return {
    id: "#el-to-0-position",
    targetSelector: "#el",
    method: "to",
    position: 0,
    properties: {},
    ...overrides,
  };
}

describe("resolveNewTweenRange", () => {
  // Regression: "add a keyframe" must land at the PLAYHEAD. The runtime auto-stamps
  // data-start="0" + data-duration=<rootDuration> on every GSAP element, so honoring
  // data-start as authored timing put the keyframe at 0. Clamping the playhead into
  // the element's range fixes it (auto-stamp's full range passes the playhead through).
  it("anchors at the playhead through the auto-stamped full-composition range", () => {
    // data-start="0", data-duration="14" (the auto-stamp), playhead 4.9 → 4.9
    expect(resolveNewTweenRange("0", "14", 4.9)).toEqual({ start: 4.9, duration: 9.1 });
  });

  it("anchors at the playhead when the element has no authored range", () => {
    expect(resolveNewTweenRange(undefined, undefined, 4)).toEqual({ start: 4, duration: 1 });
    expect(resolveNewTweenRange(undefined, undefined, 6.123456).start).toBe(6.123);
  });

  it("never returns a negative start", () => {
    expect(resolveNewTweenRange(undefined, undefined, -2).start).toBe(0);
  });

  it("clamps the playhead into a genuinely narrow authored clip", () => {
    // clip [2.5, 8]: inside → playhead; before → start; after → end
    expect(resolveNewTweenRange("2.5", "5.5", 4)).toEqual({ start: 4, duration: 4 });
    expect(resolveNewTweenRange("2.5", "5.5", 1).start).toBe(2.5);
    expect(resolveNewTweenRange("2.5", "5.5", 99).start).toBe(8);
  });
});

describe("animatedProps", () => {
  it("uses top-level properties when present (flat tween)", () => {
    expect(animatedProps(anim({ properties: { x: -260 } }))).toEqual(["x"]);
  });

  it("derives props from keyframe stops when top-level properties is empty (array form)", () => {
    // Regression: array-form `keyframes: [{x,y},…]` leaves `properties` empty, so
    // add-keyframe read an empty prop list → empty position → silent no-op.
    const a = anim({
      properties: {},
      keyframes: {
        format: "object-array",
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 } },
          { percentage: 100, properties: { x: -460, y: -20 } },
        ],
      },
    });
    expect(animatedProps(a).sort()).toEqual(["x", "y"]);
  });

  it("falls back to x/y for a null anim or one with no resolvable props", () => {
    expect(animatedProps(null)).toEqual(["x", "y"]);
    expect(animatedProps(anim({ properties: {} }))).toEqual(["x", "y"]);
  });
});

describe("isPlayheadWithinTween", () => {
  const tween = anim({ position: 1.0, duration: 3.4 }); // range [1.0, 4.4]

  it("is true inside the range (incl. boundaries)", () => {
    expect(isPlayheadWithinTween(tween, 3.0)).toBe(true);
    expect(isPlayheadWithinTween(tween, 1.0)).toBe(true);
    expect(isPlayheadWithinTween(tween, 4.4)).toBe(true);
  });

  it("is false outside the tween range", () => {
    expect(isPlayheadWithinTween(tween, 5.767)).toBe(false);
    expect(isPlayheadWithinTween(tween, 0.5)).toBe(false);
  });

  it("does not block when the start can't be resolved", () => {
    expect(isPlayheadWithinTween(anim({ position: "+=1" }), 99)).toBe(true);
  });

  it("uses the window GSAP plays a duration-less tween in, not its clip", () => {
    const durationless = anim({ position: 0 });

    expect(isPlayheadWithinTween(durationless, 0.4)).toBe(true);
    expect(isPlayheadWithinTween(durationless, 5)).toBe(false);
  });
});

describe("buildExtendedKeyframes", () => {
  // puck-b: tween [1.0, 4.4], four evenly-distributed stops.
  const kfAnim = anim({
    position: 1.0,
    duration: 3.4,
    keyframes: {
      format: "object-array",
      keyframes: [
        { percentage: 0, properties: { x: 0, y: 0 } },
        { percentage: 33.3, properties: { x: -180, y: -60 } },
        { percentage: 66.7, properties: { x: -320, y: 40 } },
        { percentage: 100, properties: { x: -460, y: -20 } },
      ],
    },
  });

  it("extends the end and rescales existing stops to keep their absolute timing", () => {
    const out = buildExtendedKeyframes(kfAnim, 5.767, { x: -460, y: -20 });
    expect(out.position).toBe(1.0); // start unchanged
    expect(out.duration).toBe(4.767); // grown to reach the playhead
    // old end (abs 4.4) is no longer 100% — it slid back inside the longer range
    const last = out.keyframes[out.keyframes.length - 1]!;
    expect(last.percentage).toBe(100); // the new keyframe sits at the new end
    expect(last.properties).toEqual({ x: -460, y: -20 });
    expect(out.keyframes[0]!.percentage).toBe(0); // old start still anchors 0%
    expect(out.keyframes.some((k) => k.percentage > 0 && k.percentage < 100)).toBe(true);
  });

  it("extends the start when the playhead precedes the tween", () => {
    const out = buildExtendedKeyframes(kfAnim, 0, { x: 0, y: 0 });
    expect(out.position).toBe(0); // start moved back to the playhead
    expect(out.duration).toBe(4.4); // end (abs 4.4) unchanged
    expect(out.keyframes[0]).toEqual({ percentage: 0, properties: { x: 0, y: 0 } });
    // the old first stop (abs 1.0) is now partway in: 1.0 / 4.4 ≈ 22.7%
    expect(out.keyframes[1]!.percentage).toBeCloseTo(22.7, 1);
  });
});

describe("promoteSetToKeyframes — auto endpoint", () => {
  it("marks the 0% (held start) as `auto`, leaving the 100% (playhead) fixed", async () => {
    let committed: Record<string, unknown> | undefined;
    const session = {
      commitMutation: async (mutation: Record<string, unknown>) => {
        committed = mutation;
      },
    } as unknown as EnableKeyframesSession;
    const sel = {
      id: "card",
      selector: "#card",
      sourceFile: "index.html",
      element: { isConnected: true } as unknown as HTMLElement,
    } as unknown as DomEditSelection;
    // readElementPosition reads gsap.getProperty off the iframe window.
    const iframe = {
      contentWindow: { gsap: { getProperty: () => -74 } },
    } as unknown as HTMLIFrameElement;
    const setAnim = anim({
      id: "#card-set-0-position",
      targetSelector: "#card",
      method: "set",
      global: true,
      resolvedStart: 0,
      properties: { x: -74, y: -469 },
    });

    await promoteSetToKeyframes(session, sel, setAnim, 1, iframe);

    const kfs = committed?.keyframes as Array<{ percentage: number; auto?: boolean }>;
    expect(committed?.type).toBe("replace-with-keyframes");
    expect(kfs[0]).toMatchObject({ percentage: 0, auto: true });
    expect(kfs[1].percentage).toBe(100);
    expect(kfs[1].auto).toBeUndefined();
  });

  it("playhead AT the set (t <= setStart) drops a single 0% keyframe, not a no-op", async () => {
    // Regression: enabling keyframes on a `gsap.set` element at t=0 (set start 0)
    // returned early (`t <= setStart`) → nothing created. Must give a 0% keyframe.
    let committed: Record<string, unknown> | undefined;
    const session = {
      commitMutation: async (mutation: Record<string, unknown>) => {
        committed = mutation;
      },
    } as unknown as EnableKeyframesSession;
    const sel = {
      id: "box",
      selector: "#box",
      sourceFile: "index.html",
      element: { isConnected: true } as unknown as HTMLElement,
    } as unknown as DomEditSelection;
    const iframe = {
      contentWindow: { gsap: { getProperty: () => -1091 } },
    } as unknown as HTMLIFrameElement;
    const setAnim = anim({
      id: "#box-set-0-position",
      targetSelector: "#box",
      method: "set",
      global: true,
      resolvedStart: 0,
      properties: { x: -1091, y: 280 },
    });

    await promoteSetToKeyframes(session, sel, setAnim, 0, iframe);

    const kfs = committed?.keyframes as Array<{ percentage: number }>;
    expect(committed?.type).toBe("replace-with-keyframes");
    expect(kfs).toHaveLength(1);
    expect(kfs[0].percentage).toBe(0);
  });
});

describe("applyArcKeyframeAtPlayhead", () => {
  const arcAnim = anim({
    id: "#el-to-0-position",
    position: 0,
    duration: 10,
    ease: "none",
    keyframes: {
      format: "object-array",
      keyframes: [
        { percentage: 0, properties: { x: 0, y: 0 } },
        { percentage: 50, properties: { x: 50, y: 50 } },
        { percentage: 100, properties: { x: 100, y: 0 } },
      ],
    },
    arcPath: {
      enabled: true,
      autoRotate: false,
      segments: [{ curviness: 1 }, { curviness: 1 }],
    },
  });

  function arcFixture(x: number, y: number) {
    const commitMutation = vi.fn(async () => undefined);
    const session = { commitMutation } as unknown as EnableKeyframesSession;
    const sel = {
      id: "el",
      selector: "#el",
      element: { isConnected: true } as HTMLElement,
      dataAttributes: { duration: "10" },
    } as DomEditSelection;
    const iframe = {
      contentWindow: {
        gsap: { getProperty: (_element: Element, property: string) => (property === "x" ? x : y) },
      },
    } as unknown as HTMLIFrameElement;
    return { commitMutation, iframe, sel, session };
  }

  it("removes an existing interior stop without redistributing the remaining times", async () => {
    const fixture = arcFixture(50, 50);
    await applyArcKeyframeAtPlayhead(fixture.session, fixture.sel, arcAnim, 5, fixture.iframe);
    expect(fixture.commitMutation).toHaveBeenCalledWith(
      {
        type: "replace-with-keyframes",
        animationId: arcAnim.id,
        targetSelector: "#el",
        position: 0,
        duration: 10,
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 } },
          { percentage: 100, properties: { x: 100, y: 0 } },
        ],
        ease: "none",
      },
      { label: "Remove keyframe", softReload: true },
    );
  });

  it("preserves the path endpoints", async () => {
    const fixture = arcFixture(0, 0);
    await applyArcKeyframeAtPlayhead(fixture.session, fixture.sel, arcAnim, 0, fixture.iframe);
    expect(fixture.commitMutation).not.toHaveBeenCalled();
  });

  it("adds a temporal keyframe at the exact playhead while preserving authored times", async () => {
    const fixture = arcFixture(25, 25);
    await applyArcKeyframeAtPlayhead(fixture.session, fixture.sel, arcAnim, 2.5, fixture.iframe);
    expect(fixture.commitMutation).toHaveBeenCalledWith(
      {
        type: "replace-with-keyframes",
        animationId: arcAnim.id,
        targetSelector: "#el",
        position: 0,
        duration: 10,
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 } },
          { percentage: 25, properties: { x: 25, y: 25 } },
          { percentage: 50, properties: { x: 50, y: 50 } },
          { percentage: 100, properties: { x: 100, y: 0 } },
        ],
        ease: "none",
      },
      { label: "Add keyframe", softReload: true, keyframeAction: "add" },
    );
  });

  it("extends a duration-less arc to a later playhead, keeping the other nodes' times", async () => {
    const fixture = arcFixture(100, 0);
    const durationlessArc = { ...arcAnim, duration: undefined };

    await applyArcKeyframeAtPlayhead(
      fixture.session,
      fixture.sel,
      durationlessArc,
      2.5,
      fixture.iframe,
    );

    // GSAP plays it 0-0.5 s, so the nodes stay at 0, 0.25 and 0.5 s.
    expect(fixture.commitMutation).toHaveBeenCalledWith(
      {
        type: "replace-with-keyframes",
        animationId: arcAnim.id,
        targetSelector: "#el",
        position: 0,
        duration: 2.5,
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 } },
          { percentage: 10, properties: { x: 50, y: 50 } },
          { percentage: 20, properties: { x: 100, y: 0 } },
          { percentage: 100, properties: { x: 100, y: 0 } },
        ],
        ease: "none",
      },
      { label: "Add keyframe", softReload: true, keyframeAction: "add" },
    );
  });
});

function renderEnableKeyframes(session: EnableKeyframesSession): () => Promise<void> {
  let enable: (() => Promise<void>) | null = null;
  function Probe() {
    const sessionRef = useRef<EnableKeyframesSession | undefined>(session);
    enable = useEnableKeyframes(sessionRef);
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(createElement(Probe)));
  cleanup = () => act(() => root.unmount());
  if (!enable) throw new Error("hook did not initialize");
  return enable;
}

function flatTweenResponses(flat: GsapAnimation, converted: GsapAnimation) {
  const responses = [{ animations: [flat] }, { animations: [converted] }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => responses.shift() ?? { animations: [] },
    })),
  );
}

function makeElementSelection(): DomEditSelection {
  const element = document.body.appendChild(document.createElement("div"));
  element.id = "el";
  return {
    id: "el",
    selector: "#el",
    sourceFile: "index.html",
    element,
  } as DomEditSelection;
}

function stubFlatTweenConversion(
  id: string,
  easeEach?: string,
): {
  flat: GsapAnimation;
  converted: GsapAnimation;
} {
  const flat = anim({ id, position: 1, duration: 1, properties: { x: 10 } });
  const converted = anim({
    id,
    position: 1,
    duration: 1,
    keyframes: {
      format: "object-array",
      keyframes: [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 100, properties: { x: 10 } },
      ],
      ...(easeEach && { easeEach }),
    },
  });
  flatTweenResponses(flat, converted);
  return { flat, converted };
}

describe("useEnableKeyframes — flat tween transaction", () => {
  beforeEach(() => {
    usePlayerStore.setState({ timelineProjectId: "test-project", previewBooted: true });
  });

  it("skips the convert reload and coalesces an outside-range terminal soft reload", async () => {
    window.location.hash = "#/project/test-project";
    usePlayerStore.setState({ currentTime: 3 });
    const selection = makeElementSelection();
    const { flat } = stubFlatTweenConversion("flat-1");
    const handleConvert = vi.fn(async () => undefined);
    const commitMutation = vi.fn(async () => undefined);
    const enable = renderEnableKeyframes({
      domEditSelection: selection,
      selectedGsapAnimations: [flat],
      previewIframeRef: {
        current: {
          contentWindow: { gsap: { getProperty: () => 10 } },
        } as unknown as HTMLIFrameElement,
      },
      handleGsapAddAnimation: vi.fn(),
      handleGsapConvertToKeyframes: handleConvert,
      handleGsapRemoveKeyframe: vi.fn(),
      commitMutation,
    });

    await act(async () => enable());

    const convertOptions = handleConvert.mock.calls[0]?.[3];
    const terminalOptions = commitMutation.mock.calls[0]?.[1];
    expect(convertOptions).toMatchObject({ skipReload: true, coalesceMs: Infinity });
    expect(terminalOptions).toMatchObject({
      softReload: true,
      coalesceKey: convertOptions?.coalesceKey,
    });
    expect(convertOptions?.coalesceKey).toEqual(expect.any(String));
  });

  it("keeps the converted tween's easeEach when it extends it to the playhead", async () => {
    window.location.hash = "#/project/test-project";
    usePlayerStore.setState({ currentTime: 3 });
    const { flat } = stubFlatTweenConversion("flat-1", "none");
    const commitMutation = vi.fn(async () => undefined);
    const enable = renderEnableKeyframes({
      domEditSelection: makeElementSelection(),
      selectedGsapAnimations: [flat],
      previewIframeRef: {
        current: {
          contentWindow: { gsap: { getProperty: () => 10 } },
        } as unknown as HTMLIFrameElement,
      },
      handleGsapAddAnimation: vi.fn(),
      handleGsapConvertToKeyframes: vi.fn(async () => undefined),
      handleGsapRemoveKeyframe: vi.fn(),
      commitMutation,
    });

    await act(async () => enable());

    expect(commitMutation.mock.calls[0]?.[0]).toMatchObject({
      type: "replace-with-keyframes",
      easeEach: "none",
    });
  });

  it("passes the convert coalesce key to an inside-range batch edit", async () => {
    window.location.hash = "#/project/test-project";
    usePlayerStore.setState({ currentTime: 1.5 });
    const selection = makeElementSelection();
    const { flat } = stubFlatTweenConversion("flat-2");
    const handleConvert = vi.fn(async () => undefined);
    const addKeyframeBatch = vi.fn(async () => undefined);
    const enable = renderEnableKeyframes({
      domEditSelection: selection,
      selectedGsapAnimations: [flat],
      previewIframeRef: {
        current: {
          contentWindow: { gsap: { getProperty: () => 5 } },
        } as unknown as HTMLIFrameElement,
      },
      handleGsapAddAnimation: vi.fn(),
      handleGsapConvertToKeyframes: handleConvert,
      handleGsapRemoveKeyframe: vi.fn(),
      handleGsapAddKeyframeBatch: addKeyframeBatch,
    });

    await act(async () => enable());

    const convertOptions = handleConvert.mock.calls[0]?.[3];
    expect(addKeyframeBatch.mock.calls[0]?.[3]).toEqual({
      softReload: true,
      coalesceKey: convertOptions?.coalesceKey,
      // Must carry the convert phase's infinite window so the inside-range
      // apply folds into one undo entry regardless of round-trip latency.
      coalesceMs: Infinity,
    });
  });
});

describe("useEnableKeyframes — new tween on a class-only element", () => {
  beforeEach(() => {
    usePlayerStore.setState({ timelineProjectId: "test-project", previewBooted: true });
  });

  it("targets the selected sibling alone, not every element sharing its class", async () => {
    window.location.hash = "#/project/test-project";
    usePlayerStore.setState({ currentTime: 1 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ animations: [] }) })),
    );
    const scene = document.body.appendChild(document.createElement("div"));
    scene.id = "scene";
    scene.innerHTML = '<i class="group"></i>'.repeat(5);
    const groups = Array.from(scene.querySelectorAll<HTMLElement>(".group"));
    const commitMutation = vi.fn(async () => undefined);
    const enable = renderEnableKeyframes({
      // A bare `.group` here writes `tl.to(".group", …)`, which animates all five
      // siblings and reads back as all five — one add wiped the timeline.
      domEditSelection: {
        selector: ".group",
        selectorIndex: 3,
        sourceFile: "index.html",
        element: groups[3],
        dataAttributes: { start: "0", duration: "2" },
      } as unknown as DomEditSelection,
      selectedGsapAnimations: [],
      previewIframeRef: {
        current: {
          contentWindow: { gsap: { getProperty: () => 7 } },
        } as unknown as HTMLIFrameElement,
      },
      handleGsapAddAnimation: vi.fn(),
      handleGsapConvertToKeyframes: vi.fn(),
      handleGsapRemoveKeyframe: vi.fn(),
      commitMutation,
    });

    await act(async () => enable());

    const mutation = commitMutation.mock.calls[0]?.[0] as { targetSelector: string };
    expect(mutation?.targetSelector).toBeTruthy();
    expect(document.querySelectorAll(mutation.targetSelector)).toHaveLength(1);
    expect(document.querySelector(mutation.targetSelector)).toBe(groups[3]);
  });
});
