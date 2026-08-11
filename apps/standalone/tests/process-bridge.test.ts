import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  createStandaloneHandoffEnvelope,
  type StandaloneHandle,
  type StandaloneHandoffDescriptor,
  type StandaloneRuntimeStatus,
  type StandaloneRuntimeTerminalStatus,
  type StandaloneShellCapabilityRequest,
} from "@open-design/standalone-proto";
import { afterEach, describe, expect, it } from "vitest";

import {
  connectStandaloneBodyBridge,
  exposeStandaloneBodyBridge,
  resolveStandaloneShellBridgeService,
} from "../src/process-bridge.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function descriptor(
  attachmentId = "electron-a",
  generation = 3,
): Promise<StandaloneHandoffDescriptor> {
  const root = await mkdtemp(join(tmpdir(), "od-standalone-process-bridge-"));
  roots.push(root);
  return {
    attachment: {
      id: attachmentId,
      shell: {
        digest: `sha256:${(attachmentId === "electron-a" ? "b" : "c").repeat(64)}`,
        type: "electron",
        version: "0.19.0-beta.10",
      },
    },
    handoff: createStandaloneHandoffEnvelope({
      descriptor: {
        release: { version: "0.19.0-beta.10" },
        standalone: {
          digest: `sha256:${"a".repeat(64)}`,
          protocolVersion: STANDALONE_PROTOCOL_VERSION,
          version: "0.19.0-beta.10",
        },
      },
      scope: { channel: "beta", generation, namespace: "release-beta" },
    }),
    paths: {
      cacheRoot: join(root, "cache"),
      dataRoot: join(root, "data"),
      installationRoot: join(root, "installation"),
      logsRoot: join(root, "logs"),
      resourceRoot: join(root, "resources"),
      runtimeRoot: join(root, "runtime"),
    },
  };
}

function fakeHandle(descriptor: StandaloneHandoffDescriptor): StandaloneHandle {
  let status: StandaloneRuntimeStatus = {
    daemonUrl: "http://127.0.0.1:43101",
    handoff: descriptor.handoff,
    pid: process.pid,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    state: "running",
    webUrl: "http://127.0.0.1:43102",
  };
  let resolveTerminal!: (status: StandaloneRuntimeTerminalStatus) => void;
  const terminal = new Promise<StandaloneRuntimeTerminalStatus>((resolve) => {
    resolveTerminal = resolve;
  });
  return {
    async close() {
      if (status.state === "running") {
        status = {
          handoff: descriptor.handoff,
          pid: process.pid,
          schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
          state: "stopped",
        };
        resolveTerminal(status);
      }
      return status as StandaloneRuntimeTerminalStatus;
    },
    async invoke(request) {
      return {
        attachmentId: request.attachmentId,
        handoff: request.handoff,
        outcome: "completed",
        output: request.input,
        requestId: request.requestId,
        schemaVersion: request.schemaVersion,
      };
    },
    async readStatus() {
      return status;
    },
    async waitForTerminal() {
      return await terminal;
    },
  };
}

describe("Standalone process bridge", () => {
  it("round-trips Shell capabilities and body lifecycle through Sidecar methods", async () => {
    const binding = await descriptor();
    const capabilityInputs: unknown[] = [];
    const body = await exposeStandaloneBodyBridge({
      descriptor: binding,
      async handoff(request) {
        await request.capabilities.invoke({
          attachmentId: request.attachment.id,
          capability: "open-design.test-capability.v1",
          handoff: request.handoff,
          input: { value: "from-body" },
          requestId: "capability-1",
          schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
        });
        return fakeHandle(binding);
      },
    });
    try {
      const handle = await connectStandaloneBodyBridge({
        descriptor: binding,
        capabilities: {
          async invoke(request) {
            capabilityInputs.push(request.input);
            return {
              attachmentId: request.attachmentId,
              handoff: request.handoff,
              outcome: "completed",
              output: { accepted: true },
              requestId: request.requestId,
              schemaVersion: request.schemaVersion,
            };
          },
        },
      });

      expect(capabilityInputs).toEqual([{ value: "from-body" }]);
      await expect(handle.readStatus()).resolves.toMatchObject({ state: "running" });
      await expect(handle.invoke({
        attachmentId: binding.attachment.id,
        command: "open-design.echo.v1",
        handoff: binding.handoff,
        input: { echoed: true },
        requestId: "command-1",
        schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      })).resolves.toMatchObject({ outcome: "completed", output: { echoed: true } });
      const waiting = handle.waitForTerminal();
      await expect(handle.close()).resolves.toMatchObject({ state: "stopped" });
      await expect(waiting).resolves.toMatchObject({ state: "stopped" });
    } finally {
      await body.close();
    }
  });

  it("derives attachment-local services and fences a different generation", async () => {
    const current = await descriptor("electron-a", 3);
    const sibling = { ...current, attachment: (await descriptor("electron-b", 3)).attachment };
    const stale = { ...current, handoff: (await descriptor("electron-a", 2)).handoff };
    expect(resolveStandaloneShellBridgeService(current)).not.toBe(
      resolveStandaloneShellBridgeService(sibling),
    );

    const body = await exposeStandaloneBodyBridge({
      descriptor: current,
      async handoff(request) {
        return fakeHandle({
          attachment: request.attachment,
          handoff: request.handoff,
          paths: request.paths,
        });
      },
    });
    try {
      const unsupportedCapabilities = {
        async invoke(request: StandaloneShellCapabilityRequest) {
          return {
            attachmentId: request.attachmentId,
            handoff: request.handoff,
            outcome: "unsupported" as const,
            requestId: request.requestId,
            schemaVersion: request.schemaVersion,
          };
        },
      };
      const first = await connectStandaloneBodyBridge({
        capabilities: unsupportedCapabilities,
        descriptor: current,
      });
      const second = await connectStandaloneBodyBridge({
        capabilities: unsupportedCapabilities,
        descriptor: sibling,
      });
      await expect(first.close()).resolves.toMatchObject({ state: "stopped" });
      await expect(second.readStatus()).resolves.toMatchObject({ state: "running" });
      await expect(second.close()).resolves.toMatchObject({ state: "stopped" });

      await expect(connectStandaloneBodyBridge({
        capabilities: unsupportedCapabilities,
        descriptor: stale,
      })).rejects.toThrow(/unavailable/u);
    } finally {
      await body.close();
    }
  });
});
