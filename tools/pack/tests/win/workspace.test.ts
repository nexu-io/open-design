import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "@/config/index.js";
import { materializeWinWorkspaceOutputs } from "@/win/app.js";

const mocks = vi.hoisted(() => ({ inputs: vi.fn(), localKey: vi.fn(), maps: vi.fn(), build: vi.fn() }));
vi.mock("@/workspace-build.js", () => ({
  workspaceBuildUnitResult: mocks.inputs,
  createWorkspaceBuildCacheKey: mocks.localKey,
  ensureWorkspaceBuildArtifacts: mocks.build,
}));
vi.mock("@/web-sourcemaps.js", () => ({ processWebSourcemaps: mocks.maps }));

beforeEach(() => { vi.resetAllMocks(); mocks.localKey.mockResolvedValue("local-packaging-determinants"); });

describe("Windows completed workspace consumption", () => {
  it("retains local packaging determinants without acquiring/building source outputs", async () => {
    const config = {} as ToolPackConfig;
    expect(await materializeWinWorkspaceOutputs(config)).toBe("local-packaging-determinants");
    expect(mocks.inputs.mock.calls.map((call) => call[1])).toEqual(["packages", "daemon", "web", "shell"]);
    expect(mocks.localKey).toHaveBeenCalledExactlyOnceWith(config);
    expect(mocks.maps).toHaveBeenCalledExactlyOnceWith(config);
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.localKey.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.inputs.mock.invocationCallOrder[3]!);
  });

  it("rejects missing inputs before materialization or cache work", async () => {
    mocks.inputs.mockRejectedValueOnce(new Error("missing output"));
    await expect(materializeWinWorkspaceOutputs({} as ToolPackConfig)).rejects.toThrow("missing output");
    expect(mocks.localKey).not.toHaveBeenCalled();
    expect(mocks.maps).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
