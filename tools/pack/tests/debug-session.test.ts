import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import {
  beginToolPackDebugSession,
  parkToolPackDebugSession,
  resolveToolPackProductUserDataRoot,
  restoreToolPackDebugSession,
} from "../src/debug-session.js";

const roots: string[] = [];

function config(platform: "mac" | "win"): ToolPackConfig {
  return {
    namespace: platform === "win" ? "release-beta-win" : "release-beta",
    platform,
    releaseVersion: "0.19.2-beta.3",
  } as ToolPackConfig;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("tools-pack release debug session root", () => {
  it("uses the channel-neutral Electron bootstrap profile on Windows", () => {
    vi.stubEnv("APPDATA", "C:\\Users\\runneradmin\\AppData\\Roaming");

    expect(resolveToolPackProductUserDataRoot(config("win"))).toBe(
      join("C:\\Users\\runneradmin\\AppData\\Roaming", "Open Design"),
    );
  });

  it("keeps the channel-specific Electron bundle profile on macOS", () => {
    expect(resolveToolPackProductUserDataRoot(config("mac"))).toBe(
      join(homedir(), "Library", "Application Support", "Open Design Beta"),
    );
  });

  it("re-arms the same parked transaction for a rollback cold start", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-debug-session-"));
    roots.push(root);
    const value = {
      ...config("mac"),
      debugChannel: "beta",
      debugProductUserDataRoot: join(root, "product"),
      roots: { runtime: { namespaceBaseRoot: join(root, "namespaces") } },
    } as ToolPackConfig;

    const initial = await beginToolPackDebugSession(value);
    expect(initial?.state).toBe("pending");
    await expect(parkToolPackDebugSession(value)).resolves.toBe(true);
    const rearmed = await beginToolPackDebugSession(value);
    expect(rearmed).toMatchObject({ sessionId: initial?.sessionId, state: "pending" });
    await expect(restoreToolPackDebugSession(value, initial?.sessionId)).resolves.toBe(true);
  });
});
