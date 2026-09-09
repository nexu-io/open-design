import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn(() => {
  const child = new EventEmitter(); queueMicrotask(() => child.emit("close", 0, null)); return child;
}) }));
vi.mock("esbuild", () => ({ build: vi.fn(async ({ outfile }: { outfile: string }) => { await writeFile(outfile, "runtime-entry"); }) }));
import { buildClosureRuntimeResources } from "../src/build/runtime-resources.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("produces only runtime archives without any data source tree and refuses existing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "closure-runtime-resources-")); roots.push(root);
  for (const path of ["apps/web/.next/standalone/apps/web", "apps/web/.next/static", "apps/web/public"]) await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, "apps/web/.next/static/chunk.js"), "web-static");
  const outputDirectory = join(root, "output");
  const receipt = await buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory });
  expect(receipt.operation).toBe("closure.runtime-resources.build");
  expect(receipt.resources.map(resource => resource.id)).toEqual(["open-design-daemon", "open-design-web"]);
  expect(await readdir(outputDirectory)).toEqual(["artifacts"]);
  const web = await JSZip.loadAsync(await readFile(receipt.resources[1]!.path));
  expect(await web.file("standalone/apps/web/.next/static/chunk.js")!.async("string")).toBe("web-static");
  expect(await web.file("sidecar.mjs")!.async("string")).toBe("runtime-entry");
  await expect(buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory })).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readdir(join(outputDirectory, "artifacts"))).toEqual(["open-design-daemon.zip", "open-design-web.zip"]);
});
