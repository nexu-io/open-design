import { describe, expect, it } from "vitest";

import { createInstallerRecoveryIntentAdapter, parseInstallerRecoveryIntent, serializeInstallerRecoveryIntent } from "@/adapters/updater/installer-recovery.js";

const identity = Object.freeze({
  bindingDigest: "a".repeat(64),
  generationId: "b".repeat(64),
  handoffDigest: "c".repeat(64),
  installAttemptId: "attempt-1",
  lifecycleFence: 4,
  revision: 2,
});
const encoded = Buffer.from(JSON.stringify(identity)).toString("base64url");
const args = [
  "electron",
  "--od-installer-recovery-action=abandon-and-restore",
  "--od-installer-recovery-id=recovery-1",
  `--od-installer-recovery-claim=${encoded}`,
];

describe("Electron installer recovery intent", () => {
  it("requires a complete explicit action, recovery id, and exact claim identity", () => {
    expect(parseInstallerRecoveryIntent(["electron"])).toBeNull();
    expect(() => parseInstallerRecoveryIntent(args.slice(0, -1))).toThrow("incomplete");
    expect(parseInstallerRecoveryIntent(args)).toEqual({ action: "abandon-and-restore", recoveryId: "recovery-1", expected: identity });
  });

  it("cannot inject artifact paths and preserves the original identity across detached restore revisions", async () => {
    const resolve = createInstallerRecoveryIntentAdapter([...args, "--artifact=/tmp/other.dmg"]);
    const claim = { schemaVersion: 1 as const, state: "expired" as const, expiresAt: "2026-09-06T00:00:00.000Z", identity, artifact: { path: "/original/update.dmg", sha256: "d".repeat(64), size: 42, device: "1", inode: "2" }, invocation: { state: "failed" as const, lastError: { code: "failed", message: "failed", observedAt: "2026-09-05T00:00:00.000Z" } } };
    expect(await resolve({ claim, snapshot: {} as never })).toEqual({ action: "abandon-and-restore", recoveryId: "recovery-1", expected: identity });
    expect(await resolve({ claim: { ...claim, identity: { ...identity, revision: 3 } }, snapshot: {} as never })).toEqual({ action: "abandon-and-restore", recoveryId: "recovery-1", expected: identity });
    expect(parseInstallerRecoveryIntent(["electron", ...serializeInstallerRecoveryIntent({ action: "abandon-and-restore", recoveryId: "recovery-1", expected: identity })])).toEqual({ action: "abandon-and-restore", recoveryId: "recovery-1", expected: identity });
  });
});
