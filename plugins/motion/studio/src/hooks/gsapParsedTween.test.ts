// @vitest-environment happy-dom
import { gsap } from "gsap";
import { afterEach, describe, expect, it } from "vitest";
import { findParsedTween, parsedImplicitEndValue } from "./gsapParsedTween";
import { liveTween, previewWith, tween } from "./gsapParsedTween.test-helpers";

type Parsed = Parameters<typeof parsedImplicitEndValue>[0];
const el = document.createElement("div");
const part = (start: number, ends?: Record<string, [number, number]>) =>
  liveTween(el, { start, duration: 1, vars: { x: 0 }, ends });
const keyframed = (parts: unknown[]) =>
  liveTween(el, { start: 0, duration: 2, vars: { keyframes: [] } }, { parts }) as Parsed;

describe("parsedImplicitEndValue", () => {
  it("reads a flat tween's own start and end", () => {
    const value = parsedImplicitEndValue(part(0, { x: [-60, 0] }) as Parsed);
    expect([value("x", "start"), value("x", "end")]).toEqual([-60, 0]);
  });

  it("reads a keyframed tween's start from its first part and its end from its last", () => {
    const value = parsedImplicitEndValue(
      keyframed([part(0, { x: [0, 50] }), part(1, { x: [50, 120] })]),
    );
    expect([value("x", "start"), value("x", "end")]).toEqual([0, 120]);
  });

  it("refuses when the part nearest that end is not initialised, rather than read an earlier one", () => {
    const value = parsedImplicitEndValue(keyframed([part(0, { x: [0, 50] }), part(1)]));
    expect(value("x", "end")).toBeNull();
  });

  it("has no value without a parsed tween", () => {
    expect(parsedImplicitEndValue(null)("x", "start")).toBeNull();
  });
});

describe("findParsedTween", () => {
  afterEach(() => document.body.replaceChildren());

  it("takes the flat tween an edit names, not a keyframed tween at the same start", () => {
    const fade = liveTween(el, { start: 0, duration: 2, vars: { keyframes: {}, ease: "none" } });
    const slide = liveTween(el, { start: 0, duration: 2, vars: { x: 300 } });
    const edit = tween({ method: "to", properties: { x: 300 }, resolvedStart: 0, duration: 2 });
    expect(findParsedTween(previewWith(el, [fade, slide]), el, edit)).toBe(slide);
  });

  it("parses a to() tween the playhead has not reached, from its authored start", () => {
    const box = document.body.appendChild(document.createElement("div"));
    box.id = "box";
    const timeline = gsap.timeline({ paused: true }).to(box, { x: 300, duration: 1 }, 2);
    timeline.seek(0.5);
    gsap.set(box, { x: 40 });
    const iframe = { contentWindow: { __timelines: { main: timeline }, gsap } };
    const edit = tween({ method: "to", properties: { x: 300 }, resolvedStart: 2, duration: 1 });

    const parsed = findParsedTween(iframe as unknown as HTMLIFrameElement, box, edit);

    expect(parsedImplicitEndValue(parsed)("x", "start")).toBe(0);
    expect([gsap.getProperty(box, "x"), timeline.time()]).toEqual([40, 0.5]);
    timeline.kill();
  });
});
