import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_HANDOFF_SCHEMA_VERSION,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  CLOSURE_SHIM_SCHEMA_VERSION,
  CLOSURE_SIGNATURE_ALGORITHM,
  CLOSURE_SIGNATURE_SCHEMA_VERSION,
  ClosureProtocolError,
  bindClosureCandidateIdentity,
  createClosureHandoffEnvelope,
  serializeClosureCandidateManifestForSigning,
  validateClosureBindingIdentity,
  validateClosureCandidateIdentity,
  validateClosureCandidateManifest,
  validateClosureCandidateSignature,
  validateClosureFileInventory,
  validateClosureHandoffEnvelope,
  validateClosureShimRequest,
  validateClosureShimResult,
  type ClosureCandidateIdentity,
  type ClosureCandidateManifest,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}` as const;

const candidate: ClosureCandidateIdentity = {
  channel: "beta",
  digest,
  platform: "darwin-arm64",
  protocolVersion: CLOSURE_PROTOCOL_VERSION,
  version: "0.19.0-beta.1",
};

const manifest: ClosureCandidateManifest = {
  artifact: {
    digest,
    entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
    inventoryDigest: digest,
    mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
    size: 1024,
    url: "https://releases.open-design.ai/beta/closure/darwin-arm64/runtime.zip",
  },
  compatibility: {
    shell: {
      minVersion: "0.18.1",
    },
  },
  identity: candidate,
  schemaVersion: CLOSURE_SCHEMA_VERSION,
};

describe("closure candidate identity", () => {
  it("validates a namespace-neutral platform candidate", () => {
    expect(validateClosureCandidateIdentity(candidate)).toEqual(candidate);
  });

  it("rejects a public candidate that is already bound to a local namespace", () => {
    expect(() => validateClosureCandidateIdentity({
      ...candidate,
      namespace: "release-beta",
    })).toThrowError(new ClosureProtocolError(
      "closure candidate identity must not contain a local namespace",
    ));
  });

  it.each([
    ["digest", `sha256:${"A".repeat(64)}`],
    ["platform", "darwin_arm64"],
    ["protocolVersion", 0],
    ["protocolVersion", 2],
    ["version", "../0.19.0-beta.1"],
  ])("rejects an invalid %s", (field, value) => {
    expect(() => validateClosureCandidateIdentity({
      ...candidate,
      [field]: value,
    })).toThrow(ClosureProtocolError);
  });
});

describe("closure local binding", () => {
  it("binds an explicit product namespace only during local activation", () => {
    const binding = bindClosureCandidateIdentity(candidate, "release-beta");

    expect(binding).toEqual({
      ...candidate,
      namespace: "release-beta",
    });
    expect(validateClosureBindingIdentity(binding, {
      channel: "beta",
      namespace: "release-beta",
    })).toEqual(binding);
  });

  it("rejects a binding from another coordination domain", () => {
    const binding = bindClosureCandidateIdentity(candidate, "release-beta");

    expect(() => validateClosureBindingIdentity(binding, {
      channel: "stable",
      namespace: "release-beta",
    })).toThrow(/does not match expected channel/u);
    expect(() => validateClosureBindingIdentity(binding, {
      channel: "beta",
      namespace: "release-preview",
    })).toThrow(/does not match expected namespace/u);
    expect(() => bindClosureCandidateIdentity(candidate, "../release-beta")).toThrowError(ClosureProtocolError);
  });
});

describe("closure candidate manifest", () => {
  it("validates an immutable artifact and its minimum shell version", () => {
    expect(validateClosureCandidateManifest(manifest)).toEqual(manifest);
  });

  it("rejects artifact identity drift", () => {
    expect(() => validateClosureCandidateManifest({
      ...manifest,
      artifact: {
        ...manifest.artifact,
        digest: `sha256:${"b".repeat(64)}`,
      },
    })).toThrow(/digest must match/u);
  });

  it("rejects a manifest that is already bound to a local namespace", () => {
    expect(() => validateClosureCandidateManifest({
      ...manifest,
      namespace: "release-beta",
    })).toThrow(/must not contain a local namespace/u);
  });

  it.each([
    ["entryPath", "headless.mjs"],
    ["inventoryDigest", "sha256:invalid"],
    ["size", 0],
    ["url", "file:///tmp/runtime.zip"],
    ["mediaType", "application/zip"],
  ])("rejects an invalid artifact %s", (field, value) => {
    expect(() => validateClosureCandidateManifest({
      ...manifest,
      artifact: {
        ...manifest.artifact,
        [field]: value,
      },
    })).toThrow(ClosureProtocolError);
  });

  it("rejects an unsafe minimum shell version", () => {
    expect(() => validateClosureCandidateManifest({
      ...manifest,
      compatibility: {
        shell: {
          minVersion: "../0.18.1",
        },
      },
    })).toThrow(/minimum shell version/u);
  });
});

describe("closure file inventory", () => {
  const inventory = {
    files: [
      { digest, path: "runtime.mjs", size: 12 },
      { digest, path: "web/server.js", size: 0 },
    ],
    schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
  };

  it("validates a sorted, namespace-neutral payload inventory", () => {
    expect(validateClosureFileInventory(inventory)).toEqual(inventory);
  });

  it.each([
    ["absolute", "/runtime.mjs"],
    ["parent", "../runtime.mjs"],
    ["windows", "web\\server.js"],
  ])("rejects an unsafe %s path", (_label, path) => {
    expect(() => validateClosureFileInventory({
      ...inventory,
      files: [{ digest, path, size: 1 }],
    })).toThrow(ClosureProtocolError);
  });

  it("rejects duplicate or unsorted paths", () => {
    expect(() => validateClosureFileInventory({
      ...inventory,
      files: [...inventory.files].reverse(),
    })).toThrow(/strictly sorted/u);
  });
});

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8")) as unknown;
}

describe("closure shim and handoff protocol", () => {
  it("keeps the shell request and ready result fixtures executable", async () => {
    await expect(validateClosureShimRequest(await fixture("shim-request-v1.json"))).toEqual({
      channel: "beta",
      namespace: "release-beta",
      platform: "darwin-arm64",
      schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
      shell: {
        type: "desktop",
        version: "0.19.0-beta.1",
      },
    });
    await expect(validateClosureShimResult(await fixture("handoff-ready-v1.json"))).toMatchObject({
      outcome: "ready",
      schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    });
    await expect(validateClosureShimResult(await fixture("installer-reinstall-v1.json"))).toEqual({
      minShellVersion: "0.19.0-beta.1",
      outcome: "installer-reinstall",
      schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    });
  });

  it("binds one namespace and runtime generation without exposing body layout", () => {
    const envelope = createClosureHandoffEnvelope({
      ...bindClosureCandidateIdentity(candidate, "release-beta"),
      generation: 7,
    });

    expect(envelope).toEqual({
      identity: {
        ...candidate,
        generation: 7,
        namespace: "release-beta",
      },
      schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
    });
    expect(envelope).not.toHaveProperty("entryPath");
    expect(envelope).not.toHaveProperty("components");
  });

  it("rejects namespace crossover and stale generation readiness", () => {
    const envelope = createClosureHandoffEnvelope({
      ...bindClosureCandidateIdentity(candidate, "release-beta"),
      generation: 7,
    });

    expect(() => validateClosureHandoffEnvelope(envelope, {
      generation: 7,
      namespace: "release-preview",
    })).toThrow(/namespace/u);
    expect(() => validateClosureHandoffEnvelope(envelope, {
      generation: 8,
      namespace: "release-beta",
    })).toThrow(/generation/u);
  });

  it("accepts additive envelope fields without making them current behavior", () => {
    const fixtureValue = {
      ...createClosureHandoffEnvelope({
        ...bindClosureCandidateIdentity(candidate, "release-beta"),
        generation: 7,
      }),
      futureCapability: { ignored: true },
    };

    expect(validateClosureHandoffEnvelope(fixtureValue)).not.toHaveProperty("futureCapability");
  });
});

describe("closure candidate signatures", () => {
  it("validates a detached Ed25519 signature descriptor", () => {
    expect(validateClosureCandidateSignature({
      algorithm: CLOSURE_SIGNATURE_ALGORITHM,
      keyId: "release-root-2026",
      schemaVersion: CLOSURE_SIGNATURE_SCHEMA_VERSION,
      value: "ZmFrZS1zaWduYXR1cmU",
    })).toEqual({
      algorithm: "ed25519",
      keyId: "release-root-2026",
      schemaVersion: 1,
      value: "ZmFrZS1zaWduYXR1cmU",
    });
  });

  it("serializes the normalized v1 manifest deterministically", () => {
    expect(serializeClosureCandidateManifestForSigning({
      ...manifest,
      ignoredFutureField: true,
    })).toBe(`${JSON.stringify(manifest)}\n`);
  });

  it.each([
    ["algorithm", "rsa"],
    ["keyId", "../release-root"],
    ["value", "not+padded="],
    ["schemaVersion", 2],
  ])("rejects an invalid signature %s", (field, value) => {
    expect(() => validateClosureCandidateSignature({
      algorithm: CLOSURE_SIGNATURE_ALGORITHM,
      keyId: "release-root-2026",
      schemaVersion: CLOSURE_SIGNATURE_SCHEMA_VERSION,
      value: "ZmFrZS1zaWduYXR1cmU",
      [field]: value,
    })).toThrow(ClosureProtocolError);
  });
});
