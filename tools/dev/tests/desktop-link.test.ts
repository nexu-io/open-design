import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { ToolDevConfig } from "../src/config.js";
import { createDesktopLink } from "../src/desktop-link.js";

const config = {
  namespace: "scratch",
  workspaceRoot: "/repo/open-design",
} as unknown as ToolDevConfig;

const nodePath = "/opt/node/bin/node";

describe("tools-dev desktop link", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "od-link-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it("embeds node binary, bin entry, workspace, and namespace", async () => {
    const target = path.join(tmpDir, "Open Design (Dev).command");
    const result = await createDesktopLink(config, { path: target }, { platform: "darwin", nodePath });

    const script = await readFile(target, "utf8");
    assert.match(script, /^#!\/bin\/bash/);
    assert.ok(script.includes(JSON.stringify(nodePath)));
    assert.ok(script.includes(JSON.stringify("/repo/open-design/tools/dev/bin/tools-dev.mjs")));
    assert.ok(script.includes('cd "/repo/open-design"'));
    assert.ok(script.includes("--namespace \"scratch\""));
    assert.equal(result.platform, "darwin");
    assert.equal(result.path, target);
  });

  it("writes an executable file and reports created then replaced", async () => {
    const target = path.join(tmpDir, "launcher.command");

    const first = await createDesktopLink(config, { path: target }, { platform: "darwin", nodePath });
    assert.equal(first.written, "created");

    const mode = (await stat(target)).mode & 0o777;
    assert.equal(mode, 0o755);

    const second = await createDesktopLink(config, { path: target }, { platform: "darwin", nodePath });
    assert.equal(second.written, "replaced");
  });

  it("rejects non-macOS platforms", async () => {
    await assert.rejects(
      createDesktopLink(config, { path: path.join(tmpDir, "x.command") }, { platform: "linux", nodePath }),
      /macOS-only/,
    );
  });
});
