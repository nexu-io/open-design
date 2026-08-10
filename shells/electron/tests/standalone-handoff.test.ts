import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  type StandaloneHandle,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeTerminalStatus,
  type StandaloneShellCapabilityPort,
} from "@open-design/standalone-proto";

import {
  createElectronStandaloneLauncher,
  type ElectronStandaloneBinding,
} from "../src/standalone-handoff.js";

const capabilityPort: StandaloneShellCapabilityPort = {
  async invoke(request) {
    return {
      attachmentId: request.attachmentId,
      handoff: request.handoff,
      outcome: "unsupported",
      requestId: request.requestId,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    };
  },
};

function binding(generation = 3): ElectronStandaloneBinding {
  return {
    attachment: {
      id: "electron-a",
      shell: {
        digest: `sha256:${"a".repeat(64)}`,
        type: "electron",
        version: "0.18.0-beta.1",
      },
    },
    bootloaderPath: "/open-design/standalone/bootloader.mjs",
    descriptor: {
      release: { version: "0.18.0-beta.4" },
      standalone: {
        digest: `sha256:${"b".repeat(64)}`,
        protocolVersion: STANDALONE_PROTOCOL_VERSION,
        version: "0.18.0-beta.4",
      },
    },
    paths: {
      cacheRoot: "/open-design/cache",
      dataRoot: "/open-design/data",
      installationRoot: "/open-design/standalone",
      logsRoot: "/open-design/logs",
      resourceRoot: "/open-design/standalone/resources",
      runtimeRoot: "/open-design/runtime",
    },
    scope: { channel: "beta", generation, namespace: "release-beta" },
  };
}

function runningHandle(request: StandaloneHandoffRequest): StandaloneHandle {
  const stopped: StandaloneRuntimeTerminalStatus = {
    handoff: request.handoff,
    pid: 42,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    state: "stopped",
  };
  return {
    async close() {
      return stopped;
    },
    async invoke(value) {
      return {
        attachmentId: value.attachmentId,
        handoff: request.handoff,
        outcome: "unsupported",
        requestId: value.requestId,
        schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      };
    },
    async readStatus() {
      return {
        daemonUrl: "http://127.0.0.1:4100",
        handoff: request.handoff,
        pid: 42,
        schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
        state: "running",
        webUrl: "http://127.0.0.1:4200",
      };
    },
    async waitForTerminal() {
      return stopped;
    },
  };
}

describe("Electron Shell Standalone handoff", () => {
  it("lazy-loads and enters one committed bootloader for identical calls", async () => {
    const handoff = vi.fn(async (request: StandaloneHandoffRequest) => runningHandle(request));
    const importBootloader = vi.fn(async () => ({ handoff }));
    const launcher = createElectronStandaloneLauncher({ importBootloader });

    const [first, second] = await Promise.all([
      launcher.launch(binding(), capabilityPort),
      launcher.launch(binding(), capabilityPort),
    ]);

    expect(importBootloader).toHaveBeenCalledOnce();
    expect(importBootloader).toHaveBeenCalledWith(pathToFileURL(binding().bootloaderPath).href);
    expect(handoff).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it("fences a different committed generation before a second import", async () => {
    const importBootloader = vi.fn(async () => ({
      handoff: async (request: StandaloneHandoffRequest) => runningHandle(request),
    }));
    const launcher = createElectronStandaloneLauncher({ importBootloader });

    await launcher.launch(binding(), capabilityPort);
    await expect(launcher.launch(binding(4), capabilityPort)).rejects.toMatchObject({
      code: "binding-conflict",
    });
    expect(importBootloader).toHaveBeenCalledOnce();
  });

  it("maps the protocol Shell floor to installer-required", async () => {
    const launcher = createElectronStandaloneLauncher({
      async importBootloader() {
        return {
          async handoff() {
            throw Object.assign(new Error("new shell required"), {
              code: "shell-incompatible",
            });
          },
        };
      },
    });

    await expect(launcher.launch(binding(), capabilityPort)).rejects.toMatchObject({
      code: "installer-required",
    });
  });

  it("does not retry or fall back after an invalid bootloader entry", async () => {
    const importBootloader = vi.fn(async () => ({ default: () => undefined }));
    const launcher = createElectronStandaloneLauncher({ importBootloader });

    await expect(launcher.launch(binding(), capabilityPort)).rejects.toMatchObject({
      code: "standalone-start-failed",
    });
    await expect(launcher.launch(binding(), capabilityPort)).rejects.toMatchObject({
      code: "standalone-start-failed",
    });
    expect(importBootloader).toHaveBeenCalledOnce();
  });
});
