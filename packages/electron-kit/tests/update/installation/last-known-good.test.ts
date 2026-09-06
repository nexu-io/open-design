import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  captureMacElectronLastKnownGood,
  identifyMacElectronLastKnownGoodTree,
  verifyMacElectronLastKnownGoodCapture,
} from "@/update/installation/index.js";

const shell = Object.freeze({ type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) });
const installIdentity = Object.freeze({ appId: "io.open-design.betahyx", executableName: "open-design-betahyx", namespace: "release-betahyx", productName: "Open Design Betahyx" });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-macos-lkg-"));
  const appPath = join(root, "Open Design Betahyx.app");
  await mkdir(join(appPath, "Contents", "Versions", "A"), { recursive: true });
  await writeFile(join(appPath, "Contents", "Info.plist"), "plist-v1");
  await writeFile(join(appPath, "Contents", "Versions", "A", "runtime"), "runtime-v1");
  await symlink("A", join(appPath, "Contents", "Versions", "Current"));
  return { root, appPath, authorityRoot: join(root, "authority") };
}

describe("macOS Electron last-known-good capture", () => {
  it("captures a content-addressed tree and keeps it independent from later source writes", async () => {
    const value = await fixture();
    try {
      const receipt = await captureMacElectronLastKnownGood({ ...value, shell, installIdentity });
      expect(receipt).toMatchObject({ schemaVersion: 1, operation: "electron.macos-lkg.capture", shell, installIdentity });
      expect(receipt.backup.path).toContain(`/installer/lkg/${receipt.source.sha256}.app`);
      expect(receipt.backup).toMatchObject({ sha256: receipt.source.sha256, entries: receipt.source.entries, size: receipt.source.size });
      await writeFile(join(value.appPath, "Contents", "Info.plist"), "plist-v2");
      expect((await identifyMacElectronLastKnownGoodTree(value.appPath)).sha256).not.toBe(receipt.source.sha256);
      await expect(verifyMacElectronLastKnownGoodCapture(receipt)).resolves.toEqual(receipt);
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("fails closed when captured bytes are changed", async () => {
    const value = await fixture();
    try {
      const receipt = await captureMacElectronLastKnownGood({ ...value, shell, installIdentity });
      await writeFile(join(receipt.backup.path, "Contents", "Info.plist"), "tampered");
      await expect(verifyMacElectronLastKnownGoodCapture(receipt)).rejects.toThrow("differs from its captured source");
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("rejects a symbolic link that escapes the app bundle", async () => {
    const value = await fixture();
    try {
      await symlink("../../../../outside", join(value.appPath, "Contents", "escape"));
      await expect(captureMacElectronLastKnownGood({ ...value, shell, installIdentity }))
        .rejects.toThrow("escaping symbolic link");
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });
});
