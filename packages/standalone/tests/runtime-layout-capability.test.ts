import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createStandaloneRuntimeLayoutCapabilityHandler,
  createStandaloneShellCapabilityRouter,
  readStandaloneRuntimeLayoutCapability,
  resolveStandaloneRuntimeLayout,
  type StandaloneShellCapabilityPort,
} from "../src/index.js";

const scope = Object.freeze({ channel: "betahyx", namespace: "electron" });
const bindingDigest = "a".repeat(64);
const layout = Object.freeze({
  dataRoot: join(tmpdir(), "od-layout", "data"),
  logsRoot: join(tmpdir(), "od-layout", "logs"),
  resourceStoreRoot: join(tmpdir(), "od-layout", "store"),
  runtimeRoot: join(tmpdir(), "od-layout", "runtime"),
  sidecarSupervisorPath: join(tmpdir(), "od-layout", "supervisor.mjs"),
});

describe("Standalone runtime layout capability", () => {
  it("derives the same product layout for every Shell without changing existing product paths", () => {
    const namespaceRoot = join(tmpdir(), "shared-scope");
    const input = { namespaceRoot, resourceStoreRoot: layout.resourceStoreRoot, sidecarSupervisorPath: layout.sidecarSupervisorPath };
    const first = resolveStandaloneRuntimeLayout(input);
    expect(resolveStandaloneRuntimeLayout({ ...input })).toEqual(first);
    expect(first).toEqual({
      dataRoot: join(namespaceRoot, "data", "product"),
      logsRoot: join(namespaceRoot, "logs", "product"),
      runtimeRoot: join(namespaceRoot, "runtime", "product"),
      resourceStoreRoot: layout.resourceStoreRoot,
      sidecarSupervisorPath: layout.sidecarSupervisorPath,
    });
    expect(Object.isFrozen(first)).toBe(true);
    const second = resolveStandaloneRuntimeLayout({ ...input, namespaceRoot: join(tmpdir(), "other-scope") });
    expect(second.dataRoot).not.toBe(first.dataRoot);
    expect(second.logsRoot).not.toBe(first.logsRoot);
    expect(second.runtimeRoot).not.toBe(first.runtimeRoot);
    expect(() => resolveStandaloneRuntimeLayout({ ...input, namespaceRoot: "relative" })).toThrow("absolute and normalized");
    expect(() => resolveStandaloneRuntimeLayout({ ...input, resourceStoreRoot: "relative" })).toThrow("absolute and normalized");
  });

  it("round-trips only the exact Shell-owned scope and paths", async () => {
    const capabilities = createStandaloneRuntimeLayoutCapabilityHandler({ layout, scope });
    await expect(readStandaloneRuntimeLayoutCapability({
      attachmentId: "electron-window",
      bindingDigest,
      capabilities,
      requestId: "layout-1",
      scope,
    })).resolves.toEqual(layout);

    await expect(capabilities.invoke({
      attachmentId: "electron-window",
      bindingDigest,
      capability: "standalone-runtime-layout-v1",
      requestId: "layout-2",
      input: { schemaVersion: 1, operation: "read", scope: { ...scope, channel: "stable" } },
    })).resolves.toMatchObject({ outcome: "failed", error: { code: "runtime-layout-capability-invalid" } });
  });

  it("routes finite capabilities and rejects a handler that escapes request fencing", async () => {
    const layoutHandler = createStandaloneRuntimeLayoutCapabilityHandler({ layout, scope });
    const fallback: StandaloneShellCapabilityPort = {
      async invoke(request) { return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest, outcome: "unsupported" }; },
    };
    const routed = createStandaloneShellCapabilityRouter([fallback, layoutHandler]);
    await expect(readStandaloneRuntimeLayoutCapability({
      attachmentId: "electron-window",
      bindingDigest,
      capabilities: routed,
      requestId: "layout-3",
      scope,
    })).resolves.toEqual(layout);

    const escaped: StandaloneShellCapabilityPort = {
      async invoke(request) { return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: "b".repeat(64), outcome: "unsupported" }; },
    };
    await expect(createStandaloneShellCapabilityRouter([escaped]).invoke({
      attachmentId: "electron-window",
      bindingDigest,
      capability: "unknown",
      requestId: "layout-4",
    })).rejects.toThrow("escaped its request binding");
  });
});
