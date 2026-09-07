import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { resolveToolDevConfig } from "../src/config.js";

test("records pre-launch desktop failures in the caller-owned log", async () => {
  const toolsDevRoot = await mkdtemp(join(tmpdir(), "tools-dev-error-log-"));
  const namespace = `log-${randomUUID()}`;
  const env = { ...process.env };
  delete env.OD_ELECTRON_STANDALONE_BOOTSTRAP_URL;
  try {
    // No fixture is supplied, so this exercises the real CLI failure boundary
    // without launching Electron or creating shared product resources.
    await assert.rejects(promisify(execFile)(process.execPath, [
      "--import", "tsx", fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      "start", "desktop", "--namespace", namespace, "--tools-dev-root", toolsDevRoot, "--no-env-file", "--json",
    ], { env }), /--standalone-bootstrap-url is required/u);
    const config = resolveToolDevConfig({ namespace, toolsDevRoot });
    const log = await readFile(config.apps.desktop.latestLogPath, "utf8");
    assert.match(log, /electron\.dev\.start failed: Error: --standalone-bootstrap-url is required/u);
  } finally { await rm(toolsDevRoot, { recursive: true, force: true }); }
});
