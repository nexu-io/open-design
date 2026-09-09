import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { contributeBase, restoreBase } from "@/exact/base-cache.ts";
const roots: string[] = [];
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it.each([false, true])("restores portable base permissions and links, refusing identity corruption (%s)", async corrupt => {
  const root = await mkdtemp(join(tmpdir(), "base-cache-")); roots.push(root);
  const base = join(root, "source"); await mkdir(base);
  const manifest = JSON.stringify({ schemaVersion: 1, operation: "electron.base.build", target: "darwin-arm64" });
  await writeFile(join(base, "base.json"), manifest); await writeFile(join(base, "native"), "native", { mode: 0o755 }); await symlink("native", join(base, "link"));
  const node = { id: "electron.base.build", target: "darwin-arm64", identity: `sha256:${"a".repeat(64)}` };
  const input = { plan: join(root, "plan.json"), pending: join(root, "pending.json"), workload: "electron_base_darwin_arm64",
    output: join(root, "candidate"), artifact: "base-artifact", buildReceipt: join(root, "build.json") };
  await json(input.plan, { schemaVersion: 1, plan: { target: node.target, nodes: { [node.id]: node } } });
  await json(input.buildReceipt, { schemaVersion: 1, operation: node.id, target: node.target, planNode: node, base: { root: base, manifestSha256: sha(manifest) } });
  await json(input.pending, { workloads: { [input.workload]: { run: true, resultHit: false, digest: "b".repeat(64), executionClass: { runnerClass: "mac", labels: ["macos-15"] } } } });
  await contributeBase(input);
  const zip = new JSZip();
  for (const name of await readdir(join(input.output, "artifact"))) zip.file(name, await readFile(join(input.output, "artifact", name)));
  if (corrupt) {
    const receipt = JSON.parse(await readFile(join(input.output, "artifact/base-build-receipt.json"), "utf8"));
    receipt.planNode.identity = `sha256:${"c".repeat(64)}`; zip.file("base-build-receipt.json", JSON.stringify(receipt));
  }
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  await json(input.pending, { workloads: { [input.workload]: { run: false, resultHit: true, result: { products: { base: {
    type: "url", source: "https://cache.example/base.zip", data: { sha256: sha(bytes) },
  } } } } } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes))));
  const output = join(root, "restored");
  if (corrupt) {
    await expect(restoreBase({ ...input, output })).rejects.toThrow("binding mismatch");
    await expect(stat(output)).rejects.toThrow("ENOENT"); return;
  }
  await rm(base, { recursive: true });
  const result = await restoreBase({ ...input, output });
  const receipt = JSON.parse(await readFile(result.buildReceipt, "utf8"));
  expect(receipt.base.root).toBe(join(output, "base"));
  expect(await readlink(join(receipt.base.root, "link"))).toBe("native");
  expect((await stat(join(receipt.base.root, "native"))).mode & 0o777).toBe(0o755);
});
