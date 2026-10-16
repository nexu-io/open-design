import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLauncherLaunchTarget, resolveLauncherCliContext } from "../src/launch-target.js";
import { resolveLauncherPaths, resolveLauncherVersionPaths } from "../src/index.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "od-launch-target-"));
  directories.push(root);
  return root;
}

async function json(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function fixture(platform: "darwin" | "win32" = "darwin") {
  const root = await tempRoot();
  const request = { channel: "stable", namespace: "release-stable", platform, root };
  const paths = resolveLauncherPaths(request);
  const pointer = { generation: 2, version: "99.0.0" };
  const relativeExecutable = platform === "darwin" ? "payload/Open Design.app/Contents/MacOS/Open Design" : "payload/Open Design.exe";
  const payload = resolveLauncherVersionPaths({ ...request, version: pointer.version });
  const executablePath = join(payload.versionRoot, relativeExecutable);
  await mkdir(dirname(executablePath), { recursive: true });
  await writeFile(executablePath, "fixture");
  await json(payload.manifestPath, { ...request, schemaVersion: 1, version: pointer.version, payloadRoot: "payload", entry: { cwd: "payload", executable: relativeExecutable } });
  await json(paths.runtimePath, { ...request, schemaVersion: 1, active: pointer, lastSuccessful: pointer });
  return { executablePath, paths, payload, pointer, relativeExecutable, request };
}

async function currentAlias(f: Awaited<ReturnType<typeof fixture>>, versionRoot = f.payload.versionRoot) {
  await symlink(versionRoot, join(f.paths.namespaceRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  return join(f.paths.namespaceRoot, "current", f.relativeExecutable);
}

async function canonical(f: Awaited<ReturnType<typeof fixture>>, version = f.pointer.version) {
  const launchPath = join(f.request.root, "Applications", "Open Design.app");
  const executablePath = join(launchPath, "Contents", "MacOS", "Open Design");
  await mkdir(dirname(executablePath), { recursive: true });
  await writeFile(executablePath, "canonical fixture");
  await json(join(launchPath, "Contents", "Resources", "open-design-config.json"), { appVersion: version, namespace: f.request.namespace });
  await json(join(f.paths.namespaceRoot, "launch-entry.json"), { ...f.request, ...f.pointer, schemaVersion: 1, launchPath, executablePath, payloadExecutablePath: f.executablePath });
  return { executablePath, launchPath };
}

describe("supported launcher entry resolution", () => {
  it("prefers the canonical app whose promotion record and packaged version match the selected pointer", async () => {
    const f = await fixture();
    const installed = await canonical(f);
    await currentAlias(f);
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({ ...installed, ...f.pointer, source: "canonical" });
  });

  it("returns the fixed current path when canonical promotion is absent", async () => {
    const f = await fixture();
    const executablePath = await currentAlias(f);
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({ executablePath, launchPath: join(f.paths.namespaceRoot, "current", "payload", "Open Design.app"), version: f.pointer.version, source: "current-alias" });
  });

  it("does not let a stale canonical copy override the selected current alias", async () => {
    const f = await fixture();
    await canonical(f, "0.20.0");
    await currentAlias(f);
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({ version: f.pointer.version, source: "current-alias" });
  });

  it("rejects a stale current alias instead of launching a different version", async () => {
    const f = await fixture();
    const old = resolveLauncherVersionPaths({ ...f.request, version: "0.20.0" });
    await mkdir(dirname(join(old.versionRoot, f.relativeExecutable)), { recursive: true });
    await writeFile(join(old.versionRoot, f.relativeExecutable), "old fixture");
    await currentAlias(f, old.versionRoot);
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-stale-entry" });
  });

  it("uses the last successful pointer after an unfinished active attempt and refuses a stale new alias", async () => {
    const f = await fixture();
    await currentAlias(f);
    await json(f.paths.runtimePath, { ...f.request, schemaVersion: 1, active: f.pointer, lastSuccessful: { generation: 1, version: "0.20.0" } });
    await json(f.paths.attemptsPath, { ...f.request, ...f.pointer, schemaVersion: 1 });
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-stale-entry", message: expect.stringContaining("0.20.0") });
  });

  it("returns the valid last successful entry after an unfinished newer attempt", async () => {
    const f = await fixture();
    await canonical(f);
    await json(f.paths.runtimePath, { ...f.request, schemaVersion: 1, active: { generation: 3, version: "99.1.0" }, lastSuccessful: f.pointer });
    await json(f.paths.attemptsPath, { ...f.request, generation: 3, version: "99.1.0", schemaVersion: 1 });
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({ ...f.pointer, reason: "last-successful", source: "canonical" });
  });

  it("allows a validated live caller's delegated pointer while the cold CLI still rolls back", async () => {
    const f = await fixture();
    await canonical(f);
    await json(f.paths.runtimePath, { ...f.request, schemaVersion: 1, active: f.pointer, lastSuccessful: { generation: 1, version: "0.20.0" } });
    await json(f.paths.attemptsPath, { ...f.request, ...f.pointer, schemaVersion: 1 });
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-stale-entry" });
    await expect(readLauncherLaunchTarget({ ...f.request, delegated: f.pointer })).resolves.toMatchObject({ ...f.pointer, reason: "active-delegated", source: "canonical" });
    await expect(readLauncherLaunchTarget({ ...f.request, delegated: { ...f.pointer, generation: 1 } })).rejects.toMatchObject({ code: "launcher-stale-entry" });
  });

  it("accepts a packaged namespace overridden by the launch environment", async () => {
    const f = await fixture();
    const installed = await canonical(f);
    await json(join(installed.launchPath, "Contents", "Resources", "open-design-config.json"), { appVersion: f.pointer.version, namespace: "baked-default" });
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({ ...installed, source: "canonical" });
  });

  it("allows the installed outer on first boot only when its config matches the selected version", async () => {
    const f = await fixture();
    const installed = await canonical(f);
    await rm(f.payload.versionRoot, { recursive: true, force: true });
    await rm(join(f.paths.namespaceRoot, "launch-entry.json"));
    await json(f.paths.installPath, { ...f.request, schemaVersion: 1, launchPath: installed.launchPath });
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({ source: "installed", ...installed, version: f.pointer.version });
    await json(join(installed.launchPath, "Contents", "Resources", "open-design-config.json"), { appVersion: "0.20.0" });
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-stale-entry" });
  });

  it("rejects an executable traversal in selected payload metadata", async () => {
    const f = await fixture();
    await json(f.payload.manifestPath, { ...f.request, schemaVersion: 1, version: f.pointer.version, payloadRoot: "payload", entry: { executable: "../../outside.exe" } });
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-invalid-payload" });
  });

  it("rejects a payload directory redirected outside the selected namespace", async () => {
    const f = await fixture();
    const external = await tempRoot();
    const executable = join(external, "Open Design.app", "Contents", "MacOS", "Open Design");
    await mkdir(dirname(executable), { recursive: true });
    await writeFile(executable, "unrelated executable");
    await rm(f.payload.payloadRoot, { recursive: true, force: true });
    await symlink(external, f.payload.payloadRoot, process.platform === "win32" ? "junction" : "dir");
    await currentAlias(f);
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-invalid-payload" });
  });

  it("rejects cross-channel runtime metadata", async () => {
    const f = await fixture();
    await json(f.paths.runtimePath, { ...f.request, channel: "beta", schemaVersion: 1, active: f.pointer, lastSuccessful: f.pointer });
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-invalid-state" });
  });

  it("resolves the fixed Windows entry through a directory junction", async () => {
    const f = await fixture("win32");
    const executablePath = await currentAlias(f);
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({ executablePath, launchPath: executablePath, source: "current-alias" });
  });

  it("uses a compatible Windows installed outer after a payload update without a synthetic current junction", async () => {
    const f = await fixture("win32");
    const launchPath = join(f.request.root, "Installed", "Open Design.exe");
    await mkdir(dirname(launchPath), { recursive: true });
    await writeFile(launchPath, "installed outer");
    await json(join(dirname(launchPath), "resources", "open-design-config.json"), { appVersion: "0.20.0", namespace: f.request.namespace });
    await json(f.paths.installPath, { ...f.request, schemaVersion: 1, launchPath });
    await expect(readLauncherLaunchTarget(f.request)).resolves.toMatchObject({
      executablePath: launchPath, launchPath, source: "installed", version: f.pointer.version,
      payloadExecutablePath: f.executablePath,
    });
  });

  it.each(["0.16.9", "0.17.0-beta.1", "0.20.0-beta.1", "100.0.0", "unknown"])("rejects a Windows outer with incompatible installed version %s", async (appVersion) => {
    const f = await fixture("win32");
    const launchPath = join(f.request.root, "Installed", "Open Design.exe");
    await mkdir(dirname(launchPath), { recursive: true });
    await writeFile(launchPath, "installed outer");
    await json(join(dirname(launchPath), "resources", "open-design-config.json"), { appVersion });
    await json(f.paths.installPath, { ...f.request, schemaVersion: 1, launchPath });
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-stale-entry" });
  });

  it("rejects a Windows installed outer recorded inside the version cache", async () => {
    const f = await fixture("win32");
    await json(join(dirname(f.executablePath), "resources", "open-design-config.json"), { appVersion: "0.20.0" });
    await json(f.paths.installPath, { ...f.request, schemaVersion: 1, launchPath: f.executablePath });
    await expect(readLauncherLaunchTarget(f.request)).rejects.toMatchObject({ code: "launcher-stale-entry" });
  });
});

describe("launcher CLI context", () => {
  it("honors explicit identity/root flags over inherited environment and config", async () => {
    const root = await tempRoot();
    const configPath = join(root, "config.json");
    await json(configPath, { appVersion: "99.0.0-beta.1", namespace: "config-ns", namespaceBaseRoot: join(root, "config", "namespaces") });
    await expect(resolveLauncherCliContext({ channel: "stable", namespace: "flag-ns", root, configPath, platform: "darwin", env: { OD_INSTALLATION_DIR: join(root, "env"), OD_PACKAGED_NAMESPACE: "env-ns", OD_SIDECAR_CHANNEL: "beta" } })).resolves.toMatchObject({ channel: "stable", namespace: "flag-ns", root });
  });

  it("uses packaged config identity and custom namespace base root without the daemon", async () => {
    const root = await tempRoot();
    const configPath = join(root, "config.json");
    await json(configPath, { appVersion: "99.0.0-canary.1", namespace: "test-canary", namespaceBaseRoot: join(root, "namespaces") });
    await expect(resolveLauncherCliContext({ configPath, platform: "darwin", env: {} })).resolves.toMatchObject({ channel: "canary", namespace: "test-canary", root });
  });

  it("discovers the sole persisted namespace instead of assuming a release namespace", async () => {
    const f = await fixture();
    await expect(resolveLauncherCliContext({ root: f.request.root, platform: "darwin", arch: "x64", env: {} })).resolves.toMatchObject({ namespace: "release-stable" });
  });

  it("requires an explicit namespace when several matching installations exist", async () => {
    const f = await fixture();
    const other = resolveLauncherPaths({ ...f.request, namespace: "default" });
    await json(other.installPath, { channel: "stable", namespace: "default", schemaVersion: 1, launchPath: join(f.request.root, "installed.app") });
    await expect(resolveLauncherCliContext({ root: f.request.root, platform: "darwin", env: {} })).rejects.toMatchObject({ code: "launcher-namespace-ambiguous" });
  });

  it("uses release product identity for platform defaults", async () => {
    const home = await tempRoot();
    await expect(resolveLauncherCliContext({ home, platform: "darwin", arch: "arm64", channel: "prerelease", env: {} })).resolves.toMatchObject({ root: join(home, "Library", "Application Support", "Open Design Prerelease"), namespace: "release-prerelease" });
    await expect(resolveLauncherCliContext({ home, platform: "win32", channel: "beta", env: { APPDATA: home } })).resolves.toMatchObject({ root: join(home, "Open Design"), namespace: "release-beta-win" });
  });

  it("reports missing config and unsupported platform explicitly", async () => {
    const root = await tempRoot();
    await expect(resolveLauncherCliContext({ configPath: join(root, "missing.json"), platform: "darwin", env: {} })).rejects.toMatchObject({ code: "launcher-config-not-found" });
    await expect(resolveLauncherCliContext({ platform: "linux", env: {} })).rejects.toMatchObject({ code: "unsupported-platform" });
  });
});
