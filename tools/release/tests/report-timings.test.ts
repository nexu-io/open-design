import { describe, expect, it } from "vitest";

import { resolveReportTimings } from "../src/report/timings.js";

describe("release report timings", () => {
  it("uses the measured smoke suite duration when no detailed timings exist", () => {
    expect(resolveReportTimings({
      build: null,
      index: null,
      smokeSummary: { health: { ok: true } },
      suiteResult: { durationMs: 1234, status: "success" },
    })).toEqual({
      build: [],
      releaseScript: [],
      smoke: [{ durationMs: 1234, status: "success", step: "packaged-smoke-suite" }],
      totalDurationMs: 1234,
      totalDurationSource: "packaged-smoke-suite",
    });
  });

  it("prefers detailed smoke and release-index measurements when available", () => {
    const detailed = [{ durationMs: 20, step: "install" }];
    expect(resolveReportTimings({
      build: { timings: [{ durationMs: 10, phase: "build" }] },
      index: { durationMs: 50, timings: [{ durationMs: 5, step: "prepare" }] },
      smokeSummary: { timings: detailed },
      suiteResult: { durationMs: 30, status: "success" },
    })).toEqual({
      build: [{ durationMs: 10, phase: "build" }],
      releaseScript: [{ durationMs: 5, step: "prepare" }],
      smoke: detailed,
      totalDurationMs: 50,
      totalDurationSource: "release-index",
    });
  });
});
