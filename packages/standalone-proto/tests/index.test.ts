import { describe, expect, it } from "vitest";

import {
  STANDALONE_BOOTLOADER_ENTRY_PATH,
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  STANDALONE_SHELL_CAPABILITIES,
  STANDALONE_UPDATER_SCHEMA_VERSION,
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
  validateStandaloneUpdaterActionRequest,
  validateStandaloneUpdaterActionResult,
  validateStandaloneUpdaterProviderDescriptor,
  validateStandaloneUpdaterSnapshot,
  validateStandaloneUpdaterWaitRequest,
  type StandaloneHandoffRequest,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const shellDigest = `sha256:${"b".repeat(64)}` as const;

function request(): StandaloneHandoffRequest {
  return {
    attachment: {
      id: "electron-a",
      shell: {
        digest: shellDigest,
        type: "electron",
        version: "0.18.0-beta.1",
      },
    },
    capabilities: {
      async invoke(value) {
        return {
          attachmentId: value.attachmentId,
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
      attachment: {
        id: "electron-a",
        shell: { type: "electron", version: "0.18.0-beta.1" },
      },
      handoff: {
        descriptor: {
          release: { version: "0.18.0-beta.4" },
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
      attachmentId: request().attachment.id,
      handoff,
      outcome: "completed",
      output: { path: "/tmp/export.pdf" },
      requestId: "export-1",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, {
      attachmentId: request().attachment.id,
      handoff,
      requestId: "export-1",
    })).toMatchObject({ outcome: "completed" });

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
      attachmentId: request().attachment.id,
      command: "open-design.register-desktop-auth.v1",
      handoff,
      input: { secret: "dGVzdA==" },
      requestId: "desktop-auth-1",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, { attachmentId: request().attachment.id, handoff });
    expect(validateStandaloneRuntimeCommandResult({
      attachmentId: command.attachmentId,
      handoff,
      outcome: "completed",
      output: { accepted: true },
      requestId: command.requestId,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, {
      attachmentId: command.attachmentId,
      handoff,
      requestId: command.requestId,
    })).toMatchObject({ outcome: "completed" });

    expect(() => validateStandaloneRuntimeCommandResult({
      attachmentId: command.attachmentId,
      handoff,
      outcome: "unsupported",
      requestId: "other-request",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    }, {
      attachmentId: command.attachmentId,
      handoff,
      requestId: command.requestId,
    })).toThrow(/requestId/);
  });
});

describe("Standalone updater provider protocol", () => {
  const handoff = request().handoff;
  const standaloneProvider = {
    handoff,
    incarnation: "standalone-update-1",
    owner: "standalone",
    providerId: "standalone-update",
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  } as const;
  const shellProvider = {
    attachmentId: "electron-a",
    handoff,
    hostScope: "electron-updater-a",
    incarnation: "electron-update-1",
    owner: "shell",
    providerId: "electron-update",
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  } as const;

  it("separates namespace-shared Standalone and attachment-local Shell providers", () => {
    expect(validateStandaloneUpdaterProviderDescriptor(standaloneProvider)).toEqual(standaloneProvider);
    expect(validateStandaloneUpdaterProviderDescriptor(shellProvider)).toEqual(shellProvider);
    expect(() => validateStandaloneUpdaterProviderDescriptor({
      ...shellProvider,
      attachmentId: undefined,
    })).toThrow(/attachmentId/u);
    expect(() => validateStandaloneUpdaterProviderDescriptor({
      ...standaloneProvider,
      attachmentId: "electron-a",
    })).toThrow(/attachment/u);
    expect(() => validateStandaloneUpdaterProviderDescriptor({
      ...shellProvider,
      installerPath: "/private/provider-state/OpenDesign.dmg",
    })).toThrow(/unsupported fields/u);
  });

  it("projects progress and opaque presentation without exposing action semantics", () => {
    const snapshot = validateStandaloneUpdaterSnapshot({
      actions: [{
        emphasis: "primary",
        id: "apply-current-update",
        label: "Install and restart",
      }],
      presentation: {
        detail: "Open Design 0.19.1 is ready.",
        title: "Update ready",
      },
      progress: { completed: 40, total: 100 },
      provider: standaloneProvider,
      revision: 4,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      state: "ready",
    }, { provider: standaloneProvider });

    expect(snapshot.actions[0]).toEqual({
      emphasis: "primary",
      id: "apply-current-update",
      label: "Install and restart",
    });
    expect(snapshot.progress).toEqual({ completed: 40, total: 100 });
    expect(snapshot).not.toHaveProperty("restart");
    expect(snapshot).not.toHaveProperty("installerPath");
  });

  it("bounds wait-for-change and fences actions to one provider incarnation", () => {
    expect(validateStandaloneUpdaterWaitRequest({
      afterRevision: 4,
      provider: shellProvider,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      timeoutMs: 30_000,
    }, { provider: shellProvider })).toMatchObject({ afterRevision: 4, timeoutMs: 30_000 });
    expect(() => validateStandaloneUpdaterWaitRequest({
      afterRevision: 4,
      provider: shellProvider,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      timeoutMs: 30_001,
    })).toThrow(/timeoutMs/u);

    const action = validateStandaloneUpdaterActionRequest({
      actionId: "open-installer",
      provider: shellProvider,
      requestId: "update-action-1",
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    }, { provider: shellProvider });
    expect(validateStandaloneUpdaterActionResult({
      actionId: action.actionId,
      operationId: "installer-handoff-1",
      outcome: "accepted",
      provider: shellProvider,
      requestId: action.requestId,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    }, {
      actionId: action.actionId,
      provider: shellProvider,
      requestId: action.requestId,
    })).toMatchObject({ outcome: "accepted", operationId: "installer-handoff-1" });
    expect(() => validateStandaloneUpdaterActionResult({
      actionId: action.actionId,
      outcome: "unsupported",
      provider: { ...shellProvider, incarnation: "electron-update-2" },
      requestId: action.requestId,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    }, {
      actionId: action.actionId,
      provider: shellProvider,
      requestId: action.requestId,
    })).toThrow(/provider/u);
  });

  it("treats handed-off as terminal after an accepted destructive action", () => {
    expect(validateStandaloneUpdaterSnapshot({
      actions: [],
      presentation: { title: "Installer opened" },
      provider: shellProvider,
      revision: 5,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      state: "handed-off",
    })).toMatchObject({ revision: 5, state: "handed-off" });
    expect(() => validateStandaloneUpdaterSnapshot({
      actions: [{ emphasis: "primary", id: "again", label: "Open again" }],
      presentation: { title: "Installer opened" },
      provider: shellProvider,
      revision: 5,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      state: "handed-off",
    })).toThrow(/terminal/u);
  });
});
