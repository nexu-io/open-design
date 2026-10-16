import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { LAUNCHER_SCHEMA_VERSION, resolveLauncherPaths } from "@open-design/launcher-proto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmPackagedLauncherRuntime, type PackagedLauncherRuntime } from "../src/launcher-runtime.js";
import { refreshMacApplicationRegistration } from "../src/mac-launch-services.js";

vi.mock("../src/mac-launch-services.js", () => ({
  refreshMacApplicationRegistration: vi.fn(async () => ({ status: "skipped" })),
}));

afterEach(() => vi.clearAllMocks());

async function fixture(root: string): Promise<PackagedLauncherRuntime> {
  const launcherPaths = resolveLauncherPaths({ root, channel: "stable", namespace: "release-stable" });
  const pointer = { generation: 1, version: "0.24.1" };
  const runtime = {
    desktopExecutablePath: join(root, "Open Design.app", "Contents", "MacOS", "Open Design"),
    descriptor: {
      active: pointer,
      channel: "stable",
      lastSuccessful: { generation: 0, version: "0.24.0" },
      namespace: "release-stable",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
    },
    launcherPaths,
    payloadDesktopProcess: true,
    selection: { pointer, reason: "active", selected: true },
    source: "payload",
  } as PackagedLauncherRuntime;
  await mkdir(dirname(launcherPaths.runtimePath), { recursive: true });
  await mkdir(dirname(launcherPaths.attemptsPath), { recursive: true });
  await writeFile(launcherPaths.runtimePath, JSON.stringify(runtime.descriptor));
  await writeFile(launcherPaths.attemptsPath, JSON.stringify(pointer));
  return runtime;
}

describe("packaged activation registration", () => {
  it.each(["active", "active-delegated", "active-resume"] as const)(
    "refreshes registration only after %s is persisted as successful",
    async (reason) => {
      const root = await mkdtemp(join(tmpdir(), "od-launcher-registration-"));
      try {
        const runtime = await fixture(root);
        runtime.selection = { ...runtime.selection, reason } as typeof runtime.selection;
        vi.mocked(refreshMacApplicationRegistration).mockImplementationOnce(async ({ executablePath }) => {
          expect(executablePath).toBe(runtime.desktopExecutablePath);
          expect(JSON.parse(await readFile(runtime.launcherPaths.runtimePath, "utf8"))).toMatchObject({
            active: runtime.selection.selected ? runtime.selection.pointer : null,
            lastSuccessful: runtime.selection.selected ? runtime.selection.pointer : null,
          });
          await expect(readFile(runtime.launcherPaths.attemptsPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
          return { status: "registered", appBundlePath: join(root, "Open Design.app") };
        });
        await confirmPackagedLauncherRuntime(runtime);
        expect(refreshMacApplicationRegistration).toHaveBeenCalledExactlyOnceWith({
          executablePath: runtime.desktopExecutablePath,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("does not refresh registration when confirmation was skipped", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-registration-skip-"));
    try {
      const runtime = await fixture(root);
      await confirmPackagedLauncherRuntime({ ...runtime, source: "current-package" });
      await confirmPackagedLauncherRuntime({ ...runtime, payloadDesktopProcess: false });
      await confirmPackagedLauncherRuntime({ ...runtime, desktopExecutablePath: null });
      await confirmPackagedLauncherRuntime({ ...runtime, selection: { selected: false, reason: "no-runtime-target" } });
      await confirmPackagedLauncherRuntime({
        ...runtime,
        selection: { selected: true, reason: "last-successful", pointer: { generation: 0, version: "0.24.0" } },
      });
      expect(refreshMacApplicationRegistration).not.toHaveBeenCalled();
      await expect(readFile(runtime.launcherPaths.attemptsPath, "utf8")).resolves.toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps successful activation when LaunchServices refresh fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-registration-failure-"));
    try {
      const runtime = await fixture(root);
      const error = new Error("lsregister timed out");
      const logger = { warn: vi.fn() };
      vi.mocked(refreshMacApplicationRegistration).mockResolvedValueOnce({ status: "failed", error });
      await expect(confirmPackagedLauncherRuntime(runtime, logger)).resolves.toBeUndefined();
      expect(refreshMacApplicationRegistration).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith("failed to refresh macOS application registration", { error });
      expect(JSON.parse(await readFile(runtime.launcherPaths.runtimePath, "utf8"))).toMatchObject({
        lastSuccessful: { generation: 1, version: "0.24.1" },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not register an activation whose runtime descriptor could not be written", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-registration-write-failure-"));
    try {
      const runtime = await fixture(root);
      await rm(runtime.launcherPaths.runtimePath);
      await mkdir(runtime.launcherPaths.runtimePath);
      await expect(confirmPackagedLauncherRuntime(runtime)).rejects.toThrow();
      expect(refreshMacApplicationRegistration).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
