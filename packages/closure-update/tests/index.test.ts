import { describe, expect, it } from "vitest";

import type {
  ClosureAttemptDescriptor,
  ClosureRuntimeDescriptor,
  ClosureRuntimePointer,
} from "@open-design/closure-store";

import {
  ClosureUpdateError,
  compareClosureShellVersions,
  decideClosureUpdate,
  selectClosureReleaseCandidate,
  type ClosureReleaseCandidate,
} from "../src/index.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;
const OTHER_DIGEST = `sha256:${"b".repeat(64)}` as const;

function metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const version = "0.18.0-beta.4";
  const archiveUrl = `https://releases.open-design.test/beta/versions/${version}/closure.zip`;
  return {
    channel: "beta",
    releaseState: "complete",
    releaseTargets: {
      mac_arm64: {
        closure: {
          assets: {
            archive: { url: archiveUrl },
            inventory: { url: `${archiveUrl}.inventory.json` },
            manifest: { url: `${archiveUrl}.manifest.json` },
            provenance: { url: `${archiveUrl}.provenance.json` },
          },
          manifest: {
            artifact: {
              digest: DIGEST,
              entryPath: "runtime.mjs",
              inventoryDigest: OTHER_DIGEST,
              mediaType: "application/vnd.open-design.closure.zip-v1",
              size: 123,
              url: archiveUrl,
            },
            compatibility: { shell: { minVersion: "0.16.2" } },
            identity: {
              channel: "beta",
              digest: DIGEST,
              platform: "darwin-arm64",
              protocolVersion: 1,
              version,
            },
            schemaVersion: 1,
          },
        },
        enabled: true,
        status: "published",
      },
    },
    releaseVersion: version,
    ...overrides,
  };
}

function select(value: unknown = metadata()): ClosureReleaseCandidate {
  return selectClosureReleaseCandidate(value, {
    channel: "beta",
    platform: "darwin-arm64",
    releaseTarget: "mac_arm64",
  });
}

function pointer(version: string, digest = DIGEST): ClosureRuntimePointer {
  return {
    channel: "beta",
    digest,
    generation: 0,
    namespace: "release-beta",
    platform: "darwin-arm64",
    protocolVersion: 1,
    version,
  };
}

function runtime(active: ClosureRuntimePointer | null): ClosureRuntimeDescriptor {
  return {
    active,
    channel: "beta",
    lastSuccessful: active,
    namespace: "release-beta",
    nextGeneration: active == null ? 0 : 1,
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
  };
}

describe("Closure release update selection", () => {
  it("selects the platform Closure independently from shell artifacts", () => {
    const candidate = select();

    expect(candidate.releaseTarget).toBe("mac_arm64");
    expect(candidate.manifest.identity).toMatchObject({
      channel: "beta",
      platform: "darwin-arm64",
      version: "0.18.0-beta.4",
    });
    expect(candidate.assets.archive).toBe(candidate.manifest.artifact.url);
  });

  it("rejects incomplete, cross-channel, and cross-platform metadata", () => {
    expect(() => select(metadata({ releaseState: "partial" }))).toThrow(/not complete/u);
    expect(() => select(metadata({ channel: "preview" }))).toThrow(/does not match beta/u);
    expect(() => selectClosureReleaseCandidate(metadata(), {
      channel: "beta",
      platform: "win32-x64",
      releaseTarget: "mac_arm64",
    })).toThrow(/does not match win32-x64/u);
  });

  it("uses shell compatibility and the independent active Closure identity", () => {
    const candidate = select();

    expect(decideClosureUpdate({
      attempt: null,
      candidate,
      runtime: runtime(null),
      shellVersion: "0.16.2",
    })).toMatchObject({ action: "activate", reason: "no-active-closure" });
    expect(decideClosureUpdate({
      attempt: null,
      candidate,
      runtime: runtime(pointer("0.18.0-beta.3", OTHER_DIGEST)),
      shellVersion: "0.18.0-beta.4",
    })).toMatchObject({ action: "activate", reason: "newer-closure" });
    expect(decideClosureUpdate({
      attempt: null,
      candidate,
      runtime: runtime(pointer("0.18.0-beta.5", OTHER_DIGEST)),
      shellVersion: "0.18.0-beta.4",
    })).toMatchObject({ action: "retain", reason: "candidate-not-newer" });
    expect(decideClosureUpdate({
      attempt: null,
      candidate,
      runtime: runtime(null),
      shellVersion: "0.16.1",
    })).toMatchObject({ action: "retain", reason: "shell-incompatible" });
  });

  it("does not replace a running attempt and rejects same-version equivocation", () => {
    const candidate = select();
    const active = pointer("0.18.0-beta.3", OTHER_DIGEST);
    const attempt: ClosureAttemptDescriptor = {
      ...active,
      schemaVersion: 1,
      startedAt: new Date(0).toISOString(),
    };
    expect(decideClosureUpdate({
      attempt,
      candidate,
      runtime: runtime(active),
      shellVersion: "0.18.0-beta.4",
    })).toMatchObject({ action: "retain", reason: "runtime-attempt-pending" });

    expect(() => decideClosureUpdate({
      attempt: null,
      candidate,
      runtime: runtime(pointer("0.18.0-beta.4", OTHER_DIGEST)),
      shellVersion: "0.18.0-beta.4",
    })).toThrowError(new ClosureUpdateError(
      "Closure version 0.18.0-beta.4 has conflicting immutable digests",
    ));
  });

  it("compares release and prerelease shell versions deterministically", () => {
    expect(compareClosureShellVersions("0.16.2", "0.16.2")).toBe(0);
    expect(compareClosureShellVersions("0.18.0-beta.4", "0.16.2")).toBe(1);
    expect(compareClosureShellVersions("0.18.0-beta.4", "0.18.0-beta.3")).toBe(1);
    expect(compareClosureShellVersions("0.18.0-beta-internal.2", "0.18.0-beta-internal.1")).toBe(1);
    expect(compareClosureShellVersions("0.18.0-beta.3", "0.18.0")).toBe(-1);
  });
});
