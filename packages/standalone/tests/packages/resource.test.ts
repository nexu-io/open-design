import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { archiveNodePlatformResource } from "@/packages/resource-build.js";
import { prepareNodePlatformResource } from "@/packages/resource.js";
import { validateNodePlatformResource } from "@/packages/resource-contract.js";

const bind = vi.hoisted(() => vi.fn(async (root: string) => ({ command: `${root}/bin/node`, env: {} })));
vi.mock("@/packages/runtime.js", () => ({ bindNodePlatform: bind, currentOfficialNodeTarget: () => "darwin-arm64" }));
const roots: string[] = [];
const executables = ["bin/node"];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "node-platform-resource-")); roots.push(root);
  const platform = join(root, "built"), archivePath = join(root, "platform.zip"), cache = join(root, "cache");
  await mkdir(join(platform, "bin"), { recursive: true });
  await writeFile(join(platform, "bin/node"), "official Node fixture");
  await chmod(join(platform, "bin/node"), 0o755);
  await writeFile(join(platform, "platform.json"), "{}");
  await writeFile(join(platform, "LICENSE"), "license");
  const { resource } = await archiveNodePlatformResource({ root: platform, target: "darwin-arm64", archivePath, executables });
  const options = { candidates: [{ path: archivePath, source: "seed" as const }], fetch: vi.fn<typeof fetch>() };
  return { root, platform, archivePath, resource, input: { root: cache, resource }, options };
}

it("archives deterministically and prepares/reuses exact verified bytes before probing", async () => {
  const f = await fixture();
  const second = await archiveNodePlatformResource({ root: f.platform, target: "darwin-arm64", archivePath: join(f.root, "second.zip"), executables });
  expect(second.resource).toEqual(f.resource);
  expect(f.resource.executables).toEqual(["bin/node"]);
  const installed = await prepareNodePlatformResource(f.input, f.options);
  expect(bind).toHaveBeenCalledWith(installed.root, { signal: undefined });
  expect(await readFile(join(installed.root, "bin/node"), "utf8")).toBe("official Node fixture");
  if (process.platform !== "win32") expect((await stat(join(installed.root, "bin/node"))).mode & 0o777).toBe(0o755);
  await rm(f.archivePath);
  expect((await prepareNodePlatformResource(f.input, f.options)).reused).toBe(true);
  expect(f.options.fetch).not.toHaveBeenCalled();
});

it.each(["blob", "tree"])("requires explicit recovery for damaged %s and never silently substitutes versions", async kind => {
  const f = await fixture();
  const first = await prepareNodePlatformResource(f.input, f.options);
  const damaged = kind === "blob" ? first.archive.path : join(first.root, "bin/node");
  await writeFile(damaged, "corrupt"); bind.mockClear();
  await expect(prepareNodePlatformResource(f.input, f.options)).rejects.toThrow("explicit recovery required");
  expect(bind).not.toHaveBeenCalled(); expect(await readFile(damaged, "utf8")).toBe("corrupt");
  expect(f.options.fetch).not.toHaveBeenCalled();
  const repaired = await prepareNodePlatformResource({ ...f.input, recovery: true }, f.options);
  expect(await readFile(join(repaired.root, "bin/node"), "utf8")).toBe("official Node fixture");
  expect(bind).toHaveBeenCalledTimes(1);
});

it("refuses wrong target, unsafe executable paths, and wrong tree digest before any execution", async () => {
  const f = await fixture();
  await expect(prepareNodePlatformResource({ ...f.input, resource: { ...f.resource, target: "darwin-x64" } }, f.options)).rejects.toThrow("target/root");
  for (const path of ["../bin/node", "/bin/node", "C:/node", "bin\\node", "bin/./node"]) {
    expect(() => validateNodePlatformResource({ ...f.resource, executables: ["bin/node", path] })).toThrow("unsafe");
  }
  await expect(prepareNodePlatformResource({ ...f.input, resource: { ...f.resource, treeSha256: "0".repeat(64) } }, f.options)).rejects.toThrow("tree failed verification");
  expect(bind).not.toHaveBeenCalled();
});

it("does not overwrite archives or package symbolic links", async () => {
  const f = await fixture();
  await expect(archiveNodePlatformResource({ root: f.platform, target: "darwin-arm64", archivePath: f.archivePath, executables })).rejects.toThrow("EEXIST");
  if (process.platform !== "win32") {
    await symlink("bin/node", join(f.platform, "node-link"));
    await expect(archiveNodePlatformResource({ root: f.platform, target: "darwin-arm64", archivePath: join(f.root, "bad.zip"), executables })).rejects.toThrow("symbolic links");
  }
});

it("serializes shared preparation under the existing maintenance lock", async () => {
  const f = await fixture();
  const prepared = await Promise.all([prepareNodePlatformResource(f.input, f.options), prepareNodePlatformResource(f.input, f.options)]);
  expect(prepared[0].root).toBe(prepared[1].root);
  expect(prepared.map(result => result.reused).sort()).toEqual([false, true]);
});

it("honors cancellation before acquisition and preserves probe failures", async () => {
  const f = await fixture();
  await expect(prepareNodePlatformResource(f.input, { ...f.options, signal: AbortSignal.abort(new Error("cancelled")) })).rejects.toThrow("cancelled");
  expect(bind).not.toHaveBeenCalled();
  bind.mockRejectedValueOnce(new Error("native ABI mismatch"));
  await expect(prepareNodePlatformResource(f.input, f.options)).rejects.toThrow("runtime probe; explicit recovery required");
});
