import { describe, expect, it, vi } from "vitest";

import { observeElectronInstallerHandoff, resolveElectronInstallerRecovery } from "@/runtime/session/update-handoff.js";

const handedOff = {
  schemaVersion: 3 as const,
  revision: 6,
  shellType: "electron",
  state: "handed-off" as const,
  candidateId: "99.0.0",
  installAttemptId: "1a7fbacd-d319-47f0-b229-f9ec16b9f3b9",
  blockedBy: [],
  handoff: {
    interaction: "restart-and-install" as const,
    releaseVersion: "99.0.0",
    target: "darwin-arm64",
    artifact: {
      path: "/fixture/update.dmg",
      sha256: "a".repeat(64),
      size: 42,
      mediaType: "application/x-apple-diskimage",
    },
    shell: { type: "electron", version: "0.1.0", buildHash: "b".repeat(64) },
  },
  actions: [{ id: "abandon" as const, emphasis: "danger" as const }],
};

describe("Electron installer handoff observation", () => {
  it("fails sealed instead of replaying installer arming when the current Shell is still the old identity", async () => {
    await expect(resolveElectronInstallerRecovery({
      shell: { type: "electron", version: "0.0.9", buildHash: "c".repeat(64), digest: "d".repeat(64) },
      updater: { readSnapshot: async () => handedOff },
    })).resolves.toMatchObject({ state: "recovery-required", request: { handoff: handedOff.handoff, installAttemptId: handedOff.installAttemptId } });
  });

  it("routes the exact replacement Shell through authority confirmation without mutating the updater", async () => {
    const readSnapshot = vi.fn(async () => handedOff);
    await expect(resolveElectronInstallerRecovery({
      shell: { ...handedOff.handoff.shell, digest: "d".repeat(64) },
      updater: { readSnapshot },
    })).resolves.toMatchObject({ state: "replacement-confirmation-required", snapshot: handedOff });
    expect(readSnapshot).toHaveBeenCalledOnce();
  });

  it("hands an applying transition to the Shell-owned guarded continuation", async () => {
    const onHandoff = vi.fn(async () => undefined);
    await observeElectronInstallerHandoff({
      afterRevision: 0,
      isClosing: () => false,
      onHandoff,
      updater: {
        readSnapshot: async () => ({ ...handedOff, state: "applying", actions: [] }),
        waitForChange: vi.fn(),
      },
    });
    expect(onHandoff).toHaveBeenCalledWith({ handoff: handedOff.handoff, installAttemptId: handedOff.installAttemptId });
  });

  it("arms a handoff that completed before observation started", async () => {
    const onHandoff = vi.fn(async () => undefined);
    const waitForChange = vi.fn();
    await observeElectronInstallerHandoff({
      afterRevision: 0,
      isClosing: () => false,
      onHandoff,
      updater: {
        readSnapshot: async () => handedOff,
        waitForChange,
      },
    });
    expect(onHandoff).toHaveBeenCalledOnce();
    expect(onHandoff).toHaveBeenCalledWith({
      handoff: handedOff.handoff,
      installAttemptId: handedOff.installAttemptId,
    });
    expect(waitForChange).not.toHaveBeenCalled();
  });

  it("does not consume a handoff while the runtime is closing", async () => {
    const onHandoff = vi.fn();
    await observeElectronInstallerHandoff({
      afterRevision: 0,
      isClosing: () => true,
      onHandoff,
      updater: {
        readSnapshot: async () => handedOff,
        waitForChange: vi.fn(),
      },
    });
    expect(onHandoff).not.toHaveBeenCalled();
  });

  it("reattaches observation after an expected Standalone host replacement", async () => {
    const onHandoff = vi.fn(async () => undefined);
    const readSnapshot = vi.fn()
      .mockResolvedValueOnce({ ...handedOff, revision: 0, state: "idle", handoff: null, installAttemptId: null })
      .mockResolvedValueOnce(handedOff);
    const unavailable = Object.assign(new Error("connect ENOENT host.sock"), { code: "ENOENT" });
    await observeElectronInstallerHandoff({
      afterRevision: 0,
      isClosing: () => false,
      onHandoff,
      updater: { readSnapshot, waitForChange: vi.fn(async () => { throw unavailable; }) },
    });
    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(onHandoff).toHaveBeenCalledWith({ handoff: handedOff.handoff, installAttemptId: handedOff.installAttemptId });
  });

  it("surfaces non-transport observation failures", async () => {
    await expect(observeElectronInstallerHandoff({
      afterRevision: 0,
      isClosing: () => false,
      onHandoff: vi.fn(),
      updater: { readSnapshot: async () => { throw new Error("invalid updater state"); }, waitForChange: vi.fn() },
    })).rejects.toThrow("invalid updater state");
  });
});
