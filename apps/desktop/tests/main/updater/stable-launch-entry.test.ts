import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { afterEach, describe, expect, it } from "vitest";

import { resolveDesktopUpdaterConfig } from "../../../src/main/updater/config.js";
import {
  hasValidLauncherPayloadContext,
  isManagedLauncherStableEntry,
  remoteRequiresReinstall,
  resolveInstalledOuterVersion,
  selectUpdateCandidateWithFallback,
} from "../../../src/main/updater/feed.js";

const APP = "Open Design.app";
const CHANNEL = "stable";
const NAMESPACE = "release-stable";
const ROOTS: string[] = [];
const DIRECTORY_LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

afterEach(async () => {
  await Promise.all(ROOTS.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-stable-updater-"));
  ROOTS.push(root);
  return root;
}

function namespaceRoot(root: string): string {
  return join(root, "launcher", "channels", CHANNEL, "namespaces", NAMESPACE);
}

/** Writes a versioned payload plus the runtime descriptor the updater validates. */
async function seedLauncher(root: string, version: string): Promise<string> {
  const ns = namespaceRoot(root);
  const payloadApp = join(ns, "versions", version, "payload", APP, "Contents", "Resources");
  await mkdir(payloadApp, { recursive: true });
  await writeFile(
    join(payloadApp, "open-design-config.json"),
    `${JSON.stringify({ appVersion: version }, null, 2)}\n`,
  );
  await writeFile(
    join(ns, "runtime.json"),
    `${JSON.stringify(
      {
        active: { generation: 2, version },
        channel: CHANNEL,
        lastSuccessful: { generation: 2, version },
        namespace: NAMESPACE,
        schemaVersion: 1,
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
  );
  return join(ns, "versions", version, "payload", APP);
}

/** Mirrors what the packaged launcher writes: `current` -> `versions/<active>`. */
async function linkStableEntry(root: string, version: string): Promise<string> {
  const ns = namespaceRoot(root);
  await symlink(join(ns, "versions", version), join(ns, "current"), DIRECTORY_LINK_TYPE);
  return join(ns, "current", "payload", APP);
}

function updaterConfig(options: { launcherLaunchPath: string; root: string }) {
  return resolveDesktopUpdaterConfig({
    arch: "arm64",
    currentVersion: "0.24.1",
    env: {},
    launcherLaunchPath: options.launcherLaunchPath,
    launcherRoot: options.root,
    launcherRuntimePath: join(namespaceRoot(options.root), "runtime.json"),
    namespace: NAMESPACE,
    platform: "darwin",
    source: SIDECAR_SOURCES.PACKAGED,
  });
}

const METADATA = {
  channel: CHANNEL,
  releaseVersion: "0.25.0",
  platforms: {
    mac: {
      arch: "arm64",
      enabled: true,
      artifacts: {
        dmg: { name: "OpenDesign-0.25.0.dmg", sha512: "d".repeat(128), url: "https://example.test/od.dmg" },
        payload: { name: "payload-0.25.0.zip", sha512: "p".repeat(128), url: "https://example.test/payload.zip" },
      },
    },
  },
};

/** `runtime.json` is the only record of which version the launcher activated. */
async function activeVersion(root: string): Promise<string> {
  const raw: unknown = JSON.parse(await readFile(join(namespaceRoot(root), "runtime.json"), "utf8"));
  return (raw as { active: { version: string } }).active.version;
}

/** The decision `updater.ts` makes on every check, minus the network fetch. */
async function nextUpdateCheck(config: ReturnType<typeof updaterConfig>) {
  const launcherPayloadContextValid = await hasValidLauncherPayloadContext(config);
  const installedOuterVersion = launcherPayloadContextValid ? await resolveInstalledOuterVersion(config) : null;
  const reinstallRequirement =
    launcherPayloadContextValid ? remoteRequiresReinstall(METADATA, config, installedOuterVersion) ?? undefined : undefined;
  return {
    launcherPayloadContextValid,
    reinstallRequirement,
    selected: selectUpdateCandidateWithFallback(
      METADATA,
      config,
      launcherPayloadContextValid && reinstallRequirement == null,
    ),
  };
}

describe("launcher stable entry vs. payload-update eligibility", () => {
  it("keeps payload updates after the stable entry is created", async () => {
    const root = await createRoot();
    await seedLauncher(root, "0.24.1");
    const aliasAppPath = await linkStableEntry(root, "0.24.1");
    const installedLaunchPath = join(root, "Applications", APP);
    await mkdir(join(root, "Applications"), { recursive: true });
    await symlink(aliasAppPath, installedLaunchPath, DIRECTORY_LINK_TYPE);

    const config = updaterConfig({ launcherLaunchPath: installedLaunchPath, root });

    expect(await isManagedLauncherStableEntry(config, await activeVersion(root))).toBe(true);
    // Without the active version there is no proof, so it stays rejected.
    expect(await isManagedLauncherStableEntry(config)).toBe(false);
    const check = await nextUpdateCheck(config);
    expect(check.launcherPayloadContextValid).toBe(true);
    expect(check.reinstallRequirement).toBeUndefined();
    expect(check.selected.ok).toBe(true);
    // The regression this guards: a symlinked install path used to read as an
    // invalid launcher context, which dropped the check to the DMG installer.
    expect(check.selected.ok && check.selected.candidate.artifact.type).toBe("payload");
  });

  it("still follows the alias after the version bump", async () => {
    const root = await createRoot();
    await seedLauncher(root, "0.24.0");
    await linkStableEntry(root, "0.24.0");
    const installedLaunchPath = join(root, "Applications", APP);
    await mkdir(join(root, "Applications"), { recursive: true });
    await symlink(join(namespaceRoot(root), "current", "payload", APP), installedLaunchPath, DIRECTORY_LINK_TYPE);

    // Activate 0.24.1 the way the launcher does: re-point the alias only.
    await seedLauncher(root, "0.24.1");
    await rm(join(namespaceRoot(root), "current"), { force: true, recursive: true });
    await linkStableEntry(root, "0.24.1");

    const config = updaterConfig({ launcherLaunchPath: installedLaunchPath, root });
    expect(await resolveInstalledOuterVersion(config)).toBe("0.24.1");
    const check = await nextUpdateCheck(config);
    expect(check.launcherPayloadContextValid).toBe(true);
    expect(check.selected.ok && check.selected.candidate.artifact.type).toBe("payload");
  });

  it("rejects a symlink the launcher does not own", async () => {
    const root = await createRoot();
    await seedLauncher(root, "0.24.1");
    await linkStableEntry(root, "0.24.1");
    const foreignApp = join(root, "somewhere-else", APP, "Contents", "Resources");
    await mkdir(foreignApp, { recursive: true });
    await writeFile(join(foreignApp, "open-design-config.json"), '{"appVersion":"0.24.1"}\n');
    const installedLaunchPath = join(root, "Applications", APP);
    await mkdir(join(root, "Applications"), { recursive: true });
    await symlink(join(root, "somewhere-else", APP), installedLaunchPath, DIRECTORY_LINK_TYPE);

    const config = updaterConfig({ launcherLaunchPath: installedLaunchPath, root });

    expect(await isManagedLauncherStableEntry(config, await activeVersion(root))).toBe(false);
    const check = await nextUpdateCheck(config);
    expect(check.launcherPayloadContextValid).toBe(false);
    expect(check.selected.ok && check.selected.candidate.artifact.type).toBe("dmg");
  });

  it("rejects a stale alias that still points at the superseded version", async () => {
    const root = await createRoot();
    await seedLauncher(root, "0.24.0");
    const aliasAppPath = await linkStableEntry(root, "0.24.0");
    const installedLaunchPath = join(root, "Applications", APP);
    await mkdir(join(root, "Applications"), { recursive: true });
    await symlink(aliasAppPath, installedLaunchPath, DIRECTORY_LINK_TYPE);

    // A half-finished activation: runtime.json already names 0.24.1, but the
    // alias was never re-pointed. Path shape alone cannot tell this apart from
    // a healthy entry — only the active version can.
    await seedLauncher(root, "0.24.1");

    const config = updaterConfig({ launcherLaunchPath: installedLaunchPath, root });

    expect(await isManagedLauncherStableEntry(config, await activeVersion(root))).toBe(false);
    const check = await nextUpdateCheck(config);
    expect(check.launcherPayloadContextValid).toBe(false);
    expect(check.selected.ok && check.selected.candidate.artifact.type).toBe("dmg");
  });

  it("keeps a physically installed bundle eligible", async () => {
    const root = await createRoot();
    await seedLauncher(root, "0.24.1");
    await linkStableEntry(root, "0.24.1");
    const installedLaunchPath = join(root, "Applications", APP);
    const resources = join(installedLaunchPath, "Contents", "Resources");
    await mkdir(resources, { recursive: true });
    await writeFile(join(resources, "open-design-config.json"), '{"appVersion":"0.20.0"}\n');

    const config = updaterConfig({ launcherLaunchPath: installedLaunchPath, root });

    expect(await isManagedLauncherStableEntry(config, await activeVersion(root))).toBe(false);
    expect(await resolveInstalledOuterVersion(config)).toBe("0.20.0");
    const check = await nextUpdateCheck(config);
    expect(check.launcherPayloadContextValid).toBe(true);
    expect(check.selected.ok && check.selected.candidate.artifact.type).toBe("payload");
  });
});
