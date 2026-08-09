import { describe, expect, it } from "vitest";

import {
  STANDALONE_BOOTLOADER_ENTRY_PATH,
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  STANDALONE_SHELL_CAPABILITIES,
  compareStandaloneVersions,
  createStandaloneHandoffEnvelope,
  validateStandaloneHandoffRequest,
  validateStandaloneHandoffEnvelope,
  validateStandaloneRuntimeStatus,
  validateStandaloneRuntimeCommandRequest,
  validateStandaloneRuntimeCommandResult,
  validateStandaloneShellCapabilityResult,
  validateStandaloneShellCapabilityInput,
  validateStandaloneShellCapabilityOutput,
  type StandaloneHandoffRequest,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const shellDigest = `sha256:${"b".repeat(64)}` as const;

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
      descriptor: {
        release: { version: "0.18.0-beta.4" },
        shell: {
          digest: shellDigest,
          type: "electron",
          version: "0.18.0-beta.1",
        },
        standalone: {
          digest,
          protocolVersion: STANDALONE_PROTOCOL_VERSION,
          version: "0.18.0-beta.4",
        },
      },
      scope: {
        channel: "beta",
        generation: 7,
        namespace: "release-beta",
      },
    }),
    paths: {
      cacheRoot: "/open-design/cache",
      dataRoot: "/open-design/data",
      installationRoot: "/open-design/install",
      logsRoot: "/open-design/logs",
      resourceRoot: "/open-design/resources",
      runtimeRoot: "/open-design/runtime",
    },
  };
}

describe("Standalone bootloader protocol", () => {
  it("fixes the fossil entry while keeping channel and namespace independent", () => {
    expect(STANDALONE_BOOTLOADER_ENTRY_PATH).toBe("bootloader.mjs");
    expect(validateStandaloneHandoffRequest(request())).toMatchObject({
      handoff: {
        descriptor: {
          release: { version: "0.18.0-beta.4" },
          shell: { type: "electron", version: "0.18.0-beta.1" },
          standalone: { version: "0.18.0-beta.4" },
        },
        scope: {
          channel: "beta",
          namespace: "release-beta",
          generation: 7,
        },
      },
    });

    expect(() => validateStandaloneHandoffRequest({
      ...request(),
      handoff: {
        ...request().handoff,
        scope: { ...request().handoff.scope, namespace: "Beta Namespace" },
      },
    })).toThrow(/namespace/);
  });

  it("compares shell floors without importing update policy", () => {
    expect(compareStandaloneVersions("0.18.0-beta.4", "0.18.0-beta.3")).toBe(1);
    expect(compareStandaloneVersions("0.18.0-beta.4", "0.18.0")).toBe(-1);
    expect(compareStandaloneVersions("0.18.0", "0.18.0-beta.4")).toBe(1);
  });

  it("separates release presentation from Shell and Standalone compatibility truth", () => {
    const handoff = request().handoff;
    expect(handoff.descriptor).toEqual({
      release: { version: "0.18.0-beta.4" },
      shell: {
        digest: shellDigest,
        type: "electron",
        version: "0.18.0-beta.1",
      },
      standalone: {
        digest,
        protocolVersion: STANDALONE_PROTOCOL_VERSION,
        version: "0.18.0-beta.4",
      },
    });
    expect(() => validateStandaloneHandoffEnvelope({
      ...handoff,
      descriptor: {
        ...handoff.descriptor,
        release: { version: "0.18.0-beta.5" },
      },
    })).toThrow(/descriptorDigest/);
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
      daemonUrl: "http://127.0.0.1:4100",
      pid: 42,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      state: "running",
      webUrl: "http://127.0.0.1:4200",
    }, { handoff, state: "running" })).toMatchObject({
      daemonUrl: "http://127.0.0.1:4100",
      state: "running",
      webUrl: "http://127.0.0.1:4200",
    });

    const wrongHandoff = createStandaloneHandoffEnvelope({
      descriptor: handoff.descriptor,
      scope: {
        ...handoff.scope,
        generation: handoff.scope.generation + 1,
      },
    });
    expect(() => validateStandaloneRuntimeStatus({
      handoff: wrongHandoff,
      pid: 42,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      state: "stopped",
    }, { handoff })).toThrow(/committed generation/);
  });

  it("owns the typed rendering capability payloads on both sides of the handoff", () => {
    expect(validateStandaloneShellCapabilityInput(
      STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF,
      {
        deck: false,
        defaultFilename: "artifact.pdf",
        html: "<main>artifact</main>",
        title: "Artifact",
      },
    )).toMatchObject({ deck: false, defaultFilename: "artifact.pdf" });
    expect(() => validateStandaloneShellCapabilityInput(
      STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF,
      { html: "<main>missing contract fields</main>" },
    )).toThrow(/deck/);

    expect(validateStandaloneShellCapabilityOutput(
      STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES,
      { ok: true, slides: ["data:image/png;base64,AA=="] },
    )).toEqual({ ok: true, slides: ["data:image/png;base64,AA=="] });
    expect(() => validateStandaloneShellCapabilityOutput(
      STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES,
      { ok: true, slides: [42] },
    )).toThrow(/array of strings/);
  });

  it("fences Shell-to-Standalone commands to the committed generation", () => {
    const handoff = request().handoff;
    const command = validateStandaloneRuntimeCommandRequest({
      command: "open-design.register-desktop-auth.v1",
      handoff,
      input: { secret: "dGVzdA==" },
      requestId: "desktop-auth-1",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, { handoff });
    expect(validateStandaloneRuntimeCommandResult({
      handoff,
      outcome: "completed",
      output: { accepted: true },
      requestId: command.requestId,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, { handoff, requestId: command.requestId })).toMatchObject({ outcome: "completed" });

    expect(() => validateStandaloneRuntimeCommandResult({
      handoff,
      outcome: "unsupported",
      requestId: "other-request",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, { handoff, requestId: command.requestId })).toThrow(/requestId/);
  });
});
