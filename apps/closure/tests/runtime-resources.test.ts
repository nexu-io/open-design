import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract } from "@open-design/archive";
import type { SpawnOptions } from "node:child_process";
import { spawn } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn((command: string, args: readonly string[], options: SpawnOptions) => {
  if (options.stdio !== "inherit") return actual.spawn(command, args, options);
  const child = new EventEmitter(); queueMicrotask(() => child.emit("close", 0, null)); return child;
}) }; });
vi.mock("esbuild", () => ({ build: vi.fn(async ({ outfile }: { outfile: string }) => { await writeFile(outfile, "runtime-entry"); }) }));
import { buildClosureRuntimeResources } from "../src/build/runtime-resources.js";

const roots: string[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it.each(["open-design-daemon", "open-design-web"] as const)("builds %s without invoking or requiring the other app", async id => {
  const root = await mkdtemp(join(tmpdir(), "closure-selected-runtime-")); roots.push(root);
  if (id === "open-design-web") {
    for (const path of ["apps/web/.next/standalone/apps/web", "apps/web/.next/static", "apps/web/public"]) await mkdir(join(root, path), { recursive: true });
  }
  const receipt = await buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory: join(root, "output"), resourceIds: [id] });
  expect(receipt.resources.map(resource => resource.id)).toEqual([id]);
  const appBuilds = vi.mocked(spawn).mock.calls.filter(call => (call[2] as SpawnOptions)?.stdio === "inherit")
    .map(call => (call[1] as string[]).join(" "));
  expect(appBuilds.some(args => args.includes(id === "open-design-daemon" ? "@open-design/web" : "@open-design/daemon"))).toBe(false);
  expect(appBuilds.some(args => args.includes(id === "open-design-daemon" ? "@open-design/daemon" : "@open-design/web"))).toBe(true);
  expect(await readdir(join(root, "output/artifacts"))).toEqual([`${id}.zip`]);
});

it.each([[], null, ["unknown"], ["open-design-web", "open-design-web"]].map(resourceIds => ({ resourceIds })))("rejects invalid selection before creating output ($resourceIds)", async ({ resourceIds }) => {
  const root = await mkdtemp(join(tmpdir(), "closure-invalid-runtime-")); roots.push(root);
  await expect(buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory: join(root, "output"),
    resourceIds: resourceIds as never })).rejects.toThrow("invalid runtime resource selection");
  expect(await readdir(root)).toEqual([]);
  expect(spawn).not.toHaveBeenCalled();
});

it("produces only runtime archives without any data source tree and refuses existing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "closure-runtime-resources-")); roots.push(root);
  for (const path of ["apps/web/.next/standalone/apps/web", "apps/web/.next/static", "apps/web/public"]) await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, "apps/web/.next/static/chunk.js"), "web-static");
  await writeFile(join(root, "apps/web/.next/static/chunk.js.map"), "excluded source map");
  const outputDirectory = join(root, "output");
  const receipt = await buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory });
  expect(receipt.operation).toBe("closure.runtime-resources.build");
  expect(receipt.resources.map(resource => resource.id)).toEqual(["open-design-daemon", "open-design-web"]);
  expect(await readdir(outputDirectory)).toEqual(["artifacts"]);
  const unpacked = join(root, "unpacked"); await extract(receipt.resources[1]!.path, unpacked);
  expect(await readFile(join(unpacked, "standalone/apps/web/.next/static/chunk.js"), "utf8")).toBe("web-static");
  await expect(readFile(join(unpacked, "standalone/apps/web/.next/static/chunk.js.map"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(root, "apps/web/.next/static/chunk.js.map"), "utf8")).toBe("excluded source map");
  expect(await readFile(join(unpacked, "sidecar.mjs"), "utf8")).toBe("runtime-entry");
  await expect(buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory })).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readdir(join(outputDirectory, "artifacts"))).toEqual(["open-design-daemon.zip", "open-design-web.zip"]);
});
