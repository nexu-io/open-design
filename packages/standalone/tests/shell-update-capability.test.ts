import { describe, expect, it, vi } from "vitest";

import {
  STANDALONE_SHELL_UPDATER_CAPABILITY,
  createStandaloneShellUpdaterCapabilityClient,
  createStandaloneShellUpdaterCapabilityHandler,
  initialShellUpdaterSnapshot,
  type StandaloneShellCapabilityPort,
  type StandaloneShellIdentity,
  type StandaloneShellUpdaterPort,
} from "../src/index.js";

const bindingDigest = "a".repeat(64);
const shell: StandaloneShellIdentity = Object.freeze({
  type: "electron",
  version: "1.2.3",
  buildHash: "b".repeat(64),
  digest: "c".repeat(64),
});

function updater(): StandaloneShellUpdaterPort & Readonly<{ calls: ReturnType<typeof vi.fn> }> {
  const snapshot = initialShellUpdaterSnapshot(shell.type);
  const calls = vi.fn();
  return Object.freeze({
    shellType: shell.type,
    calls,
    async readSnapshot() { calls("read"); return snapshot; },
    async waitForChange(afterRevision: number, timeoutMs: number) { calls("wait", afterRevision, timeoutMs); return snapshot; },
    async invoke(action: "check" | "download" | "install" | "later" | "force-stop-and-install" | "abandon") { calls("invoke", action); return { outcome: "accepted" as const, snapshot }; },
    async confirmInstalled(proof: StandaloneShellIdentity) { calls("confirm-installed", proof); return { outcome: "blocked" as const, snapshot }; },
  });
}

function client(capabilities: StandaloneShellCapabilityPort) {
  let sequence = 0;
  return createStandaloneShellUpdaterCapabilityClient({
    shellType: shell.type,
    attachmentId: "electron-window",
    bindingDigest,
    capabilities,
    nextRequestId: () => `request-${++sequence}`,
  });
}

describe("Standalone Shell updater capability", () => {
  it("round-trips the complete typed updater over one versioned capability", async () => {
    const concrete = updater();
    const typed = client(createStandaloneShellUpdaterCapabilityHandler(concrete));

    await expect(typed.readSnapshot()).resolves.toMatchObject({ shellType: "electron", state: "idle" });
    await expect(typed.waitForChange(4, 250)).resolves.toMatchObject({ revision: 0 });
    await expect(typed.invoke("check")).resolves.toMatchObject({ outcome: "accepted", snapshot: { state: "idle" } });
    await expect(typed.confirmInstalled(shell)).resolves.toMatchObject({ outcome: "blocked" });
    expect(concrete.calls.mock.calls).toEqual([
      ["read"],
      ["wait", 4, 250],
      ["invoke", "check"],
      ["confirm-installed", shell],
    ]);
  });

  it("fails closed before dispatch for unknown, malformed, or cross-Shell requests", async () => {
    const concrete = updater();
    const handler = createStandaloneShellUpdaterCapabilityHandler(concrete);
    const base = { requestId: "request-1", attachmentId: "electron-window", bindingDigest };

    await expect(handler.invoke({ ...base, capability: "arbitrary-shell-operation" })).resolves.toMatchObject({ outcome: "unsupported" });
    await expect(handler.invoke({ ...base, capability: STANDALONE_SHELL_UPDATER_CAPABILITY, input: { schemaVersion: 1, operation: "wait", shellType: "electron", afterRevision: 0, timeoutMs: 60_001 } })).resolves.toMatchObject({ outcome: "failed", error: { code: "shell-updater-capability-invalid" } });
    await expect(handler.invoke({ ...base, capability: STANDALONE_SHELL_UPDATER_CAPABILITY, input: { schemaVersion: 1, operation: "read", shellType: "terminal" } })).resolves.toMatchObject({ outcome: "failed", error: { code: "shell-updater-capability-invalid" } });
    expect(concrete.calls).not.toHaveBeenCalled();
  });

  it("rejects a Shell result that escapes the exact handoff binding", async () => {
    const escaped: StandaloneShellCapabilityPort = {
      async invoke(request) {
        return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: "d".repeat(64), outcome: "accepted", output: {} };
      },
    };
    await expect(client(escaped).readSnapshot()).rejects.toThrow("escaped its binding");
  });
});
