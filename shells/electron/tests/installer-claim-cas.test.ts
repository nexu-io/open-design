import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  electronInstallerClaimIdentity,
  ElectronStandaloneInstallerClaimLedger,
  type ElectronStandaloneInstallerClaim,
} from "@/adapters/standalone/installer-claim.js";

const roots: string[] = [];
afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))));

describe("Electron installer claim CAS", () => {
  it("allows only one expiry, retry-failure, or abandon writer for one revision", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-installer-claim-cas-"));
    roots.push(root);
    const ledger = new ElectronStandaloneInstallerClaimLedger(root, { channel: "betahyx", namespace: "cas" });
    const base: ElectronStandaloneInstallerClaim = Object.freeze({
      schemaVersion: 1,
      revision: 0,
      state: "sealed",
      bindingDigest: "a".repeat(64),
      generationId: "b".repeat(64),
      installAttemptId: "attempt-1",
      handoffDigest: "c".repeat(64),
      runtimeRoot: join(root, "runtime"),
      lifecycleFence: 1,
      createdAt: "2026-09-06T00:00:00.000Z",
      expiresAt: "2026-09-06T00:10:00.000Z",
      artifact: { path: join(root, "update.dmg"), sha256: "d".repeat(64), size: 42, device: "1", inode: "2" },
      invocation: { state: "pending" as const },
      retirement: { schemaVersion: 1 as const, bindingDigest: "a".repeat(64), generationId: "b".repeat(64), resources: [] },
    });
    await ledger.compareAndSet(null, base);
    const expected = electronInstallerClaimIdentity(base);
    const expired = Object.freeze({ ...base, revision: 1, state: "expired" as const });
    const retryFailed = Object.freeze({ ...base, revision: 1, invocation: { state: "failed" as const, lastError: { code: "retry-failed", message: "retry failed", observedAt: "2026-09-06T00:01:00.000Z" } } });
    const restorationIntent = Object.freeze({
      ...base,
      revision: 1,
      restoration: { recoveryId: "abandon-1", expected, phase: "intent-persisted" as const },
    });
    const outcomes = await Promise.allSettled([
      ledger.compareAndSet(expected, expired),
      ledger.compareAndSet(expected, retryFailed),
      ledger.compareAndSet(expected, restorationIntent),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(2);
    expect((await ledger.read())?.revision).toBe(1);
  });
});
