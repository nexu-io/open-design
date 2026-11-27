import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startStandaloneBackendInProcess } from "../../sidecar/server";

type Cleanup = () => Promise<void> | void;
const cleanups: Cleanup[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

function spoofWindowsPlatform(): void {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...descriptor, value: "win32" });
  cleanups.push(() => {
    Object.defineProperty(process, "platform", descriptor);
  });
}

function snapshotEnvironment(): void {
  const before = { ...process.env };
  cleanups.push(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in before)) delete process.env[key];
    }
    Object.assign(process.env, before);
  });
}

describe("startStandaloneBackendInProcess", () => {
  // Regression for #9157: with the old working-directory alias installed, a
  // launch through an aliased path (Windows profile junction) patched chdir,
  // and the rewrite fought Next.js's realpath-based project directory
  // resolution, splicing two drive roots into one path (HTTP 500 everywhere).
  // The alias is gone; the startup path must now leave chdir native and the
  // working directory exactly where it was.
  it("leaves process.chdir and the working directory untouched behind an aliased entry path", async () => {
    spoofWindowsPlatform();
    snapshotEnvironment();
    // Nothing listens on the probe origin, so startup is expected to end in
    // the readiness timeout; the entry import has already happened by then.
    process.env.OD_STANDALONE_STARTUP_TIMEOUT_MS = "40";

    const realRoot = await mkdtemp(join(tmpdir(), "open-design-real-"));
    const aliasRoot = await mkdtemp(join(tmpdir(), "open-design-alias-"));
    cleanups.push(async () => {
      await rm(realRoot, { recursive: true, force: true });
      await rm(aliasRoot, { recursive: true, force: true });
    });

    // The same entry tree, reachable through its real location and through an
    // aliased link — the packaged-launcher situation on a junctioned profile.
    const appDir = join(realRoot, "apps", "web");
    await mkdir(appDir, { recursive: true });
    const entryPath = join(appDir, "server.js");
    await writeFile(
      entryPath,
      [
        "globalThis.__openDesignCwdProbe = {",
        "  cwd: process.cwd(),",
        "  chdirIsNative: process.chdir === globalThis.__openDesignNativeChdir,",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    const linkRoot = join(aliasRoot, "link");
    await symlink(realRoot, linkRoot, "junction");
    const aliasedEntry = join(linkRoot, "apps", "web", "server.js");

    const nativeChdir = process.chdir;
    (globalThis as unknown as Record<string, unknown>).__openDesignNativeChdir = nativeChdir;
    const originalCwd = process.cwd();

    await expect(
      startStandaloneBackendInProcess(aliasedEntry, 9, "http://127.0.0.1:9"),
    ).rejects.toThrow(/timed out/i);

    const probe = (globalThis as unknown as Record<string, unknown>)
      .__openDesignCwdProbe as { cwd: string; chdirIsNative: boolean };

    // The entry module ran (the timeout came from the readiness probe).
    expect(probe).toBeDefined();
    // No chdir alias was installed: the shim never wraps process.chdir ...
    expect(probe.chdirIsNative).toBe(true);
    expect(process.chdir).toBe(nativeChdir);
    // ... and the imported server observed the untouched working directory,
    // not anything mapped into the alias root.
    expect(resolve(probe.cwd)).toBe(originalCwd);
  });
});
