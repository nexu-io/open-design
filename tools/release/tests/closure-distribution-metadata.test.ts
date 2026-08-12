import { createHash } from "node:crypto";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureDistributionManifest,
  type ClosureDistributionManifestDraft,
} from "@open-design/closure-proto";
import { describe, expect, it } from "vitest";

import { validateClosureDistributionPublication } from "../src/storage/closure-distribution-metadata.js";

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fixture(publicOrigin = "https://releases.open-design.test"): ReturnType<typeof createClosureDistributionManifest> {
  const launcher = digest("launcher");
  const body = digest("body");
  const runtime = digest("runtime");
  const native = digest("native");
  const artifact = (value: `sha256:${string}`) => ({
    digest: value,
    mediaType: "application/zip",
    size: 1,
    url: `${publicOrigin}/beta/blobs/${value.slice("sha256:".length)}`,
  });
  const draft: ClosureDistributionManifestDraft = {
    blobs: Object.fromEntries([launcher, body, runtime, native].map((value) => [value, artifact(value)])),
    compatibility: { shell: { electron: { version: { min: "0.19.0" } } } },
    identity: { channel: "beta", protocolVersion: CLOSURE_PROTOCOL_VERSION, version: "0.19.0-beta.10" },
    required: {
      body: { blob: body, entryPath: "bootloader.mjs", treeDigest: digest("body-tree") },
      launcher: {
        blob: launcher,
        entryPath: "launcher.mjs",
        handoffPath: "bootloader.mjs",
        treeDigest: digest("launcher-tree"),
      },
      targets: {
        "darwin-arm64": {
          native: { blob: native, treeDigest: digest("native-tree") },
          runtime: { blob: runtime, entryPath: "bin/node", treeDigest: digest("runtime-tree") },
        },
      },
    },
    resources: [],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  };
  return createClosureDistributionManifest(draft, digest);
}

describe("version-wide Closure publication metadata", () => {
  it("accepts one canonical graph covering every enabled target", () => {
    const manifest = fixture();
    expect(validateClosureDistributionPublication({
      channel: "beta",
      expectedTargets: ["darwin-arm64"],
      publicOrigin: "https://releases.open-design.test",
      releaseVersion: "0.19.0-beta.10",
      value: manifest,
    })).toEqual(manifest);
  });

  it("rejects target gaps, mutable blob paths, and graph drift", () => {
    const manifest = fixture();
    expect(() => validateClosureDistributionPublication({
      channel: "beta",
      expectedTargets: ["win32-x64"],
      publicOrigin: "https://releases.open-design.test",
      releaseVersion: "0.19.0-beta.10",
      value: manifest,
    })).toThrow(/missing enabled target win32-x64/u);

    const mutable = fixture("https://example.test");
    expect(() => validateClosureDistributionPublication({
      channel: "beta",
      expectedTargets: ["darwin-arm64"],
      publicOrigin: "https://releases.open-design.test",
      releaseVersion: "0.19.0-beta.10",
      value: mutable,
    })).toThrow(/blob .* URL must be/u);

    expect(() => validateClosureDistributionPublication({
      channel: "beta",
      expectedTargets: ["darwin-arm64"],
      publicOrigin: "https://releases.open-design.test",
      releaseVersion: "0.19.0-beta.10",
      value: { ...manifest, identity: { ...manifest.identity, version: "0.19.0-beta.11" } },
    })).toThrow(/digest/u);
  });
});
