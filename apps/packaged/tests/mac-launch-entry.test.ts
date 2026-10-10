import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanupConfirmedMacLaunchEntry, promoteMacLaunchEntry, type PromoteMacLaunchEntryInput } from "../src/mac-launch-entry.js";

const roots: string[] = [];
const oldVersion = "0.23.1-beta.1";
const version = "0.23.1-beta.2";
const product = "Open Design Beta";
const bundleName = `${product}.app`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function bundle(path: string, appVersion: string, namespace = "release-beta") {
  await mkdir(join(path, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(path, "Contents", "Resources"), { recursive: true });
  await writeFile(join(path, "Contents", "Resources", "open-design-config.json"), JSON.stringify({ appVersion, namespace }));
  await writeFile(join(path, "Contents", "MacOS", product), appVersion);
}

function executor() {
  return vi.fn(async (command: string, args: string[]) => {
    if (command === "/usr/bin/ditto") await cp(args[2]!, args[3]!, { recursive: true });
    else if (command === "/usr/bin/osascript") {
      const call = args[3]!.match(/const result = \$\.renamex_np\((.+), (.+), 2\);/);
      if (!call) throw new Error("Unexpected exchange script");
      const stage: string = JSON.parse(call[1]!);
      const target: string = JSON.parse(call[2]!);
      const temporary = join(dirname(stage), ".swap-test-original");
      await rename(target, temporary);
      await rename(stage, target);
      await rename(temporary, stage);
    } else if (command === "/usr/bin/plutil") return { stdout: "io.open-design.desktop.beta\n" };
    return { stdout: "" };
  });
}

async function fixture({ installed = true } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "od-mac-launch-entry-")));
  roots.push(root);
  const runtimeRoot = join(root, "launcher", "channels", "beta", "namespaces", "release-beta");
  const sourceBundle = join(runtimeRoot, "versions", version, "payload", bundleName);
  const installedLaunchPath = join(root, "Applications", bundleName);
  await mkdir(dirname(installedLaunchPath), { recursive: true });
  await bundle(sourceBundle, version);
  await writeFile(join(runtimeRoot, "versions", version, "manifest.json"), JSON.stringify({
    schemaVersion: 1, channel: "beta", namespace: "release-beta", version, platform: "darwin", payloadRoot: "payload",
    entry: { cwd: `payload/${bundleName}`, executable: `payload/${bundleName}/Contents/MacOS/${product}` },
  }));
  if (installed) await bundle(installedLaunchPath, oldVersion);
  const exec = executor();
  const input: PromoteMacLaunchEntryInput = {
    runtimeRoot, channel: "beta", namespace: "release-beta", version, generation: 2,
    sourceExecutablePath: join(sourceBundle, "Contents", "MacOS", product), installedLaunchPath, platform: "darwin", exec,
  };
  return { root, runtimeRoot, sourceBundle, installedLaunchPath, exec, input };
}

describe("promoteMacLaunchEntry", () => {
  it("retains an uncached installed outer then atomically promotes the confirmed payload", async () => {
    const { input, installedLaunchPath, runtimeRoot, exec } = await fixture();
    const result = await promoteMacLaunchEntry(input);
    expect(result).toMatchObject({ status: "promoted", launchPath: installedLaunchPath });
    if (result.status !== "promoted") throw new Error("promotion failed");
    expect((await lstat(installedLaunchPath)).isDirectory()).toBe(true);
    expect(await readFile(result.executablePath, "utf8")).toBe(version);
    expect(await readFile(join(result.backupAppBundlePath!, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
    expect(await readFile(join(runtimeRoot, "versions", oldVersion, "payload", bundleName, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
    expect(JSON.parse(await readFile(join(runtimeRoot, "versions", oldVersion, "manifest.json"), "utf8"))).toMatchObject({ channel: "beta", namespace: "release-beta", version: oldVersion, platform: "darwin" });
    expect(JSON.parse(await readFile(join(runtimeRoot, "launch-entry.json"), "utf8"))).toMatchObject({
      schemaVersion: 1, version, generation: 2, launchPath: installedLaunchPath, executablePath: result.executablePath,
      payloadExecutablePath: input.sourceExecutablePath, backupAppBundlePath: result.backupAppBundlePath,
    });
    expect(exec.mock.calls.filter(([command]) => command === "/usr/bin/ditto")).toHaveLength(2);
  });

  it("returns current without copying an already published and matching entry", async () => {
    const { input, exec } = await fixture();
    await promoteMacLaunchEntry(input);
    exec.mockClear();
    await expect(promoteMacLaunchEntry(input)).resolves.toMatchObject({ status: "current" });
    expect(exec.mock.calls.map(([command]) => command)).toEqual(["/usr/bin/plutil", "/usr/bin/plutil"]);
  });

  it("promotes a missing physical entry without exchanging or inventing a rollback bundle", async () => {
    const { input, exec, installedLaunchPath } = await fixture({ installed: false });
    const result = await promoteMacLaunchEntry(input);
    expect(result).toMatchObject({ status: "promoted", launchPath: installedLaunchPath });
    expect(result).not.toHaveProperty("backupAppBundlePath");
    expect(exec.mock.calls.map(([command]) => command)).toEqual(["/usr/bin/plutil", "/usr/bin/ditto"]);
  });

  it("keeps the installed app and previous journal when copying fails", async () => {
    const { input, installedLaunchPath, runtimeRoot } = await fixture();
    await writeFile(join(runtimeRoot, "launch-entry.json"), "previous journal");
    const error = new Error("copy failed");
    input.exec = vi.fn(async (command) => {
      if (command === "/usr/bin/ditto") throw error;
      return { stdout: "io.open-design.desktop.beta" };
    });
    await expect(promoteMacLaunchEntry(input)).resolves.toEqual({ status: "failed", error });
    expect(await readFile(join(installedLaunchPath, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
    expect(await readFile(join(runtimeRoot, "launch-entry.json"), "utf8")).toBe("previous journal");
  });

  it("keeps the installed app and journal when atomic exchange fails", async () => {
    const { input, exec, installedLaunchPath, runtimeRoot } = await fixture();
    await writeFile(join(runtimeRoot, "launch-entry.json"), "previous journal");
    const error = new Error("exchange failed");
    input.exec = async (command, args, options) => {
      if (command === "/usr/bin/osascript") throw error;
      return exec(command, args);
    };
    await expect(promoteMacLaunchEntry(input)).resolves.toEqual({ status: "failed", error });
    expect(await readFile(join(installedLaunchPath, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
    expect(await readFile(join(runtimeRoot, "launch-entry.json"), "utf8")).toBe("previous journal");
  });

  it("restores the old bundle when journal publication fails after exchanging", async () => {
    const { input, exec, installedLaunchPath, runtimeRoot } = await fixture();
    await mkdir(join(runtimeRoot, "launch-entry.json"));
    expect(await promoteMacLaunchEntry(input)).toMatchObject({ status: "failed" });
    expect(await readFile(join(installedLaunchPath, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
    expect(exec.mock.calls.filter(([command]) => command === "/usr/bin/osascript")).toHaveLength(2);
    expect((await lstat(join(runtimeRoot, "launch-entry.json"))).isDirectory()).toBe(true);
  });

  it("refuses an existing invalid rollback cache instead of overwriting it", async () => {
    const { input, exec, installedLaunchPath, runtimeRoot } = await fixture();
    await mkdir(join(runtimeRoot, "versions", oldVersion));
    await writeFile(join(runtimeRoot, "versions", oldVersion, "keep.txt"), "custom cache");
    expect(await promoteMacLaunchEntry(input)).toMatchObject({ status: "failed" });
    expect(exec.mock.calls.map(([command]) => command)).toEqual(["/usr/bin/plutil", "/usr/bin/plutil"]);
    expect(await readFile(join(installedLaunchPath, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
    expect(await readFile(join(runtimeRoot, "versions", oldVersion, "keep.txt"), "utf8")).toBe("custom cache");
  });

  it("refuses custom renamed applications and applications from another channel", async () => {
    const { input, exec, installedLaunchPath } = await fixture();
    await expect(promoteMacLaunchEntry({ ...input, installedLaunchPath: join(dirname(installedLaunchPath), "Custom Open Design.app") })).resolves.toEqual({ status: "skipped" });
    await writeFile(join(installedLaunchPath, "Contents", "Resources", "open-design-config.json"), JSON.stringify({ appVersion: "0.23.1", namespace: "default" }));
    await expect(promoteMacLaunchEntry(input)).resolves.toEqual({ status: "skipped" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("preserves a different application with the same expected filename and version config", async () => {
    const { input, exec, installedLaunchPath } = await fixture();
    input.exec = async (command, args) => command === "/usr/bin/plutil"
      ? { stdout: args.at(-1)!.startsWith(installedLaunchPath) ? "io.custom.application" : "io.open-design.desktop.beta" }
      : exec(command, args);
    await expect(promoteMacLaunchEntry(input)).resolves.toEqual({ status: "skipped" });
    expect(await readFile(join(installedLaunchPath, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
    expect(exec).not.toHaveBeenCalled();
  });

  it("refuses source version traversal, cache destinations and non-bundle executables", async () => {
    const { input, exec, sourceBundle } = await fixture();
    expect(await promoteMacLaunchEntry({ ...input, version: "../other" })).toMatchObject({ status: "failed" });
    await expect(promoteMacLaunchEntry({ ...input, installedLaunchPath: sourceBundle })).resolves.toEqual({ status: "skipped" });
    await expect(promoteMacLaunchEntry({ ...input, sourceExecutablePath: join(sourceBundle, "Contents", "Other", product) })).resolves.toEqual({ status: "skipped" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("preserves arbitrary symlink destinations", async () => {
    const { input, root, installedLaunchPath, exec } = await fixture({ installed: false });
    const custom = join(root, "Custom", bundleName);
    await bundle(custom, oldVersion);
    await symlink(custom, installedLaunchPath, process.platform === "win32" ? "junction" : "dir");
    await expect(promoteMacLaunchEntry(input)).resolves.toEqual({ status: "skipped" });
    expect(exec).not.toHaveBeenCalled();
    expect((await lstat(installedLaunchPath)).isSymbolicLink()).toBe(true);
  });

  it("detects a replacement installation appearing during a copy", async () => {
    const { input, exec, installedLaunchPath } = await fixture({ installed: false });
    input.exec = async (command, args) => {
      const result = await exec(command, args);
      if (command === "/usr/bin/ditto") await bundle(installedLaunchPath, oldVersion);
      return result;
    };
    expect(await promoteMacLaunchEntry(input)).toMatchObject({ status: "failed" });
    expect(await readFile(join(installedLaunchPath, "Contents", "MacOS", product), "utf8")).toBe(oldVersion);
  });

  it.each(["linux", "win32"] as const)("skips %s without touching the installation", async (platform) => {
    const { input, exec } = await fixture();
    await expect(promoteMacLaunchEntry({ ...input, platform })).resolves.toEqual({ status: "skipped" });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("cleanupConfirmedMacLaunchEntry", () => {
  it("unregisters and deletes only the marked backup after the promoted version is confirmed", async () => {
    const { input, runtimeRoot, installedLaunchPath, exec } = await fixture();
    const result = await promoteMacLaunchEntry(input);
    if (result.status !== "promoted") throw new Error("promotion failed");
    const backup = result.backupAppBundlePath!;
    const journalBefore = await readFile(join(runtimeRoot, "launch-entry.json"), "utf8");
    exec.mockClear();
    await expect(cleanupConfirmedMacLaunchEntry({ runtimeRoot, launchPath: installedLaunchPath, version, generation: 2, platform: "darwin", exec })).resolves.toEqual({ status: "cleaned" });
    await expect(lstat(dirname(backup))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(result.executablePath, "utf8")).toBe(version);
    expect(await readFile(join(runtimeRoot, "launch-entry.json"), "utf8")).toBe(journalBefore);
    expect(exec.mock.calls.map((call) => call.slice(0, 2))).toEqual([["/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-u", backup]]]);
  });

  it.each(["stdout", "stderr", "message"] as const)("removes an owned backup when LaunchServices reports it was never registered in %s", async (field) => {
    const { input, runtimeRoot, installedLaunchPath } = await fixture();
    const result = await promoteMacLaunchEntry(input);
    if (result.status !== "promoted") throw new Error("promotion failed");
    const error = Object.assign(new Error("LaunchServices unregister failed"), { code: 1, [field]: `failed to scan ${result.backupAppBundlePath}: -10814 from spotlight` });
    const exec = vi.fn(async () => { throw error; });
    await expect(cleanupConfirmedMacLaunchEntry({ runtimeRoot, launchPath: installedLaunchPath, version, generation: 2, platform: "darwin", exec })).resolves.toEqual({ status: "cleaned" });
    await expect(lstat(dirname(result.backupAppBundlePath!))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(result.executablePath, "utf8")).toBe(version);
  });

  it("retains an owned backup when unregistering fails for another reason", async () => {
    const { input, runtimeRoot, installedLaunchPath } = await fixture();
    const result = await promoteMacLaunchEntry(input);
    if (result.status !== "promoted") throw new Error("promotion failed");
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const exec = vi.fn(async () => { throw error; });
    await expect(cleanupConfirmedMacLaunchEntry({ runtimeRoot, launchPath: installedLaunchPath, version, generation: 2, platform: "darwin", exec })).resolves.toEqual({ status: "failed", error });
    expect((await lstat(result.backupAppBundlePath!)).isDirectory()).toBe(true);
    expect(await readFile(result.executablePath, "utf8")).toBe(version);
  });

  it("preserves backups if the confirmed generation does not match", async () => {
    const { input, runtimeRoot, installedLaunchPath, exec } = await fixture();
    const result = await promoteMacLaunchEntry(input);
    if (result.status !== "promoted") throw new Error("promotion failed");
    exec.mockClear();
    await expect(cleanupConfirmedMacLaunchEntry({ runtimeRoot, launchPath: installedLaunchPath, version, generation: 3, platform: "darwin", exec })).resolves.toEqual({ status: "skipped" });
    expect((await lstat(result.backupAppBundlePath!)).isDirectory()).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it("preserves a marked stage if the user has put extra files in it", async () => {
    const { input, runtimeRoot, installedLaunchPath, exec } = await fixture();
    const result = await promoteMacLaunchEntry(input);
    if (result.status !== "promoted") throw new Error("promotion failed");
    await writeFile(join(dirname(result.backupAppBundlePath!), "user-file.txt"), "preserve");
    exec.mockClear();
    await expect(cleanupConfirmedMacLaunchEntry({ runtimeRoot, launchPath: installedLaunchPath, version, generation: 2, platform: "darwin", exec })).resolves.toEqual({ status: "skipped" });
    expect(await readdir(dirname(result.backupAppBundlePath!))).toContain("user-file.txt");
    expect(exec).not.toHaveBeenCalled();
  });
});
