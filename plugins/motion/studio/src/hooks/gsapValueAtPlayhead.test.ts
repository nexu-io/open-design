// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { GSAP_EDIT_BLOCK_COPY, GsapEditBlockedError } from "./gsapEditOutcome";
import { boxSteps, liveTween, previewWith, tween } from "./gsapParsedTween.test-helpers";
import { tryGsapResizeIntercept } from "./gsapResizeIntercept";
import { tryGsapDragIntercept, tryGsapRotationIntercept } from "./gsapRuntimeBridge";
import { planValueAtPlayhead, planValueEdit, type PlayheadEdit } from "./gsapValueAtPlayhead";
import { STUDIO_EDIT_MOMENT_ATTR } from "../components/editor/manualEditsTypes";

let el: HTMLElement;
let selection: DomEditSelection;
beforeEach(() => {
  el = document.createElement("div");
  el.id = "box";
  document.body.append(el);
  selection = { id: "box", selector: "#box", element: el } as DomEditSelection;
});
afterEach(() => {
  el.remove();
  usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null });
});

/** Drags `#box` by `dx` from a pre-gesture GSAP position of `base`, at `time`. */
async function drag(
  anims: GsapAnimation[],
  live: unknown[],
  {
    time,
    base,
    dx,
    values = {},
  }: { time: number; base: [number, number]; dx: number; values?: Record<string, number> },
) {
  usePlayerStore.setState({ currentTime: time });
  el.setAttribute("data-hf-drag-gsap-base-x", String(base[0]));
  el.setAttribute("data-hf-drag-gsap-base-y", String(base[1]));
  const commitMutation = vi.fn();
  const outcome = await tryGsapDragIntercept(
    selection,
    { x: dx, y: 0 },
    anims,
    previewWith(el, live, values),
    commitMutation,
    async () => anims,
  );
  return { outcome, mutations: commitMutation.mock.calls.map((call) => call[1]) };
}

const fromX = tween({
  id: "#box-from-0-position",
  method: "from",
  properties: { x: -60 },
  resolvedStart: 0,
  duration: 2,
  ease: "none",
});
const fromXLive = (end: number) =>
  liveTween(
    el,
    { start: 0, duration: 2, vars: { x: -60, ease: "none" }, ends: { x: [-60, end] } },
    { from: true },
  );

/** Two linear `to` tweens of `group` on `#box`, 0-2s then 2-3s, their live copies and a commit recorder. */
function backToBack(
  group: "size" | "scale" | "rotation",
  firstEnd: Record<string, number>,
  secondEnd: Record<string, number>,
) {
  const flat = (start: number, duration: number, properties: Record<string, number>) =>
    tween({
      id: `#box-to-${start * 1000}-${group}`,
      propertyGroup: group,
      method: "to",
      properties,
      resolvedStart: start,
      duration,
      ease: "none",
    });
  const tweens = [flat(0, 2, firstEnd), flat(2, 1, secondEnd)];
  const live = tweens.map((a) =>
    liveTween(el, { start: a.resolvedStart!, duration: a.duration!, vars: a.properties }),
  );
  const commitMutation = vi.fn();
  const written = () => commitMutation.mock.calls.map((call) => call[1]);
  return { tweens, live, commitMutation, written };
}

describe("a move on a GSAP-animated layer, at the playhead", () => {
  it("adds a keyframe inside a from() tween and keeps its end where GSAP parsed it", async () => {
    const { outcome, mutations } = await drag([fromX], [fromXLive(40)], {
      time: 1,
      base: [-10, 0],
      dx: 30,
    });
    expect(outcome).toEqual({ status: "persisted" });
    expect(mutations).toEqual([
      expect.objectContaining({
        type: "replace-with-keyframes",
        animationId: "#box-from-0-position",
        position: 0,
        duration: 2,
        easeEach: "none",
        keyframes: [
          { percentage: 0, properties: { x: -60, y: 0 } },
          { percentage: 50, properties: { x: 20, y: 0 } },
          { percentage: 100, properties: { x: 40, y: 0 } },
        ],
      }),
    ]);
  });

  it("writes the end GSAP parsed from the file, not the dragged element's live value", async () => {
    const { mutations } = await drag([fromX], [fromXLive(40)], {
      time: 1,
      base: [-10, 0],
      dx: 30,
      values: { x: 999 },
    });
    expect(mutations[0].keyframes.at(-1)).toEqual({ percentage: 100, properties: { x: 40, y: 0 } });
  });

  it("extends a to() tween back to the playhead, holding the start GSAP folded from CSS translate", async () => {
    const toX = tween({
      id: "#box-to-2000-position",
      method: "to",
      properties: { x: 60 },
      resolvedStart: 2,
      duration: 1,
      ease: "none",
    });
    // `translate: 40px 30px` on the element: GSAP parses x from 40, not 0.
    const live = liveTween(el, { start: 2, duration: 1, vars: { x: 60 }, ends: { x: [40, 60] } });
    const { mutations } = await drag([toX], [live], { time: 1, base: [40, 0], dx: -20 });
    expect(mutations).toEqual([
      expect.objectContaining({
        animationId: "#box-to-2000-position",
        position: 1,
        duration: 2,
        easeEach: "none",
        keyframes: [
          { percentage: 0, properties: { x: 20, y: 0 } },
          { percentage: 50, properties: { x: 40, y: 0 } },
          { percentage: 100, properties: { x: 60, y: 0 } },
        ],
      }),
    ]);
  });

  it("refuses, with the Code tab message, when GSAP has not parsed the tween's end yet", async () => {
    const unparsed = liveTween(el, { start: 0, duration: 2, vars: { x: -60 } }, { from: true });
    const { outcome, mutations } = await drag([fromX], [unparsed], {
      time: 1,
      base: [-10, 0],
      dx: 30,
    });
    expect(outcome).toEqual({
      status: "blocked",
      reason: "keyframes-uneditable",
      detail: "implicit-end-unknown",
    });
    expect(mutations).toEqual([]);
    expect(GSAP_EDIT_BLOCK_COPY["keyframes-uneditable"]).toContain("Code tab");
  });

  it("adds a keyframe between two steps of a keyframes array", async () => {
    // The parse rounds the first step to 66.7%; GSAP times it at 2 s of 3.
    const { keys, live } = boxSteps([
      [2, { x: 60 }],
      [1, { x: 120 }],
    ]);
    const { mutations } = await drag([keys], [live(el)], { time: 1, base: [30, 0], dx: 10 });
    expect(mutations.map((m) => m.type)).toEqual(["replace-with-keyframes"]);
    // An array step eases linearly unless it says otherwise; percentage keyframes would not.
    expect(mutations[0].keyframes).toEqual([
      { percentage: 33.333, properties: { x: 40, y: 0 }, ease: "none" },
      { percentage: 66.667, properties: { x: 60, y: 0 }, ease: "none" },
      { percentage: 100, properties: { x: 120, y: 0 }, ease: "none" },
    ]);
  });

  it("keys the time the drag was pressed at, wherever the playhead is when it commits", async () => {
    const { keys, live } = boxSteps([
      [2, { x: 60 }],
      [1, { x: 120 }],
    ]);
    el.setAttribute(STUDIO_EDIT_MOMENT_ATTR, JSON.stringify({ time: 1, keyframePct: null }));
    const { mutations } = await drag([keys], [live(el)], { time: 2, base: [30, 0], dx: 10 });
    expect(mutations[0].keyframes[0]).toEqual({
      percentage: 33.333,
      properties: { x: 40, y: 0 },
      ease: "none",
    });
  });

  it("never writes x and y into a tween that only animates size", async () => {
    const size = tween({
      id: "#box-to-0-size",
      propertyGroup: "size",
      method: "to",
      properties: {},
      resolvedStart: 0,
      duration: 2,
      keyframes: {
        format: "percentage",
        keyframes: [{ percentage: 100, properties: { width: 300 } }],
      },
    });
    const live = liveTween(el, {
      start: 0,
      duration: 2,
      vars: { keyframes: { "100%": { width: 300 } } },
    });
    const { mutations } = await drag([size], [live], { time: 1, base: [0, 0], dx: 10 });
    expect(mutations.some((m) => m.animationId === "#box-to-0-size")).toBe(false);
  });
});

describe("where two tweens meet at the playhead", () => {
  it("edits the one whose keyframe the file states there, not the one listed first", async () => {
    const fromTo = tween({
      id: "#box-fromTo-2000-position",
      method: "fromTo",
      fromProperties: { x: 0 },
      properties: { x: 60 },
      resolvedStart: 2,
      duration: 1,
      ease: "none",
    });
    const live = liveTween(el, { start: 2, duration: 1, vars: { x: 60 }, ends: { x: [0, 60] } });
    const { mutations } = await drag([fromX, fromTo], [fromXLive(40), live], {
      time: 2,
      base: [0, 0],
      dx: 25,
    });
    expect(mutations).toEqual([
      expect.objectContaining({
        animationId: "#box-fromTo-2000-position",
        easeEach: "none",
        keyframes: [
          { percentage: 0, properties: { x: 25, y: 0 } },
          { percentage: 100, properties: { x: 60, y: 0 } },
        ],
      }),
    ]);
  });
});

describe("a resize on a layer whose size GSAP animates, at the playhead", () => {
  it("adds a size keyframe inside the tween at the playhead", async () => {
    const { tweens, live, commitMutation, written } = backToBack(
      "size",
      { width: 300, height: 200 },
      { width: 360, height: 240 },
    );
    usePlayerStore.setState({ currentTime: 1 });
    await tryGsapResizeIntercept(
      selection,
      { width: 330, height: 210 },
      tweens,
      previewWith(el, live),
      commitMutation,
    );
    expect(written()).toEqual([
      expect.objectContaining({
        type: "replace-with-keyframes",
        animationId: "#box-to-0-size",
        easeEach: "none",
        keyframes: [
          { percentage: 50, properties: { width: 330, height: 210 } },
          { percentage: 100, properties: { width: 300, height: 200 } },
        ],
      }),
    ]);
  });
});

describe("a resize on a layer whose scale GSAP animates, at the playhead", () => {
  it("adds a scale keyframe inside the tween at the playhead and leaves the next tween alone", async () => {
    const { tweens, live, commitMutation, written } = backToBack(
      "scale",
      { scale: 1.25 },
      { scale: 1.5 },
    );
    el.setAttribute("data-hf-studio-original-box-width", "240");
    el.setAttribute("data-hf-studio-original-box-height", "160");
    usePlayerStore.setState({ currentTime: 1 });
    // Dropped at 1.5x the box with a live scale of 1.125, the playhead's value of the first tween.
    await tryGsapResizeIntercept(
      selection,
      { width: 320, height: 213.333 },
      tweens,
      previewWith(el, live, { scaleX: 1.125, scaleY: 1.125 }),
      commitMutation,
    );
    const writes = written();
    expect(writes[0]).toMatchObject({
      type: "replace-with-keyframes",
      animationId: "#box-to-0-scale",
      easeEach: "none",
      keyframes: [
        { percentage: 50, properties: { scale: 1.5 } },
        { percentage: 100, properties: { scale: 1.25 } },
      ],
    });
    expect(writes.some((m) => m.animationId === "#box-to-2000-scale")).toBe(false);
  });
});

describe("a resize inside one gesture, on a tween that mixes size and position", () => {
  it("writes the size and the anchor move once, into the tween the file has", async () => {
    const keys = tween({
      id: "#box-to-0",
      propertyGroup: undefined,
      method: "to",
      properties: {},
      resolvedStart: 0,
      duration: 3,
      keyframes: {
        format: "object-array",
        keyframes: [
          { percentage: 66.667, properties: { x: 60, width: 280 }, ease: "none" },
          { percentage: 100, properties: { x: 120, width: 320 }, ease: "none" },
        ],
      },
    });
    el.setAttribute("data-hf-studio-original-box-width", "260");
    el.setAttribute("data-hf-studio-original-box-height", "160");
    el.setAttribute("data-hf-drag-gsap-base-x", "50");
    el.setAttribute("data-hf-drag-gsap-base-y", "30");
    const live = liveTween(el, { start: 0, duration: 3, vars: { keyframes: [] } });
    usePlayerStore.setState({ currentTime: 1 });
    // A gesture buffers its writes: the file the intercept reads back stays as it was.
    const commitMutation = vi.fn();
    const outcome = await tryGsapResizeIntercept(
      selection,
      { width: 300, height: 200 },
      [keys],
      previewWith(el, [live]),
      commitMutation,
      async () => [keys],
      { x: -40, y: -40 },
    );
    expect(outcome).toMatchObject({ status: "persisted", ownsDragOffset: true });
    expect(commitMutation.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        type: "replace-with-keyframes",
        animationId: "#box-to-0",
        keyframes: [
          {
            percentage: 33.333,
            properties: { width: 300, height: 200, x: 10, y: -10 },
            ease: "none",
          },
          {
            percentage: 66.667,
            properties: { x: 60, width: 280, height: 160, y: 30 },
            ease: "none",
          },
          { percentage: 100, properties: { x: 120, width: 320, height: 160, y: 30 }, ease: "none" },
        ],
      }),
    ]);
  });
});

describe("a rotate on a GSAP-animated layer, at the playhead", () => {
  it("changes the keyframe two flat tweens meet at, on the tween that states it", async () => {
    const { tweens, live, commitMutation, written } = backToBack(
      "rotation",
      { rotation: 20 },
      { rotation: 40 },
    );
    usePlayerStore.setState({ currentTime: 2 });
    await tryGsapRotationIntercept(selection, 25, tweens, previewWith(el, live), commitMutation);
    expect(written()).toEqual([
      expect.objectContaining({
        type: "replace-with-keyframes",
        animationId: "#box-to-0-rotation",
        position: 0,
        duration: 2,
        easeEach: "none",
        keyframes: [{ percentage: 100, properties: { rotation: 25 } }],
      }),
    ]);
  });
});

describe("a rotate on a layer whose tween turns it on another axis", () => {
  it("holds the new rotation across the whole tween, so the layer does not turn before the playhead", async () => {
    const flip = tween({
      id: "#box-to-0-rotation",
      propertyGroup: "rotation",
      method: "to",
      properties: { rotationY: 180 },
      resolvedStart: 0,
      duration: 2,
      ease: "none",
    });
    usePlayerStore.setState({ currentTime: 1 });
    const commitMutation = vi.fn();
    const live = [liveTween(el, { start: 0, duration: 2, vars: flip.properties })];
    await tryGsapRotationIntercept(selection, 45, [flip], previewWith(el, live), commitMutation);
    expect(commitMutation.mock.calls.map((call) => call[1].keyframes)).toEqual([
      [
        { percentage: 0, properties: { rotation: 45 } },
        { percentage: 50, properties: { rotation: 45 } },
        { percentage: 100, properties: { rotationY: 180, rotation: 45 } },
      ],
    ]);
  });
});

describe("planValueAtPlayhead", () => {
  const plan = (edit: Partial<PlayheadEdit>) =>
    planValueAtPlayhead({
      anim: tween({ method: "to", properties: {}, resolvedStart: 0, duration: 4 }),
      at: { time: 2 },
      values: {},
      implicitEndValue: () => null,
      ...edit,
    });
  const kf = (
    keyframes: Array<{ percentage: number; properties: Record<string, number> }>,
    easeEach?: string,
  ) =>
    tween({
      method: "to",
      properties: {},
      resolvedStart: 0,
      duration: 4,
      keyframes: { format: "percentage", keyframes, ...(easeEach && { easeEach }) },
    });

  it("changes the keyframe under the playhead and no other", () => {
    const result = plan({
      anim: kf([
        { percentage: 0, properties: { x: 0 } },
        { percentage: 50, properties: { x: 10 } },
        { percentage: 100, properties: { x: 20 } },
      ]),
      values: { x: 15 },
    });
    expect(result.ok && result.mutation.keyframes.map((k) => k.properties.x)).toEqual([0, 15, 20]);
  });

  it("reports an add only when it writes a keyframe the tween did not have", () => {
    const changed = plan({
      anim: kf([
        { percentage: 0, properties: { x: 0 } },
        { percentage: 100, properties: { x: 20 } },
      ]),
      at: { time: 4 },
      values: { x: 15 },
    });
    const held = plan({
      anim: kf([{ percentage: 100, properties: { x: 20 } }]),
      at: { time: 4 },
      values: { y: 5 },
      backfill: { y: 0 },
      holdFromStart: true,
    });
    expect(changed.ok && changed.added).toBe(false);
    expect(held.ok && held.mutation.keyframes.length).toBe(2);
    expect(held.ok && held.added).toBe(true);
  });

  it("eases the new segment like the one it splits", () => {
    const result = plan({
      anim: kf([{ percentage: 100, properties: { x: 20 } }], "power2.in"),
      at: { time: 1 },
      values: { x: 5 },
    });
    expect(result.ok && result.mutation).toMatchObject({
      easeEach: "power2.in",
      keyframes: [
        { percentage: 25, properties: { x: 5 } },
        { percentage: 100, properties: { x: 20 } },
      ],
    });
  });

  it("extends past the end and keeps the authored end where it was", () => {
    const result = plan({
      anim: tween({
        method: "to",
        properties: { width: 300 },
        resolvedStart: 0,
        duration: 2,
        ease: "none",
      }),
      at: { time: 3 },
      values: { width: 400 },
    });
    expect(result.ok && result.mutation).toMatchObject({
      position: 0,
      duration: 3,
      easeEach: "none",
      keyframes: [
        { percentage: 66.667, properties: { width: 300 } },
        { percentage: 100, properties: { width: 400 } },
      ],
    });
  });

  it("splits a uniform scale into longhands for a per-axis edit", () => {
    const result = plan({
      anim: tween({
        method: "to",
        properties: { scale: 1.25 },
        resolvedStart: 0,
        duration: 4,
        ease: "none",
      }),
      values: { scaleX: 1.5, scaleY: 1.1 },
    });
    expect(result.ok && result.mutation.keyframes).toEqual([
      { percentage: 50, properties: { scaleX: 1.5, scaleY: 1.1 } },
      { percentage: 100, properties: { scaleX: 1.25, scaleY: 1.25 } },
    ]);
  });

  it("refuses a step that leaves a channel out when GSAP's start for it is unknown", () => {
    const anim = kf([
      { percentage: 50, properties: {} },
      { percentage: 100, properties: { x: 20 } },
    ]);
    const steps = { ...anim, keyframes: { ...anim.keyframes!, format: "object-array" as const } };
    expect(plan({ anim: steps, at: { percentage: 100 }, values: { x: 5 } })).toEqual({
      ok: false,
      reason: "implicit-end-unknown",
    });
  });

  it("changes the nearer of two keyframes under 1% apart", () => {
    const anim = kf([
      { percentage: 50, properties: { x: 100 } },
      { percentage: 50.5, properties: { x: 100 } },
      { percentage: 100, properties: { x: 100 } },
    ]);
    const result = plan({ anim, at: { percentage: 50.5 }, values: { x: 150 } });
    expect(result.ok && result.mutation.keyframes.map((k) => k.properties.x)).toEqual([
      100, 150, 100,
    ]);
  });

  describe("keyframes eased as a whole", () => {
    const eased = {
      ...kf([
        { percentage: 0, properties: { x: 0 } },
        { percentage: 100, properties: { x: 20 } },
      ]),
      ease: "power2.out",
    };

    it("changes the keyframe under the playhead and writes the ease back", () => {
      const result = plan({ anim: eased, at: { time: 4 }, values: { x: 5 } });
      expect(result.ok && result.mutation.keyframes.map((k) => k.properties.x)).toEqual([0, 5]);
      expect(result.ok && result.mutation.ease).toBe("power2.out");
    });

    it("writes the keyframes' own ease as the tween's, as GSAP prefers it", () => {
      const anim = { ...eased, keyframes: { ...eased.keyframes!, ease: "expo.in" } };
      const result = plan({ anim, at: { time: 0 }, values: { x: 5 } });
      expect(result.ok && result.mutation.ease).toBe("expo.in");
    });

    it("refuses an inner keyframe, which the ease shows at another time", () => {
      const anim = {
        ...kf([
          { percentage: 0, properties: { x: 0 } },
          { percentage: 50, properties: { x: 100 } },
          { percentage: 100, properties: { x: 300 } },
        ]),
        ease: "power2.out",
      };
      expect(plan({ anim, at: { time: 2 }, values: { x: 5 } })).toEqual({
        ok: false,
        reason: "eased-keyframes",
      });
    });

    it("refuses an inner node of a motionPath tween, which GSAP runs power1.out", () => {
      const path = kf([
        { percentage: 0, properties: { x: 0 } },
        { percentage: 50, properties: { x: 100 } },
        { percentage: 100, properties: { x: 300 } },
      ]);
      const anim = { ...path, keyframes: { ...path.keyframes!, fromMotionPath: true as const } };
      expect(plan({ anim, at: { time: 2 }, values: { x: 5 } })).toEqual({
        ok: false,
        reason: "eased-keyframes",
      });
    });

    it("changes an inner keyframe picked by its percentage, which the ease does not move", () => {
      const anim = {
        ...kf([
          { percentage: 0, properties: { x: 0 } },
          { percentage: 50, properties: { x: 100 } },
          { percentage: 100, properties: { x: 300 } },
        ]),
        ease: "power2.out",
      };
      const result = plan({ anim, at: { percentage: 50 }, values: { x: 5 } });
      expect(result.ok && result.mutation.keyframes.map((k) => k.properties.x)).toEqual([
        0, 5, 300,
      ]);
      expect(result.ok && result.mutation.ease).toBe("power2.out");
    });

    it("refuses to add a keyframe at a percentage, whose time the ease would move", () => {
      expect(plan({ anim: eased, at: { percentage: 40 }, values: { x: 5 } })).toEqual({
        ok: false,
        reason: "eased-keyframes",
      });
    });

    it("refuses to add a keyframe, whose time the ease would move", () => {
      expect(plan({ anim: eased, at: { time: 2 }, values: { x: 5 } })).toEqual({
        ok: false,
        reason: "eased-keyframes",
      });
      expect(plan({ anim: eased, at: { time: 6 }, values: { x: 5 } })).toEqual({
        ok: false,
        reason: "eased-keyframes",
      });
    });
  });
});

it("refuses a tween whose selector also animates a sibling, before it plans anything", () => {
  el.className = "card";
  const sibling = document.body.appendChild(document.createElement("div"));
  sibling.className = "card";
  const shared = tween({
    targetSelector: ".card",
    properties: { x: 100 },
    resolvedStart: 0,
    duration: 1,
  });

  expect(planValueEdit(selection, shared, { x: 40 }, null)).toEqual({
    ok: false,
    reason: "shared-tween",
  });
  sibling.remove();
});

describe("a keyframes array the percentage rewrite would change", () => {
  const steps = (
    properties: Array<Record<string, number | string>>,
    edit: Partial<PlayheadEdit> = {},
  ) =>
    planValueAtPlayhead({
      anim: tween({
        method: "to",
        properties: {},
        resolvedStart: 0,
        duration: 3,
        keyframes: {
          format: "object-array",
          keyframes: properties.map((p, i) => ({ percentage: ((i + 1) / 3) * 100, properties: p })),
        },
      }),
      at: { percentage: 100 },
      values: { x: 50 },
      implicitEndValue: () => 0,
      ...edit,
    });

  it.each([
    ["a step delay", { x: 100, delay: 0.5 }, "array-step-delay", "its own delay"],
    ["a step callback", { x: 100, onComplete: "__raw:done" }, "array-step-callback", "runs code"],
    [
      "an unlisted callback",
      { x: 100, onInterrupt: "__raw:stop" },
      "array-step-callback",
      "runs code",
    ],
    [
      "a step repeat",
      { x: 100, repeat: 2 },
      "array-step-config",
      "tween setting (like repeat or stagger)",
    ],
    ["a computed value", { x: "__raw:offset()" }, "array-step-computed", "comes from code"],
    ["a relative value", { x: "-=40" }, "array-step-relative", '"+=40"'],
    ["a random value", { x: "random(0, 300)" }, "array-step-random", "random()"],
    [
      "a random value inside a string",
      { filter: "blur(random(1, 9)px)" },
      "array-step-random",
      "random()",
    ],
  ] as const)("refuses %s and says so", (_, step, reason, says) => {
    expect(steps([{ x: 60 }, step, { x: 180 }])).toEqual({ ok: false, reason });
    const message = new GsapEditBlockedError("keyframes-uneditable", reason).message;
    expect(message).toContain(says);
    expect(message).toContain("Code tab");
  });

  it("rewrites absolute values, colours included", () => {
    const result = steps([{ x: 60, color: "#fff" }, { x: 120, color: "rgb(0, 0, 0)" }, { x: 180 }]);
    expect(result.ok && result.mutation.keyframes.map((k) => k.properties.x)).toEqual([
      60, 120, 50,
    ]);
  });

  it("holds a pause step at the dropped value of a channel the drop starts animating", () => {
    const result = steps([{ x: 60 }, {}, { x: 180 }], {
      at: { percentage: 100 / 3 },
      values: { x: 37, y: 11 },
      backfill: { y: 0 },
    });
    expect(result.ok && result.mutation.keyframes.map((k) => k.properties)).toEqual([
      { x: 37, y: 11 },
      { x: 37, y: 11 },
      { x: 180, y: 0 },
    ]);
  });
});
