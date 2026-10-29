import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { normalizeLauncherVersion } from "@open-design/launcher-proto";
import { releaseChannelFromNamespace, releaseChannelFromVersion, releaseInstallIdentity } from "@open-design/release";

const execFileAsync = promisify(execFile);
const execOptions = { timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true } as const;
type MacLaunchEntryExec = (command: string, args: string[], options: typeof execOptions) => Promise<{ stdout: string }>;

export type MacLaunchEntryDescriptor = {
  schemaVersion: 1;
  channel: string;
  namespace: string;
  version: string;
  generation: number;
  launchPath: string;
  executablePath: string;
  payloadExecutablePath: string;
  backupAppBundlePath?: string;
  updatedAt: string;
};
export type MacLaunchEntryResult =
  | { status: "promoted" | "current"; launchPath: string; executablePath: string; backupAppBundlePath?: string }
  | { status: "skipped" }
  | { status: "failed"; error: unknown };
export type PromoteMacLaunchEntryInput = {
  runtimeRoot: string;
  channel: string;
  namespace: string;
  version: string;
  generation: number;
  sourceExecutablePath: string;
  installedLaunchPath: string;
  platform?: NodeJS.Platform;
  exec?: MacLaunchEntryExec;
};
type EmbeddedConfig = { appVersion?: unknown; namespace?: unknown };

function within(root: string, path: string): boolean {
  const remainder = relative(root, path);
  return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." && !remainder.startsWith(`..${sep}`));
}

async function configAt(bundle: string): Promise<EmbeddedConfig | null> {
  try {
    const config: unknown = JSON.parse(await readFile(join(bundle, "Contents", "Resources", "open-design-config.json"), "utf8"));
    return config != null && typeof config === "object" ? config as EmbeddedConfig : null;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function channelOf(config: EmbeddedConfig): string {
  return releaseChannelFromVersion(typeof config.appVersion === "string" ? config.appVersion : null)
    ?? releaseChannelFromNamespace(typeof config.namespace === "string" ? config.namespace : "default", "default")
    ?? "stable";
}

async function pathStatus(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try { return await lstat(path); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isUnregisteredApplication(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const diagnostic = error as { code?: unknown; killed?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown };
  if (diagnostic.killed === true || typeof diagnostic.code === "string") return false;
  // Apple's kLSApplicationNotFoundErr means this exact backup has no claim to
  // remove. Hidden staging bundles are often never indexed by LaunchServices.
  return [diagnostic.stdout, diagnostic.stderr, diagnostic.message].some((value) =>
    typeof value === "string" && /(?:^|[\s:=])-10814(?=\s|[),;.]|$)/.test(value));
}

function managedPayloadBundle(runtimeRoot: string, path: string, bundleName: string): boolean {
  const parts = relative(join(runtimeRoot, "versions"), path).split(sep);
  if (parts.length !== 3 || parts[1] !== "payload" || parts[2] !== bundleName) return false;
  try { return normalizeLauncherVersion(parts[0]) === parts[0]; }
  catch { return false; }
}

function exchangeScript(stagePath: string, installedPath: string): string {
  return `ObjC.import("Foundation");
ObjC.bindFunction("renamex_np", ["int", ["char *", "char *", "unsigned int"]]);
const result = $.renamex_np(${JSON.stringify(stagePath)}, ${JSON.stringify(installedPath)}, 2);
if (result !== 0) throw new Error("Could not atomically exchange application bundles: " + result);
JSON.stringify({ status: "exchanged" });`;
}

async function exchangeBundles(exec: MacLaunchEntryExec, stagePath: string, installedPath: string): Promise<void> {
  await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", exchangeScript(stagePath, installedPath)], execOptions);
}

async function writeDescriptor(path: string, descriptor: MacLaunchEntryDescriptor): Promise<void> {
  const temporaryPath = join(dirname(path), `.launch-entry-${randomUUID()}.json`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(descriptor, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function retainInstalledPayload(input: PromoteMacLaunchEntryInput, launchPath: string, config: EmbeddedConfig | null, exec: MacLaunchEntryExec): Promise<void> {
  if (typeof config?.appVersion !== "string") throw new Error("Installed application version is unavailable for rollback");
  const oldVersion = normalizeLauncherVersion(config.appVersion);
  const identity = releaseInstallIdentity(input.channel);
  const bundleName = `${identity.productName}.app`;
  const versionRoot = join(await realpath(input.runtimeRoot), "versions", oldVersion);
  const expectedManifest = {
    schemaVersion: 1, channel: input.channel, namespace: input.namespace, version: oldVersion,
    platform: "darwin", payloadRoot: "payload",
    entry: { cwd: `payload/${bundleName}`, executable: `payload/${bundleName}/Contents/MacOS/${identity.executableName}` },
  };
  if (await pathStatus(versionRoot) != null) {
    const manifest = JSON.parse(await readFile(join(versionRoot, "manifest.json"), "utf8")) as Partial<typeof expectedManifest>;
    const bundle = join(versionRoot, "payload", bundleName);
    const cachedConfig = await configAt(bundle);
    if (manifest.schemaVersion !== 1 || manifest.channel !== input.channel || manifest.namespace !== input.namespace
      || manifest.version !== oldVersion || manifest.platform !== "darwin" || manifest.payloadRoot !== "payload"
      || manifest.entry?.cwd !== expectedManifest.entry.cwd || manifest.entry?.executable !== expectedManifest.entry.executable
      || cachedConfig?.appVersion !== oldVersion || channelOf(cachedConfig) !== input.channel
      || await realpath(bundle) !== bundle || !(await lstat(join(bundle, "Contents", "MacOS", identity.executableName))).isFile()) {
      throw new Error("Existing rollback payload does not match the installed application");
    }
    return;
  }
  const stageRoot = join(dirname(versionRoot), `.${oldVersion}-migration-${randomUUID()}`);
  await mkdir(join(stageRoot, "payload"), { recursive: true, mode: 0o700 });
  const stageBundle = join(stageRoot, "payload", bundleName);
  await exec("/usr/bin/ditto", ["--rsrc", "--extattr", await realpath(launchPath), stageBundle], execOptions);
  const stagedConfig = await configAt(stageBundle);
  if (stagedConfig?.appVersion !== oldVersion || channelOf(stagedConfig) !== input.channel
    || !(await lstat(join(stageBundle, "Contents", "MacOS", identity.executableName))).isFile()) throw new Error("Staged rollback payload is incomplete");
  await writeFile(join(stageRoot, "manifest.json"), `${JSON.stringify(expectedManifest, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  if (await pathStatus(versionRoot) != null) throw new Error("Rollback payload changed during retention");
  await rename(stageRoot, versionRoot);
}

/**
 * Install the confirmed payload at the physically recorded, channel-specific
 * application path. Stage on the same filesystem, atomically exchange bundles,
 * and retain the old bundle for rollback. Failed publication restores the old
 * entry; no existing bundle or staging backup is deleted here.
 */
export async function promoteMacLaunchEntry(input: PromoteMacLaunchEntryInput): Promise<MacLaunchEntryResult> {
  if ((input.platform ?? process.platform) !== "darwin") return { status: "skipped" };
  const exec = input.exec ?? execFileAsync;
  try {
    const version = normalizeLauncherVersion(input.version);
    if (!Number.isSafeInteger(input.generation) || input.generation < 0) return { status: "skipped" };
    if (![input.runtimeRoot, input.sourceExecutablePath, input.installedLaunchPath].every(isAbsolute)) return { status: "skipped" };
    const identity = releaseInstallIdentity(input.channel);
    const bundleName = `${identity.productName}.app`;
    const runtimeRoot = await realpath(input.runtimeRoot);
    const sourceExecutablePath = resolve(input.sourceExecutablePath);
    const sourceBundle = dirname(dirname(dirname(sourceExecutablePath)));
    if (basename(dirname(sourceExecutablePath)) !== "MacOS" || basename(dirname(dirname(sourceExecutablePath))) !== "Contents"
      || basename(sourceBundle) !== bundleName || basename(sourceExecutablePath) !== identity.executableName) return { status: "skipped" };
    const expectedSource = join(runtimeRoot, "versions", version, "payload", bundleName);
    if (await realpath(sourceBundle) !== expectedSource || await realpath(sourceExecutablePath) !== join(expectedSource, "Contents", "MacOS", identity.executableName)
      || !(await lstat(sourceBundle)).isDirectory()
      || !(await lstat(sourceExecutablePath)).isFile()) return { status: "skipped" };
    const sourceConfig = await configAt(sourceBundle);
    if (sourceConfig?.appVersion !== version || channelOf(sourceConfig) !== input.channel) return { status: "skipped" };

    const recordedPath = resolve(input.installedLaunchPath);
    if (basename(recordedPath) !== bundleName) return { status: "skipped" };
    const parentPath = await realpath(dirname(recordedPath));
    const launchPath = join(parentPath, bundleName);
    if (within(runtimeRoot, launchPath) || within(launchPath, runtimeRoot)) return { status: "skipped" };
    const executablePath = join(launchPath, "Contents", "MacOS", identity.executableName);
    const before = await pathStatus(launchPath);
    let targetConfig: EmbeddedConfig | null = null;
    if (before != null) {
      if (!before.isDirectory() && !before.isSymbolicLink()) return { status: "skipped" };
      if (before.isSymbolicLink() && !managedPayloadBundle(runtimeRoot, await realpath(launchPath), bundleName)) return { status: "skipped" };
      targetConfig = await configAt(launchPath);
      if (targetConfig != null) {
        if (channelOf(targetConfig) !== input.channel) return { status: "skipped" };
      }
      if (!(await stat(executablePath)).isFile()) return { status: "skipped" };
    }
    const readBundleId = async (bundle: string) => (await exec("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", join(bundle, "Contents", "Info.plist")], execOptions)).stdout.trim();
    const sourceBundleId = await readBundleId(sourceBundle);
    if (sourceBundleId.length === 0 || (before != null && await readBundleId(launchPath) !== sourceBundleId)) return { status: "skipped" };

    const descriptorPath = join(runtimeRoot, "launch-entry.json");
    let previous: Partial<MacLaunchEntryDescriptor> | null = null;
    try { previous = JSON.parse(await readFile(descriptorPath, "utf8")) as Partial<MacLaunchEntryDescriptor>; }
    catch { /* Missing or invalid records cannot authorize skipping a bundle copy. */ }
    if (before?.isDirectory() && targetConfig?.appVersion === version && previous?.schemaVersion === 1
      && previous.channel === input.channel && previous.namespace === input.namespace && previous.version === version
      && previous.generation === input.generation && previous.launchPath === launchPath && previous.executablePath === executablePath
      && previous.payloadExecutablePath === sourceExecutablePath) return { status: "current", launchPath, executablePath };

    // Retain the installed outer before replacing it: its last-successful version
    // may predate payload updates and therefore have no rollback cache yet.
    if (before != null) await retainInstalledPayload(input, launchPath, targetConfig, exec);
    const stageRoot = await mkdtemp(join(parentPath, ".od-launch-entry-"));
    await chmod(stageRoot, 0o700);
    const stagePath = join(stageRoot, bundleName);
    const marker = { schemaVersion: 1, launchPath, backupAppBundlePath: stagePath, channel: input.channel, namespace: input.namespace, version, generation: input.generation };
    if (before != null) await writeFile(join(stageRoot, ".od-launch-entry.json"), `${JSON.stringify(marker)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await exec("/usr/bin/ditto", ["--rsrc", "--extattr", sourceBundle, stagePath], execOptions);
    const stagedConfig = await configAt(stagePath);
    if (await realpath(stagePath) !== stagePath || stagedConfig?.appVersion !== version || channelOf(stagedConfig) !== input.channel
      || !(await lstat(join(stagePath, "Contents", "MacOS", identity.executableName))).isFile()) throw new Error("Staged application does not match the confirmed payload");
    const current = await pathStatus(launchPath);
    if ((before == null) !== (current == null) || (before != null && current != null && (before.dev !== current.dev || before.ino !== current.ino || before.mtimeMs !== current.mtimeMs
      || JSON.stringify(await configAt(launchPath)) !== JSON.stringify(targetConfig)))) {
      throw new Error("Installed application changed during launch-entry promotion");
    }
    if (before == null) await rename(stagePath, launchPath);
    else await exchangeBundles(exec, stagePath, launchPath);
    try {
      await writeDescriptor(descriptorPath, {
        schemaVersion: 1, channel: input.channel, namespace: input.namespace, version, generation: input.generation,
        launchPath, executablePath, payloadExecutablePath: sourceExecutablePath, updatedAt: new Date().toISOString(),
        ...(before == null ? {} : { backupAppBundlePath: stagePath }),
      });
    } catch (error: unknown) {
      try {
        if (before == null) await rename(launchPath, stagePath);
        else await exchangeBundles(exec, stagePath, launchPath);
      } catch (rollbackError: unknown) {
        throw new AggregateError([error, rollbackError], "Launch-entry publication and bundle rollback failed");
      }
      throw error;
    }
    if (before == null) await rmdir(stageRoot).catch(() => undefined);
    return { status: "promoted", launchPath, executablePath, ...(before == null ? {} : { backupAppBundlePath: stagePath }) };
  } catch (error: unknown) {
    return { status: "failed", error };
  }
}

/** Remove only the journaled old bundle once the promoted desktop is ready. */
export async function cleanupConfirmedMacLaunchEntry(input: {
  runtimeRoot: string; launchPath: string; version: string; generation: number;
  platform?: NodeJS.Platform; exec?: MacLaunchEntryExec;
}): Promise<{ status: "cleaned" | "skipped" } | { status: "failed"; error: unknown }> {
  if ((input.platform ?? process.platform) !== "darwin") return { status: "skipped" };
  try {
    const runtimeRoot = await realpath(input.runtimeRoot);
    const descriptorPath = join(runtimeRoot, "launch-entry.json");
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as MacLaunchEntryDescriptor;
    if (descriptor.schemaVersion !== 1 || descriptor.launchPath !== resolve(input.launchPath)
      || descriptor.version !== input.version || descriptor.generation !== input.generation || typeof descriptor.backupAppBundlePath !== "string") return { status: "skipped" };
    const identity = releaseInstallIdentity(descriptor.channel);
    const backupPath = descriptor.backupAppBundlePath;
    const stageRoot = dirname(backupPath);
    const parentPath = await realpath(dirname(input.launchPath));
    if (!isAbsolute(backupPath) || dirname(stageRoot) !== parentPath || !/^\.od-launch-entry-[A-Za-z0-9]{6}$/.test(basename(stageRoot))
      || basename(backupPath) !== `${identity.productName}.app` || await realpath(stageRoot) !== stageRoot
      || !(await lstat(stageRoot)).isDirectory() || (await lstat(stageRoot)).isSymbolicLink()) return { status: "skipped" };
    const marker = JSON.parse(await readFile(join(stageRoot, ".od-launch-entry.json"), "utf8")) as Partial<MacLaunchEntryDescriptor>;
    if (marker.schemaVersion !== 1 || marker.launchPath !== descriptor.launchPath || marker.backupAppBundlePath !== backupPath
      || marker.channel !== descriptor.channel || marker.namespace !== descriptor.namespace || marker.version !== descriptor.version
      || marker.generation !== descriptor.generation) return { status: "skipped" };
    const entries = await readdir(stageRoot);
    if (entries.length !== 2 || !entries.includes(basename(backupPath)) || !entries.includes(".od-launch-entry.json")) return { status: "skipped" };
    const backup = await lstat(backupPath);
    if (!backup.isDirectory() || backup.isSymbolicLink() || await realpath(backupPath) !== backupPath) return { status: "skipped" };
    const current = await configAt(descriptor.launchPath);
    if (current?.appVersion !== descriptor.version || channelOf(current) !== descriptor.channel) return { status: "skipped" };
    try {
      await (input.exec ?? execFileAsync)("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-u", backupPath], execOptions);
    } catch (error: unknown) {
      if (!isUnregisteredApplication(error)) throw error;
    }
    // Re-read ownership immediately before the only recursive deletion.
    if (JSON.stringify(JSON.parse(await readFile(descriptorPath, "utf8"))) !== JSON.stringify(descriptor)) return { status: "skipped" };
    if (await realpath(stageRoot) !== stageRoot || (await lstat(stageRoot)).isSymbolicLink()) return { status: "skipped" };
    await rm(stageRoot, { recursive: true });
    // The immutable backup path remains as recovery history. Rewriting an old
    // journal here could overwrite a concurrently published newer promotion.
    return { status: "cleaned" };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "skipped" };
    return { status: "failed", error };
  }
}
