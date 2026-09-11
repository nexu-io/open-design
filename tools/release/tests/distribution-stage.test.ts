import { expect, it, vi } from "vitest";
import { distributionStage } from "@/exact/distribution-stage.ts";

it("reports a completed operation without changing its result", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const result = {};
    expect(await distributionStage("installer-publication", async () => result)).toBe(result);
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
      event: "release.distribution.stage", stage: "installer-publication", status: "success",
      durationMs: expect.any(Number),
    });
  } finally { log.mockRestore(); }
});

it("preserves the original failure without exposing its sensitive message", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const error = new Error("secret credential");
    await expect(distributionStage("result-publication", async () => { throw error; })).rejects.toBe(error);
    expect(JSON.parse(log.mock.calls[0]![0]).status).toBe("failure");
    expect(log.mock.calls[0]![0]).not.toContain("secret credential");
  } finally { log.mockRestore(); }
});
