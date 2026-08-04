import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertNativeServerTarget,
  resolveServerPackConfig,
} from "../src/server/config.js";

describe("server package config", () => {
  it("resolves the repository root from both source and bundled tools-pack code", () => {
    const config = resolveServerPackConfig({
      appVersion: "1.2.3",
      releaseId: "release-1",
    });

    expect(config.workspaceRoot).toBe(
      join(import.meta.dirname, "../../.."),
    );
  });

  it("resolves an immutable platform archive layout", () => {
    const config = resolveServerPackConfig({
      appVersion: "1.2.3",
      arch: "arm64",
      dir: "/tmp/open-design-server-pack",
      platform: "darwin",
      releaseId: "1.2.3+abc1234",
      workspaceRoot: "/workspace/open-design",
    });

    expect(config.target).toEqual({ arch: "arm64", platform: "darwin" });
    expect(config.topLevelName).toBe("open-design-server-1.2.3-darwin-arm64");
    expect(config.releaseRoot).toBe(
      join(
        "/tmp/open-design-server-pack",
        "out",
        "server",
        "darwin-arm64",
        "stage",
        "open-design-server-1.2.3-darwin-arm64",
        "releases",
        "1.2.3+abc1234",
      ),
    );
    expect(config.archivePath).toBe(
      join(
        "/tmp/open-design-server-pack",
        "out",
        "server",
        "darwin-arm64",
        "open-design-server-1.2.3-darwin-arm64.tar.gz",
      ),
    );
    expect(config.sha256Path).toBe(`${config.archivePath}.sha256`);
    expect(config.sha256SumsPath).toBe(
      join(
        "/tmp/open-design-server-pack",
        "out",
        "server",
        "darwin-arm64",
        "SHA256SUMS",
      ),
    );
  });

  it("uses zip for native Windows archives", () => {
    const config = resolveServerPackConfig({
      appVersion: "1.2.3",
      arch: "x64",
      dir: "C:\\od-server-pack",
      platform: "win32",
      releaseId: "1.2.3+abc1234",
      workspaceRoot: "C:\\workspace\\open-design",
    });

    expect(config.archivePath).toMatch(/open-design-server-1\.2\.3-win32-x64\.zip$/);
  });

  it("rejects cross-target native package builds", () => {
    expect(() =>
      assertNativeServerTarget(
        { arch: "arm64", platform: "linux" },
        { arch: "x64", platform: "linux" },
      ),
    ).toThrow(/must run on a native linux-arm64 host/);
  });

  it("rejects versions that are not portable path segments", () => {
    expect(() =>
      resolveServerPackConfig({
        appVersion: "1.2.3:preview",
        releaseId: "release-1",
        workspaceRoot: "/workspace/open-design",
      }),
    ).toThrow(/--app-version must be a non-empty path-safe value/);
  });
});
