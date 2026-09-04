import { describe, expect, it, vi } from "vitest";

import type { ElectronStandaloneContentUpdaterPort } from "@open-design/electron-kit/runtime";

import { createElectronContentUpdateHandler } from "@/adapters/updater/content.js";

function updater(input: Partial<ElectronStandaloneContentUpdaterPort>): ElectronStandaloneContentUpdaterPort {
  return {
    prepareLatest: input.prepareLatest ?? vi.fn(),
    applyNow: input.applyNow ?? vi.fn(),
  };
}

describe("Electron content update handler", () => {
  it("projects a prepared generation without exposing materialized resources", async () => {
    const prepareLatest = vi.fn().mockResolvedValue({
      status: "prepared",
      authorized: false,
      generation: {
        id: "a".repeat(64),
        releaseVersion: "0.1.0-betahyx.2",
        resources: { closure: { path: "/private/store/closure.mjs" } },
      },
    });
    const result = await createElectronContentUpdateHandler(updater({ prepareLatest })).prepare();
    expect(prepareLatest).toHaveBeenCalledWith("observe");
    expect(result).toEqual({
      schemaVersion: 1,
      state: "prepared",
      generationId: "a".repeat(64),
      releaseVersion: "0.1.0-betahyx.2",
      authorized: false,
    });
    expect(JSON.stringify(result)).not.toContain("/private/store");
  });

  it("projects Shell compatibility and guarded blockers as finite data", async () => {
    const check = createElectronContentUpdateHandler(updater({
      prepareLatest: vi.fn().mockResolvedValue({ status: "shell-reinstall-required", releaseVersion: "0.1.0-betahyx.3", minimumVersion: "0.2.0", requirement: null }),
    }));
    expect(await check.prepare()).toEqual({
      schemaVersion: 1,
      state: "shell-update-required",
      releaseVersion: "0.1.0-betahyx.3",
      minimumShellVersion: "0.2.0",
    });

    const applyNow = vi.fn().mockResolvedValue({
      status: "blocked",
      reason: "occupied",
      occupants: [{ attachmentId: "terminal-1", generationId: "b".repeat(64), shell: { type: "terminal", version: "0.1.0", buildHash: "c".repeat(64), digest: "d".repeat(64) } }],
    });
    const result = await createElectronContentUpdateHandler(updater({ applyNow })).apply(true);
    expect(applyNow).toHaveBeenCalledWith({ force: true });
    expect(result).toEqual({
      schemaVersion: 1,
      state: "blocked",
      reason: "occupied",
      blockedBy: [{ attachmentId: "terminal-1", shellType: "terminal" }],
    });
    expect(JSON.stringify(result)).not.toContain("generationId");
  });

  it("collapses updater failures to a stable error code", async () => {
    const handler = createElectronContentUpdateHandler(updater({
      prepareLatest: vi.fn().mockRejectedValue(new Error("secret release URL")),
      applyNow: vi.fn().mockRejectedValue(new Error("private lifecycle token")),
    }));
    await expect(handler.prepare()).resolves.toEqual({ schemaVersion: 1, state: "failed", error: { code: "content-update-failed" } });
    await expect(handler.apply(false)).resolves.toEqual({ schemaVersion: 1, state: "failed", error: { code: "content-update-failed" } });
  });
});
