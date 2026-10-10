import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { resolveLauncherVersionPaths } from "@open-design/launcher-proto";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PackagedConfig } from "../src/config.js";
import { confirmPackagedLauncherRuntime, preparePackagedMacLaunchEntry, resolvePackagedLauncherRuntime } from "../src/launcher-runtime.js";
import { promoteMacLaunchEntry } from "../src/mac-launch-entry.js";
import { resolvePackagedNamespacePaths } from "../src/paths.js";

vi.mock("../src/mac-launch-entry.js", () => ({ promoteMacLaunchEntry: vi.fn(), cleanupConfirmedMacLaunchEntry: vi.fn(async () => ({ status: "skipped" })) }));
vi.mock("../src/mac-dock-entry.js", () => ({ repairMacDockEntries: vi.fn(async () => ({ status: "unchanged" })) }));
vi.mock("../src/mac-launch-services.js", () => ({ refreshMacApplicationRegistration: vi.fn(async () => ({ status: "skipped" })) }));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const roots: string[] = [];
afterEach(async () => {
  Object.defineProperty(process, "platform", originalPlatform);
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-canonical-launcher-"));
  roots.push(root);
  const versionPaths = resolveLauncherVersionPaths({ root, channel: "stable", namespace: "release-stable", version: "0.24.1" });
  const appPath = join(root, "Applications", "Open Design.app");
  const currentExecutablePath = join(appPath, "Contents", "MacOS", "Open Design");
  const payloadExecutablePath = join(versionPaths.payloadRoot, "Open Design.app", "Contents", "MacOS", "Open Design");
  for (const executable of [currentExecutablePath, payloadExecutablePath]) {
    await mkdir(dirname(executable), { recursive: true });
    await writeFile(executable, "");
    const resources = join(dirname(dirname(executable)), "Resources");
    await mkdir(resources, { recursive: true });
    await writeFile(join(resources, "open-design-config.json"), JSON.stringify({ appVersion: "0.24.1", webOutputMode: "server" }));
  }
  await writeFile(versionPaths.manifestPath, JSON.stringify({ schemaVersion: 1, channel: "stable", namespace: "release-stable", version: "0.24.1", payloadRoot: "payload", platform: "darwin", entry: { cwd: "payload/Open Design.app", executable: "payload/Open Design.app/Contents/MacOS/Open Design" } }));
  const descriptor = { schemaVersion: 1, channel: "stable", namespace: "release-stable", active: { version: "0.24.1", generation: 1 }, lastSuccessful: { version: "0.24.0", generation: 0 } };
  await writeFile(versionPaths.runtimePath, JSON.stringify(descriptor));
  await writeFile(versionPaths.installPath, JSON.stringify({ schemaVersion: 1, channel: "stable", namespace: "release-stable", launchPath: appPath }));
  const binding = { schemaVersion: 1, channel: "stable", namespace: "release-stable", version: "0.24.1", generation: 1, launchPath: appPath, executablePath: currentExecutablePath, payloadExecutablePath };
  await writeFile(join(versionPaths.namespaceRoot, "launch-entry.json"), JSON.stringify(binding));
  const config = {
    appVersion: "0.24.1", namespace: "release-stable", namespaceBaseRoot: join(root, "namespaces"), resourceRoot: join(appPath, "Contents", "Resources", "open-design"), webOutputMode: "server",
  } as PackagedConfig;
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
  return { root, config, binding, versionPaths, currentExecutablePath, appPath };
}

describe("canonical payload launcher identity", () => {
  it("runs the promoted bundle using its own resource paths instead of delegating back to the version cache", async () => {
    const f = await fixture();
    const runtime = await resolvePackagedLauncherRuntime(f.config, resolvePackagedNamespacePaths(f.config), { currentExecutablePath: f.currentExecutablePath });
    expect(runtime.canonicalDesktopProcess).toBe(true);
    expect(runtime.payloadDesktopProcess).toBe(true);
    expect(runtime.config.resourceRoot).toBe(f.config.resourceRoot);
    expect(runtime.desktopExecutablePath).toBe(f.currentExecutablePath);
    await confirmPackagedLauncherRuntime(runtime);
    expect(JSON.parse(await readFile(f.versionPaths.runtimePath, "utf8")).lastSuccessful).toEqual({ version: "0.24.1", generation: 1 });
  });

  it("reads the promoted version from the bundle when an inherited external config still names the old installer", async () => {
    const f = await fixture();
    const runtime = await resolvePackagedLauncherRuntime({ ...f.config, appVersion: "0.24.0" }, resolvePackagedNamespacePaths(f.config), { currentExecutablePath: f.currentExecutablePath });
    expect(runtime.canonicalDesktopProcess).toBe(true);
    expect(runtime.payloadDesktopProcess).toBe(true);
    expect(runtime.config.appVersion).toBe("0.24.1");
    expect(runtime.config.resourceRoot).toBe(f.config.resourceRoot);
  });

  it.each(["generation", "version", "payloadExecutablePath"] as const)("rejects a stale canonical binding with a different %s", async (field) => {
    const f = await fixture();
    await writeFile(join(f.versionPaths.namespaceRoot, "launch-entry.json"), JSON.stringify({ ...f.binding, [field]: field === "generation" ? 2 : "stale" }));
    const runtime = await resolvePackagedLauncherRuntime(f.config, resolvePackagedNamespacePaths(f.config), { currentExecutablePath: f.currentExecutablePath });
    expect(runtime.canonicalDesktopProcess).toBe(false);
    expect(runtime.payloadDesktopProcess).toBe(false);
    expect(runtime.desktopExecutablePath).toBe(f.binding.payloadExecutablePath);
  });

  it("forces a fresh process after copying over the current executable path", async () => {
    const f = await fixture();
    await writeFile(join(f.appPath, "Contents", "Resources", "open-design-config.json"), JSON.stringify({ appVersion: "0.24.0" }));
    const runtime = await resolvePackagedLauncherRuntime({ ...f.config, appVersion: "0.24.0" }, resolvePackagedNamespacePaths(f.config), { currentExecutablePath: f.currentExecutablePath });
    vi.mocked(promoteMacLaunchEntry).mockResolvedValue({ status: "promoted", launchPath: f.appPath, executablePath: f.currentExecutablePath });
    await preparePackagedMacLaunchEntry(runtime);
    expect(runtime.payloadDesktopProcess).toBe(false);
    expect(runtime.desktopExecutablePath).toBe(f.currentExecutablePath);
    expect(promoteMacLaunchEntry).toHaveBeenCalledWith(expect.objectContaining({ sourceExecutablePath: f.binding.payloadExecutablePath }));
  });
});
