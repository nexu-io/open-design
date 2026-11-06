import { describe, expect, it, vi } from "vitest";
import { buildFrameCaptureFilename, buildFrameCaptureUrl } from "./frameCapture";

describe("frame capture utilities", () => {
  it("builds a PNG capture URL for the master composition", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00Z"));

    expect(
      buildFrameCaptureUrl({
        projectId: "demo project",
        compositionPath: null,
        currentTime: 1.23456,
        origin: "http://localhost:5194",
      }),
    ).toBe(
      "http://localhost:5194/api/projects/demo%20project/thumbnail/index.html?t=1.235&format=png&output=source&v=1777464000000",
    );

    vi.useRealTimers();
  });

  it("builds a safe filename from a nested composition path", () => {
    expect(buildFrameCaptureFilename("compositions/intro.html", 2.5)).toBe("intro-2-500s.png");
  });
});
