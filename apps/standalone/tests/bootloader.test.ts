import { describe, expect, it, vi } from "vitest";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  createStandaloneHandoffEnvelope,
  type StandaloneHandle,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeTerminalStatus,
} from "@open-design/standalone-proto";

import { createStandaloneBootloader } from "../src/bootloader.js";

const digest = `sha256:${"b".repeat(64)}` as const;
const shellDigest = `sha256:${"c".repeat(64)}` as const;

function request(overrides: {
  attachmentId?: string;
  generation?: number;
  shellType?: string;
  shellVersion?: string;
} = {}): StandaloneHandoffRequest {
  const handoff = createStandaloneHandoffEnvelope({
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
      generation: overrides.generation ?? 3,
      namespace: "release-beta",
    },
  });
  return {
    attachment: {
      id: overrides.attachmentId ?? "electron-a",
      shell: {
        digest: shellDigest,
        type: overrides.shellType ?? "electron",
        version: overrides.shellVersion ?? "0.18.0-beta.4",
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
    handoff,
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

function runningHandle(input: StandaloneHandoffRequest): StandaloneHandle {
  const stopped: StandaloneRuntimeTerminalStatus = {
    handoff: input.handoff,
    pid: 42,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    state: "stopped",
  };
  let resolveTerminal!: (status: StandaloneRuntimeTerminalStatus) => void;
  const terminal = new Promise<StandaloneRuntimeTerminalStatus>((resolve) => {
    resolveTerminal = resolve;
  });
  return {
    async close() {
      resolveTerminal(stopped);
      return stopped;
    },
    async invoke(value) {
      return {
        attachmentId: value.attachmentId,
        handoff: input.handoff,
        outcome: "unsupported",
        requestId: value.requestId,
        schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      };
    },
    async readStatus() {
      return {
        daemonUrl: "http://127.0.0.1:4100",
        handoff: input.handoff,
        pid: 42,
        schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
        state: "running",
        webUrl: "http://127.0.0.1:4200",
      };
    },
    async waitForTerminal() {
      return await terminal;
    },
  };
}

function compatibility(min = "0.18.0-beta.1") {
  return {
    electron: { version: { min } },
    "codex-plugin": { version: { min: "0.1.0" } },
  };
}

describe("bootloader.mjs handoff-once", () => {
  it("starts one body for repeated identical handoffs", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      start,
    });
    const input = request();

    const [first, second] = await Promise.all([handoff(input), handoff(input)]);

    expect(start).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    await expect(first.readStatus()).resolves.toMatchObject({
      handoff: input.handoff,
      state: "running",
    });
  });

  it("fails closed for a different committed generation", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      start,
    });

    await handoff(request());
    await expect(handoff(request({ generation: 4 }))).rejects.toMatchObject({
      code: "handoff-conflict",
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("enforces the shell floor before body startup", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility("0.18.0-beta.3"),
      start,
    });

    await expect(handoff(request({ shellVersion: "0.18.0-beta.2" }))).rejects.toMatchObject({
      code: "shell-incompatible",
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("routes capabilities by attachment and stops the body after the final release", async () => {
    let bodyRequest: StandaloneHandoffRequest | null = null;
    let rawHandle: StandaloneHandle | null = null;
    const start = vi.fn(async (input: StandaloneHandoffRequest) => {
      bodyRequest = input;
      rawHandle = runningHandle(input);
      rawHandle.close = vi.fn(rawHandle.close.bind(rawHandle));
      return rawHandle;
    });
    const electron = request({ attachmentId: "electron-a" });
    const plugin = request({
      attachmentId: "codex-plugin-a",
      shellType: "codex-plugin",
      shellVersion: "0.1.0",
    });
    electron.capabilities.invoke = vi.fn(electron.capabilities.invoke);
    plugin.capabilities.invoke = vi.fn(plugin.capabilities.invoke);
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      start,
    });

    const electronHandle = await handoff(electron);
    const pluginHandle = await handoff(plugin);
    expect(start).toHaveBeenCalledOnce();

    await bodyRequest!.capabilities.invoke({
      attachmentId: plugin.attachment.id,
      capability: "open-design.fixture.v1",
      handoff: plugin.handoff,
      input: {},
      requestId: "plugin-capability-1",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    });
    expect(plugin.capabilities.invoke).toHaveBeenCalledOnce();
    expect(electron.capabilities.invoke).not.toHaveBeenCalled();

    await expect(electronHandle.close()).resolves.toMatchObject({ state: "stopped" });
    expect(rawHandle!.close).not.toHaveBeenCalled();
    await expect(pluginHandle.readStatus()).resolves.toMatchObject({ state: "running" });
    await expect(pluginHandle.close()).resolves.toMatchObject({ state: "stopped" });
    expect(rawHandle!.close).toHaveBeenCalledOnce();
  });

  it("rejects an undeclared shell before it acquires a body reference", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      start,
    });

    await expect(handoff(request({
      attachmentId: "unknown-a",
      shellType: "unknown-shell",
    }))).rejects.toMatchObject({ code: "shell-incompatible" });
    expect(start).not.toHaveBeenCalled();
  });

  it("fences shell capability results to the same request and generation", async () => {
    const input = request();
    const wrongHandoff = createStandaloneHandoffEnvelope({
      descriptor: input.handoff.descriptor,
      scope: {
        ...input.handoff.scope,
        generation: input.handoff.scope.generation + 1,
      },
    });
    input.capabilities.invoke = async (value) => ({
      attachmentId: value.attachmentId,
      handoff: wrongHandoff,
      outcome: "unsupported",
      requestId: value.requestId,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    });
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      async start(bound) {
        await bound.capabilities.invoke({
          attachmentId: bound.attachment.id,
          capability: "open-external",
          handoff: bound.handoff,
          input: { url: "https://open-design.dev" },
          requestId: "open-1",
          schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
        });
        return runningHandle(bound);
      },
    });

    await expect(handoff(input)).rejects.toThrow(/committed generation/);
  });

  it("rejects body readiness from another handoff", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => {
      const wrong = request({ generation: input.handoff.scope.generation + 1 });
      return runningHandle(wrong);
    });
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      start,
    });

    await expect(handoff(request())).rejects.toMatchObject({ code: "body-invalid" });
  });

  it("hands off once to a registered inner bootloader", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const inner = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const resolveRegisteredBootloader = vi.fn(() => inner);
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      resolveRegisteredBootloader,
      start,
    });
    const input = request();

    const [first, second] = await Promise.all([handoff(input), handoff(input)]);

    expect(resolveRegisteredBootloader).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(first).toBe(second);
  });

  it("treats an inner bootloader failure as terminal without body fallback", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const innerFailure = new Error("inner bootloader failed");
    const inner = vi.fn(async () => await Promise.reject(innerFailure));
    const handoff = createStandaloneBootloader({
      shellCompatibility: compatibility(),
      resolveRegisteredBootloader: () => inner,
      start,
    });

    await expect(handoff(request())).rejects.toBe(innerFailure);
    await expect(handoff(request())).rejects.toBe(innerFailure);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });
});
