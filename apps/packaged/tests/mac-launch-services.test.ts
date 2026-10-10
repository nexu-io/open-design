import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { refreshMacApplicationRegistration } from "../src/mac-launch-services.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createBundle() {
  const root = await mkdtemp(join(tmpdir(), "od-mac-registration-"));
  roots.push(root);
  const appBundlePath = join(root, "Open Design Beta.app");
  const executableRoot = join(appBundlePath, "Contents", "MacOS");
  await mkdir(executableRoot, { recursive: true });
  const executablePath = join(executableRoot, "Open Design Beta");
  await writeFile(executablePath, "payload desktop", "utf8");
  return { root, appBundlePath, executablePath };
}

describe("refreshMacApplicationRegistration", () => {
  it("registers the exact confirmed application with spaces in a single argument", async () => {
    const { appBundlePath, executablePath } = await createBundle();
    const exec = vi.fn(async () => undefined);
    const canonicalBundle = await realpath(appBundlePath);

    await expect(refreshMacApplicationRegistration({ executablePath, platform: "darwin", exec }))
      .resolves.toEqual({ status: "registered", appBundlePath: canonicalBundle });
    expect(exec).toHaveBeenCalledExactlyOnceWith(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-f", canonicalBundle],
      { timeout: 5_000, maxBuffer: 64 * 1024, windowsHide: true },
    );
  });

  it.each(["win32", "linux"] as const)("skips %s without starting an OS utility", async (platform) => {
    const exec = vi.fn(async () => undefined);
    await expect(refreshMacApplicationRegistration({
      executablePath: join(tmpdir(), "Open Design.app", "Contents", "MacOS", "Open Design"),
      platform,
      exec,
    })).resolves.toEqual({ status: "skipped" });
    expect(exec).not.toHaveBeenCalled();
  });

  it.each([
    "Open Design.app/Contents/MacOS/Open Design",
    join(tmpdir(), "Open Design", "Contents", "MacOS", "Open Design"),
    join(tmpdir(), "Open Design.app", "Resources", "MacOS", "Open Design"),
    join(tmpdir(), "Open Design.app", "Contents", "Resources", "Open Design"),
    join(tmpdir(), "Open Design.app", "Contents", "MacOS", "nested", "Open Design"),
  ])("skips an executable outside the immediate bundle entry: %s", async (executablePath) => {
    const exec = vi.fn(async () => undefined);
    await expect(refreshMacApplicationRegistration({ executablePath, platform: "darwin", exec }))
      .resolves.toEqual({ status: "skipped" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("resolves an application alias before registration", async () => {
    const { root, appBundlePath } = await createBundle();
    const aliasPath = join(root, "Open Design.app");
    await symlink(appBundlePath, aliasPath, process.platform === "win32" ? "junction" : "dir");
    const exec = vi.fn(async () => undefined);
    const canonicalBundle = await realpath(appBundlePath);

    await expect(refreshMacApplicationRegistration({
      executablePath: join(aliasPath, "Contents", "MacOS", "Open Design Beta"),
      platform: "darwin",
      exec,
    })).resolves.toEqual({ status: "registered", appBundlePath: canonicalBundle });
    expect(exec).toHaveBeenCalledExactlyOnceWith(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-f", canonicalBundle],
      { timeout: 5_000, maxBuffer: 64 * 1024, windowsHide: true },
    );
  });

  it("returns an OS command failure without rejecting the confirmed launch", async () => {
    const { executablePath } = await createBundle();
    const error = new Error("registration timed out");
    const exec = vi.fn(async () => { throw error; });

    await expect(refreshMacApplicationRegistration({ executablePath, platform: "darwin", exec }))
      .resolves.toEqual({ status: "failed", error });
  });

  it("removes owned version registrations before registering the canonical app", async () => {
    const { root, executablePath, appBundlePath } = await createBundle();
    const versionsRoot = join(root, "versions");
    await mkdir(join(versionsRoot, "0.24.0", "payload", "Open Design Beta.app"), { recursive: true });
    await mkdir(join(versionsRoot, "unrelated-directory"), { recursive: true });
    const exec = vi.fn(async () => undefined);
    await refreshMacApplicationRegistration({ executablePath, versionsRoot, platform: "darwin", exec });
    expect(exec.mock.calls.map((call) => (call as unknown as [string, string[]])[1])).toEqual([
      ["-u", join(versionsRoot, "0.24.0", "payload", "Open Design Beta.app")],
      ["-f", await realpath(appBundlePath)],
    ]);
  });

  it("returns a missing bundle failure without starting an OS utility", async () => {
    const { root } = await createBundle();
    const exec = vi.fn(async () => undefined);
    const result = await refreshMacApplicationRegistration({
      executablePath: join(root, "Missing.app", "Contents", "MacOS", "Open Design"),
      platform: "darwin",
      exec,
    });

    expect(result).toMatchObject({ status: "failed", error: { code: "ENOENT" } });
    expect(exec).not.toHaveBeenCalled();
  });
});
