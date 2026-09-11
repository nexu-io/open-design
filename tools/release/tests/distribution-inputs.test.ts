import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { acquireDistributionInputs } from "@/exact/distribution-inputs.ts";

const mocks = vi.hoisted(() => ({ scene: vi.fn(), base: vi.fn(), toolchain: vi.fn() }));
vi.mock("@/exact/scene-artifact.ts", () => ({ importSceneArtifact: mocks.scene, unpackSceneArtifact: mocks.scene }));
vi.mock("@/exact/base-artifact.ts", () => ({ importBase: mocks.base, unpackBase: mocks.base }));
vi.mock("@/exact/toolchain-artifact.ts", () => ({ importToolchain: mocks.toolchain, unpackToolchain: mocks.toolchain }));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "distribution-inputs-")); roots.push(root);
  return { shell: "electron", target: "darwin-arm64", output: join(root, "inputs"),
    scene: { directory: "produced-scene" }, base: { descriptor: "base.json" }, toolchain: { descriptor: "toolchain.json" } };
}

it("starts independent acquisitions together and waits for every owner after failure", async () => {
  const input = await fixture();
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let count = 0, complete = false;
  const acquire = async () => { if (++count === 3) started.resolve(); await release.promise; };
  mocks.scene.mockImplementation(acquire);
  mocks.base.mockImplementation(async () => { await acquire(); throw new Error("bad digest"); });
  mocks.toolchain.mockImplementation(acquire);
  const pending = acquireDistributionInputs(input);
  const assertion = expect(pending).rejects.toThrow("acquisition failed");
  void pending.then(() => { complete = true; }, () => { complete = true; });
  await started.promise;
  expect(count).toBe(3); expect(complete).toBe(false);
  release.resolve(); await assertion;
  expect(mocks.base).toHaveBeenCalledWith({ target: input.target, descriptor: "base.json", output: join(input.output, "base") });
});

it("keeps Terminal acquisition scene-only", async () => {
  const input = await fixture();
  expect(await acquireDistributionInputs({ shell: "terminal", target: input.target, output: input.output, scene: input.scene }))
    .toEqual({ scene: join(input.output, "scene") });
  expect(mocks.base).not.toHaveBeenCalled(); expect(mocks.toolchain).not.toHaveBeenCalled();
});

it("rejects incomplete topology and existing output before starting work", async () => {
  const input = await fixture();
  await expect(acquireDistributionInputs({ ...input, base: undefined })).rejects.toThrow("topology");
  await acquireDistributionInputs(input);
  vi.clearAllMocks();
  await expect(acquireDistributionInputs(input)).rejects.toThrow("already exists");
  expect(mocks.scene).not.toHaveBeenCalled();
});
