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

function request(overrides: {
  generation?: number;
  shellVersion?: string;
} = {}): StandaloneHandoffRequest {
  const handoff = createStandaloneHandoffEnvelope({
    channel: "beta",
    digest,
    generation: overrides.generation ?? 3,
    namespace: "release-beta",
    platform: "darwin-arm64",
    protocolVersion: STANDALONE_PROTOCOL_VERSION,
    version: "0.18.0-beta.4",
  });
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
    handoff,
    paths: {
      cacheRoot: "/open-design/cache",
      dataRoot: "/open-design/data",
      installationRoot: "/open-design/install",
      logsRoot: "/open-design/logs",
      resourceRoot: "/open-design/resources",
      runtimeRoot: "/open-design/runtime",
    },
    shell: {
      type: "standalone-launcher",
      version: overrides.shellVersion ?? "0.18.0-beta.4",
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
  return {
    async close() {
      return stopped;
    },
    async readStatus() {
      return {
        handoff: input.handoff,
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

describe("bootloader.mjs handoff-once", () => {
  it("starts one body for repeated identical handoffs", async () => {
    const start = vi.fn(async (input: StandaloneHandoffRequest) => runningHandle(input));
    const handoff = createStandaloneBootloader({
      minShellVersion: "0.18.0-beta.1",
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
      minShellVersion: "0.18.0-beta.1",
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
      minShellVersion: "0.18.0-beta.3",
      start,
    });

    await expect(handoff(request({ shellVersion: "0.18.0-beta.2" }))).rejects.toMatchObject({
      code: "shell-incompatible",
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("fences shell capability results to the same request and generation", async () => {
    const input = request();
    const wrongHandoff = createStandaloneHandoffEnvelope({
      ...input.handoff.identity,
      generation: input.handoff.identity.generation + 1,
    });
    input.capabilities.invoke = async (value) => ({
      handoff: wrongHandoff,
      outcome: "unsupported",
      requestId: value.requestId,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    });
    const handoff = createStandaloneBootloader({
      minShellVersion: "0.18.0-beta.1",
      async start(bound) {
        await bound.capabilities.invoke({
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
      const wrong = request({ generation: input.handoff.identity.generation + 1 });
      return runningHandle(wrong);
    });
    const handoff = createStandaloneBootloader({
      minShellVersion: "0.18.0-beta.1",
      start,
    });

    await expect(handoff(request())).rejects.toMatchObject({ code: "body-invalid" });
  });
});
