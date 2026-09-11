import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pack } from "@open-design/archive/build";
import { afterEach, expect, it, vi } from "vitest";
import { importToolchain, resolveToolchainPackage, unpackToolchain } from "@/exact/toolchain-artifact.ts";
import { zipFixture } from "./archive-fixture.ts";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
it.skipIf(process.platform !== "darwin").each([false, true])("restores an authenticated portable toolchain with internal self-links (corrupt=%s)", async corrupt => {
  vi.stubEnv("ARCHIVE_ZIP_PATH", "/usr/bin/zip");
  const root = await mkdtemp(join(tmpdir(), "toolchain-artifact-")); roots.push(root);
  const source = join(root, "source"), transport = join(root, "transport"), output = join(root, "restored");
  await mkdir(join(source, "package/node_modules"), { recursive: true });
  await mkdir(transport);
  await writeFile(join(source, "package/package.json"), JSON.stringify({ name: "@open-design/shell-electron", version: "0.2.0" }));
  await writeFile(join(source, "package/native"), "native", { mode: 0o755 });
  await symlink("..", join(source, "package/node_modules/self"), "dir");
  const archive = await pack(source, join(transport, "toolchain.zip"), { allowInternalLinks: true });
  const target = "darwin-" + process.arch;
  const receipt = { schemaVersion: 1, operation: "electron.toolchain.build", target,
    packageName: "@open-design/shell-electron", packageVersion: "0.2.0", nodeMajor: Number(process.versions.node.split(".")[0]),
    archive: { sha256: corrupt ? "0".repeat(64) : archive.sha256, size: archive.size } };
  await writeFile(join(transport, "toolchain.json"), JSON.stringify(receipt));
  const bytes = await zipFixture({ "toolchain.zip": await readFile(join(transport, "toolchain.zip")), "toolchain.json": JSON.stringify(receipt) });
  const descriptor = join(root, "descriptor.json");
  await writeFile(descriptor, JSON.stringify({ url: "https://cache.example/toolchain.zip", sha256: createHash("sha256").update(bytes).digest("hex") }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes))));
  if (corrupt) {
    await expect(importToolchain({ target, descriptor, output })).rejects.toThrow("binding verification failed");
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    return;
  }
  await rm(source, { recursive: true, force: true });
  const result = await importToolchain({ target, descriptor, output });
  expect(await resolveToolchainPackage(output, target)).toBe(result.packageDirectory);
  expect(await readlink(join(result.packageDirectory, "node_modules/self"))).toBe("..");
  expect((await stat(join(result.packageDirectory, "native"))).mode & 0o777).toBe(0o755);
  await expect(unpackToolchain({ target, source: transport, output })).rejects.toThrow("already exists");
});
