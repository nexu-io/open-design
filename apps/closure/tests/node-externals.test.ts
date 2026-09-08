import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterEach, expect, it } from "vitest";
import { closureNodeExternals } from "../src/build/node-externals.js";
import { closureRuntimeDependencies } from "../src/build/runtime-dependencies.js";

const execute = promisify(execFile);
const roots: string[] = [];
it("does not install Shell-owned ABI packages into Closure", () => {
  expect(closureRuntimeDependencies).not.toHaveProperty("better-sqlite3");
  expect(closureRuntimeDependencies).not.toHaveProperty("node-pty");
});
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("resolves static and dynamic native imports from the supplied Node environment outside Closure", async () => {
  const root = await mkdtemp(join(tmpdir(), "closure-node-externals-")); roots.push(root);
  const modules = join(root, "physical", "node_modules"), closure = join(root, "closure");
  for (const name of ["better-sqlite3", "node-pty"]) {
    await mkdir(join(modules, name), { recursive: true });
    await writeFile(join(modules, name, "package.json"), JSON.stringify({ name, main: "index.cjs" }));
    await writeFile(join(modules, name, "index.cjs"), `module.exports = { source: ${JSON.stringify(name)}, spawn: () => 'pty-ready' };`);
  }
  await mkdir(closure);
  const entry = join(closure, "input.mjs"), output = join(closure, "output.mjs");
  await writeFile(entry, `import sqlite from 'better-sqlite3'; const pty = await import('node-pty'); console.log(JSON.stringify({ sqlite: sqlite.source, pty: pty.spawn() }));`);
  const env = { ...process.env, NODE_OPTIONS: "", NODE_PATH: modules, ELECTRON_RUN_AS_NODE: "" };
  // The native ESM resolver really fails with this environment before bundling.
  await expect(execute(process.execPath, [entry], { env, timeout: 5000 })).rejects.toThrow(/Cannot find package 'better-sqlite3'/u);
  await build({ entryPoints: [entry], outfile: output, bundle: true, platform: "node", target: "node24", format: "esm",
    external: Object.keys(closureRuntimeDependencies), plugins: [closureNodeExternals()],
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
  const result = await execute(process.execPath, [output], { env, timeout: 5000 });
  expect(JSON.parse(result.stdout)).toEqual({ sqlite: "better-sqlite3", pty: "pty-ready" });
  expect(await readFile(output, "utf8")).not.toContain(modules);
  // No ambient fallback when the Shell does not provide its modules.
  await expect(execute(process.execPath, [output], { env: { ...env, NODE_PATH: "" }, timeout: 5000 })).rejects.toThrow(/Cannot find module 'better-sqlite3'/u);
});
