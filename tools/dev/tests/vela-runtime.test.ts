import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { resolveDevVelaEnv } from "../src/vela-runtime.js";

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "od-dev-vela-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tool = path.join(root, "tools/dev");
  await mkdir(tool, { recursive: true });
  await writeFile(path.join(tool, "package.json"), '{"name":"test-tools-dev"}');
  return { root, tool };
}

test("daemon launch uses the workspace Vela package despite an older CLI on PATH", async (t) => {
  const { root, tool } = await fixture(t);
  const pkg = path.join(tool, "node_modules/@powerformer/vela-cli");
  await mkdir(pkg, { recursive: true });
  const binary = path.join(pkg, "vela");
  await writeFile(binary, "#!/bin/sh\n", { mode: 0o755 });
  await writeFile(path.join(pkg, "index.js"),
    'exports.resolveVelaCliBin = () => require("node:path").join(__dirname, "vela");');
  const env = { PATH: "/old-global/bin" };
  assert.deepEqual(resolveDevVelaEnv(root, env), { VELA_BIN: await realpath(binary) });
  assert.deepEqual(env, { PATH: "/old-global/bin" });
});

test("an explicitly selected Vela remains authoritative", async (t) => {
  const { root } = await fixture(t);
  assert.deepEqual(resolveDevVelaEnv(root, { VELA_BIN: "/custom/vela" }), {});
});

test("a missing optional package produces actionable startup diagnostics", async (t) => {
  const { root } = await fixture(t);
  const logs: string[] = [];
  assert.deepEqual(resolveDevVelaEnv(root, {}, (message) => logs.push(message)), {});
  assert.match(logs.join("\n"), /pnpm install/);
  assert.match(logs.join("\n"), /PATH/);
});

test("an installed but incomplete package must not silently select a global CLI", async (t) => {
  const { root, tool } = await fixture(t);
  const pkg = path.join(tool, "node_modules/@powerformer/vela-cli");
  await mkdir(pkg, { recursive: true });
  await writeFile(path.join(pkg, "index.js"),
    'exports.resolveVelaCliBin = () => "/missing/vela";');
  assert.throws(() => resolveDevVelaEnv(root, {}), /pnpm install/);
});
