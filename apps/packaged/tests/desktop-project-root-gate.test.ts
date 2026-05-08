/**
 * Coverage for the path-allowlist gate that the new shell.openPath
 * IPC handler in `apps/desktop/src/main/runtime.ts` checks before
 * forwarding any renderer-supplied string to Electron's
 * `shell.openPath`. The packaged workspace hosts the test because
 * `apps/desktop` itself has no vitest setup yet — same reasoning as
 * the existing `desktop-url-allowlist.test.ts` next to this file.
 *
 * @see https://github.com/nexu-io/open-design/pull/974 (mrcfps's P1
 * review on runtime.ts:305 — shell:open-path must not accept
 * arbitrary renderer paths).
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createProjectRootGate,
  validateExistingDirectory,
} from "@open-design/desktop/main";

let tempRoot = "";

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(tmpdir(), "od-desktop-gate-"));
});

afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  }
});

describe("validateExistingDirectory", () => {
  it("rejects empty / non-string input", async () => {
    const empty = await validateExistingDirectory("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toMatch(/non-empty string/i);
  });

  it("rejects relative paths", async () => {
    const relative = await validateExistingDirectory("relative/site");
    expect(relative.ok).toBe(false);
    if (!relative.ok) expect(relative.reason).toMatch(/absolute/i);
  });

  it("rejects non-existent absolute paths", async () => {
    const ghost = path.join(tempRoot, "does-not-exist");
    const result = await validateExistingDirectory(ghost);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exist/i);
  });

  it("rejects absolute paths that point at files rather than directories", async () => {
    const file = path.join(tempRoot, "file.txt");
    writeFileSync(file, "not a directory");
    const result = await validateExistingDirectory(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/directory/i);
  });

  it("accepts an existing absolute directory and returns the realpath", async () => {
    const result = await validateExistingDirectory(tempRoot);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved).toBe(tempRoot);
  });

  it("realpath-resolves symlinks so attackers cannot register one path and reach another", async () => {
    const realDir = path.join(tempRoot, "real");
    await mkdir(realDir);
    const linkDir = path.join(tempRoot, "link");
    symlinkSync(realDir, linkDir, "dir");
    const result = await validateExistingDirectory(linkDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved).toBe(realDir);
  });
});

describe("ProjectRootGate", () => {
  it("starts empty", () => {
    const gate = createProjectRootGate();
    expect(gate.size()).toBe(0);
  });

  it("rejects shell.openPath candidates that have not been registered", async () => {
    const gate = createProjectRootGate();
    expect(gate.isApproved(tempRoot)).toBe(false);
  });

  it("accepts shell.openPath candidates that match a previously registered root", async () => {
    const gate = createProjectRootGate();
    const registered = await gate.register(tempRoot);
    expect(registered).toBe(true);
    expect(gate.isApproved(tempRoot)).toBe(true);
    expect(gate.size()).toBe(1);
  });

  it("rejects registration of a non-existent path so the allowlist cannot be poisoned", async () => {
    const gate = createProjectRootGate();
    const ghost = path.join(tempRoot, "does-not-exist");
    const ok = await gate.register(ghost);
    expect(ok).toBe(false);
    expect(gate.isApproved(ghost)).toBe(false);
    expect(gate.size()).toBe(0);
  });

  it("rejects registration of files (only directories are project roots)", async () => {
    const gate = createProjectRootGate();
    const file = path.join(tempRoot, "not-a-dir.txt");
    writeFileSync(file, "");
    const ok = await gate.register(file);
    expect(ok).toBe(false);
    expect(gate.size()).toBe(0);
  });

  it("registers the realpath so a symlinked registration is matched against the real directory", async () => {
    const gate = createProjectRootGate();
    const realDir = path.join(tempRoot, "real");
    await mkdir(realDir);
    const linkDir = path.join(tempRoot, "link");
    symlinkSync(realDir, linkDir, "dir");

    expect(await gate.register(linkDir)).toBe(true);
    // The resolved path is the real dir, not the symlink.
    expect(gate.isApproved(realDir)).toBe(true);
    expect(gate.isApproved(linkDir)).toBe(false);
  });

  it("reset() empties the allowlist (test isolation hook)", async () => {
    const gate = createProjectRootGate();
    await gate.register(tempRoot);
    expect(gate.size()).toBe(1);
    gate.reset();
    expect(gate.size()).toBe(0);
    expect(gate.isApproved(tempRoot)).toBe(false);
  });
});
