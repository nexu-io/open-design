import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { withDistributionResult } from "@/exact/distribution-result.ts";
import { describeFile, writeObject } from "@/exact/control-common.ts";
import { resolveReleasePolicy } from "@/policy/release-profile.ts";

const { objects } = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }));
vi.mock("@/exact/release-object.ts", () => ({ releaseObjects: () => ({
  read: async (name: string) => objects.get(name), create: async (name: string, bytes: Buffer) => {
    if (objects.has(name) && !objects.get(name)!.equals(bytes)) throw new Error("immutable collision");
    objects.set(name, bytes);
  },
}) }));
const roots: string[] = [];
afterEach(async () => { objects.clear(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(shell = "electron") {
  const root = await mkdtemp(join(tmpdir(), "distribution-result-")); roots.push(root);
  const output = join(root, "built"), receipt = join(output, "distribution-receipt.json");
  const policy = resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation", channel: "betahyx",
    releaseVersion: "0.1.0-betahyx.21", sourceCommit: "a".repeat(40), sourceRef: "refs/heads/test",
    switches: { endUserDistribution: false, stableAuthorized: false }, target: { endpointUrl: "https://storage.example", bucket: "releases",
      publicBaseUrl: "https://public.example", latestChannelHeadUrl: "https://storage.example/releases/betahyx/latest/channel-head.json" } });
  const build = vi.fn(async () => {
    await mkdir(output); const file = join(output, "installer.dmg"); await writeFile(file, "original signed bytes");
    const result = { schemaVersion: 1, operation: "shell.distribution.contribute", shell: { type: shell }, target: "darwin-arm64",
      artifact: await describeFile(file), platformTrust: { mode: "formal", teamIdentifier: "TEAM" } };
    await writeObject(join(output, "shell-contribution.json"), result); await writeObject(receipt, result);
    return shell === "terminal" ? { schemaVersion: 1, operation: "terminal.distribution.build", archive: result.artifact } : result;
  });
  return { policy, shell, target: "darwin-arm64", binding: { policy, content: "a".repeat(64), signerTeamId: "TEAM" }, output, receipt, build, root };
}
it.each(["electron", "terminal"])("restores exact completed %s bytes from the contribution, not the builder's execution receipt", async shell => {
  const f = await fixture(shell), original = await withDistributionResult(f);
  const output = join(f.root, "retry"), receipt = join(output, "distribution-receipt.json");
  expect(await withDistributionResult({ ...f, output, receipt })).toEqual(original);
  expect(f.build).toHaveBeenCalledTimes(1);
  expect(await readFile(join(output, "installer.dmg"), "utf8")).toBe("original signed bytes");
});
it("refuses a builder return value without its completed contribution file", async () => {
  const f = await fixture();
  const build = async () => { const result = await f.build(); await rm(join(f.output, "shell-contribution.json")); return result; };
  await expect(withDistributionResult({ ...f, build })).rejects.toMatchObject({ code: "ENOENT" });
  expect(objects.size).toBe(0);
});
it("rejects changed signing inputs and corrupted completed bytes", async () => {
  const f = await fixture(); await withDistributionResult(f);
  const output = join(f.root, "retry");
  await expect(withDistributionResult({ ...f, output, binding: { ...f.binding, content: "different" } })).rejects.toThrow("binding mismatch");
  objects.set("native/electron/darwin-arm64/installer.dmg", Buffer.from("corrupt"));
  await expect(withDistributionResult({ ...f, output })).rejects.toThrow("binding verification failed");
  expect(f.build).toHaveBeenCalledTimes(1);
});
it("does not erase an unfinished local output or mark it as a completed result", async () => {
  const f = await fixture(); await mkdir(f.output);
  await expect(withDistributionResult(f)).rejects.toThrow("already exists");
  expect(f.build).not.toHaveBeenCalled(); expect(objects.size).toBe(0);
});
