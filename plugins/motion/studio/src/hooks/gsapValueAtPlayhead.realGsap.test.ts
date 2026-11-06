// @vitest-environment happy-dom
import { gsap } from "gsap";
import { parseGsapScriptAcorn } from "@hyperframes/parsers/gsap-parser-acorn";
import {
  replaceTweenWithKeyframesInScript,
  syncPositionHoldsBeforeKeyframes,
  updateKeyframeInScript,
} from "@hyperframes/parsers/gsap-writer-acorn";
import { afterEach, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { findParsedTween, parsedImplicitEndValue, parsedTweenEase } from "./gsapParsedTween";
import { readRuntimeKeyframes } from "./gsapRuntimeKeyframes";
import { GsapEditBlockedError } from "./gsapEditOutcome";
import { toClipKeyframes } from "./gsapShared";
import { commitValueAtPlayhead, planValueEdit } from "./gsapValueAtPlayhead";
import { applyKeyframeAtPlayhead, type EnableKeyframesSession } from "./useEnableKeyframes";

/** Runs a composition script as the preview does: a paused timeline, bound, then seeked to `at`. */
function play(script: string, at: number) {
  const win = { __timelines: {} as Record<string, gsap.core.Timeline> };
  new Function("gsap", "window", script)(gsap, win);
  const timeline = win.__timelines.t!;
  timeline.progress(0.0001, true).seek(at);
  return { timeline, iframe: { contentWindow: { ...win, gsap } } as unknown as HTMLIFrameElement };
}

/** Drags `#x` to `x` at `at`, writes the plan into the script, and replays the written file there. */
function dragAndReplay(
  script: string,
  x: number,
  at: number,
  selectedPct: number | null = null,
  { y, backfill }: { y?: number; backfill?: Record<string, number> } = {},
) {
  const box = document.body.appendChild(document.createElement("div"));
  box.id = "x";
  const { timeline, iframe } = play(script, at);
  usePlayerStore.setState({ currentTime: at, activeKeyframePct: selectedPct });
  const anim = parseGsapScriptAcorn(script).animations[0]!;
  const selection = { id: "x", selector: "#x", element: box } as DomEditSelection;
  const plan = planValueEdit(selection, anim, { x, ...(y != null && { y }) }, iframe, { backfill });
  timeline.kill();
  if (!plan.ok) return { plan };
  const written = replaceTweenWithKeyframesInScript(script, anim.id, plan.mutation)!;
  const replay = play(written, at);
  const shown = gsap.getProperty(box, "x");
  replay.timeline.kill();
  return { plan, written, shown };
}

const script = (vars: string) =>
  `var tl = gsap.timeline({ paused: true });\ntl.to("#x", { ${vars} }, 0);\nwindow.__timelines["t"] = tl;`;

afterEach(() => {
  document.body.replaceChildren();
  usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null });
});

it("edits a delayed tween with no authored ease, landing the value at the playhead", () => {
  const { plan, shown } = dragAndReplay(script("duration: 1, delay: 0.5, x: 100"), 200, 2);
  expect(plan.ok).toBe(true);
  expect(shown).toBe(200);
});

it("writes a delayed linear tween so GSAP shows the new value at the playhead, not later", () => {
  const { shown } = dragAndReplay(script("duration: 1, delay: 0.5, x: 100, ease: 'none'"), 200, 2);
  expect(shown).toBe(200);
});

it("reads plain array nodes where the lane puts them, though GSAP fills in step durations", () => {
  const source = script("keyframes: [{ x: 60 }, { x: 120 }, { x: 180 }], duration: 3");
  document.body.appendChild(document.createElement("div")).id = "x";
  const { timeline, iframe } = play(source, 0);
  const frame = { ...iframe, contentDocument: document } as HTMLIFrameElement;
  const read = readRuntimeKeyframes(frame, "#x");
  timeline.kill();
  const parsed = parseGsapScriptAcorn(source).animations[0]!.keyframes!.keyframes;
  expect(read?.keyframes.map((kf) => kf.percentage)).toEqual(parsed.map((kf) => kf.percentage));
});

// Three default 0.5 s steps stretched over 3 s: GSAP reaches the middle one at 2 s, where the parse
// places it at 66.7%.
it.each([
  ["at the playhead, timing array steps on their own timeline", undefined],
  ["selected in the lane, in place", 66.7],
])("changes the middle array keyframe %s", (_, selectedPct) => {
  const { plan, shown } = dragAndReplay(
    script("keyframes: [{ x: 60 }, { x: 120 }, { x: 180 }], duration: 3"),
    130,
    2,
    selectedPct,
  );
  expect(plan.ok && plan.mutation.keyframes.map((kf) => kf.properties.x)).toEqual([60, 130, 180]);
  expect(shown).toBeCloseTo(130, 2);
});

it("keeps an array step that leaves a channel out holding it, as GSAP played it", () => {
  const hold = "keyframes: [{ x: 60, duration: 1 }, { duration: 1 }, { x: 180, duration: 1 }]";
  const { written } = dragAndReplay(script(hold), 97, 1);
  const replay = play(written!, 2);
  expect(gsap.getProperty("#x", "x")).toBe(97);
  replay.timeline.kill();
});

it("holds a newly animated channel at rest through a step list's opening pause", () => {
  const pauseFirst =
    "keyframes: [{ duration: 1 }, { x: 60, duration: 1 }, { x: 180, duration: 1 }]";
  const { written } = dragAndReplay(script(pauseFirst), 37, 2, null, { y: 11, backfill: { y: 0 } });
  for (const [t, y] of [
    [0.5, 0],
    [2, 11],
  ]) {
    gsap.set("#x", { clearProps: "all" }); // a reloaded preview starts the tween from rest
    const replay = play(written!, t!);
    expect(gsap.getProperty("#x", "y")).toBeCloseTo(y!, 2);
    replay.timeline.kill();
  }
});

it("holds a channel at its start until the array step that first animates it", () => {
  const late = "keyframes: [{ x: 60 }, { x: 120, y: 50 }], duration: 2";
  const { written } = dragAndReplay(script(late), 200, 2);
  const replay = play(written!, 1);
  expect(gsap.getProperty("#x", "y")).toBe(0);
  replay.timeline.kill();
});

it("keeps GSAP's default ease, by name, for a tween that authors none", () => {
  const { plan } = dragAndReplay(script("duration: 1, x: 100"), 60, 0.5);
  expect(plan.ok && plan.mutation.easeEach).toBe("power1.out");
});

it("reads a tween the playhead has not reached without redrawing a sibling's live value", () => {
  const [x, y] = ["x", "y"].map((id) =>
    Object.assign(document.body.appendChild(document.createElement("div")), { id }),
  );
  const src = `var tl = gsap.timeline({ paused: true });
tl.to("#y", { x: 100, duration: 1, ease: "none" }, 0);
tl.to("#x", { x: 300, duration: 1 }, 2);
window.__timelines["t"] = tl;`;
  const { timeline, iframe } = play(src, 0.5);
  gsap.set(y!, { x: 77 });

  const tween = findParsedTween(iframe, x!, parseGsapScriptAcorn(src).animations[1]!);

  expect(parsedImplicitEndValue(tween)("x", "start")).toBe(0);
  expect(gsap.getProperty(y!, "x")).toBe(77);
  expect(timeline.time()).toBe(0.5);
  timeline.kill();
});

it("keeps a sibling's live attribute while reading an unplayed tween beside the runtime's filler", () => {
  const [x, y] = ["x", "y"].map((id) =>
    Object.assign(document.body.appendChild(document.createElement("div")), { id }),
  );
  y!.setAttribute("data-value", "0");
  const src = `var tl = gsap.timeline({ paused: true });
tl.to({}, { duration: 4, data: "hf-runtime-filler" }, 0);
tl.to("#y", { attr: { "data-value": 100 }, duration: 1, ease: "none" }, 0);
tl.to("#x", { x: 300, duration: 1 }, 2);
window.__timelines["t"] = tl;`;
  const { timeline, iframe } = play(src, 0.5);
  y!.setAttribute("data-value", "77");

  const tween = findParsedTween(iframe, x!, parseGsapScriptAcorn(src).animations.at(-1)!);

  expect(parsedImplicitEndValue(tween)("x", "start")).toBe(0);
  expect(y!.getAttribute("data-value")).toBe("77");
  timeline.kill();
});

it("reads a later tween's start from the earlier tween on the same layer, as playback does", () => {
  const x = Object.assign(document.body.appendChild(document.createElement("div")), { id: "x" });
  const src = `var tl = gsap.timeline({ paused: true });
tl.to("#x", { x: 50, duration: 4, ease: "none" }, 0);
tl.to("#x", { x: 100, duration: 1, ease: "none", overwrite: "auto" }, 2);
window.__timelines["t"] = tl;`;
  const { timeline, iframe } = play(src, 0.5);

  const tween = findParsedTween(iframe, x, parseGsapScriptAcorn(src).animations[1]!);

  expect(parsedImplicitEndValue(tween)("x", "start")).toBe(25);
  timeline.seek(2.5);
  expect(gsap.getProperty(x, "x")).toBe(62.5);
  timeline.kill();
});

it("saves a dragged keyframe tween with its authored start, not the drag's live value", () => {
  const box = Object.assign(document.body.appendChild(document.createElement("div")), { id: "x" });
  const src = script(
    "keyframes: { '0%': { opacity: 0 }, '100%': { opacity: 1, x: 300 } }, duration: 1, ease: 'none'",
  ).replace("}, 0);", "}, 2);");
  const { timeline, iframe } = play(src, 0.5);
  usePlayerStore.setState({ currentTime: 0.5, activeKeyframePct: null });
  gsap.set(box, { x: 77 });
  const anim = parseGsapScriptAcorn(src).animations[0]!;
  const selection = { id: "x", selector: "#x", element: box } as DomEditSelection;

  const plan = planValueEdit(selection, anim, { x: 77 }, iframe);
  timeline.kill();

  expect(plan.ok).toBe(true);
  if (!plan.ok) return;
  const written = replaceTweenWithKeyframesInScript(src, anim.id, plan.mutation)!;
  const at = (time: number) => {
    const replay = play(written, time);
    const x = gsap.getProperty(box, "x");
    replay.timeline.kill();
    return x;
  };
  expect(at(0.5)).toBe(77);
  expect(at(2)).toBe(0);
  expect(at(3)).toBe(300);
});

it("keeps a layer's other transform values while reading an unplayed tween", () => {
  const box = Object.assign(document.body.appendChild(document.createElement("div")), { id: "x" });
  const src = script(
    "keyframes: { '0%': { opacity: 0 }, '100%': { opacity: 1, x: 300 } }, duration: 1",
  ).replace("}, 0);", "}, 2);");
  const { timeline, iframe } = play(src, 0.5);
  gsap.set(box, {
    x: 77,
    skewX: 23,
    rotationX: 19,
    xPercent: 12,
    transformOrigin: "20px 30px 40px",
  });

  const tween = findParsedTween(iframe, box, parseGsapScriptAcorn(src).animations[0]!);
  timeline.kill();

  expect(parsedImplicitEndValue(tween)("x", "start")).toBe(0);
  const values = ["x", "skewX", "rotationX", "xPercent", "transformOrigin"];
  expect(values.map((p) => gsap.getProperty(box, p))).toEqual([77, 23, 19, 12, "20px 30px 40px"]);
});

it("names only an ease GSAP built in, and refuses a custom function rather than guess", () => {
  const custom = { vars: { ease: (p: number) => p * p } };
  const iframe = { contentWindow: { gsap } } as unknown as HTMLIFrameElement;
  expect(parsedTweenEase(iframe, { vars: { ease: gsap.parseEase("expo.in") } })).toBe("expo.in");
  expect(parsedTweenEase(iframe, custom)).toBeNull();
});

it("writes an edit into a looping tween and keeps its repeat and yoyo, as main did", () => {
  const vars = "duration: 2, x: 100, ease: 'none', repeat: 1, yoyo: true";
  const { plan, written } = dragAndReplay(script(vars), 40, 1);
  expect(plan.ok).toBe(true);
  expect(written).toMatch(/repeat: 1[\s\S]*yoyo: true/);
});

it("keeps a delayed step list where GSAP plays it, before and after a keyframe edit", () => {
  const box = Object.assign(document.body.appendChild(document.createElement("div")), { id: "x" });
  const stepList = `var tl = gsap.timeline({ paused: true });\ntl.to("#x", { keyframes: [{ x: 60 }, { x: 120 }], ease: "none" }, 1);\nwindow.__timelines["t"] = tl;`;
  const id = parseGsapScriptAcorn(stepList).animations[0]!.id;
  const edited = syncPositionHoldsBeforeKeyframes(
    updateKeyframeInScript(stepList, id, 100, { x: 130 }),
  );
  const xAt = (file: string, at: number) => {
    const { timeline } = play(file, at);
    const x = gsap.getProperty(box, "x");
    timeline.kill();
    gsap.set(box, { clearProps: "all" });
    return x;
  };
  for (const file of [stepList, edited]) {
    expect([xAt(file, 0.5), xAt(file, 1.25)]).toEqual([0, 30]);
    const tween = parseGsapScriptAcorn(file).animations.find((a) => a.keyframes)!;
    for (const { percentage, properties } of tween.keyframes!.keyframes) {
      expect(xAt(file, 1 + percentage / 100)).toBeCloseTo(Number(properties.x), 3);
    }
  }
});

it.each([
  [
    "an outer power2.in",
    `keyframes: { "0%": { x: 0 }, "50%": { x: 60 }, "100%": { x: 120 } }, duration: 1, ease: "power2.in"`,
  ],
  ["no duration", `keyframes: [{ x: 60 }, { x: 120 }], ease: "none"`],
])("draws each diamond of a keyframed tween with %s where GSAP shows its value", (_, vars) => {
  const box = Object.assign(document.body.appendChild(document.createElement("div")), { id: "x" });
  const file = `var tl = gsap.timeline({ paused: true });\ntl.to("#x", { ${vars} }, 1);\nwindow.__timelines["t"] = tl;`;
  const tween = parseGsapScriptAcornAnimation(file);
  for (const row of toClipKeyframes(tween.keyframes!.keyframes, tween, 0, 4)) {
    const { timeline } = play(file, (row.percentage / 100) * 4);
    expect(gsap.getProperty(box, "x")).toBeCloseTo(Number(row.properties.x), 1);
    timeline.kill();
    gsap.set(box, { clearProps: "all" });
  }
});

function parseGsapScriptAcornAnimation(file: string) {
  return parseGsapScriptAcorn(file).animations.find((a) => a.keyframes)!;
}

it("keeps a step list's steps where GSAP plays them when an outer duration stretches it", () => {
  const { plan, written } = dragAndReplay(
    script(`keyframes: [{ x: 100 }, { x: 200 }], duration: 2, ease: "none"`),
    70,
    0.5,
  );
  expect(plan.ok).toBe(true);
  const box = document.getElementById("x")!;
  const xAt = (at: number) => {
    const { timeline } = play(written!, at);
    const x = gsap.getProperty(box, "x");
    timeline.kill();
    return x;
  };
  expect([xAt(0.5), xAt(1), xAt(2)]).toEqual([70, 100, 200]);
});

it("adds a keyframe where GSAP plays a tween whose duration is an expression, and never rewrites the expression", async () => {
  const src = `var dur = () => 2;\nvar tl = gsap.timeline({ paused: true });\ntl.to("#x", { keyframes: { "0%": { x: 0 }, "100%": { x: 300 } }, duration: dur() }, 1);\nwindow.__timelines["t"] = tl;`;
  const box = document.body.appendChild(document.createElement("div"));
  box.id = "x";
  const { timeline, iframe } = play(src, 2);
  const anim = parseGsapScriptAcorn(src).animations[0]!;
  const writes: Array<[string, unknown]> = [];
  const session = {
    commitMutation: async (mutation: unknown) => void writes.push(["replace", mutation]),
    handleGsapRemoveKeyframe: () => void writes.push(["remove", null]),
    handleGsapAddKeyframeBatch: async (_id: string, pct: number) => void writes.push(["add", pct]),
  } as unknown as EnableKeyframesSession;
  const selection = { id: "x", selector: "#x", element: box } as DomEditSelection;

  await applyKeyframeAtPlayhead(session, selection, anim, 2, iframe);
  await applyKeyframeAtPlayhead(session, selection, anim, 3.5, iframe);
  timeline.kill();

  expect(anim.durationUnresolved).toBe(true);
  expect(writes).toEqual([["add", 50]]);
});

it("leaves a step list with a runBackwards step to the runtime: a rewrite would play it differently", async () => {
  const flagged = script(
    "keyframes: [{ x: 60, duration: 1, runBackwards: true }, { x: 180, duration: 1 }], ease: 'none'",
  );
  const box = Object.assign(document.body.appendChild(document.createElement("div")), { id: "x" });
  const xAt = (src: string, t: number) => {
    gsap.set(box, { clearProps: "all" });
    const replay = play(src, t);
    const x = gsap.getProperty(box, "x");
    replay.timeline.kill();
    return x;
  };
  // The flag plays the first step from 60 back to the start, so a list without it is another animation.
  expect(xAt(flagged, 0.25)).not.toBe(xAt(flagged.replace(", runBackwards: true", ""), 0.25));
  const { timeline, iframe } = play(flagged, 1.5);
  usePlayerStore.setState({ currentTime: 1.5, activeKeyframePct: null });
  const anim = parseGsapScriptAcorn(flagged).animations[0]!;
  const commitMutation = vi.fn(async () => {});
  const selection = { id: "x", selector: "#x", element: box } as DomEditSelection;

  const edit = commitValueAtPlayhead(
    selection,
    anim,
    { x: 90 },
    iframe,
    { commitMutation },
    {
      label: "Move",
    },
  );

  await expect(edit).rejects.toBeInstanceOf(GsapEditBlockedError);
  timeline.kill();
  expect(commitMutation).not.toHaveBeenCalled();
});
