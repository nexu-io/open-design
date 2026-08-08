import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
} from "@open-design/closure-store";
import { updateClosureFromRelease } from "@open-design/closure-update";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensurePackagedClosureAvailable,
  resolvePackagedClosureInstallerRequiredVersion,
  resolvePackagedClosureReleaseTarget,
} from "../src/closure-update.js";

vi.mock("@open-design/closure-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@open-design/closure-store")>(),
  readClosureBindingDescriptor: vi.fn(async () => ({
    channel: "beta",
    committed: null,
    namespace: "release-beta",
    nextGeneration: 0,
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
  })),
}));

vi.mock("@open-design/closure-update", () => ({
  updateClosureFromRelease: vi.fn(async (input: unknown) => ({
    candidate: { releaseTarget: (input as { releaseTarget: string }).releaseTarget },
    reason: "already-committed",
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
    const result = await ensurePackagedClosureAvailable({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      namespace: "release-beta",
      shellVersion: "0.18.0-beta.4",
    }, { arch: "arm64", fetch, platform: "darwin" });

    expect(result).toMatchObject({ reason: "already-committed", state: "retained" });
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
    await expect(ensurePackagedClosureAvailable({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: null,
      namespace: "release-beta",
      shellVersion: "0.18.0-beta.4",
    })).resolves.toEqual({ reason: "metadata-unconfigured", state: "skipped" });
    await expect(ensurePackagedClosureAvailable({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      namespace: "release-beta",
      shellVersion: null,
    })).resolves.toEqual({ reason: "shell-version-unavailable", state: "skipped" });
    await expect(ensurePackagedClosureAvailable({
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

  it("never consults release metadata once a committed binding exists", async () => {
    vi.mocked(readClosureBindingDescriptor).mockResolvedValueOnce({
      channel: "beta",
      committed: {
        releaseVersion: "0.19.0-beta.1",
        standalone: {
          channel: "beta",
          digest: `sha256:${"a".repeat(64)}`,
          generation: 0,
          namespace: "release-beta",
          platform: "darwin-arm64",
          protocolVersion: 1,
          version: "0.19.0-beta.1",
        },
      },
      namespace: "release-beta",
      nextGeneration: 1,
      schemaVersion: 1,
      updatedAt: new Date(0).toISOString(),
    });

    await expect(ensurePackagedClosureAvailable({
      channel: "beta",
      installationRoot: "/installation",
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      namespace: "release-beta",
      shellVersion: "0.19.0-beta.1",
    }, { arch: "arm64", platform: "darwin" })).resolves.toEqual({
      reason: "already-committed",
      state: "available",
    });
    expect(updateClosureFromRelease).not.toHaveBeenCalled();
  });

  it("projects an incompatible initial candidate into the installer floor", () => {
    const candidate = {
      manifest: { compatibility: { shell: { minVersion: "0.18.0-beta.5" } } },
      releaseVersion: "0.18.0-beta.5",
    } as never;
    expect(resolvePackagedClosureInstallerRequiredVersion({
      candidate,
      reason: "shell-incompatible",
      state: "retained",
    })).toBe("0.18.0-beta.5");
    expect(resolvePackagedClosureInstallerRequiredVersion({
      candidate,
      reason: "already-committed",
      state: "retained",
    })).toBeNull();
  });
});
