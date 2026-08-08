import { resolveClosureStorePaths } from "@open-design/closure-store";
import { updateClosureFromRelease } from "@open-design/closure-update";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkForPackagedClosureUpdate,
  resolvePackagedClosureReleaseTarget,
  resolvePackagedClosureReleaseVersion,
} from "../src/closure-update.js";

vi.mock("@open-design/closure-update", () => ({
  updateClosureFromRelease: vi.fn(async (input: unknown) => ({
    candidate: { releaseTarget: (input as { releaseTarget: string }).releaseTarget },
    reason: "already-active",
    state: "retained",
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("packaged Closure update adapter", () => {
  it("maps supported shell hosts to release Closure targets", () => {
    expect(resolvePackagedClosureReleaseTarget("darwin", "arm64")).toEqual({
      platform: "darwin-arm64",
      releaseTarget: "mac_arm64",
    });
    expect(resolvePackagedClosureReleaseTarget("win32", "x64")).toEqual({
      platform: "win32-x64",
      releaseTarget: "win_x64",
    });
    expect(resolvePackagedClosureReleaseTarget("linux", "x64")).toBeNull();
    expect(resolvePackagedClosureReleaseTarget("darwin", "x64")).toBeNull();
  });

  it("supplies explicit shell paths and identity to the shared updater", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const result = await checkForPackagedClosureUpdate({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      namespace: "release-beta",
      shellVersion: "0.18.0-beta.4",
    }, { arch: "arm64", fetch, platform: "darwin" });

    expect(result).toMatchObject({ reason: "already-active", state: "retained" });
    expect(updateClosureFromRelease).toHaveBeenCalledWith({
      channel: "beta",
      fetch,
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      paths: resolveClosureStorePaths({
        channel: "beta",
        namespace: "release-beta",
        root: "/installation",
      }),
      platform: "darwin-arm64",
      releaseTarget: "mac_arm64",
      shellVersion: "0.18.0-beta.4",
    });
  });

  it("skips before discovery when required shell inputs are unavailable", async () => {
    await expect(checkForPackagedClosureUpdate({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: null,
      namespace: "release-beta",
      shellVersion: "0.18.0-beta.4",
    })).resolves.toEqual({ reason: "metadata-unconfigured", state: "skipped" });
    await expect(checkForPackagedClosureUpdate({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      namespace: "release-beta",
      shellVersion: null,
    })).resolves.toEqual({ reason: "shell-version-unavailable", state: "skipped" });
    await expect(checkForPackagedClosureUpdate({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      namespace: "release-beta",
      shellVersion: "0.18.0-beta.4",
    }, { arch: "x64", platform: "linux" })).resolves.toEqual({
      reason: "unsupported-platform",
      state: "skipped",
    });
    expect(updateClosureFromRelease).not.toHaveBeenCalled();
  });

  it("projects release truth only for an activated or already-active candidate", () => {
    const candidate = { releaseVersion: "0.18.0-beta.5" } as never;
    expect(resolvePackagedClosureReleaseVersion({
      candidate,
      pointer: {} as never,
      reason: "newer-closure",
      state: "activated",
    }, "0.18.0-beta.4")).toBe("0.18.0-beta.5");
    expect(resolvePackagedClosureReleaseVersion({
      candidate,
      reason: "already-active",
      state: "retained",
    }, "0.18.0-beta.4")).toBe("0.18.0-beta.5");
    expect(resolvePackagedClosureReleaseVersion({
      candidate,
      reason: "shell-incompatible",
      state: "retained",
    }, "0.18.0-beta.4")).toBe("0.18.0-beta.4");
    expect(resolvePackagedClosureReleaseVersion(null, "0.18.0-beta.4")).toBe("0.18.0-beta.4");
  });
});
