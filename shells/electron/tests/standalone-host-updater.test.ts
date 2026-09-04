import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SHELL_UPDATE_ALGEBRA } from "@open-design/standalone";

import { ElectronStandaloneHostLifecycle } from "@/adapters/standalone/host-lifecycle.js";
import { ElectronStandaloneHostUpdater } from "@/adapters/standalone/host-updater.js";
import { ElectronStandaloneShellUpdaterLedger } from "@/adapters/standalone/shell-updater-ledger.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const scope = Object.freeze({ channel: "betahyx", namespace: "electron-updater" });
const handoff = Object.freeze({
  interaction: "restart-and-install" as const,
  releaseVersion: "0.2.0-betahyx.1",
  target: "darwin-arm64",
  artifact: Object.freeze({ path: "/updates/electron.dmg", sha256: "a".repeat(64), size: 42, mediaType: "application/x-apple-diskimage" }),
  shell: Object.freeze({ type: "electron", version: "0.2.0", buildHash: "b".repeat(64) }),
});

async function readyLedger(root: string): Promise<ElectronStandaloneShellUpdaterLedger> {
  const ledger = new ElectronStandaloneShellUpdaterLedger(root, scope, "electron");
  let snapshot = SHELL_UPDATE_ALGEBRA.initial("electron");
  for (const command of [
    { state: "checking" as const },
    { state: "available" as const, candidateId: "candidate-020" },
    { state: "downloading" as const },
    { state: "ready" as const, handoff },
  ]) snapshot = SHELL_UPDATE_ALGEBRA.reduce(snapshot, { expectedRevision: snapshot.revision, ...command });
  await ledger.write(snapshot);
  return ledger;
}

describe("Electron Standalone host updater", () => {
  it("durably reserves a Shell install and leaves physical retirement to the Shell continuation", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-host-updater-"));
    roots.push(root);
    const ledger = await readyLedger(root);
    const lifecycle = new ElectronStandaloneHostLifecycle(scope);
    const updater = new ElectronStandaloneHostUpdater("electron", lifecycle, ledger);
    const result = await updater.invoke("install");
    expect(result).toMatchObject({ outcome: "accepted", snapshot: { state: "applying", handoff } });
    expect(result.snapshot.installAttemptId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await lifecycle.beginTransition("shell-install", { attemptId: result.snapshot.installAttemptId }))
      .toMatchObject({ state: "acquired", transition: { phase: "reserved", attemptId: result.snapshot.installAttemptId } });
    expect(await ledger.read()).toEqual(result.snapshot);
  });

  it("confirms only the exact replacement Shell after handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-host-updater-confirm-"));
    roots.push(root);
    const ledger = await readyLedger(root);
    const updater = new ElectronStandaloneHostUpdater("electron", new ElectronStandaloneHostLifecycle(scope), ledger);
    const applying = await updater.invoke("install");
    expect((await updater.confirmInstalled({ type: "electron", version: "0.2.0", buildHash: "c".repeat(64), digest: "d".repeat(64) })).outcome).toBe("blocked");
    expect(await updater.confirmInstalled({ ...handoff.shell, digest: "d".repeat(64) }))
      .toMatchObject({ outcome: "accepted", snapshot: { state: "installed", installAttemptId: applying.snapshot.installAttemptId } });
  });
});
