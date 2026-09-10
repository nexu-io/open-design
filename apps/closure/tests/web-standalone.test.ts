import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { copyClosureWebStandalone } from "../src/build/web-standalone.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("materializes the app and transitive dependency view without a duplicate virtual store", async () => {
  const root = await mkdtemp(join(tmpdir(), "closure-web-layout-")); roots.push(root);
  const source = join(root, "source"), output = join(root, "output");
  const app = join(source, "apps/web"), store = join(source, "node_modules/.pnpm");
  const view = join(store, "node_modules");
  await Promise.all([mkdir(join(app, "node_modules"), { recursive: true }), mkdir(view, { recursive: true })]);
  for (const [name, body] of [["main", 'module.exports=require("dep")'], ["dep", 'module.exports="resolved-transitive"']]) {
    const directory = join(store, `${name}@1/node_modules/${name}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.js"), body!);
    await symlink(directory, join(view, name!), "junction");
  }
  await symlink(join(view, "main"), join(app, "node_modules/main"), "junction");
  await writeFile(join(app, "server.js"), 'module.exports=require("main")');
  await copyClosureWebStandalone(source, output);
  expect(await readdir(output)).toEqual(["apps"]);
  const require = createRequire(join(output, "apps/web/server.js"));
  expect(require("./server.js")).toBe("resolved-transitive");
  expect(await readFile(join(view, "main/index.js"), "utf8")).toBe('module.exports=require("dep")');
});

it("rejects unfamiliar root dependencies before creating output", async () => {
  const root = await mkdtemp(join(tmpdir(), "closure-web-layout-")); roots.push(root);
  await mkdir(join(root, "source/node_modules/unexpected"), { recursive: true });
  await expect(copyClosureWebStandalone(join(root, "source"), join(root, "output"))).rejects.toThrow("unsupported Next standalone");
  expect(await readdir(root)).toEqual(["source"]);
});
