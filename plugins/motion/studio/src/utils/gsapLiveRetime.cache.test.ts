import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ shape: [] as string[] }));

vi.mock("@hyperframes/parsers/gsap-parser-acorn", async (importOriginal) => {
  const real = await importOriginal<typeof import("@hyperframes/parsers/gsap-parser-acorn")>();
  return {
    ...real,
    scriptShape: (code: string, mask?: boolean) => (
      reads.shape.push(code), real.scriptShape(code, mask)
    ),
  };
});

const { planLiveRetime } = await import("./gsapLiveRetime");

const at = (start: number) =>
  `var tl = gsap.timeline({ paused: true });\ntl.to("#a", { x: 1, duration: 1 }, ${start});\nwindow.__timelines["t"] = tl;`;

describe("planLiveRetime", () => {
  beforeEach(() => {
    reads.shape.length = 0;
  });

  it("reads each script's shape once across two drags in a row", () => {
    expect(planLiveRetime(at(0), at(1)).kind).toBe("retime");
    expect(planLiveRetime(at(1), at(2)).kind).toBe("retime");

    expect(reads.shape).toEqual([at(0), at(1), at(2)]);
  });

  it("keeps the live script's shape while saves land before the preview catches up", () => {
    planLiveRetime(at(10), at(11));
    planLiveRetime(at(10), at(12));
    planLiveRetime(at(10), at(13));

    expect(reads.shape).toEqual([at(10), at(11), at(12), at(13)]);
  });
});
