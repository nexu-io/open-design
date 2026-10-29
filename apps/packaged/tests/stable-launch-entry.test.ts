import { lstat, mkdir, mkdtemp, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { isLauncherPayloadAppPath, resolveLauncherPaths } from "@open-design/launcher-proto";
import { afterEach, describe, expect, it } from "vitest";

import type { PackagedLauncherRuntime } from "../src/launcher-runtime.js";
import { syncStableLaunchEntry } from "../src/launcher-runtime.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-stable-entry-"));
  roots.push(root);
  return root;
}

/** The active version's staged directory — always present in real activations. */
async function seedVersion(root: string, version: string): Promise<void> {
  const paths = resolveLauncherPaths({ channel: "stable", namespace: "release-stable", root });
  await mkdir(join(paths.versionsRoot, version), { recursive: true });
}

function fakeRuntime(options: {
  installedLaunchPath: string | null;
  root: string;
  version: string | null;
}): PackagedLauncherRuntime {
  const launcherPaths = resolveLauncherPaths({
    channel: "stable",
    namespace: "release-stable",
    root: options.root,
  });
  return {
    config: {} as never,
    desktopExecutablePath: options.version == null
      ? null
      : join(launcherPaths.versionsRoot, options.version, "payload", "Open Design.app", "Contents", "MacOS", "Open Design"),
    descriptor: {
      active: options.version == null ? null : { generation: 3, version: options.version },
      channel: "stable",
      lastSuccessful: options.version == null ? null : { generation: 3, version: options.version },
      namespace: "release-stable",
      schemaVersion: 1,
      updatedAt: "2026-10-01T00:00:00.000Z",
    } as never,
    electronNodeCommand: null,
    installedLaunchPath: options.installedLaunchPath,
    launcherPaths,
    paths: { installationRoot: options.root } as never,
    payloadDesktopProcess: true,
    selection: {
      pointer: { generation: 3, version: options.version },
      reason: "active",
      selected: options.version != null,
    } as never,
    source: "payload",
    targetVersion: options.version,
  };
}

describe.skipIf(process.platform !== "darwin")("stable launch entry", () => {
  it("points the version-less alias at the active version", async () => {
    const root = await createRoot();
    const runtime = fakeRuntime({ installedLaunchPath: null, root, version: "0.24.1" });

    const result = await syncStableLaunchEntry(runtime);

    expect(result.aliasPath).toBe(join(runtime.launcherPaths.namespaceRoot, "current"));
    expect(await readlink(result.aliasPath as string)).toBe(
      join(runtime.launcherPaths.versionsRoot, "0.24.1"),
    );
  });

  it("re-points the alias when the active version changes", async () => {
    const root = await createRoot();
    const runtime = fakeRuntime({ installedLaunchPath: null, root, version: "0.24.0" });
    await syncStableLaunchEntry(runtime);

    const updated = await syncStableLaunchEntry(
      fakeRuntime({ installedLaunchPath: null, root, version: "0.24.1" }),
    );

    expect(await readlink(updated.aliasPath as string)).toBe(
      join(runtime.launcherPaths.versionsRoot, "0.24.1"),
    );
  });

  it("links the installed launch path to the aliased payload when it is absent", async () => {
    const root = await createRoot();
    const installedLaunchPath = join(root, "Applications", "Open Design.app");
    await seedVersion(root, "0.24.1");
    const runtime = fakeRuntime({ installedLaunchPath, root, version: "0.24.1" });

    const result = await syncStableLaunchEntry(runtime);

    expect(result.launchPathStatus).toBe("linked");
    expect(result.payloadAppPath).toBe(
      join(runtime.launcherPaths.namespaceRoot, "current", "payload", "Open Design.app"),
    );
    expect((await lstat(installedLaunchPath)).isSymbolicLink()).toBe(true);
    expect(await readlink(installedLaunchPath)).toBe(result.payloadAppPath);
  });

  it("keeps the launch path stable across version bumps", async () => {
    const root = await createRoot();
    const installedLaunchPath = join(root, "Applications", "Open Design.app");
    await mkdir(join(root, "Applications"), { recursive: true });
    await seedVersion(root, "0.24.0");
    await seedVersion(root, "0.24.1");

    const firstRuntime = fakeRuntime({ installedLaunchPath, root, version: "0.24.0" });
    const first = await syncStableLaunchEntry(firstRuntime);
    const secondRuntime = fakeRuntime({ installedLaunchPath, root, version: "0.24.1" });
    const second = await syncStableLaunchEntry(secondRuntime);

    // The launch path points at the alias, so a version bump only has to
    // re-point the alias — the Dock tile itself never moves again.
    expect(await readlink(installedLaunchPath)).toBe(first.payloadAppPath);
    expect(second.launchPathStatus).toBe("unchanged");
    expect(second.payloadAppPath).toBe(first.payloadAppPath);
    expect(await readlink(second.aliasPath as string)).toBe(
      join(secondRuntime.launcherPaths.versionsRoot, "0.24.1"),
    );
  });

  it("links to a payload path the updater contract recognises", async () => {
    const root = await createRoot();
    const installedLaunchPath = join(root, "Applications", "Open Design.app");
    await mkdir(join(root, "Applications"), { recursive: true });
    const runtime = fakeRuntime({ installedLaunchPath, root, version: "0.24.1" });
    await mkdir(join(runtime.launcherPaths.versionsRoot, "0.24.1", "payload", "Open Design.app"), {
      recursive: true,
    });

    const result = await syncStableLaunchEntry(runtime);

    // `hasValidLauncherPayloadContext` accepts the entry only when it resolves
    // to a `versions/<version>/payload/...` path inside the launcher root.
    const resolved = await realpath(installedLaunchPath);
    expect(resolved.startsWith(await realpath(runtime.launcherPaths.versionsRoot))).toBe(true);
    expect(resolved).toContain(`${sep}payload${sep}`);
    // The updater compares against `realpath`-ed roots (launcher root can sit
    // under a symlinked prefix such as /var -> /private/var on macOS).
    const resolvedPaths = {
      ...runtime.launcherPaths,
      root: await realpath(runtime.launcherPaths.root),
      versionsRoot: await realpath(runtime.launcherPaths.versionsRoot),
    };
    expect(isLauncherPayloadAppPath(resolvedPaths, resolved)).toBe(true);
    expect(result.payloadAppPath).toBe(join(result.aliasPath as string, "payload", "Open Design.app"));
  });

  it("fails loudly instead of publishing an entry it could not verify", async () => {
    const root = await createRoot();
    const installedLaunchPath = join(root, "Applications", "Open Design.app");
    await mkdir(join(root, "Applications"), { recursive: true });
    const runtime = fakeRuntime({ installedLaunchPath, root, version: "0.24.1" });
    // A real, non-empty directory sits where the alias belongs: `rename()`
    // cannot replace it. Reporting success here would be the false-success path
    // — the install path would get linked while `current` is still stale.
    await mkdir(join(runtime.launcherPaths.namespaceRoot, "current", "Contents"), { recursive: true });

    const result = await syncStableLaunchEntry(runtime);

    expect(result.launchPathStatus).toBe("failed");
    expect(result.payloadAppPath).toBeNull();
    expect((await lstat(join(runtime.launcherPaths.namespaceRoot, "current"))).isDirectory()).toBe(true);
    // The install path must stay untouched.
    await expect(lstat(installedLaunchPath)).rejects.toThrow();
  });

  it("does not report a stale alias as unchanged", async () => {
    const root = await createRoot();
    const installedLaunchPath = join(root, "Applications", "Open Design.app");
    await mkdir(join(root, "Applications"), { recursive: true });
    const stale = fakeRuntime({ installedLaunchPath, root, version: "0.24.0" });
    await mkdir(join(stale.launcherPaths.versionsRoot, "0.24.0"), { recursive: true });
    await syncStableLaunchEntry(stale);
    // Alias still on 0.24.0 but the runtime has moved on; the link at the
    // install path already has the right *text*, so only the alias check can
    // catch this.
    await mkdir(join(stale.launcherPaths.versionsRoot, "0.24.1"), { recursive: true });
    const dangling = fakeRuntime({ installedLaunchPath, root, version: "0.24.1" });

    const result = await syncStableLaunchEntry(dangling);

    expect(result.launchPathStatus).not.toBe("failed");
    expect(await readlink(result.aliasPath as string)).toBe(
      join(dangling.launcherPaths.versionsRoot, "0.24.1"),
    );
  });

  it("never replaces a real installed bundle", async () => {
    const root = await createRoot();
    const installedLaunchPath = join(root, "Applications", "Open Design.app");
    await mkdir(join(installedLaunchPath, "Contents", "MacOS"), { recursive: true });
    await seedVersion(root, "0.24.1");
    const runtime = fakeRuntime({ installedLaunchPath, root, version: "0.24.1" });

    const result = await syncStableLaunchEntry(runtime);

    expect(result.launchPathStatus).toBe("skipped-existing-install");
    expect((await lstat(installedLaunchPath)).isDirectory()).toBe(true);
  });
});
