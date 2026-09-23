import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "@/config/index.js";
import { packageMac, packMac } from "@/mac/build.js";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  inputs: vi.fn(),
  maps: vi.fn(),
  seed: vi.fn(),
  resources: vi.fn(),
  tarballs: vi.fn(),
  assemble: vi.fn(),
  native: vi.fn(),
  scrub: vi.fn(),
  payload: vi.fn(),
  artifacts: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/mac/workspace.js", () => ({ ensureMacWorkspaceBuild: mocks.source }));
vi.mock("@/workspace-build.js", () => ({ workspaceBuildUnitResult: mocks.inputs }));
vi.mock("@/web-sourcemaps.js", () => ({ processWebSourcemaps: mocks.maps }));
vi.mock("@/mac/app-config.js", () => ({ seedPackagedAppConfig: mocks.seed }));
vi.mock("@/mac/app.js", () => ({
  copyResourceTree: mocks.resources, collectWorkspaceTarballs: mocks.tarballs, writeAssembledApp: mocks.assemble,
}));
vi.mock("@/mac/builder.js", () => ({ resolveElectronBuilderTargets: () => ["dir"], runElectronBuilder: mocks.native }));
vi.mock("@/mac/fs.js", () => ({ scrubMacExtendedAttributes: mocks.scrub }));
vi.mock("@/mac/payload.js", () => ({ createMacLauncherPayloadArchive: mocks.payload }));
vi.mock("@/mac/artifacts.js", () => ({ finalizeMacArtifacts: mocks.artifacts }));
vi.mock("@/mac/report.js", () => ({ collectMacSizeReport: mocks.report }));
vi.mock("@/mac/paths.js", () => ({ resolveMacPaths: () => ({ appPath: "app", resourceRoot: "resources" }) }));

const config = {
  to: "app",
  roots: { cacheRoot: "unused-cache", output: { namespaceRoot: "out" }, runtime: { namespaceRoot: "runtime" } },
} as ToolPackConfig;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.artifacts.mockResolvedValue({ dmgPath: null, zipPath: null, latestMacYmlPath: null });
});

describe("Mac source/packaging execution boundary", () => {
  it("packages completed units without source builds and preserves release-time work", async () => {
    const result = await packageMac(config);
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.inputs.mock.calls.map((call) => call[1])).toEqual(["packages", "daemon", "web", "shell"]);
    expect(mocks.maps).toHaveBeenCalledExactlyOnceWith(config);
    expect(mocks.maps.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.inputs.mock.invocationCallOrder[3]!);
    expect(mocks.seed.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.maps.mock.invocationCallOrder[0]!);
    expect(mocks.native).toHaveBeenCalledTimes(1);
    expect(result.timings.map(({ phase }) => phase)).toEqual([
      "workspace-inputs", "web-sourcemaps", "seed-app-config", "resource-tree", "workspace-tarballs",
      "assembled-app", "electron-builder", "xattr-scrub", "payload-artifact", "artifacts", "size-report",
    ]);
  });

  it("fails before packaging side effects when an input is incomplete; never builds as fallback", async () => {
    mocks.inputs.mockRejectedValueOnce(new Error("missing source output"));
    await expect(packageMac(config)).rejects.toThrow("missing source output");
    for (const [name, mock] of Object.entries(mocks)) {
      if (name !== "inputs") expect(mock).not.toHaveBeenCalled();
    }
  });

  it("skips workspace tarball materialization for a restored runtime product", async () => {
    await packageMac(config, "restored-runtime");
    expect(mocks.tarballs).not.toHaveBeenCalled();
    expect(mocks.assemble).toHaveBeenCalledWith(config, expect.anything(), [], "restored-runtime");
  });

  it("retains the complete local build and its existing workspace cache path", async () => {
    const result = await packMac(config);
    expect(mocks.source).toHaveBeenCalledTimes(1);
    expect(mocks.inputs).not.toHaveBeenCalled();
    expect(mocks.maps).not.toHaveBeenCalled(); // local source preparation owns its materialization
    expect(mocks.native).toHaveBeenCalledTimes(1);
    expect(result.timings[0]?.phase).toBe("workspace-build");
  });
});
