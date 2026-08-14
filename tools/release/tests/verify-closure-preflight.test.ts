import { describe, expect, it } from "vitest";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureDistributionManifest,
} from "@open-design/closure/protocol";
import { verifyClosureNMinusOnePreflight } from "../src/storage/verify-closure-preflight.js";

function manifest(min: string, version: string) {
  const body = `sha256:${"a".repeat(64)}` as const;
  const launcher = `sha256:${"b".repeat(64)}` as const;
  const native = `sha256:${"c".repeat(64)}` as const;
  const blob = (digest: `sha256:${string}`) => ({
    digest,
    mediaType: "application/zip",
    size: 1,
    url: `https://releases.open-design.test/beta/blobs/${digest.slice(7)}`,
  });
  return createClosureDistributionManifest({
    blobs: Object.fromEntries([body, launcher, native].map((digest) => [digest, blob(digest)])),
    compatibility: { shell: { electron: { version: { min } } } },
    identity: { channel: "beta", protocolVersion: CLOSURE_PROTOCOL_VERSION, version },
    required: {
      body: { blob: body, entryPath: "bootloader.mjs", treeDigest: body },
      launcher: { blob: launcher, entryPath: "launcher.mjs", handoffPath: "bootloader.mjs", treeDigest: launcher },
      targets: { "darwin-arm64": { native: { blob: native, treeDigest: native } } },
    },
    resources: [],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, (canonical) => `sha256:${createHash("sha256").update(canonical).digest("hex")}`);
}

describe("Closure N-1 preflight acceptance", () => {
  it("proves an incompatible reader exits before a malformed graph", () => {
    expect(verifyClosureNMinusOnePreflight({
      channel: "beta",
      manifest: manifest("0.19.1-beta.17", "0.19.1-beta.17"),
      releaseVersion: "0.19.1-beta.17",
    })).toMatchObject({
      previousShellVersion: "0.19.1-beta.16",
      result: "installer-required-before-graph",
    });
  });

  it("keeps a compatible N-1 reader on the normal selection path", () => {
    expect(verifyClosureNMinusOnePreflight({
      channel: "beta",
      manifest: manifest("0.19.1-beta.17", "0.19.1-beta.18"),
      releaseVersion: "0.19.1-beta.18",
    })).toMatchObject({
      previousShellVersion: "0.19.1-beta.17",
      result: "compatible",
    });
  });
});
import { createHash } from "node:crypto";
