import { describe, expect, it } from "vitest";

import {
  STANDALONE_BOOTLOADER_ENTRY_PATH,
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  compareStandaloneVersions,
  createStandaloneHandoffEnvelope,
  validateStandaloneHandoffRequest,
  validateStandaloneRuntimeStatus,
  validateStandaloneShellCapabilityResult,
  type StandaloneHandoffRequest,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}` as const;

function request(): StandaloneHandoffRequest {
  return {
    capabilities: {
      async invoke(value) {
        return {
          handoff: value.handoff,
          outcome: "unsupported",
          requestId: value.requestId,
          schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
        };
      },
    },
    handoff: createStandaloneHandoffEnvelope({
      channel: "beta",
      digest,
      generation: 7,
      namespace: "release-beta",
      platform: "darwin-arm64",
      protocolVersion: STANDALONE_PROTOCOL_VERSION,
      version: "0.18.0-beta.4",
    }),
    paths: {
      cacheRoot: "/open-design/cache",
      dataRoot: "/open-design/data",
      installationRoot: "/open-design/install",
      logsRoot: "/open-design/logs",
      resourceRoot: "/open-design/resources",
      runtimeRoot: "/open-design/runtime",
    },
    shell: { type: "standalone-launcher", version: "0.18.0-beta.4" },
  };
}

describe("Standalone bootloader protocol", () => {
  it("fixes the fossil entry while keeping channel and namespace independent", () => {
    expect(STANDALONE_BOOTLOADER_ENTRY_PATH).toBe("bootloader.mjs");
    expect(validateStandaloneHandoffRequest(request())).toMatchObject({
      handoff: {
        identity: {
          channel: "beta",
          namespace: "release-beta",
          generation: 7,
        },
      },
      shell: { type: "standalone-launcher" },
    });

    expect(() => validateStandaloneHandoffRequest({
      ...request(),
      handoff: {
        ...request().handoff,
        identity: { ...request().handoff.identity, namespace: "Beta Namespace" },
      },
    })).toThrow(/namespace/);
  });

  it("compares shell floors without importing update policy", () => {
    expect(compareStandaloneVersions("0.18.0-beta.4", "0.18.0-beta.3")).toBe(1);
    expect(compareStandaloneVersions("0.18.0-beta.4", "0.18.0")).toBe(-1);
    expect(compareStandaloneVersions("0.18.0", "0.18.0-beta.4")).toBe(1);
  });

  it("fences capability results and runtime status to the exact handoff", () => {
    const handoff = request().handoff;
    expect(validateStandaloneShellCapabilityResult({
      handoff,
      outcome: "completed",
      output: { path: "/tmp/export.pdf" },
      requestId: "export-1",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, { handoff, requestId: "export-1" })).toMatchObject({ outcome: "completed" });

    expect(validateStandaloneRuntimeStatus({
      handoff,
      pid: 42,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      state: "running",
      webUrl: "http://127.0.0.1:4200",
    }, { handoff, state: "running" })).toMatchObject({ state: "running" });

    const wrongHandoff = createStandaloneHandoffEnvelope({
      ...handoff.identity,
      generation: handoff.identity.generation + 1,
    });
    expect(() => validateStandaloneRuntimeStatus({
      handoff: wrongHandoff,
      pid: 42,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      state: "stopped",
    }, { handoff })).toThrow(/committed generation/);
  });
});
