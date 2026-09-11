import { cac } from "cac";
import { beforeEach, expect, it, vi } from "vitest";
import { registerBuildCommands } from "@/exact/build-commands.ts";
import { registerDistributionCommands } from "@/exact/distribution-commands.ts";
import { buildReleaseDistribution } from "@/exact/distribution-build.ts";
import { exportReleaseDistribution } from "@/exact/distribution-artifact.ts";

vi.mock("@/exact/distribution-build.ts", () => ({ buildReleaseDistribution: vi.fn() }));
vi.mock("@/exact/distribution-artifact.ts", () => ({ exportReleaseDistribution: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function invoke(args: string[]) {
  const cli = cac("tools-release");
  registerBuildCommands(cli);
  registerDistributionCommands(cli);
  cli.parse(["node", "tools-release", ...args], { run: false });
  await cli.runMatchedCommand();
}

const flags = ["--root", "/workspace", "--shell", "electron", "--target", "darwin-arm64",
  "--output", "/output", "--receipt", "/receipt", "--scene", "/scene", "--prepared", "/prepared",
  "--policy", "/policy", "--channel", "betahyx", "--release-version", "0.1.0-betahyx.22",
  "--source-commit", "a".repeat(40)];

it("owns version-bound build and installer transport without the production command", async () => {
  await invoke(["distribution", "build", ...flags, "--retain-result", "true", "--transport-output", "/transport"]);
  expect(buildReleaseDistribution).toHaveBeenCalledWith(expect.objectContaining({
    retainResult: true, channel: "betahyx", releaseVersion: "0.1.0-betahyx.22", sourceCommit: "a".repeat(40),
  }));
  expect(exportReleaseDistribution).toHaveBeenCalledWith({ source: "/output", output: "/transport" });
});

it("rejects cross-boundary flags and invalid delivery operations before execution", async () => {
  await expect(invoke(["build", "capsule", "--channel", "betahyx"])).rejects.toThrow("Unknown option");
  await expect(invoke(["distribution", "build", ...flags, "--resource-id", "skills"])).rejects.toThrow("Unknown option");
  await expect(invoke(["distribution", "build", ...flags, "--retain-result", "yes"])).rejects.toThrow("true or false");
  await expect(invoke(["distribution", "unknown", ...flags])).rejects.toThrow("operation must be build");
  expect(buildReleaseDistribution).not.toHaveBeenCalled();
});
