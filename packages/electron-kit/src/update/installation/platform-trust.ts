import { execFile } from "node:child_process";
import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import type {
  ElectronInstallerArtifactIdentity,
  ElectronMacInstallerTrustExpectation,
  ElectronMacInstallerTrustObservation,
  ElectronMacInstallerTrustReceipt,
  ElectronMacInstallerTrustVerifier,
} from "./contracts.js";
import { verifyElectronInstallerArtifact } from "./artifact.js";

const execFileAsync = promisify(execFile);

type CommandResult = Readonly<{ stdout: string; stderr: string }>;
type CommandRunner = (executable: string, args: readonly string[]) => Promise<CommandResult>;

function exactToken(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) throw new Error(`macOS installer ${label} is invalid`);
  return value;
}

function exactExpectation(value: ElectronMacInstallerTrustExpectation, mode: ElectronMacInstallerTrustReceipt["mode"]): ElectronMacInstallerTrustExpectation {
  exactToken(value.channel, "channel");
  exactToken(value.releaseVersion, "release version");
  exactToken(value.installIdentity.appId, "install identity appId");
  exactToken(value.installIdentity.executableName, "install identity executableName");
  exactToken(value.installIdentity.namespace, "install identity namespace");
  if (value.installIdentity.productName.length === 0 || value.installIdentity.productName.includes("\n")) {
    throw new Error("macOS installer install identity productName is invalid");
  }
  if (!/^[A-Z0-9]{10}$/u.test(value.teamIdentifier) && !(mode === "verify-only" && value.teamIdentifier === "adhoc")) throw new Error("macOS installer team identifier is invalid");
  if (value.designatedRequirement.length === 0 || value.designatedRequirement.includes("\n")) throw new Error("macOS installer designated requirement is invalid");
  return Object.freeze({ ...value, shell: Object.freeze({ ...value.shell }), installIdentity: Object.freeze({ ...value.installIdentity }) });
}

function codesignField(output: string, name: string): string {
  const value = new RegExp(`(?:^|\\n)${name}=(.+?)(?:\\n|$)`, "u").exec(output)?.[1]?.trim();
  if (value == null || value.length === 0) throw new Error(`macOS codesign output omitted ${name}`);
  return value;
}

function teamIdentifier(output: string): string {
  const value = new RegExp(`(?:^|\\n)TeamIdentifier=(.+?)(?:\\n|$)`, "u").exec(output)?.[1]?.trim();
  if (value === "not set") return "adhoc";
  if (value == null || value.length === 0) throw new Error("macOS codesign output omitted TeamIdentifier");
  return value;
}

function designatedRequirement(output: string): string {
  const value = /(?:^|\n)(?:# )?designated => (.+?)(?:\n|$)/u.exec(output)?.[1]?.trim();
  if (value == null || value.length === 0) throw new Error("macOS codesign output omitted its designated requirement");
  return value;
}

function scalar(result: CommandResult, label: string): string {
  const value = result.stdout.trim();
  if (value.length === 0 || value.includes("\n")) throw new Error(`macOS app omitted ${label}`);
  return value;
}

export function createMacSystemInstallerTrustVerifier(options: Readonly<{
  run?: CommandRunner;
}> = {}): ElectronMacInstallerTrustVerifier {
  const run = options.run ?? (async (executable, args) => await execFileAsync(executable, [...args]));
  return Object.freeze({
    async verify({ container, mode, mountRoot }): Promise<ElectronMacInstallerTrustObservation> {
      if (process.platform !== "darwin" && options.run == null) throw new Error("macOS installer trust requires Darwin");
      await rm(mountRoot, { recursive: true, force: true });
      await mkdir(mountRoot, { recursive: true, mode: 0o700 });
      let mounted = false;
      try {
        await run("/usr/bin/hdiutil", ["attach", container.path, "-nobrowse", "-readonly", "-mountpoint", mountRoot]);
        mounted = true;
        const apps = (await readdir(mountRoot, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
        if (apps.length !== 1) throw new Error(`macOS installer must contain exactly one app bundle; found ${apps.length}`);
        return await inspectMacElectronAppTrust({ appPath: join(mountRoot, apps[0]!.name), mode, run });
      } finally {
        try { if (mounted) await run("/usr/bin/hdiutil", ["detach", mountRoot, "-quiet"]); }
        finally { await rm(mountRoot, { recursive: true, force: true }); }
      }
    },
  });
}

export async function inspectMacElectronAppTrust(input: Readonly<{
  appPath: string;
  mode: ElectronMacInstallerTrustReceipt["mode"];
  run?: CommandRunner;
}>): Promise<ElectronMacInstallerTrustObservation> {
  if (process.platform !== "darwin" && input.run == null) throw new Error("macOS app trust inspection requires Darwin");
  const status = await lstat(input.appPath);
  if (!status.isDirectory() || status.isSymbolicLink() || !basename(input.appPath).endsWith(".app")) throw new Error("macOS app trust target is not an app bundle");
  const run = input.run ?? (async (executable, args) => await execFileAsync(executable, [...args]));
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", input.appPath]);
  if (input.mode === "formal") await run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", input.appPath]);
  const details = await run("/usr/bin/codesign", ["--display", "--requirements", "-", "--verbose=4", input.appPath]);
  const plistPath = join(input.appPath, "Contents", "Info.plist");
  const executableName = scalar(await run("/usr/bin/plutil", ["-extract", "CFBundleExecutable", "raw", "-o", "-", plistPath]), "CFBundleExecutable");
  const productName = scalar(await run("/usr/bin/plutil", ["-extract", "CFBundleName", "raw", "-o", "-", plistPath]), "CFBundleName");
  const output = `${details.stdout}\n${details.stderr}`;
  return Object.freeze({
    provider: "macos-system",
    appBundleName: basename(input.appPath),
    bundleId: codesignField(output, "Identifier"),
    executableName,
    productName,
    designatedRequirement: designatedRequirement(output),
    teamIdentifier: teamIdentifier(output),
    codesignVerified: true,
    gatekeeperAssessed: input.mode === "formal",
  });
}

export function createMacVerifyOnlyInstallerTrustVerifier(
  observation: Omit<ElectronMacInstallerTrustObservation, "provider" | "codesignVerified" | "gatekeeperAssessed">,
): ElectronMacInstallerTrustVerifier {
  return Object.freeze({
    async verify() {
      return Object.freeze({ ...observation, provider: "verify-only" as const, codesignVerified: true, gatekeeperAssessed: false });
    },
  });
}

export async function verifyMacElectronInstallerTrust(input: Readonly<{
  container: ElectronInstallerArtifactIdentity;
  expectation: ElectronMacInstallerTrustExpectation;
  mode: ElectronMacInstallerTrustReceipt["mode"];
  mountRoot: string;
  verifier: ElectronMacInstallerTrustVerifier;
}>): Promise<ElectronMacInstallerTrustReceipt> {
  const expected = exactExpectation(input.expectation, input.mode);
  const before = await verifyElectronInstallerArtifact(input.container);
  const app = await input.verifier.verify({ container: before, mode: input.mode, mountRoot: input.mountRoot });
  const after = await verifyElectronInstallerArtifact(before);
  const expectedBundleName = `${expected.installIdentity.executableName}.app`;
  if (app.appBundleName !== expectedBundleName || app.bundleId !== expected.installIdentity.appId
    || app.executableName !== expected.installIdentity.executableName || app.productName !== expected.installIdentity.productName
    || app.designatedRequirement !== expected.designatedRequirement || app.teamIdentifier !== expected.teamIdentifier
    || app.codesignVerified !== true || (input.mode === "formal" && (app.provider !== "macos-system" || app.gatekeeperAssessed !== true))) {
    throw new Error("macOS installer app trust differs from its release identity");
  }
  return Object.freeze({
    schemaVersion: 1,
    operation: "electron.macos-installer.trust",
    mode: input.mode,
    container: after,
    release: expected,
    app: Object.freeze({ ...app }),
  });
}

/** A detached helper calls this after trust verification and immediately before opening the fixed DMG. */
export async function verifyElectronInstallerArtifactForExecution(
  staged: ElectronInstallerArtifactIdentity,
  trust: ElectronMacInstallerTrustReceipt,
): Promise<ElectronInstallerArtifactIdentity> {
  if (trust.operation !== "electron.macos-installer.trust" || trust.schemaVersion !== 1
    || JSON.stringify(trust.container) !== JSON.stringify(staged)) {
    throw new Error("macOS installer trust receipt does not bind the staged container");
  }
  return await verifyElectronInstallerArtifact(staged);
}
