import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Script } from "node:vm";

import * as launcherProto from "@open-design/launcher-proto";
import * as release from "@open-design/release";
import type { SidecarStamp } from "@open-design/sidecar";
import * as sidecarProto from "@open-design/sidecar-proto";
import { transformSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";

import { PackagedPathAccessError } from "../src/errors.js";
import {
  exitPackagedLauncherForExistingDesktop,
  inspectExistingDesktopForLauncher,
  waitForLauncherAfterQuit,
} from "../src/launcher-after-quit.js";
import type { PackagedNamespacePaths } from "../src/paths.js";

// Run the real entry and gate logic. Only OS/Electron/sidecar transport and the
// final payload-launch boundary are simulated; this is not a full GUI smoke.
const entry = new Script(transformSync(
  await readFile(new URL("../src/index.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "cjs", target: "node24" },
).code, { filename: "packaged-index.cjs" });

type Role = "unstamped" | "launcher" | "supervised";
const roles: Role[] = ["unstamped", "launcher", "supervised"];
const oldPid = 4242;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function startEntry(options: {
  role: Role;
  update?: boolean;
  oldAlive?: boolean;
  headless?: boolean;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "od-startup-order-"));
  const paths: PackagedNamespacePaths = {
    cacheRoot: path.join(root, "cache"), dataRoot: path.join(root, "data"),
    desktopLogPath: path.join(root, "logs", "desktop", "latest.log"),
    desktopLogsRoot: path.join(root, "logs", "desktop"),
    electronSessionDataRoot: path.join(root, "user-data", "session"),
    electronUserDataRoot: path.join(root, "user-data"), installationRoot: root,
    installerObservationRoot: path.join(root, "observations"), logsRoot: path.join(root, "logs"),
    namespaceRoot: root, resourceRoot: path.join(root, "resources"),
    runtimeRoot: path.join(root, "runtime"), updateRoot: path.join(root, "updates"),
  };
  const stamp: SidecarStamp = {
    app: "desktop", channel: "stable", mode: options.headless ? "headless" : "runtime",
    namespace: "startup-test", source: "packaged",
  };
  const waiting = deferred<"waiting">();
  const releaseOldProcess = deferred<boolean>();
  const completions: Promise<number>[] = [];
  const config = { namespace: stamp.namespace, appVersion: "0.22.1" };
  let oldAlive = options.oldAlive ?? true;
  const argv = ["Open Design", ...(options.update
    ? launcherProto.buildLauncherAfterQuitArgs({ targetPid: oldPid, timeoutMs: 1000 })
    : [])];
  const show = vi.fn(async (..._args: unknown[]) => ({ accepted: true }));
  const errors = vi.fn();
  const getStatus = vi.fn(async (target: SidecarStamp) => {
    // The only existing owner is a healthy, visible GUI of the same identity.
    // A headless-only probe must NOT see this GUI.
    if (!oldAlive || target.mode !== "runtime" || target.source !== stamp.source
      || target.namespace !== stamp.namespace || target.channel !== stamp.channel) {
      return { state: "stopped" };
    }
    if (target.app === "desktop") return {
      state: "running", pid: oldPid, windowVisible: true,
      update: { currentVersion: options.update ? "0.22.0" : config.appVersion },
    };
    return { state: "running", url: "http://127.0.0.1:1234" };
  });
  const waitForExit = vi.fn(async () => {
    if (!oldAlive) return true;
    waiting.resolve("waiting");
    const stopped = await releaseOldProcess.promise;
    if (stopped) oldAlive = false;
    return stopped;
  });
  const stopProcesses = vi.fn(async () => ({
    alreadyStopped: !oldAlive, forcedPids: [], matchedPids: [oldPid],
    remainingPids: oldAlive ? [oldPid] : [], stoppedPids: oldAlive ? [] : [oldPid],
  }));
  const stopSidecar = vi.fn(async () => {
    oldAlive = false;
    return {
      alreadyStopped: false, forcedPids: [], matchedPids: [oldPid],
      remainingPids: [], stoppedPids: [oldPid], gracefulAccepted: true,
    };
  });
  const launchPayload = vi.fn(async () => true);

  function runProcess(role: Role): Promise<number> {
    const done = deferred<number>();
    completions.push(done.promise);
    const exit = (code: number) => { done.resolve(code); };
    const modules: Record<string, unknown> = {
      "@open-design/sidecar-proto": sidecarProto,
      "@open-design/launcher-proto": launcherProto,
      "@open-design/release": release,
      "@open-design/sidecar": {
        readCurrentSidecarStamp: () => {
          if (role === "unstamped") throw new Error("no sidecar stamp");
          return stamp;
        },
        isCurrentSidecarLauncher: () => role === "launcher",
        bootstrapSidecarProcess: async () => {
          if (role === "supervised") return false;
          // A launcher delegates to a supervised process and waits for it.
          // A parent's clean exit alone cannot satisfy launch acceptance.
          if (await runProcess("supervised") !== 0) throw new Error("supervised startup failed");
          return true;
        },
        resolveSidecarLauncherExitCode: () => 1,
      },
      "@open-design/desktop/main": {
        applyOsLocaleSwitch: vi.fn(), applyLoopbackConnectionLimitSwitch: vi.fn(),
      },
      "node:path": path,
      electron: { app: { commandLine: { appendSwitch: vi.fn() }, exit }, dialog: {} },
      "./config.js": { readPackagedConfig: async () => config },
      "./download-attribution.js": {},
      "./headless-runtime.js": {
        parsePackagedHeadlessRequest: () => ({ headless: options.headless ?? false, mcpInstallAgent: null }),
        runPackagedMcpActionAgainstExistingDaemon: async () => false,
      },
      "./errors.js": { PackagedPathAccessError },
      "./launcher-after-quit.js": {
        exitPackagedLauncherForExistingDesktop,
        waitForLauncherAfterQuit: (request: launcherProto.LauncherAfterQuitRequest | null) =>
          waitForLauncherAfterQuit(request, paths, { warn: vi.fn() }, { waitForExit, stopProcesses }),
        inspectExistingDesktopForLauncher: (
          target: SidecarStamp, input: Parameters<typeof inspectExistingDesktopForLauncher>[1],
        ) => inspectExistingDesktopForLauncher(target, {
          ...input, getStatus: getStatus as never, invoke: show as never, stopSidecar,
        }),
      },
      "./launcher-runtime.js": { resolvePackagedLauncherRuntime: async () => ({ config, paths }) },
      "./launch.js": { createPackagedSecondInstanceHandoff: () => ({}) },
      "./logging.js": {},
      "./paths.js": { resolvePackagedNamespacePaths: () => paths },
      "./obsolete-installed-outer.js": {},
      "./payload-desktop-launch.js": {
        findPackagedDeeplinkArg: () => null, launchPackagedPayloadDesktop: launchPayload,
      },
      "./protocol.js": {},
      "./sidecars.js": {},
      "./startup-telemetry.js": {},
      "./window-title.js": {},
      "./windows-lifecycle.js": {},
    };
    entry.runInNewContext({
      require: (id: string) => {
        if (!(id in modules)) throw new Error(`Unexpected startup dependency: ${id}`);
        return modules[id];
      },
      process: { argv, env: {}, exit },
      console: { error: errors, log: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });
    return done.promise;
  }
  const finished = runProcess(options.role);
  return {
    waiting, releaseOldProcess, finished, show, errors, getStatus, waitForExit, stopProcesses, launchPayload,
    async close() {
      releaseOldProcess.resolve(false);
      // A parent awaits its child, so all entries have completed by this point.
      await finished;
      await Promise.all(completions);
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe("packaged entry update handoff", () => {
  it.each(roles)("preserves the update successor while the old GUI is quitting (%s)", async (role) => {
    const run = await startEntry({ role, update: true });
    try {
      expect(await Promise.race([run.waiting.promise, run.finished])).toBe("waiting");
      expect(run.waitForExit).toHaveBeenCalledWith(oldPid, 1000);
      expect(run.show).not.toHaveBeenCalled();
      expect(run.launchPayload).not.toHaveBeenCalled();
      run.releaseOldProcess.resolve(true);
      expect(await run.finished).toBe(0);
      expect(run.launchPayload).toHaveBeenCalledTimes(1);
      expect(run.show).not.toHaveBeenCalled();
      expect(run.errors).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });

  it.each(roles)("fails the update if waiting and stopping cannot release the old GUI (%s)", async (role) => {
    const run = await startEntry({ role, update: true });
    try {
      run.releaseOldProcess.resolve(false);
      expect(await run.finished).toBe(1);
      expect(run.stopProcesses).toHaveBeenCalledWith([oldPid]);
      expect(run.show).not.toHaveBeenCalled();
      expect(run.launchPayload).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });

  it.each(roles)("reuses a healthy same-version GUI on an ordinary duplicate launch (%s)", async (role) => {
    const run = await startEntry({ role });
    try {
      expect(await run.finished).toBe(0);
      expect(run.show).toHaveBeenCalledTimes(1);
      expect(run.show.mock.calls[0]?.[1]).toBe(sidecarProto.SIDECAR_MESSAGES.SHOW);
      expect(run.waitForExit).not.toHaveBeenCalled();
      expect(run.launchPayload).not.toHaveBeenCalled();
      expect(run.errors).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });

  it.each(roles)("continues a first launch without waiting for a nonexistent owner (%s)", async (role) => {
    const run = await startEntry({ role, oldAlive: false });
    try {
      expect(await run.finished).toBe(0);
      expect(run.launchPayload).toHaveBeenCalledTimes(1);
      expect(run.waitForExit).not.toHaveBeenCalled();
      expect(run.show).not.toHaveBeenCalled();
      expect(run.errors).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });

  it.each(roles)("continues an update immediately when its old PID has already exited (%s)", async (role) => {
    const run = await startEntry({ role, update: true, oldAlive: false });
    try {
      expect(await run.finished).toBe(0);
      expect(run.waitForExit).toHaveBeenCalledWith(oldPid, 1000);
      expect(run.launchPayload).toHaveBeenCalledTimes(1);
      expect(run.stopProcesses).not.toHaveBeenCalled();
      expect(run.show).not.toHaveBeenCalled();
      expect(run.errors).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });

  it("lets an ordinary headless request reuse the existing GUI without an update wait", async () => {
    const run = await startEntry({ role: "unstamped", headless: true });
    try {
      expect(await run.finished).toBe(0);
      expect(run.show).toHaveBeenCalledTimes(1);
      expect(run.waitForExit).not.toHaveBeenCalled();
      expect(run.launchPayload).not.toHaveBeenCalled();
      expect(run.errors).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });
});
