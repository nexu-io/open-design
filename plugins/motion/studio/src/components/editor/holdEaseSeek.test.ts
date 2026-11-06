// Real gsap, not a parseEase stub: this pins the seek behaviour of the `hold`
// ease against the engine that actually runs it, and gsap is a studio
// dependency. core's own customEase.test.ts covers the resolver in isolation.
import { installStudioCustomEase } from "@hyperframes/core/runtime/custom-ease";
import { gsap } from "gsap";
import { describe, expect, it } from "vitest";

describe("Studio hold ease", () => {
  it("holds the start value under seek until the destination time", () => {
    const runtimeGsap = { parseEase: gsap.parseEase.bind(gsap) };
    expect(installStudioCustomEase(runtimeGsap)).toBe(true);
    const hold = runtimeGsap.parseEase("hold");
    expect(hold).toBeTypeOf("function");
    if (typeof hold !== "function") return;

    const target = { value: 0 };
    const timeline = gsap.timeline({ paused: true }).to(
      target,
      {
        value: 100,
        duration: 2,
        ease: hold,
      },
      0,
    );

    timeline.seek(0.5);
    expect(target.value).toBe(0);
    timeline.seek(1);
    expect(target.value).toBe(0);
    timeline.seek(1.99);
    expect(target.value).toBe(0);
    timeline.seek(2);
    expect(target.value).toBe(100);
    timeline.kill();
  });
});
