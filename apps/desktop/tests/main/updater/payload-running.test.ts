import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveLauncherPaths, resolveLauncherVersionPaths, type LauncherCleanupDescriptor } from "@open-design/launcher-proto";

import { resolveDesktopUpdaterConfig } from "../../../src/main/updater/config.js";
import {
  cleanupLauncherPayloadRoots,
  clearLauncherStateForManualClear,
  prepareLauncherPayloadRelease,
  runLauncherCleanupLifecycle,
} from "../../../src/main/updater/payload.js";
import type { LoadedRelease } from "../../../src/main/updater.js";

describe("running launcher payload retention", () => {
  let root: string;
  const now = () => new Date("2026-09-09T03:07:00.000Z");
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runtime = {
    schemaVersion: 1 as const,
    channel: "stable" as const,
    namespace: "crash-test",
    active: { version: "0.23.0", generation: 2 },
    lastSuccessful: { version: "0.23.0", generation: 2 },
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "od-payload-running-"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  async function fixture() {
    const paths = resolveLauncherPaths({ root, channel: "stable", namespace: "crash-test" });
    const versionPaths = resolveLauncherVersionPaths({ root, channel: "stable", namespace: "crash-test", version: "0.22.0" });
    const executable = join(versionPaths.payloadRoot, "Open Design.exe");
    await mkdir(versionPaths.payloadRoot, { recursive: true });
    await writeFile(executable, "running binary");
    await mkdir(join(paths.versionsRoot, "0.21.0"), { recursive: true });
    await mkdir(paths.stateRoot, { recursive: true });
    await writeFile(paths.runtimePath, JSON.stringify(runtime));
    // A pointer may advance or roll back before this physical process exits.
    // Even a version override must not change which executable needs retaining.
    vi.stubGlobal("process", { ...process, execPath: executable });
    const config = resolveDesktopUpdaterConfig({
      source: "packaged", env: { OD_UPDATE_CURRENT_VERSION: "0.23.0" },
      platform: "win32", namespace: "crash-test", launcherRoot: root,
      launcherRuntimePath: paths.runtimePath, downloadRoot: join(root, "updates"),
    });
    return { paths, versionPaths, executable, config };
  }

  it("manual clear preserves the physical executable after runtime pointers move", async () => {
    const { config, executable, paths } = await fixture();
    await clearLauncherStateForManualClear({ config, logger, now, removeLauncherPayloadRoot: (path) => rm(path, { recursive: true, force: true }) });
    expect(await readFile(executable, "utf8")).toBe("running binary");
    expect(existsSync(join(paths.versionsRoot, "0.21.0"))).toBe(false);
  });

  it("recognizes a running executable through an aliased launcher root", async () => {
    const { config, paths, executable } = await fixture();
    const alias = join(root, "alias");
    await symlink(root, alias, "junction");
    vi.stubGlobal("process", { ...process, execPath: await realpath(executable) });
    await clearLauncherStateForManualClear({
      config: { ...config, launcherRoot: alias }, logger, now,
      removeLauncherPayloadRoot: (path) => rm(path, { recursive: true, force: true }),
    });
    expect(await readFile(executable, "utf8")).toBe("running binary");
    expect(existsSync(join(paths.versionsRoot, "0.21.0"))).toBe(false);
  });

  it.each(["prepare-existing", "prepare-promoted", "activate"] as const)("%s cleanup preserves a running payload absent from pointer retention", async (trigger) => {
    const { config, executable, paths, versionPaths } = await fixture();
    await cleanupLauncherPayloadRoots({
      config, currentRuntime: runtime, keepVersions: new Set(["0.23.0"]),
      logger, now, trigger, versionPaths,
      removeLauncherPayloadRoot: (path) => rm(path, { recursive: true, force: true }),
    });
    expect(await readFile(executable, "utf8")).toBe("running binary");
    expect(existsSync(join(paths.versionsRoot, "0.21.0"))).toBe(false);
  });

  it("defers cold-start deletion until the process no longer runs from that payload", async () => {
    const { config, executable, paths } = await fixture();
    await writeFile(paths.cleanupPath, JSON.stringify({
      version: 1, channel: "stable", namespace: "crash-test", currentVersion: "0.23.0", updatedAt: now().toISOString(),
      versions: [{ version: "0.22.0", generation: 1, state: "deprecated", reason: "older-than-bound-package", updatedAt: now().toISOString() }],
    } satisfies LauncherCleanupDescriptor));
    await runLauncherCleanupLifecycle({ config, logger, now });
    expect(await readFile(executable, "utf8")).toBe("running binary");
    expect(JSON.parse(await readFile(paths.cleanupPath, "utf8")).versions[0].state).toBe("cleanup-deferred");

    vi.unstubAllGlobals();
    await runLauncherCleanupLifecycle({ config, logger, now });
    expect(existsSync(executable)).toBe(false);
    expect(JSON.parse(await readFile(paths.cleanupPath, "utf8")).versions[0].state).toBe("cleanup-removed");
  });

  it("rejects same-version repair while that payload runs, but permits repair from the outer", async () => {
    const { config, executable } = await fixture();
    const extractLauncherPayloadArchive = vi.fn(async ({ destinationRoot }: { destinationRoot: string }) => {
      await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
      await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "replacement binary");
      await writeFile(join(destinationRoot, "payload", "resources", "open-design-config.json"), "{}");
      await writeFile(join(destinationRoot, "manifest.json"), JSON.stringify({
        schemaVersion: 1, channel: "stable", namespace: "crash-test", version: "0.22.0",
        platform: "win32", payloadRoot: "payload", entry: { cwd: "payload", executable: "payload/Open Design.exe" },
      }));
    });
    const input = {
      config, logger, now, extractLauncherPayloadArchive,
      activeRelease: { path: join(root, "release.zip"), ref: { key: "repair", version: "0.22.0" } } as LoadedRelease,
      removeLauncherPayloadRoot: (path: string) => rm(path, { recursive: true, force: true }),
    };
    await expect(prepareLauncherPayloadRelease(input)).rejects.toThrow(/running payload/i);
    expect(await readFile(executable, "utf8")).toBe("running binary");

    vi.unstubAllGlobals();
    await prepareLauncherPayloadRelease(input);
    expect(await readFile(executable, "utf8")).toBe("replacement binary");
  });
});
