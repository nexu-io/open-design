import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initialSharedLifecycleState, reduceSharedLifecycleState, SHELL_UPDATE_ALGEBRA, StandaloneHostControlClient, StandaloneHostRuntime,
  type StandaloneShellUpdateHandoff } from "@open-design/standalone";

import { StandaloneHostLifecycle } from "@open-design/standalone";
import { ElectronStandaloneHostUpdater } from "@/adapters/standalone/host-updater.js";
import { ElectronStandaloneShellUpdaterLedger } from "@/adapters/standalone/shell-updater-ledger.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const scope = Object.freeze({ channel: "betahyx", namespace: "electron-updater" });
function publicLifecycle(lifecycle: StandaloneHostLifecycle): StandaloneHostControlClient {
  const host = new StandaloneHostRuntime({
    scope, lifecycle,
    capabilities() { throw new Error("updater must not start a Closure runtime"); },
    async resolveGeneration() { throw new Error("updater must not load a Closure generation"); },
  });
  return new StandaloneHostControlClient(scope, (request) => host.request(request));
}
const handoff = Object.freeze({
  interaction: "restart-and-install" as const,
  releaseVersion: "0.2.0-betahyx.1",
  target: "darwin-arm64",
  artifact: Object.freeze({ path: "/updates/electron.dmg", sha256: "a".repeat(64), size: 42, mediaType: "application/x-apple-diskimage" }),
  shell: Object.freeze({ type: "electron", version: "0.2.0", buildHash: "b".repeat(64) }),
});

async function readyLedger(root: string, selectedHandoff: StandaloneShellUpdateHandoff = handoff): Promise<ElectronStandaloneShellUpdaterLedger> {
  const ledger = new ElectronStandaloneShellUpdaterLedger(root, scope, "electron");
  let snapshot = SHELL_UPDATE_ALGEBRA.initial("electron");
  for (const command of [
    { state: "checking" as const },
    { state: "available" as const, candidateId: "candidate-020" },
    { state: "downloading" as const },
    { state: "ready" as const, handoff: selectedHandoff },
  ]) snapshot = SHELL_UPDATE_ALGEBRA.reduce(snapshot, { expectedRevision: snapshot.revision, ...command });
  await ledger.write(snapshot);
  return ledger;
}

describe("Electron Standalone host updater", () => {
  it.each([false, true])("reserves restart without installer authority and respects other Shell occupants (terminal=%s)", async terminal => {
    const root = await mkdtemp(join(tmpdir(), "electron-host-restart-")); roots.push(root);
    const shell = { ...handoff.shell, digest: "c".repeat(64) };
    const selectedHandoff = { interaction: "restart-and-activate" as const, releaseVersion: handoff.releaseVersion,
      target: handoff.target, shell, activation: { targetDigest: "d".repeat(64), generationId: "e".repeat(64) } };
    const ledger = await readyLedger(root, selectedHandoff);
    const now = "2026-09-08T00:00:00.000Z";
    let shared = initialSharedLifecycleState(scope);
    for (const type of terminal ? ["electron", "terminal"] : ["electron"]) shared = reduceSharedLifecycleState(shared, {
      type: "start", generationId: "f".repeat(64), bindingDigest: "a".repeat(64), instanceId: "runtime",
      attachment: { id: type, shell: { ...shell, type } }, heartbeatAt: now, leaseExpiresAt: "2026-09-08T00:10:00.000Z",
      capability: { candidateHash: "b".repeat(64), presentedHash: null },
    });
    const lifecycle = new StandaloneHostLifecycle(scope, { clock: () => new Date(now), statePort: {
      async read() { return shared; }, async write(value) { shared = value; },
    } });
    const updater = new ElectronStandaloneHostUpdater("electron", publicLifecycle(lifecycle), ledger);
    expect((await updater.invoke("install")).outcome).toBe("unsupported");
    const initial = await updater.invoke("restart");
    if (terminal) {
      expect(initial).toMatchObject({ outcome: "blocked", snapshot: { blockedBy: [{ attachmentId: "terminal" }] } });
      expect(shared.transition).toBeNull();
      expect((await updater.invoke("force-stop-and-restart")).outcome).toBe("accepted");
    } else expect(initial.outcome).toBe("accepted");
    expect(shared.transition).toMatchObject({ kind: "content-restart", phase: "reserved" });
    expect((await ledger.read()).handoff).toEqual(selectedHandoff);
  });
  it("durably reserves a Shell install and leaves physical retirement to the Shell continuation", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-host-updater-"));
    roots.push(root);
    const ledger = await readyLedger(root);
    const lifecycle = new StandaloneHostLifecycle(scope);
    const updater = new ElectronStandaloneHostUpdater("electron", publicLifecycle(lifecycle), ledger);
    const result = await updater.invoke("install");
    expect(result).toMatchObject({ outcome: "accepted", snapshot: { state: "applying", handoff } });
    expect(result.snapshot.installAttemptId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await lifecycle.beginTransition("shell-install", { attemptId: result.snapshot.installAttemptId }))
      .toMatchObject({ state: "acquired", transition: { phase: "reserved", attemptId: result.snapshot.installAttemptId } });
    expect(await ledger.read()).toEqual(result.snapshot);
  });

  it("blocks a Shell install while a Closure restart owns the shared transition", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-host-updater-content-transition-"));
    roots.push(root);
    const ledger = await readyLedger(root);
    const lifecycle = new StandaloneHostLifecycle(scope);
    const updater = new ElectronStandaloneHostUpdater("electron", publicLifecycle(lifecycle), ledger);
    const content = await lifecycle.beginTransition("content-restart", { attemptId: "content-restart-1" });
    expect(content).toMatchObject({ state: "acquired", transition: { attemptId: "content-restart-1", phase: "reserved" } });

    const result = await updater.invoke("force-stop-and-install");
    expect(result).toMatchObject({ outcome: "blocked", snapshot: { state: "ready", handoff, blockedBy: [] } });
    expect(result.snapshot.installAttemptId).toBeUndefined();
    expect(await lifecycle.beginTransition("content-restart", { attemptId: "content-restart-1" })).toEqual(content);
    expect(await ledger.read()).toEqual(result.snapshot);
  });

  it("keeps fossil confirm-installed blocked outside Shell authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-host-updater-confirm-"));
    roots.push(root);
    const ledger = await readyLedger(root);
    const updater = new ElectronStandaloneHostUpdater("electron", publicLifecycle(new StandaloneHostLifecycle(scope)), ledger);
    const applying = await updater.invoke("install");
    expect((await updater.confirmInstalled({ type: "electron", version: "0.2.0", buildHash: "c".repeat(64), digest: "d".repeat(64) })).outcome).toBe("blocked");
    expect(await updater.confirmInstalled({ ...handoff.shell, digest: "d".repeat(64) }))
      .toMatchObject({ outcome: "blocked", snapshot: { state: "applying", installAttemptId: applying.snapshot.installAttemptId } });
  });
});
