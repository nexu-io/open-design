// @vitest-environment happy-dom
import { gsap } from "gsap";
import { retimeClipTweensInScript } from "@hyperframes/parsers/gsap-writer-acorn";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { finishTimelineTimingFallback } from "../hooks/timelineTimingSync";
import { applyLiveRetime, planLiveRetime, planLiveRetimeFromPreview } from "./gsapLiveRetime";

const BEFORE = [
  "var tl = gsap.timeline({ paused: true });",
  'tl.set("#b", { y: 3 }, 0.2);',
  'tl.to("#a", { x: 100, duration: 1 }, 0.5);',
  'tl.from("#b", { opacity: 0, duration: 2 }, 1);',
  'tl.to("#c", { keyframes: { "0%": { x: 0 }, "50%": { x: 80 }, "100%": { x: 50 } }, duration: 1.5 }, 2);',
  'window.__timelines["t"] = tl;',
].join("\n");

const SAMPLES = Array.from({ length: 25 }, (_, i) => i * 0.25);

/** Runs a composition script and binds its timeline at `at`, as the preview's runtime does. */
function play(script: string, at = 0, nested = "", registered = "") {
  const win = { __timelines: {} as Record<string, gsap.core.Timeline> };
  new Function("gsap", "window", script)(gsap, win);
  // Another composition's script, which registers its own timeline beside this one.
  new Function("gsap", "window", registered)(gsap, win);
  const timeline = win.__timelines.t!;
  // The runtime nests each sub-composition's timeline into its host's; the script does not know them...
  const sub = gsap.timeline().to({}, { duration: 6.7 });
  new Function("gsap", "sub", nested)(gsap, sub);
  timeline.add(sub, 0);
  // ...and pads the timeline to the composition's length with a filler tween.
  timeline.to({}, { duration: 0, data: "hf-runtime-filler" }, 8);
  timeline.progress(0.0001, true).totalTime(at, false);
  return { win, timeline };
}

/** Each tween's start and length, and what every element shows across the timeline. */
function observe(timeline: gsap.core.Timeline) {
  const tweens = timeline
    .getChildren(false, true, false)
    .map((t) => [round(t.startTime()), round(t.duration())]);
  const shown = SAMPLES.map((at) => {
    timeline.seek(at);
    return shownNow();
  });
  return { tweens, length: round(timeline.duration()), shown };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** What every element shows now. */
const shownNow = () =>
  ["#a", "#b", "#c"].map((id) =>
    ["x", "y", "opacity"].map((p) => round(Number(gsap.getProperty(id, p)))),
  );

/** A preview iframe whose live script is `script`, built and bound. */
function preview(script: string, nested = "", registered = "") {
  const tag = document.createElement("script");
  tag.type = "text/plain"; // the runtime already ran it; happy-dom must not run it again
  tag.textContent = script;
  document.body.appendChild(tag);
  const { win, timeline } = play(script, 0, nested, registered);
  const rebind = vi.fn();
  // The runtime hooks a rebind needs; a soft reload would also need `gsap`, which this preview lacks.
  Object.assign(win, { __hfForceTimelineRebind: rebind, __player: { seek: vi.fn() } });
  const iframe = { contentWindow: win, contentDocument: document } as unknown as HTMLIFrameElement;
  return { iframe, timeline, tag, rebind };
}

beforeEach(() => {
  for (const id of ["a", "b", "c"]) {
    const element = document.body.appendChild(document.createElement("div"));
    element.id = id;
    element.className = "item";
  }
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const moveA = () =>
  retimeClipTweensInScript(BEFORE, [{ kind: "shift", targetSelector: "#a", delta: 0.75 }], document)
    .script;

async function dropInto(iframe: HTMLIFrameElement, after: string) {
  const reloadPreview = vi.fn();
  await finishTimelineTimingFallback({
    iframe,
    projectId: null,
    reloadPreview,
    gsapMutation: async () => ({ mutated: true, scriptText: after }),
    onGsapError: () => {},
    rebindWhenUnmutated: true,
  });
  return reloadPreview;
}

/** Wraps `element` in a composition host with id `id`, and returns the host. */
function inComposition(id: string, element: Element) {
  const host = document.createElement("div");
  host.setAttribute("data-composition-id", id);
  element.replaceWith(host);
  host.appendChild(element);
  return host;
}

/** `code` as the preview serves it: indented inside the page, with the blank lines around it. */
const reformatted = (code: string) => `\n${code.replace(/^/gm, "      ")}\n`;

const script = (...lines: string[]) =>
  ["var tl = gsap.timeline({ paused: true });", ...lines, 'window.__timelines["t"] = tl;'].join(
    "\n",
  );

it.each([
  {
    name: "a tween with no written length",
    path: "rerun",
    before: script('tl.to("#a", { x: 100 }, 0);', 'tl.to("#b", { x: 50, duration: 1 }, 1);'),
    after: script('tl.to("#a", { x: 100 }, 0);', 'tl.to("#b", { x: 50, duration: 1 }, 2);'),
  },
  {
    name: "a step list with no lengths",
    path: "retime",
    before: script(
      'tl.to("#a", { keyframes: [{ x: 10 }, { x: 20 }] }, 0);',
      'tl.to("#b", { x: 5, duration: 1 }, 1);',
    ),
    after: script(
      'tl.to("#a", { keyframes: [{ x: 10 }, { x: 20 }] }, 0);',
      'tl.to("#b", { x: 5, duration: 1 }, 2);',
    ),
  },
  {
    name: "a stagger beside the moved tween",
    path: "rerun",
    before: script(
      'tl.to(".item", { x: 100, duration: 1, stagger: 0.2 }, 0);',
      'tl.to("#a", { y: 5, duration: 1 }, 2);',
    ),
    after: script(
      'tl.to(".item", { x: 100, duration: 1, stagger: 0.2 }, 0);',
      'tl.to("#a", { y: 5, duration: 1 }, 3);',
    ),
  },
  {
    name: "a repeat before an implicit position",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 1, duration: 1, repeat: 1 }, 0);',
      'tl.to("#b", { x: 1, duration: 1 });',
    ),
    after: script(
      'tl.to("#a", { x: 1, duration: 1, repeat: 1 }, 0.5);',
      'tl.to("#b", { x: 1, duration: 1 });',
    ),
  },
  {
    name: "a delay before a '<' position",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 1, duration: 1, delay: 0.5 }, 0);',
      'tl.to("#b", { x: 1, duration: 1 }, "<");',
    ),
    after: script(
      'tl.to("#a", { x: 1, duration: 1, delay: 0.5 }, 1);',
      'tl.to("#b", { x: 1, duration: 1 }, "<");',
    ),
  },
  {
    name: "two tweens on one element whose live order differs from the script's",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 100, duration: 1, delay: 1 }, 0);',
      'tl.to("#a", { y: 50, duration: 1 }, 0.5);',
    ),
    after: script(
      'tl.to("#a", { x: 100, duration: 1, delay: 1 }, 0);',
      'tl.to("#a", { y: 50, duration: 1 }, 1.5);',
    ),
  },
  {
    name: "two tweens on one element that swap order",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 100, duration: 1 }, 0);',
      'tl.to("#a", { x: 200, duration: 1 }, 2);',
    ),
    after: script(
      'tl.to("#a", { x: 100, duration: 1 }, 3);',
      'tl.to("#a", { x: 200, duration: 1 }, 2);',
    ),
  },
  {
    name: "a call in the timeline",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 1, duration: 1 }, 0);',
      "tl.call(() => {}, [], 1);",
      'tl.to("#b", { x: 1, duration: 1 }, 2);',
    ),
    after: script(
      'tl.to("#a", { x: 1, duration: 1 }, 0);',
      "tl.call(() => {}, [], 1);",
      'tl.to("#b", { x: 1, duration: 1 }, 3);',
    ),
  },
  {
    name: "a counter tween on a plain object",
    path: "rerun",
    before: script(
      "var counter = { n: 0 };",
      "tl.to(counter, { n: 10, duration: 1 }, 0);",
      'tl.to("#b", { x: 1, duration: 1 }, 1);',
    ),
    after: script(
      "var counter = { n: 0 };",
      "tl.to(counter, { n: 10, duration: 1 }, 0);",
      'tl.to("#b", { x: 1, duration: 1 }, 2);',
    ),
  },
  {
    name: "a paused playhead past the moved tween",
    path: "retime",
    before: script('tl.to("#a", { x: 100, duration: 1 }, 0.5);'),
    after: script('tl.to("#a", { x: 100, duration: 1 }, 1.5);'),
    at: 2,
  },
  {
    name: "an unmoved tween on the same element that overlaps the moved one",
    path: "rerun",
    before: script(
      'tl.to(".item", { x: 100, duration: 2 }, 0);',
      'tl.to("#a", { x: 0, duration: 1 }, 4);',
    ),
    after: script(
      'tl.to(".item", { x: 100, duration: 2 }, 0);',
      'tl.to("#a", { x: 0, duration: 1 }, 1);',
    ),
  },
  {
    name: "a sub-composition tween on the moved tween's element",
    path: "rerun",
    before: script('tl.to("#a", { x: 100, duration: 1 }, 0);'),
    after: script('tl.to("#a", { x: 100, duration: 1 }, 3);'),
    nested: 'sub.to("#a", { x: 50, duration: 1 }, 2);',
  },
  {
    name: "another composition's timeline on the moved tween's element",
    path: "rerun",
    before: script('tl.to("#a", { x: 100, duration: 1 }, 0);'),
    after: script('tl.to("#a", { x: 100, duration: 1 }, 3);'),
    registered:
      'window.__timelines.scene = gsap.timeline({ paused: true }).to("#a", { x: 50, duration: 1 }, 2);',
  },
  {
    name: "a delayed tween that GSAP orders after the moved one",
    path: "rerun",
    before: script(
      'tl.to("#a", { opacity: 0.5, duration: 1, delay: 2 }, 0);',
      'tl.to("#a", { x: 100, duration: 1 }, 0);',
    ),
    after: script(
      'tl.to("#a", { opacity: 0.5, duration: 1, delay: 2 }, 0);',
      'tl.to("#a", { x: 100, duration: 1 }, 3);',
    ),
  },
  {
    name: "a set moved onto a playhead at 0",
    path: "retime",
    before: script('tl.set("#a", { x: 30 }, 2);', 'tl.to("#b", { x: 1, duration: 1 }, 3);'),
    after: script('tl.set("#a", { x: 30 }, 0);', 'tl.to("#b", { x: 1, duration: 1 }, 3);'),
  },
  {
    name: "a tween whose callback draws another element",
    path: "retime",
    before: script(
      'tl.to("#a", { x: 100, duration: 2, onUpdate: function () { gsap.set("#c", { y: Math.round(this.progress() * 100) }); } }, 1);',
    ),
    after: script(
      'tl.to("#a", { x: 100, duration: 2, onUpdate: function () { gsap.set("#c", { y: Math.round(this.progress() * 100) }); } }, 1.5);',
    ),
    at: 2,
  },
  {
    name: "a trim of an element with an entrance and an exit, rounded as the writer writes it",
    path: "retime",
    before: script(
      'tl.to("#a", { y: 40, duration: 1 }, 0);',
      'tl.to("#a", { x: 50, duration: 1 }, 2);',
    ),
    after: script(
      'tl.to("#a", { y: 40, duration: 0.833 }, 0);',
      'tl.to("#a", { x: 50, duration: 0.833 }, 1.667);',
    ),
  },
  {
    name: "a trim of an element whose tween has a delay",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 100, duration: 1, delay: 1 }, 0);',
      'tl.to("#a", { x: 200, duration: 1 }, 2);',
    ),
    after: script(
      'tl.to("#a", { x: 100, duration: 0.5, delay: 1 }, 0);',
      'tl.to("#a", { x: 200, duration: 0.5 }, 1);',
    ),
  },
  {
    name: "a move of a sub-composition's host",
    path: "retime",
    before: script('tl.to("#a", { y: 40, duration: 1 }, 0);'),
    after: script('tl.to("#a", { y: 40, duration: 1 }, 2);'),
    setup: () => {
      const host = document.createElement("div");
      host.setAttribute("data-composition-id", "scene");
      document.getElementById("a")!.appendChild(host);
    },
  },
  {
    name: "a tween on an element inside a sub-composition's host",
    path: "retime",
    before: script('tl.to("#a", { y: 40, duration: 1 }, 0);'),
    after: script('tl.to("#a", { y: 40, duration: 1 }, 2);'),
    setup: () => inComposition("t", inComposition("scene", document.getElementById("a")!)),
  },
  {
    name: "a set and a tween on one element that round to the same start",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 50, duration: 1 }, 0);',
      'tl.set("#a", { x: 0 }, 2.0004);',
      'tl.to("#a", { x: 100, duration: 1 }, 2);',
    ),
    after: script(
      'tl.to("#a", { x: 50, duration: 1 }, 1);',
      'tl.set("#a", { x: 0 }, 3);',
      'tl.to("#a", { x: 100, duration: 1 }, 3);',
    ),
  },
  {
    name: "a slight trim of an element whose tween has a delay",
    path: "rerun",
    before: script(
      'tl.to("#a", { x: 100, duration: 1, delay: 1 }, 0);',
      'tl.to("#a", { x: 200, duration: 1 }, 2);',
    ),
    after: script(
      'tl.to("#a", { x: 100, duration: 0.999, delay: 1 }, 0);',
      'tl.to("#a", { x: 200, duration: 0.999 }, 1.998);',
    ),
  },
  {
    name: "a set that never played moved onto a playhead at 0",
    path: "retime",
    before: script('tl.set("#a", { x: 30 }, 2);', 'tl.to("#b", { x: 1, duration: 1 }, 3);'),
    after: script('tl.set("#a", { x: 30 }, 0);', 'tl.to("#b", { x: 1, duration: 1 }, 3);'),
    unplayed: true,
  },
])(
  "after a drop over $name, the live preview equals a fresh load or the script re-runs",
  async ({ before, after, nested = "", registered = "", at = 0, path, setup, unplayed }) => {
    setup?.();
    const error = vi.spyOn(console, "error");
    const live = preview(before, nested, registered);
    // Played through once, then parked: every tween has recorded its start values.
    if (!unplayed) live.timeline.totalTime(live.timeline.duration(), false);
    live.timeline.totalTime(at, false);
    const reloadPreview = await dropInto(live.iframe, after);
    expect(error).not.toHaveBeenCalled();
    if (reloadPreview.mock.calls.length === 0) {
      const shown = shownNow();
      const got = observe(live.timeline);
      live.timeline.revert();
      const fresh = play(after, at, nested, registered).timeline;
      expect(shown).toEqual(shownNow());
      expect(got).toEqual(observe(fresh));
    }
    expect(reloadPreview.mock.calls.length > 0 ? "rerun" : "retime").toBe(path);
  },
);

it("leaves the live preview equal to a fresh load of the saved script after a move and a resize", () => {
  const { script: after } = retimeClipTweensInScript(
    BEFORE,
    [
      { kind: "shift", targetSelector: "#a", delta: 0.75 },
      {
        kind: "scale",
        targetSelector: "#c",
        oldStart: 2,
        oldDuration: 1.5,
        newStart: 2.5,
        newDuration: 3,
      },
    ],
    document,
  );
  const fresh = play(after);
  const want = observe(fresh.timeline);
  fresh.timeline.revert();

  const live = preview(BEFORE);
  const plan = planLiveRetimeFromPreview(live.iframe, after);
  expect(plan.kind).toBe("retime");
  if (plan.kind !== "retime") return;
  expect(plan.tweens.filter((t) => t.moved).map((t) => t.selector)).toEqual(["#a", "#c"]);
  expect(applyLiveRetime(live.iframe, plan)).toBe(true);

  expect(observe(live.timeline)).toEqual(want);
  expect(live.tag.textContent).toBe(after);
});

it("re-runs the script for an edit that changes more than timing", () => {
  const after = BEFORE.replace("x: 100", "x: 140").replace(", 0.5);", ", 0.9);");
  expect(planLiveRetime(BEFORE, after).kind).toBe("rerun");
});

it("re-runs the script when the edit also changes code the parser does not read", () => {
  const before = script('tl.to("#a", { x: 1, duration: 1 }, 0);', 'document.title = "one";');
  const after = script('tl.to("#a", { x: 1, duration: 1 }, 1);', 'document.title = "two";');
  expect(planLiveRetime(before, after).kind).toBe("rerun");
});

it("reloads the preview, and says so, when moving the live tweens throws", async () => {
  const before = script('tl.to("#a", { x: () => { throw new Error("boom"); }, duration: 1 }, 5);');
  const live = preview(before);
  live.timeline.totalTime(3, false);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  const reloadPreview = await dropInto(live.iframe, before.replace("}, 5);", "}, 1);"));

  expect(reloadPreview).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);
});

it("re-runs a script that does not parse as a classic script, such as one with an import", () => {
  const before = script('import "./setup.js";', 'tl.to("#a", { x: 1, duration: 1 }, 0);');
  const after = script('import "./setup.js";', 'tl.to("#a", { x: 1, duration: 1 }, 1);');
  expect(planLiveRetime(before, after).kind).toBe("rerun");
});

it("re-runs the script when the edit also flips an operator in a tween's value", () => {
  const before = script('tl.to("#a", { x: window.innerWidth - 40, duration: 1 }, 0);');
  const after = script('tl.to("#a", { x: window.innerWidth + 40, duration: 1 }, 1);');
  expect(planLiveRetime(before, after).kind).toBe("rerun");
});

it("re-runs the script when the edit also joins two words of code", () => {
  const before = script('tl.to("#a", { x: 1, duration: 1 }, 0);', "var b = typeof a;");
  const after = script('tl.to("#a", { x: 1, duration: 1 }, 1);', "var b = typeofa;");
  expect(planLiveRetime(before, after).kind).toBe("rerun");
});

it("moves the live tweens beside a helper-built tween in a reformatted copy of the script", async () => {
  const lines = [
    "function pop(sel, at) { tl.to(sel, { x: 5, duration: 1 }, at); }",
    'pop("#b", 2);',
  ];
  const before = script('tl.to("#a", { x: 1, duration: 1 }, 0);', ...lines);
  const live = preview(before);
  live.tag.textContent = reformatted(before);

  const reloadPreview = await dropInto(
    live.iframe,
    script('tl.to("#a", { x: 1, duration: 1 }, 0.5);', ...lines),
  );

  expect(reloadPreview).not.toHaveBeenCalled();
});

it("moves the live tweens beside a multi-line value in a reformatted copy of the script", async () => {
  const raw = 'tl.to("#b", { x: [\n  1,\n  2,\n].length, duration: 1 }, 2);';
  const before = script('tl.to("#a", { y: 1, duration: 1 }, 0);', raw);
  const live = preview(before);
  live.tag.textContent = reformatted(before);

  const reloadPreview = await dropInto(
    live.iframe,
    script('tl.to("#a", { y: 1, duration: 1 }, 0.5);', raw),
  );

  expect(reloadPreview).not.toHaveBeenCalled();
});

it("re-runs the script when the edit adds a tween", () => {
  const after = BEFORE.replace(
    "window.__timelines",
    'tl.to("#a", { y: 9, duration: 1 }, 4);\nwindow.__timelines',
  );
  expect(planLiveRetime(BEFORE, after).kind).toBe("rerun");
});

it("leaves a live timeline that does not pair with its script untouched", () => {
  // The preview runs a script with one more tween than the text it claims to be running.
  const ran = BEFORE.replace(
    "window.__timelines",
    'tl.to("#b", { x: 5, duration: 1 }, 0);\nwindow.__timelines',
  );
  const live = preview(ran);
  live.tag.textContent = BEFORE;
  const { script: after } = retimeClipTweensInScript(
    BEFORE,
    [{ kind: "shift", targetSelector: "#a", delta: 0.75 }],
    document,
  );
  const plan = planLiveRetimeFromPreview(live.iframe, after);
  expect(plan.kind).toBe("retime");
  if (plan.kind !== "retime") return;
  const starts = live.timeline.getChildren(false, true, false).map((t) => t.startTime());

  expect(applyLiveRetime(live.iframe, plan)).toBe(false);
  expect(live.timeline.getChildren(false, true, false).map((t) => t.startTime())).toEqual(starts);
  expect(live.tag.textContent).toBe(BEFORE);
});

it("syncs a timeline move by moving the live tweens and rebinding, without re-running the script", async () => {
  const live = preview(BEFORE);
  const after = moveA();
  const reloadPreview = await dropInto(live.iframe, after);

  expect(reloadPreview).not.toHaveBeenCalled();
  expect(live.rebind).toHaveBeenCalledTimes(1);
  const got = observe(live.timeline);
  live.timeline.revert();
  expect(got).toEqual(observe(play(after).timeline));
  expect(document.querySelectorAll("script")).toHaveLength(1);
});

it("moves the live tweens when the preview runs the saved script re-printed without its comments", async () => {
  const live = preview(BEFORE);
  const saved = `// Seams between sections.\n${moveA().replaceAll('"', "'")}\n/* end */`;

  const reloadPreview = await dropInto(live.iframe, saved);

  expect(reloadPreview).not.toHaveBeenCalled();
});

it("moves the live tweens when the preview runs a reformatted copy of the saved script", async () => {
  const live = preview(BEFORE);
  live.tag.textContent = reformatted(BEFORE);

  const reloadPreview = await dropInto(live.iframe, moveA());

  expect(reloadPreview).not.toHaveBeenCalled();
});

it("pairs by start time, so a second move after a reorder still lands on the right tweens", async () => {
  const live = preview(BEFORE);
  const first = moveA(); // #a now starts after #b, so the live children re-sort
  await dropInto(live.iframe, first);
  const { script: second } = retimeClipTweensInScript(
    first,
    [{ kind: "shift", targetSelector: "#b", delta: 1 }],
    document,
  );
  const error = vi.spyOn(console, "error");

  const reloadPreview = await dropInto(live.iframe, second);

  expect(error).not.toHaveBeenCalled();
  expect(reloadPreview).not.toHaveBeenCalled();
  const got = observe(live.timeline);
  live.timeline.revert();
  expect(got).toEqual(observe(play(second).timeline));
});
