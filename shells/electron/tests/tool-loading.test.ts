import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("loads compiled public APIs and idle lifecycle without build dependencies or a test resolver", () => {
  expect(() => execFileSync(process.execPath, ["--input-type=module", "-e",
    `import assert from "node:assert/strict";
     import { createRequire } from "node:module";
     import { mkdtemp, rm } from "node:fs/promises";
     import { join } from "node:path";
     import { tmpdir } from "node:os";
     import { buildElectronPackage, buildElectronScene, buildElectronInstaller } from "@open-design/shell-electron/build";
     import { controlElectronDevelopment, controlElectronRuntime } from "@open-design/shell-electron/lifecycle";
     import { readElectronInstalledManifest } from "@open-design/shell-electron/lifecycle/inspection";
     const root = await mkdtemp(join(tmpdir(), "electron-public-loading-"));
     try {
       for (const build of [buildElectronPackage, buildElectronScene, buildElectronInstaller]) assert.equal(typeof build, "function");
       assert.equal(typeof readElectronInstalledManifest, "function");
       const scope = { channel: "dev", namespace: "public-loading-" + process.pid, controlRuntimeRoot: root };
       const dev = await controlElectronDevelopment({ ...scope, schemaVersion: 2, operation: "electron.dev.status" }, { logFd: 2 });
       const runtime = await controlElectronRuntime({ ...scope, schemaVersion: 1, operation: "electron.runtime.status" });
       assert.equal(dev.status.state, "idle"); assert.equal(runtime.status.state, "idle");
       const loaded = Object.keys(createRequire(import.meta.url).cache);
       assert.equal(loaded.some(path => /node_modules.*(?:esbuild|electron-builder)/u.test(path)), false);
     } finally { await rm(root, { recursive: true, force: true }); }`,
  ], { stdio: "pipe", timeout: 10000 })).not.toThrow();
});
