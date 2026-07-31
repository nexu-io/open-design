import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  prepareNodePtyRuntime,
  validateNodePtyRuntime,
} from "../src/node-pty-runtime.js";

describe("node-pty packaged runtime closure", () => {
  it("repairs and validates the target macOS prebuild", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-node-pty-runtime-"));
    const prebuildRoot = join(root, "node_modules", "node-pty", "prebuilds", "darwin-arm64");

    try {
      await mkdir(prebuildRoot, { recursive: true });
      await writeFile(join(prebuildRoot, "pty.node"), Buffer.alloc(32 * 1024, 1));
      await writeFile(join(prebuildRoot, "spawn-helper"), "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(join(prebuildRoot, "spawn-helper"), 0o644);

      await expect(prepareNodePtyRuntime({
        appRoot: root,
        arch: "arm64",
        platform: "darwin",
      })).resolves.toBeUndefined();
      expect((await stat(join(prebuildRoot, "spawn-helper"))).mode & 0o111).not.toBe(0);
      await expect(validateNodePtyRuntime({
        appRoot: root,
        arch: "arm64",
        platform: "darwin",
      })).resolves.toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reports a missing macOS helper before signing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-node-pty-runtime-"));
    const prebuildRoot = join(root, "node_modules", "node-pty", "prebuilds", "darwin-x64");

    try {
      await mkdir(prebuildRoot, { recursive: true });
      await writeFile(join(prebuildRoot, "pty.node"), Buffer.alloc(32 * 1024, 1));

      await expect(validateNodePtyRuntime({
        appRoot: root,
        arch: "x64",
        platform: "darwin",
      })).resolves.toMatch(/spawn-helper is missing/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("validates the Windows native modules and companions", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-node-pty-runtime-"));
    const prebuildRoot = join(root, "node_modules", "node-pty", "prebuilds", "win32-x64");

    try {
      await mkdir(prebuildRoot, { recursive: true });
      for (const fileName of [
        "conpty.node",
        "conpty_console_list.node",
        "pty.node",
        "winpty-agent.exe",
        "winpty.dll",
      ]) {
        await writeFile(join(prebuildRoot, fileName), Buffer.alloc(32 * 1024, 1));
      }

      await expect(validateNodePtyRuntime({
        appRoot: root,
        arch: "x64",
        platform: "win32",
      })).resolves.toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
