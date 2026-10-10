import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolPackConfig } from "@/config/index.js";
const calls = vi.hoisted(() => ({
  legacyBuild: vi.fn(), unit: vi.fn(), legacyTarballs: vi.fn(), existingTarballs: vi.fn(),
  legacyAssembly: vi.fn(), existingAssembly: vi.fn(), seed: vi.fn(), validateRuntime: vi.fn(),
}));
vi.mock("@/mac/workspace.js", () => ({ ensureMacWorkspaceBuild: calls.legacyBuild }));
vi.mock("@/workspace/source.js", () => ({ workspaceBuildUnitResult: calls.unit }));
vi.mock("@/web-sourcemaps.js", () => ({ processWebSourcemaps: vi.fn() }));
vi.mock("@/mac/app.js", () => ({ collectWorkspaceTarballs: calls.legacyTarballs, writeAssembledApp: calls.legacyAssembly, copyResourceTree: vi.fn() }));
vi.mock("@/mac/existing-app.js", () => ({ collectExistingWorkspaceTarballs: calls.existingTarballs, writeExistingAssembledApp: calls.existingAssembly }));
vi.mock("@/mac/runtime-product.js", () => ({ validateMacRuntimeProductRoot: calls.validateRuntime }));
vi.mock("@/mac/app-config.js", () => ({ seedPackagedAppConfig: calls.seed }));
vi.mock("@/mac/artifacts.js", () => ({ finalizeMacArtifacts: vi.fn(async () => ({})) }));
vi.mock("@/mac/builder.js", () => ({ resolveElectronBuilderTargets: vi.fn(() => []), runElectronBuilder: vi.fn() }));
vi.mock("@/mac/fs.js", () => ({ scrubMacExtendedAttributes: vi.fn() }));
vi.mock("@/mac/payload.js", () => ({ createMacLauncherPayloadArchive: vi.fn() }));
vi.mock("@/mac/paths.js", () => ({ resolveMacPaths: vi.fn(() => ({ appPath: "/app" })) }));
vi.mock("@/mac/report.js", () => ({ collectMacSizeReport: vi.fn() }));
import { packMac, packageMac } from "@/mac/build.js";
const config = { roots: { cacheRoot: "/cache", output: { namespaceRoot: "/output" }, runtime: { namespaceRoot: "/runtime" } }, to: "app" } as ToolPackConfig;
beforeEach(() => {
  vi.resetAllMocks();
  calls.legacyTarballs.mockResolvedValue([]);
  calls.existingTarballs.mockResolvedValue([]);
});
describe("explicit Mac source consumption", () => {
  it("preserves the full build and assembly path for the old build entry", async () => {
    await packMac(config);
    expect(calls.legacyBuild).toHaveBeenCalledOnce();
    expect(calls.legacyAssembly).toHaveBeenCalledOnce();
    expect(calls.unit).not.toHaveBeenCalled();
    expect(calls.existingAssembly).not.toHaveBeenCalled();
  });
  it("validates all restored units without rebuilding source", async () => {
    await packageMac(config);
    expect(calls.unit.mock.calls.map(([, unit]) => unit)).toEqual(["packages", "daemon", "web", "shell"]);
    expect(calls.legacyBuild).not.toHaveBeenCalled();
    expect(calls.existingAssembly).toHaveBeenCalledOnce();
  });
  it("rejects incomplete source before touching assembly, without a build fallback", async () => {
    calls.unit.mockRejectedValueOnce(new Error("missing source"));
    await expect(packageMac(config)).rejects.toThrow("missing source");
    expect(calls.seed).not.toHaveBeenCalled();
    expect(calls.legacyBuild).not.toHaveBeenCalled();
  });
  it("requires compatible runtime input before proceeding and skips fresh dependency tarballs", async () => {
    await packageMac(config, "/runtime-product");
    expect(calls.validateRuntime).toHaveBeenCalledWith(config, "/runtime-product");
    expect(calls.existingTarballs).not.toHaveBeenCalled();
    expect(calls.existingAssembly).toHaveBeenCalledWith(config, expect.anything(), [], "/runtime-product");
  });
});
