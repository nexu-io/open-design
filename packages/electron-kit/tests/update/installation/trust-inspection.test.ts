import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { inspectMacElectronAppTrust } from "@/update/installation/platform-trust.js";

it.each(["not set", "ABC1234XYZ"])("detects %s trust with exactly one deep verification", async team => {
  const root = await mkdtemp(join(tmpdir(), "trust-inspection-")), appPath = join(root, "Example.app");
  try {
    await mkdir(appPath);
    const run = vi.fn(async (_executable: string, args: readonly string[]) => ({ stdout: args[0] === "-extract" ? "Example" : "",
      stderr: args[0] === "--display" ? `Identifier=io.example\nTeamIdentifier=${team}\n# designated => identifier io.example\n` : "" }));
    const result = await inspectMacElectronAppTrust({ appPath, mode: "detect", run });
    expect(result.gatekeeperAssessed).toBe(team !== "not set");
    expect(run.mock.calls.filter(([, args]) => args[0] === "--verify")).toHaveLength(1);
    expect(run.mock.calls.filter(([, args]) => args[0] === "--display")).toHaveLength(1);
    expect(run.mock.calls.filter(([command]) => command === "/usr/sbin/spctl")).toHaveLength(team === "not set" ? 0 : 1);
    expect(run.mock.calls.filter(([, args]) => args[0] === "stapler")).toHaveLength(team === "not set" ? 0 : 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("does not downgrade a failed formal check to verify-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "trust-inspection-")), appPath = join(root, "Example.app");
  try {
    await mkdir(appPath);
    const run = vi.fn(async (_executable: string, args: readonly string[]) => {
      if (args[0] === "stapler") throw new Error("missing ticket");
      return { stdout: "", stderr: "Identifier=io.example\nTeamIdentifier=ABC1234XYZ\n" };
    });
    await expect(inspectMacElectronAppTrust({ appPath, mode: "detect", run })).rejects.toThrow("missing ticket");
  } finally { await rm(root, { recursive: true, force: true }); }
});
