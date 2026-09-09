import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipFixture, type ZipFixtureEntries } from "./archive-fixture.ts";
import { afterEach, expect, it, vi } from "vitest";
import { exportBase, importBase } from "@/exact/base-artifact.ts";
const roots: string[] = [];
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it.each([false, true])("restores portable base permissions and links, refusing identity corruption (%s)", async corrupt => {
  const root = await mkdtemp(join(tmpdir(), "base-cache-")); roots.push(root);
  const base = join(root, "source"); await mkdir(base);
  const manifest = JSON.stringify({ schemaVersion: 1, operation: "electron.base.build", target: "darwin-arm64" });
  await writeFile(join(base, "base.json"), manifest); await writeFile(join(base, "native"), "native", { mode: 0o755 }); await symlink("native", join(base, "link"));
  const input = { target: "darwin-arm64", descriptor: join(root, "descriptor.json"),
    output: join(root, "candidate"), buildReceipt: join(root, "build.json") };
  await json(input.buildReceipt, { schemaVersion: 1, operation: "electron.base.build", target: input.target, base: { root: base, manifestSha256: sha(manifest) } });
  await exportBase(input);
  expect(await readdir(input.output)).toEqual(["artifact"]);
  const zip = {} as ZipFixtureEntries;
  for (const name of await readdir(join(input.output, "artifact"))) zip[name] = await readFile(join(input.output, "artifact", name));
  if (corrupt) {
    const receipt = JSON.parse(await readFile(join(input.output, "artifact/base-build-receipt.json"), "utf8"));
    receipt.base.manifestSha256 = "c".repeat(64); zip["base-build-receipt.json"] = JSON.stringify(receipt);
  }
  const bytes = await zipFixture(zip);
  await json(input.descriptor, { url: "https://cache.example/base.zip", sha256: sha(bytes) });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes))));
  const output = join(root, "restored");
  if (corrupt) {
    await expect(importBase({ ...input, output })).rejects.toThrow("binding mismatch");
    await expect(stat(output)).rejects.toThrow("ENOENT"); return;
  }
  await rm(base, { recursive: true });
  const result = await importBase({ ...input, output });
  const receipt = JSON.parse(await readFile(result.buildReceipt, "utf8"));
  expect(receipt.base.root).toBe(join(output, "base"));
  expect(await readlink(join(receipt.base.root, "link"))).toBe("native");
  expect((await stat(join(receipt.base.root, "native"))).mode & 0o777).toBe(0o755);
});
