import { homedir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { resolveToolPackProductUserDataRoot } from "../src/debug-session.js";

function config(platform: "mac" | "win"): ToolPackConfig {
  return {
    namespace: platform === "win" ? "release-beta-win" : "release-beta",
    platform,
    releaseVersion: "0.19.2-beta.3",
  } as ToolPackConfig;
}

afterEach(() => vi.unstubAllEnvs());

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
});
