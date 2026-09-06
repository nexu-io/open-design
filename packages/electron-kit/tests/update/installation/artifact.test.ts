import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createMacSystemInstallerTrustVerifier,
  createMacVerifyOnlyInstallerTrustVerifier,
  stageElectronInstallerArtifact,
  verifyElectronInstallerArtifact,
  verifyElectronInstallerArtifactForExecution,
  verifyMacElectronInstallerTrust,
} from "@/update/installation/index.js";

const expectation = Object.freeze({
  channel: "betahyx",
  releaseVersion: "0.2.0-betahyx.1",
  shell: Object.freeze({ type: "electron", version: "0.2.0", buildHash: "a".repeat(64) }),
  installIdentity: Object.freeze({
    appId: "io.open-design.betahyx",
    executableName: "open-design-betahyx",
    namespace: "release-betahyx",
    productName: "Open Design Betahyx",
  }),
  designatedRequirement: 'identifier "io.open-design.betahyx" and anchor apple generic',
  teamIdentifier: "ABC1234XYZ",
});

const trustedApp = Object.freeze({
  appBundleName: "open-design-betahyx.app",
  bundleId: expectation.installIdentity.appId,
  executableName: expectation.installIdentity.executableName,
  productName: expectation.installIdentity.productName,
  designatedRequirement: expectation.designatedRequirement,
  teamIdentifier: expectation.teamIdentifier,
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-installer-artifact-"));
  const path = join(root, "download.dmg");
  const body = Buffer.from("signed installer fixture");
  await writeFile(path, body);
  return {
    root,
    path,
    body,
    request: {
      authorityRoot: join(root, "authority"),
      artifact: {
        path,
        sha256: createHash("sha256").update(body).digest("hex"),
        size: body.byteLength,
        mediaType: "application/x-apple-diskimage",
      },
    },
  } as const;
}

describe("Electron installer artifact staging", () => {
  it("copies one O_NOFOLLOW-opened artifact into an authority-owned content address", async () => {
    const value = await fixture();
    try {
      const receipt = await stageElectronInstallerArtifact(value.request);
      expect(receipt).toMatchObject({
        schemaVersion: 1,
        operation: "electron.installer-artifact.stage",
        sourcePath: value.path,
        artifact: { sha256: value.request.artifact.sha256, size: value.body.byteLength },
      });
      expect(receipt.artifact.path).toMatch(new RegExp(`/sha256/${value.request.artifact.sha256.slice(0, 2)}/${value.request.artifact.sha256}\\.dmg$`, "u"));
      expect((await lstat(receipt.artifact.path)).mode & 0o222).toBe(0);
      await writeFile(value.path, "replacement download");
      await expect(readFile(receipt.artifact.path)).resolves.toEqual(value.body);
      await expect(verifyElectronInstallerArtifact(receipt.artifact)).resolves.toEqual(receipt.artifact);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a symbolic-link source before staging", async () => {
    const value = await fixture();
    const linked = join(value.root, "linked.dmg");
    try {
      await symlink(value.path, linked);
      await expect(stageElectronInstallerArtifact({
        ...value.request,
        artifact: { ...value.request.artifact, path: linked },
      })).rejects.toThrow("must not be a symbolic link");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a symbolic-link authority root", async () => {
    const value = await fixture();
    const owned = join(value.root, "owned");
    const linked = join(value.root, "linked-authority");
    try {
      await writeFile(owned, "not a directory");
      await symlink(owned, linked);
      await expect(stageElectronInstallerArtifact({ ...value.request, authorityRoot: linked }))
        .rejects.toThrow("authority directory is invalid");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("re-opens the fixed object by O_NOFOLLOW fd immediately before execution", async () => {
    const value = await fixture();
    try {
      const staged = await stageElectronInstallerArtifact(value.request);
      const trust = await verifyMacElectronInstallerTrust({
        container: staged.artifact,
        expectation,
        mode: "verify-only",
        mountRoot: join(value.root, "mount"),
        verifier: createMacVerifyOnlyInstallerTrustVerifier(trustedApp),
      });
      await expect(verifyElectronInstallerArtifactForExecution(staged.artifact, trust)).resolves.toEqual(staged.artifact);
      await chmod(staged.artifact.path, 0o600);
      await writeFile(staged.artifact.path, Buffer.alloc(value.body.byteLength, 0x78));
      await chmod(staged.artifact.path, 0o400);
      await expect(verifyElectronInstallerArtifactForExecution(staged.artifact, trust)).rejects.toThrow("identity mismatch");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("binds a deterministic verify-only app receipt to the fixed DMG and release identity", async () => {
    const value = await fixture();
    try {
      const staged = await stageElectronInstallerArtifact(value.request);
      const local = await verifyMacElectronInstallerTrust({
        container: staged.artifact,
        expectation,
        mode: "verify-only",
        mountRoot: join(value.root, "mount"),
        verifier: createMacVerifyOnlyInstallerTrustVerifier(trustedApp),
      });
      expect(local).toMatchObject({
        schemaVersion: 1,
        operation: "electron.macos-installer.trust",
        mode: "verify-only",
        container: staged.artifact,
        release: expectation,
        app: { ...trustedApp, provider: "verify-only", codesignVerified: true, gatekeeperAssessed: false },
      });
      await expect(verifyMacElectronInstallerTrust({
        container: staged.artifact,
        expectation: { ...expectation, teamIdentifier: "ZZZ9999YYY" },
        mode: "verify-only",
        mountRoot: join(value.root, "mount"),
        verifier: createMacVerifyOnlyInstallerTrustVerifier(trustedApp),
      })).rejects.toThrow("differs from its release identity");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("models formal mac trust as readonly mount, unique app, codesign, Gatekeeper, and identity inspection", async () => {
    const value = await fixture();
    try {
      const staged = await stageElectronInstallerArtifact(value.request);
      const mountRoot = join(value.root, "formal-mount");
      const run = vi.fn(async (executable: string, args: readonly string[]) => {
        if (executable === "/usr/bin/hdiutil" && args[0] === "attach") {
          await mkdir(join(mountRoot, trustedApp.appBundleName), { recursive: true });
        }
        if (executable === "/usr/bin/codesign" && args[0] === "--display") {
          return { stdout: "", stderr: `Identifier=${trustedApp.bundleId}\nTeamIdentifier=${trustedApp.teamIdentifier}\n# designated => ${trustedApp.designatedRequirement}\n` };
        }
        if (executable === "/usr/bin/plutil") {
          return { stdout: `${args[1] === "CFBundleExecutable" ? trustedApp.executableName : trustedApp.productName}\n`, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      });
      const receipt = await verifyMacElectronInstallerTrust({
        container: staged.artifact,
        expectation,
        mode: "formal",
        mountRoot,
        verifier: createMacSystemInstallerTrustVerifier({ run }),
      });
      expect(receipt.app).toMatchObject({ provider: "macos-system", codesignVerified: true, gatekeeperAssessed: true });
      expect(run).toHaveBeenCalledWith("/usr/bin/hdiutil", ["attach", staged.artifact.path, "-nobrowse", "-readonly", "-mountpoint", mountRoot]);
      expect(run).toHaveBeenCalledWith("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", join(mountRoot, trustedApp.appBundleName)]);
      expect(run).toHaveBeenCalledWith("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", join(mountRoot, trustedApp.appBundleName)]);
      expect(run).toHaveBeenCalledWith("/usr/bin/hdiutil", ["detach", mountRoot, "-quiet"]);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });
});
