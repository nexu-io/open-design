// @vitest-environment happy-dom
import { gsap } from "gsap";
import { expect, it } from "vitest";
import { readRuntimeKeyframes } from "./gsapRuntimeKeyframes";

/** The edit bench's `keys` layer: GSAP starts it at x 40, 260 wide, and plays it to 1 s. */
function read(keyframes: string) {
  const box = Object.assign(document.body.appendChild(document.createElement("div")), { id: "x" });
  box.style.width = "260px";
  gsap.set(box, { x: 40 });
  const win = { __timelines: {} as Record<string, gsap.core.Timeline> };
  new Function(
    "gsap",
    "window",
    `var tl = gsap.timeline({ paused: true });
tl.to("#x", { keyframes: ${keyframes} }, 0);
window.__timelines["t"] = tl;`,
  )(gsap, win);
  const timeline = win.__timelines.t!;
  timeline.progress(0.0001, true).seek(1);
  const iframe = { contentWindow: { ...win, gsap }, contentDocument: document };
  const got = readRuntimeKeyframes(iframe as unknown as HTMLIFrameElement, "#x");
  timeline.kill();
  box.remove();
  return got;
}

it("reads where GSAP started a step list whose first keyframe comes later", () => {
  const got = read(
    `[{ x: 60, width: 280, duration: 2, ease: "none" }, { x: 120, width: 320, duration: 1, ease: "none" }]`,
  );
  expect(got?.start).toEqual({ x: 40, width: 260 });
});

it.each([
  [`{ "50%": { x: 60, y: 20 }, "100%": { x: 120, y: 40 } }, duration: 2`, { x: 40, y: 0 }],
  [
    `{ "50%": { x: 60, width: 280 }, "100%": { x: 120, width: 320 } }, duration: 2`,
    { x: 40, width: 260 },
  ],
])("reads every channel's start for a percentage list past 0%: %s", (keyframes, start) => {
  expect(read(keyframes)?.start).toEqual(start);
});

it("reads no start for keyframes that begin at 0%, or a step list that begins where GSAP started", () => {
  expect(read(`{ "0%": { x: 10 }, "100%": { x: 120 } }, duration: 3`)?.start).toBeUndefined();
  expect(read(`[{ x: 40, duration: 0 }, { x: 120, duration: 1 }]`)?.start).toBeUndefined();
});
