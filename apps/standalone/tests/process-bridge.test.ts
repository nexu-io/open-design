import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
import { bootstrapSidecarLifecycle } from "@open-design/sidecar/lifecycle";
import { afterEach, describe, expect, it } from "vitest";

import {
  createStandaloneLauncherBootstrapEnv,
  readStandaloneLauncherBootstrap,
  resolveStandaloneBodyBootloaderPath,
  validateStandaloneLauncherBootstrap,
} from "../src/launcher-bootstrap.js";
import {
  connectStandaloneBodyBridge,
  exposeStandaloneBodyBridge,
  launchStandaloneBodyBridge,
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
  it("round-trips a strict launcher bootstrap without Shell capabilities", async () => {
    const binding = await descriptor();
    const env = createStandaloneLauncherBootstrapEnv({
      descriptor: binding,
    });

    expect(readStandaloneLauncherBootstrap(env)).toEqual({
      descriptor: { ...binding, transition: null },
      schemaVersion: 1,
    });
    expect(resolveStandaloneBodyBootloaderPath(binding)).toBe(
      join(binding.paths.installationRoot, "body", "bootloader.mjs"),
    );
    expect(() => validateStandaloneLauncherBootstrap({
      ...readStandaloneLauncherBootstrap(env),
      capabilities: {},
    })).toThrow(/unsupported fields/u);
  });

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

  it("lets a cold body attachment outlive the generic sidecar request deadline", async () => {
    const binding = await descriptor();
    const body = await exposeStandaloneBodyBridge({
      descriptor: binding,
      async handoff() {
        await new Promise((resolve) => setTimeout(resolve, 1_600));
        return fakeHandle(binding);
      },
    });
    try {
      const handle = await connectStandaloneBodyBridge({
        descriptor: binding,
        capabilities: {
          async invoke(request) {
            return {
              attachmentId: request.attachmentId,
              handoff: request.handoff,
              outcome: "unsupported" as const,
              requestId: request.requestId,
              schemaVersion: request.schemaVersion,
            };
          },
        },
      });

      await expect(handle.readStatus()).resolves.toMatchObject({ state: "running" });
      await expect(handle.close()).resolves.toMatchObject({ state: "stopped" });
    } finally {
      await body.close();
    }
  });

  it("keeps transition ownership in the Shell until the body reports running", async () => {
    const baseline = await descriptor();
    const lifecycle = bootstrapSidecarLifecycle({
      controlRoot: baseline.paths.dataRoot,
      scope: {
        channel: baseline.handoff.scope.channel,
        namespace: baseline.handoff.scope.namespace,
      },
    });
    const transition = await lifecycle.beginTransition({
      kind: "align-standalone-to-shell",
      leaseMs: 60_000,
      owner: {
        generation: baseline.handoff.scope.generation,
        incarnation: baseline.attachment.id,
        key: `electron:${baseline.attachment.id}`,
      },
    });
    if (transition.state !== "acquired") throw new Error("transition unexpectedly blocked");
    const binding = { ...baseline, transition: transition.credential };
    let releaseBody!: () => void;
    const bodyReady = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    const body = await exposeStandaloneBodyBridge({
      descriptor: binding,
      async handoff() {
        await bodyReady;
        return fakeHandle(binding);
      },
    });
    try {
      const connecting = connectStandaloneBodyBridge({
        descriptor: binding,
        capabilities: {
          async invoke(request) {
            return {
              attachmentId: request.attachmentId,
              handoff: request.handoff,
              outcome: "unsupported" as const,
              requestId: request.requestId,
              schemaVersion: request.schemaVersion,
            };
          },
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await expect(lifecycle.snapshot()).resolves.toMatchObject({
        leases: [{ owner: { incarnation: binding.attachment.id } }],
        transition: { id: transition.credential.id },
      });

      releaseBody();
      const handle = await connecting;
      await expect(lifecycle.snapshot()).resolves.toMatchObject({
        leases: [{ owner: { incarnation: binding.attachment.id } }],
        transition: null,
      });
      await handle.close();
    } finally {
      releaseBody();
      await body.close();
    }
  });

  it("aborts a transition and detaches the Shell lease when body startup fails", async () => {
    const baseline = await descriptor();
    const lifecycle = bootstrapSidecarLifecycle({
      controlRoot: baseline.paths.dataRoot,
      scope: {
        channel: baseline.handoff.scope.channel,
        namespace: baseline.handoff.scope.namespace,
      },
    });
    const transition = await lifecycle.beginTransition({
      kind: "repair-standalone",
      leaseMs: 60_000,
      owner: {
        generation: baseline.handoff.scope.generation,
        incarnation: baseline.attachment.id,
        key: `electron:${baseline.attachment.id}`,
      },
    });
    if (transition.state !== "acquired") throw new Error("transition unexpectedly blocked");
    const binding = { ...baseline, transition: transition.credential };
    const body = await exposeStandaloneBodyBridge({
      descriptor: binding,
      async handoff() {
        throw new Error("body failed before running");
      },
    });
    try {
      await expect(connectStandaloneBodyBridge({
        descriptor: binding,
        capabilities: {
          async invoke(request) {
            return {
              attachmentId: request.attachmentId,
              handoff: request.handoff,
              outcome: "unsupported" as const,
              requestId: request.requestId,
              schemaVersion: request.schemaVersion,
            };
          },
        },
      })).rejects.toThrow(/body failed before running/u);
      await expect(lifecycle.snapshot()).resolves.toMatchObject({ leases: [], transition: null });
    } finally {
      await body.close();
    }
  });

  it("stops an unowned body attachment after its Shell lease disappears", async () => {
    const binding = await descriptor();
    const body = await exposeStandaloneBodyBridge({
      descriptor: binding,
      async handoff() {
        return fakeHandle(binding);
      },
    });
    try {
      const handle = await connectStandaloneBodyBridge({
        descriptor: binding,
        capabilities: {
          async invoke(request) {
            return {
              attachmentId: request.attachmentId,
              handoff: request.handoff,
              outcome: "unsupported" as const,
              requestId: request.requestId,
              schemaVersion: request.schemaVersion,
            };
          },
        },
      });
      const terminal = handle.waitForTerminal();
      const lifecycleRoot = join(binding.paths.dataRoot, "sidecar-lifecycle");
      const [stateName] = (await readdir(lifecycleRoot)).filter((name) => name.endsWith(".json"));
      const statePath = join(lifecycleRoot, stateName!);
      const state = JSON.parse(await readFile(statePath, "utf8")) as {
        leases: Array<{ expiresAtMs: number }>;
      };
      for (const lease of state.leases) lease.expiresAtMs = 0;
      await writeFile(statePath, `${JSON.stringify(state)}\n`, "utf8");

      await expect(terminal).resolves.toMatchObject({ state: "stopped" });
    } finally {
      await body.close();
    }
  });

  it("coordinates update transitions across Shell attachments without exposing sidecar credentials", async () => {
    const firstBinding = await descriptor("electron-a", 3);
    const secondBinding = {
      ...firstBinding,
      attachment: (await descriptor("codex-plugin-a", 3)).attachment,
    };
    const body = await exposeStandaloneBodyBridge({
      descriptor: firstBinding,
      async handoff(request) {
        return fakeHandle({
          attachment: request.attachment,
          handoff: request.handoff,
          paths: request.paths,
        });
      },
    });
    const capabilities = {
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
    try {
      const first = await connectStandaloneBodyBridge({ capabilities, descriptor: firstBinding });
      const second = await connectStandaloneBodyBridge({ capabilities, descriptor: secondBinding });

      await expect(first.lifecycle.beginTransition("apply-shell-update")).resolves.toEqual({
        occupants: [{
          generation: 3,
          incarnation: "codex-plugin-a",
          key: "electron:codex-plugin-a",
          projection: {
            shellDigest: secondBinding.attachment.shell.digest,
            shellVersion: secondBinding.attachment.shell.version,
          },
        }],
        reason: "occupied",
        state: "blocked",
      });

      await second.close();
      const acquired = await first.lifecycle.beginTransition("apply-shell-update");
      expect(acquired.state).toBe("acquired");
      if (acquired.state !== "acquired") throw new Error("update transition unexpectedly blocked");

      const lifecycle = bootstrapSidecarLifecycle({
        controlRoot: firstBinding.paths.dataRoot,
        scope: {
          channel: firstBinding.handoff.scope.channel,
          namespace: firstBinding.handoff.scope.namespace,
        },
      });
      await expect(lifecycle.snapshot()).resolves.toMatchObject({
        leases: [{ owner: { incarnation: firstBinding.attachment.id } }],
        transition: { kind: "apply-shell-update" },
      });
      await acquired.transition.release();
      await expect(lifecycle.snapshot()).resolves.toMatchObject({
        leases: [{ owner: { incarnation: firstBinding.attachment.id } }],
        transition: null,
      });
      await first.close();
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

  it("launches the bundled launcher.mjs in a real Node body process", async () => {
    const binding = await descriptor();
    const bodyBootloaderPath = resolveStandaloneBodyBootloaderPath(binding);
    await mkdir(join(binding.paths.installationRoot, "body"), { recursive: true });
    await writeFile(bodyBootloaderPath, `
export async function handoff(request) {
  let terminalResolve;
  const terminal = new Promise((resolve) => { terminalResolve = resolve; });
  await request.capabilities.invoke({
    attachmentId: request.attachment.id,
    capability: "open-design.real-process.v1",
    handoff: request.handoff,
    input: { process: "body" },
    requestId: "real-process-capability",
    schemaVersion: 1,
  });
  let status = {
    daemonUrl: "http://127.0.0.1:44101",
    handoff: request.handoff,
    pid: process.pid,
    schemaVersion: 1,
    state: "running",
    webUrl: "http://127.0.0.1:44102",
  };
  return {
    async close() {
      if (status.state === "running") {
        status = {
          handoff: request.handoff,
          pid: process.pid,
          schemaVersion: 1,
          state: "stopped",
        };
        terminalResolve(status);
      }
      return status;
    },
    async invoke(command) {
      return {
        attachmentId: command.attachmentId,
        handoff: command.handoff,
        outcome: "completed",
        output: { bodyPid: process.pid },
        requestId: command.requestId,
        schemaVersion: command.schemaVersion,
      };
    },
    async readStatus() { return status; },
    async waitForTerminal() { return await terminal; },
  };
}
`, "utf8");
    const capabilityInputs: unknown[] = [];
    const capabilities = {
      async invoke(request: StandaloneShellCapabilityRequest) {
        capabilityInputs.push(request.input);
        return {
          attachmentId: request.attachmentId,
          handoff: request.handoff,
          outcome: "completed" as const,
          output: { accepted: true },
          requestId: request.requestId,
          schemaVersion: request.schemaVersion,
        };
      },
    };
    const launch = {
      executable: process.execPath,
      launcherPath: join(import.meta.dirname, "..", "dist", "launcher.mjs"),
      readyTimeoutMs: 5_000,
    };
    const first = await launchStandaloneBodyBridge({
      capabilities,
      descriptor: binding,
      launch,
    });
    const sibling = {
      ...binding,
      attachment: (await descriptor("electron-b", binding.handoff.scope.generation)).attachment,
    };
    const second = await launchStandaloneBodyBridge({
      capabilities,
      descriptor: sibling,
      launch,
    });

    expect(capabilityInputs).toEqual([{ process: "body" }, { process: "body" }]);
    const firstStatus = await first.readStatus();
    const secondStatus = await second.readStatus();
    expect(firstStatus).toMatchObject({ state: "running" });
    expect(firstStatus.pid).not.toBe(process.pid);
    expect(secondStatus.pid).toBe(firstStatus.pid);
    await expect(first.invoke({
      attachmentId: binding.attachment.id,
      command: "open-design.real-process.v1",
      handoff: binding.handoff,
      input: null,
      requestId: "real-process-command",
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    })).resolves.toMatchObject({
      outcome: "completed",
      output: { bodyPid: firstStatus.pid },
    });
    await expect(first.close()).resolves.toMatchObject({ state: "stopped" });
    await expect(second.readStatus()).resolves.toMatchObject({ state: "running" });
    await expect(second.close()).resolves.toMatchObject({ state: "stopped" });
  });
});
