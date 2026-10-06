import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { captureProcessSnapshot, collectProcessTreePids, isProcessAlive, waitForProcessExit } from "@open-design/platform";
import {
  normalizeSidecarStamp,
  allocatePort,
  bootstrapSidecarProcess,
  convergeSidecarLaunch,
  findSidecarProcesses,
  getSidecarStatus,
  launchSidecar,
  registerSidecarProcess,
  readCurrentSidecarStamp,
  restartSidecar,
  SidecarFactory,
  SIDECAR_STAMP_FIELDS,
  SIDECAR_STAMP_FLAGS,
  spawnSidecar,
  spawnSidecarLauncher,
  stopSidecar,
  stopSidecars,
  type SidecarResources,
  type SidecarStamp,
} from "../src/index.js";
import { retireSidecarGeneration, sidecarGenerationRef } from "../src/generation.js";
import { collectSidecarGenerationPids } from "../src/process-tree.js";
import { resolvePrivateIpcPath } from "../src/stamp.js";

const originalArgv = [...process.argv];
const originalEndpoint = process.env.OD_SIDECAR_CLIENT_ENDPOINT;
const originalSupervisedContext = process.env.OD_SIDECAR_SUPERVISED_CONTEXT;
const FIXTURE_READY_TIMEOUT_MS = 10_000;

const stamp: SidecarStamp = {
  channel: "local",
  namespace: `test-${process.pid}`,
  source: "tools-dev",
  mode: "dev",
  app: "daemon",
};

function installCurrentProcess(stampValue: SidecarStamp, resources = {
  dataRoot: "/tmp/open-design-test-data",
  ownerPid: null,
  port: 0,
  runtimeRoot: "/tmp/open-design-test-runtime",
}): void {
  process.argv = [process.execPath, "/tmp/sidecar-entry.js"];
  process.env.OD_SIDECAR_SUPERVISED_CONTEXT = JSON.stringify({
    generationPid: process.pid,
    resources,
    stamp: stampValue,
  });
}

afterEach(() => {
  process.argv = [...originalArgv];
  if (originalEndpoint == null) delete process.env.OD_SIDECAR_CLIENT_ENDPOINT;
  else process.env.OD_SIDECAR_CLIENT_ENDPOINT = originalEndpoint;
  if (originalSupervisedContext == null) delete process.env.OD_SIDECAR_SUPERVISED_CONTEXT;
  else process.env.OD_SIDECAR_SUPERVISED_CONTEXT = originalSupervisedContext;
});

describe("five-field argv identity", () => {
  it("contains channel rather than an IPC implementation field", () => {
    expect(SIDECAR_STAMP_FIELDS).toEqual(["channel", "namespace", "source", "mode", "app"]);
    expect(SIDECAR_STAMP_FIELDS).not.toContain("ipc");
  });

  it("reads the complete stamp internally from current argv", () => {
    delete process.env.OD_SIDECAR_SUPERVISED_CONTEXT;
    process.argv = [
      process.execPath,
      "/tmp/sidecar-entry.js",
      ...SIDECAR_STAMP_FIELDS.map((field) => `${SIDECAR_STAMP_FLAGS[field]}=${stamp[field]}`),
    ];
    expect(readCurrentSidecarStamp()).toEqual(stamp);

    process.argv = process.argv.filter((argument) => !argument.startsWith(`${SIDECAR_STAMP_FLAGS.channel}=`));
    expect(() => readCurrentSidecarStamp()).toThrow(/five-field sidecar argv stamp/);
  });

  it("refuses to register an unsupervised business process", () => {
    delete process.env.OD_SIDECAR_SUPERVISED_CONTEXT;
    process.argv = [process.execPath, "/tmp/packaged-entry.js"];
    expect(() => registerSidecarProcess(stamp, {
      dataRoot: "/tmp/data",
      ownerPid: null,
      port: 0,
      runtimeRoot: "/tmp/runtime",
    })).toThrow("current process is missing its supervised sidecar context");
    expect(process.argv).toEqual([process.execPath, "/tmp/packaged-entry.js"]);
  });

  it("bootstraps an unstamped root through the launch atomic", async () => {
    delete process.env.OD_SIDECAR_SUPERVISED_CONTEXT;
    process.argv = [process.execPath, "/tmp/packaged-entry.js", "--headless"];
    const launch = vi.fn(async () => ({ pid: 4321 }));
    const resources = { dataRoot: "/tmp/data", ownerPid: null, port: 0, runtimeRoot: "/tmp/runtime" };
    const waitUntilReady = vi.fn(async () => undefined);
    await expect(bootstrapSidecarProcess(stamp, resources, { launch, waitUntilReady })).resolves.toBe(true);
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      args: ["/tmp/packaged-entry.js", "--headless"],
      command: process.execPath,
      resources,
      stamp,
    }));
    expect(waitUntilReady).toHaveBeenCalledWith(stamp, 4321, 90_000);
  });

  it("enters server lifecycle from supervisor context without relaunching", async () => {
    installCurrentProcess(stamp);
    const launch = vi.fn(async () => ({ pid: 4321 }));
    const resources = { dataRoot: "/tmp/final-data", ownerPid: null, port: 4173, runtimeRoot: "/tmp/final-runtime" };

    await expect(bootstrapSidecarProcess(stamp, resources, { launch })).resolves.toBe(false);

    expect(launch).not.toHaveBeenCalled();
    expect(JSON.parse(process.env.OD_SIDECAR_SUPERVISED_CONTEXT ?? "null")?.resources).toEqual(resources);
    expect(readCurrentSidecarStamp()).toEqual(stamp);
    expect(process.argv).toEqual([process.execPath, "/tmp/sidecar-entry.js"]);
  });

  it("rejects partial matching and derived identity fields", () => {
    expect(() => normalizeSidecarStamp({ ...stamp, ipc: "/tmp/not-identity.sock" })).toThrow(/unsupported fields: ipc/);
    expect(() => normalizeSidecarStamp({ app: stamp.app, namespace: stamp.namespace })).toThrow(/channel/);
  });
});

describe("sidecar generation process trees", () => {
  it("owns ordinary and same-stamp descendants but stops at a different stamped resource root", () => {
    const nestedStamp = { ...stamp, app: "desktop" };
    const stampArgs = (stampValue: SidecarStamp) => SIDECAR_STAMP_FIELDS
      .map((field) => `${SIDECAR_STAMP_FLAGS[field]}=${stampValue[field]}`)
      .join(" ");
    const processes = [
      { command: `node supervisor ${stampArgs(stamp)}`, pid: 10, ppid: 1 },
      { command: "node target", pid: 11, ppid: 10 },
      { command: "next-server", pid: 12, ppid: 11 },
      { command: `node supervisor ${stampArgs(nestedStamp)}`, pid: 20, ppid: 11 },
      { command: `node target ${stampArgs(nestedStamp)}`, pid: 21, ppid: 20 },
    ];

    expect(collectSidecarGenerationPids(processes, [10], stamp)).toEqual([12, 11, 10]);
  });

  it("keeps a nested stamped resource alive when its ancestor generation stops", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/nested-sidecar.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-nested-"));
    const readyPath = join(root, "ready.json");
    const parentStamp = { ...stamp, app: "daemon", namespace: `nested-parent-${process.pid}` };
    const childStamp = { ...parentStamp, app: "desktop" };
    const parent = await spawnSidecar({
      args: ["--import", "tsx", fixture],
      command: process.execPath,
      env: {
        ...process.env,
        OD_TEST_NESTED_SIDECAR_READY: readyPath,
        OD_TEST_NESTED_SIDECAR_STAMP: JSON.stringify(childStamp),
      },
      resources: {
        dataRoot: join(root, "parent-data"),
        ownerPid: null,
        port: 0,
        runtimeRoot: join(root, "parent-runtime"),
      },
      stamp: parentStamp,
    });
    let childPid: number | null = null;

    try {
      await vi.waitFor(async () => {
        const ready = await readFile(readyPath, "utf8").then((value) => JSON.parse(value)).catch(() => null);
        expect(ready).not.toBeNull();
        childPid = Number(ready.pid);
        expect(childPid).toBeGreaterThan(0);
        expect((await findSidecarProcesses(childStamp)).map(({ pid }) => pid)).toContain(childPid);
      }, { interval: 100, timeout: process.platform === "win32" ? 15_000 : 5_000 });
      const nestedPid = childPid;
      if (nestedPid == null) throw new Error("nested sidecar fixture did not report a pid");
      const genericTree = collectProcessTreePids(await captureProcessSnapshot(), [parent.process.pid]);
      expect(genericTree).toContain(nestedPid);

      const result = await parent.stop({ killGraceMs: 2_000, termGraceMs: 0 });

      expect(result.matchedPids).toContain(parent.process.pid);
      expect(result.matchedPids).not.toContain(nestedPid);
      expect(result.forcedPids).not.toContain(nestedPid);
      await expect(waitForProcessExit(parent.process.pid, 2_000)).resolves.toBe(true);
      expect(isProcessAlive(nestedPid)).toBe(true);
      expect((await findSidecarProcesses(childStamp)).map(({ pid }) => pid)).toContain(nestedPid);
    } finally {
      await parent.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(childStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, process.platform === "win32" ? 45_000 : 15_000);
});

describe("normalized sidecar client", () => {
  it("is the only layer that receives OS resources and implements IPC/lifecycle", async () => {
    installCurrentProcess(stamp, {
      dataRoot: "/tmp/open-design-data",
      ownerPid: null,
      port: 4173,
      runtimeRoot: "/tmp/open-design-runtime",
    });
    const events: string[] = [];
    let inheritedDuringStart: Record<string, string> | null = null;
    let receivedResources: SidecarResources | null = null;
    const client = SidecarFactory.create({
      handlers: {
        echo(input) {
          events.push("handler");
          return input;
        },
      },
      lifecycle: {
        async start(resources) {
          events.push("start");
          inheritedDuringStart = SidecarFactory.inheritedEnvironment();
          receivedResources = resources;
          return { ready: true };
        },
        status(runtime) {
          return runtime;
        },
        async stop() {
          events.push("stop");
        },
      },
    });

    expect(SidecarFactory.inheritedEnvironment()).toEqual({});
    expect(client.resources).toEqual({
      dataRoot: "/tmp/open-design-data",
      ownerPid: null,
      pid: process.pid,
      port: 4173,
      runtimeRoot: "/tmp/open-design-runtime",
    });
    await client.start();
    const inheritedEnv = SidecarFactory.inheritedEnvironment();
    expect(Object.keys(inheritedEnv)).toHaveLength(1);
    const inherited = SidecarFactory.connectInherited(inheritedEnv);
    expect(inherited).not.toBeNull();
    await expect(inherited?.status("daemon")).resolves.toEqual({ ready: true });
    await expect(inherited?.invoke("daemon", "echo", { inherited: true })).resolves.toEqual({ inherited: true });
    await expect(client.invoke("daemon", "echo", { ok: true })).resolves.toEqual({ ok: true });
    await client.stop();
    await client.waitUntilStopped();
    expect(SidecarFactory.inheritedEnvironment()).toEqual({});

    expect(receivedResources).toEqual(client.resources);
    expect(inheritedDuringStart).toEqual({});
    expect(events).toEqual(["start", "handler", "handler", "stop"]);
  });

  it("hands off the supervised child without creating a second generation root", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/handoff-entry.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-handoff-"));
    const handoffStamp = { ...stamp, app: "desktop", namespace: `handoff-${process.pid}` };
    const spawned = await spawnSidecar({
      args: ["--import", "tsx", fixture],
      command: process.execPath,
      resources: {
        dataRoot: join(root, "data"),
        ownerPid: null,
        port: 0,
        runtimeRoot: join(root, "runtime"),
      },
      stamp: handoffStamp,
    });

    try {
      await vi.waitFor(async () => {
        await expect(getSidecarStatus(handoffStamp, { generationPid: spawned.process.pid }))
          .resolves.toEqual({ generationPid: spawned.process.pid, phase: "successor" });
        await expect(findSidecarProcesses(handoffStamp)).resolves.toEqual([
          expect.objectContaining({ pid: spawned.process.pid }),
        ]);
      }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });
    } finally {
      await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, 15_000);

  it("does not accept argv, socket paths, or capability declarations", () => {
    installCurrentProcess(stamp);
    const options = {
      handlers: {},
      lifecycle: {
        async start() { return {}; },
        status() { return {}; },
        async stop() {},
      },
    };
    SidecarFactory.create(options);
    expect(Object.keys(options).sort()).toEqual(["handlers", "lifecycle"]);
  });

  it("removes inherited generation state from a new generation environment", () => {
    expect(SidecarFactory.newGenerationEnvironment({
      KEEP_ME: "yes",
      OD_SIDECAR_CLIENT_ENDPOINT: "/private/old.sock",
      OD_SIDECAR_RESOURCES: '{"runtimeRoot":"/old"}',
      OD_SIDECAR_SUPERVISED_CONTEXT: '{"generationPid":42}',
      OD_SIDECAR_SUPERVISOR_TARGET: '{"command":"old"}',
    })).toEqual({ KEEP_ME: "yes" });
  });

  it("retries startup after a transient IPC bind failure", async () => {
    installCurrentProcess(stamp);
    const blocker = SidecarFactory.create({
      lifecycle: {
        async start() { return {}; },
        status() { return {}; },
        async stop() {},
      },
    });
    await blocker.start();

    const events: string[] = [];
    const client = SidecarFactory.create({
      lifecycle: {
        async start() {
          events.push("start");
          return {};
        },
        status() { return {}; },
        async stop() { events.push("stop"); },
      },
    });
    await expect(client.start()).rejects.toThrow();
    expect(events).toEqual([]);
    expect(SidecarFactory.inheritedEnvironment()).toEqual({});

    await blocker.stop();
    await expect(client.start()).resolves.toBeUndefined();
    expect(events).toEqual(["start"]);
    expect(Object.keys(SidecarFactory.inheritedEnvironment())).toEqual(["OD_SIDECAR_CLIENT_ENDPOINT"]);
    await client.stop();
  });

  it("releases endpoint ownership when business lifecycle startup fails", async () => {
    installCurrentProcess(stamp);
    let attempts = 0;
    const client = SidecarFactory.create({
      lifecycle: {
        async start() {
          attempts += 1;
          if (attempts === 1) throw new Error("transient business startup failure");
          return { ready: true };
        },
        status(runtime) { return runtime; },
        async stop() {},
      },
    });

    await expect(client.start()).rejects.toThrow("transient business startup failure");
    await expect(client.start()).resolves.toBeUndefined();
    await expect(client.status("daemon")).resolves.toEqual({ ready: true });
    await client.stop();
  });
});

describe("server-side atomic operations", () => {
  it("keeps an uncommitted launcher outside generation discovery", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const launcherStamp = { ...stamp, namespace: `launcher-role-${process.pid}` };
    const launcher = await spawnSidecarLauncher({
      args: [fixture],
      command: process.execPath,
      resources: {
        dataRoot: "/tmp/open-design-launcher-role",
        ownerPid: null,
        port: 0,
        runtimeRoot: "/tmp/open-design-launcher-role-runtime",
      },
      stamp: launcherStamp,
    });
    try {
      await vi.waitFor(() => expect(isProcessAlive(launcher.pid)).toBe(true));
      await expect(findSidecarProcesses(launcherStamp)).resolves.toEqual([]);
      await expect(stopSidecar(launcherStamp)).resolves.toMatchObject({ alreadyStopped: true });
      expect(isProcessAlive(launcher.pid)).toBe(true);
    } finally {
      try { process.kill(launcher.pid, "SIGKILL"); } catch {}
      await waitForProcessExit(launcher.pid, 2_000);
    }
  });

  it("retries a clean launcher exit until one ready generation is stable", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/converging-launcher.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-converging-launcher-"));
    const attemptPath = join(root, "attempt.txt");
    const launchStamp = { ...stamp, namespace: `launcher-convergence-${process.pid}` };
    await writeFile(attemptPath, "0");
    try {
      const result = await convergeSidecarLaunch({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        env: { ...process.env, OD_TEST_LAUNCH_ATTEMPT: attemptPath },
        resources: {
          dataRoot: join(root, "data"),
          ownerPid: null,
          port: 0,
          runtimeRoot: join(root, "runtime"),
        },
        stamp: launchStamp,
      }, { stabilityMs: 100, timeoutMs: 10_000 });

      expect(result.attempts).toBe(2);
      expect(result.description).toMatchObject({ ready: true, stamp: launchStamp });
      await expect(findSidecarProcesses(launchStamp)).resolves.toHaveLength(1);
    } finally {
      await stopSidecar(launchStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, 15_000);

  it.each(["runtime", "headless"] as const)("converges a tools-pack %s launch on an existing packaged-source owner", async (mode) => {
    const fixture = fileURLToPath(new URL("./fixtures/converging-launcher.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-cross-source-convergence-"));
    const ownerAttemptPath = join(root, "owner-attempt.txt");
    const launcherAttemptPath = join(root, "launcher-attempt.txt");
    const requestedStamp = {
      ...stamp,
      app: "desktop",
      mode,
      namespace: `cross-source-${mode}-${process.pid}`,
      source: "tools-pack",
    };
    const ownerStamp = { ...requestedStamp, source: "packaged" };
    await writeFile(ownerAttemptPath, "1");
    await writeFile(launcherAttemptPath, "0");
    try {
      await launchSidecar({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        env: { ...process.env, OD_TEST_LAUNCH_ATTEMPT: ownerAttemptPath },
        resources: { dataRoot: join(root, "data"), ownerPid: null, port: 0, runtimeRoot: join(root, "runtime") },
        stamp: ownerStamp,
      });
      const result = await convergeSidecarLaunch({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        env: { ...process.env, OD_TEST_LAUNCH_ATTEMPT: launcherAttemptPath },
        resources: { dataRoot: join(root, "data"), ownerPid: null, port: 0, runtimeRoot: join(root, "runtime") },
        stamp: requestedStamp,
      }, { ownerStamps: [requestedStamp, ownerStamp], stabilityMs: 100, timeoutMs: 10_000 });

      expect(result.attempts).toBe(1);
      expect(result.description).toMatchObject({ ready: true, stamp: ownerStamp });
    } finally {
      await stopSidecars([{ stamp: requestedStamp }, { stamp: ownerStamp }]).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, 15_000);

  it("retries a launcher generation retired by a competing lifecycle operation", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/converging-launcher.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-contended-launcher-"));
    const attemptPath = join(root, "attempt.txt");
    const launchStamp = { ...stamp, namespace: `launcher-contention-${process.pid}` };
    await writeFile(attemptPath, "0");
    try {
      const result = await convergeSidecarLaunch({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        env: {
          ...process.env,
          OD_TEST_FIRST_LAUNCH_EXIT: "75",
          OD_TEST_LAUNCH_ATTEMPT: attemptPath,
        },
        resources: {
          dataRoot: join(root, "data"),
          ownerPid: null,
          port: 0,
          runtimeRoot: join(root, "runtime"),
        },
        stamp: launchStamp,
      }, { stabilityMs: 100, timeoutMs: 10_000 });

      expect(result.attempts).toBe(2);
      expect(result.description).toMatchObject({ ready: true, stamp: launchStamp });
      await expect(findSidecarProcesses(launchStamp)).resolves.toHaveLength(1);
    } finally {
      await stopSidecar(launchStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, 15_000);

  it("quick-fails a non-retriable launcher error", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/converging-launcher.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-rejected-launcher-"));
    const attemptPath = join(root, "attempt.txt");
    const launchStamp = { ...stamp, namespace: `launcher-rejected-${process.pid}` };
    await writeFile(attemptPath, "0");
    try {
      await expect(convergeSidecarLaunch({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        env: {
          ...process.env,
          OD_TEST_FIRST_LAUNCH_EXIT: "1",
          OD_TEST_LAUNCH_ATTEMPT: attemptPath,
        },
        resources: {
          dataRoot: join(root, "data"),
          ownerPid: null,
          port: 0,
          runtimeRoot: join(root, "runtime"),
        },
        stamp: launchStamp,
      }, { stabilityMs: 100, timeoutMs: 10_000 })).rejects.toThrow(
        "sidecar launcher exited before convergence code=1 signal=null",
      );
      await expect(readFile(attemptPath, "utf8")).resolves.toBe("1");
    } finally {
      await stopSidecar(launchStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, 15_000);

  it("restarts a sidecar on its known concrete port by default", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/managed-child.ts", import.meta.url));
    const restartStamp = { ...stamp, namespace: `restart-port-${process.pid}` };
    const port = (await allocatePort()).port;
    const resources = {
      dataRoot: "/tmp/open-design-restart",
      ownerPid: null,
      port,
      runtimeRoot: "/tmp/open-design-restart-runtime",
    };
    const first = await launchSidecar({ args: ["--import", "tsx", fixture], command: process.execPath, resources, stamp: restartStamp });

    try {
      await vi.waitFor(async () => {
        expect(await getSidecarStatus(restartStamp)).toEqual({ pid: first.pid, port });
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      await expect(getSidecarStatus(restartStamp, { generationPid: first.pid + 1 }))
        .rejects.toThrow(`sidecar endpoint belongs to generation ${first.pid}, expected ${first.pid + 1}`);
      await expect(getSidecarStatus(restartStamp, { generationPid: first.pid }))
        .resolves.toEqual({ pid: first.pid, port });
      const restarted = await restartSidecar({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        resources: { ...resources, port: 0 },
        stamp: restartStamp,
      });

      expect(restarted.pid).not.toBe(first.pid);
      expect(restarted.reusedPort).toBe(true);
      expect(restarted.stop.stoppedPids).toContain(first.pid);
      await vi.waitFor(async () => {
        expect(await getSidecarStatus(restartStamp)).toEqual({ pid: restarted.pid, port });
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
    } finally {
      await stopSidecar(restartStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, 30_000);

  it("serializes two concurrent restarts into one healthy generation", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/managed-child.ts", import.meta.url));
    const restartStamp = { ...stamp, namespace: `restart-concurrent-${process.pid}` };
    const resources = {
      dataRoot: "/tmp/open-design-restart-concurrent",
      ownerPid: null,
      port: 0,
      runtimeRoot: "/tmp/open-design-restart-concurrent-runtime",
    };

    try {
      const results = await Promise.allSettled([
        restartSidecar({ args: ["--import", "tsx", fixture], command: process.execPath, resources, stamp: restartStamp }),
        restartSidecar({ args: ["--import", "tsx", fixture], command: process.execPath, resources, stamp: restartStamp }),
      ]);
      const fulfilled = results
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof restartSidecar>>> => result.status === "fulfilled")
        .map(({ value }) => value);
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      const live = await findSidecarProcesses(restartStamp);
      expect(live).toHaveLength(1);
      const status = await getSidecarStatus<{ pid: number }>(restartStamp);
      expect(status.pid).toBe(fulfilled.at(-1)?.pid);
    } finally {
      await stopSidecar(restartStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, 15_000);

  it("keeps an adjacent proxy and namespace healthy across a daemon restart (TD-06)", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/managed-child.ts", import.meta.url));
    const adjacentDaemonPort = (await allocatePort()).port;
    const webPort = (await allocatePort({ reserved: new Set([adjacentDaemonPort]) })).port;
    const daemonStamp = { ...stamp, namespace: `td06-a-${process.pid}` };
    const adjacentStamp = { ...stamp, namespace: `td06-b-${process.pid}` };
    const resources = {
      dataRoot: "/tmp/open-design-td06-a",
      ownerPid: null,
      port: 0,
      runtimeRoot: "/tmp/open-design-td06-a-runtime",
    };
    const adjacentResources = {
      dataRoot: "/tmp/open-design-td06-b",
      ownerPid: null,
      port: adjacentDaemonPort,
      runtimeRoot: "/tmp/open-design-td06-b-runtime",
    };
    const daemon = await launchSidecar({
      args: ["--import", "tsx", fixture],
      command: process.execPath,
      resources,
      stamp: daemonStamp,
    });
    const adjacent = await launchSidecar({
      args: ["--import", "tsx", fixture],
      command: process.execPath,
      resources: adjacentResources,
      stamp: adjacentStamp,
    });
    let daemonPort: number | null = null;
    const web = createServer(async (request, response) => {
      try {
        if (daemonPort == null) throw new Error("daemon port is not resolved");
        const upstream = await fetch(`http://127.0.0.1:${daemonPort}${request.url ?? "/"}`);
        response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
        response.end(await upstream.text());
      } catch (error) {
        response.writeHead(502, { "content-type": "text/plain" });
        response.end(error instanceof Error ? error.message : String(error));
      }
    });

    try {
      let daemonStatus!: { pid: number; port: number };
      await vi.waitFor(async () => {
        daemonStatus = await getSidecarStatus(daemonStamp);
        expect(daemonStatus.pid).toBe(daemon.pid);
        expect(daemonStatus.port).toBeGreaterThan(0);
        await expect(getSidecarStatus(adjacentStamp)).resolves.toEqual({ pid: adjacent.pid, port: adjacentDaemonPort });
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      const resolvedDaemonPort = daemonStatus.port;
      daemonPort = resolvedDaemonPort;
      await new Promise<void>((resolve, reject) => {
        web.once("error", reject);
        web.listen(webPort, "127.0.0.1", resolve);
      });
      await expect(fetch(`http://127.0.0.1:${webPort}/api/projects`).then(({ status }) => status)).resolves.toBe(200);
      await expect(fetch(`http://127.0.0.1:${adjacentDaemonPort}/api/projects`).then(({ status }) => status)).resolves.toBe(200);

      const restarted = await restartSidecar({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        resources: { ...resources, port: resolvedDaemonPort },
        stamp: daemonStamp,
      }, { requireConcretePort: true });
      expect(restarted.reusedPort).toBe(false);
      await vi.waitFor(async () => {
        await expect(getSidecarStatus(daemonStamp)).resolves.toEqual({ pid: restarted.pid, port: resolvedDaemonPort });
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });

      expect(web.address()).toEqual(expect.objectContaining({ port: webPort }));
      await expect(fetch(`http://127.0.0.1:${webPort}/api/projects`).then(({ status }) => status)).resolves.toBe(200);
      await expect(getSidecarStatus(adjacentStamp)).resolves.toEqual({ pid: adjacent.pid, port: adjacentDaemonPort });
      await expect(fetch(`http://127.0.0.1:${adjacentDaemonPort}/api/projects`).then(({ status }) => status)).resolves.toBe(200);
    } finally {
      await new Promise<void>((resolve) => web.close(() => resolve()));
      await Promise.all([
        stopSidecar(daemonStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
        stopSidecar(adjacentStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
      ]);
    }
  }, 30_000);

  it("keeps explicit and fresh restart port requests authoritative", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/managed-child.ts", import.meta.url));
    const restartStamp = { ...stamp, namespace: `restart-override-${process.pid}` };
    const firstPort = (await allocatePort()).port;
    const explicitPort = (await allocatePort({ reserved: new Set([firstPort]) })).port;
    const request = {
      args: ["--import", "tsx", fixture],
      command: process.execPath,
      resources: {
        dataRoot: "/tmp/open-design-restart-override",
        ownerPid: null,
        port: firstPort,
        runtimeRoot: "/tmp/open-design-restart-override-runtime",
      },
      stamp: restartStamp,
    };
    await launchSidecar(request);

    try {
      await vi.waitFor(async () => {
        expect(await getSidecarStatus(restartStamp)).toEqual(expect.objectContaining({ port: firstPort }));
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      const explicit = await restartSidecar({ ...request, resources: { ...request.resources, port: explicitPort } });
      expect(explicit.reusedPort).toBe(false);
      await vi.waitFor(async () => {
        expect(await getSidecarStatus(restartStamp)).toEqual(expect.objectContaining({ port: explicitPort }));
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });

      const fresh = await restartSidecar(
        { ...request, resources: { ...request.resources, port: 0 } },
        { reuseKnownPort: false },
      );
      expect(fresh.reusedPort).toBe(false);
      let freshStatus!: { pid: number; port: number };
      await vi.waitFor(async () => {
        freshStatus = await getSidecarStatus(restartStamp);
        expect(freshStatus.pid).toBe(fresh.pid);
        expect(freshStatus.port).toBeGreaterThan(0);
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      await expect(restartSidecar(
        { ...request, resources: { ...request.resources, port: 0 } },
        { requireConcretePort: true },
      )).rejects.toThrow("without a concrete port");
      await expect(getSidecarStatus(restartStamp)).resolves.toEqual(freshStatus);
    } finally {
      await stopSidecar(restartStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, 30_000);

  it("does not leak a parent client capability into an independently stamped sidecar", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-env-"));
    const capturePath = join(root, "env.json");
    const childStamp = { ...stamp, namespace: `env-${process.pid}` };
    try {
      await launchSidecar({
        args: [fixture],
        command: process.execPath,
        env: {
          ...process.env,
          OD_SIDECAR_CLIENT_ENDPOINT: "/tmp/open-design/ipc/parent.sock",
          OD_SIDECAR_RESOURCES: JSON.stringify({ dataRoot: "/wrong" }),
          OD_TEST_SIDECAR_ENV_CAPTURE: capturePath,
        },
        resources: { dataRoot: "/tmp/open-design-child", ownerPid: null, port: 0, runtimeRoot: "/tmp/open-design-child-runtime" },
        stamp: childStamp,
      });
      let captured: { argv: string[]; endpoint: string | null; resources: string | null } | null = null;
      for (let attempt = 0; attempt < 50 && captured == null; attempt += 1) {
        captured = await readFile(capturePath, "utf8").then((value) => JSON.parse(value)).catch(() => null);
        if (captured == null) await new Promise((resolveWait) => setTimeout(resolveWait, 20));
      }
      expect(captured?.endpoint).toBeNull();
      expect(captured?.resources).toBeNull();
      for (const flag of Object.values(SIDECAR_STAMP_FLAGS)) {
        expect(captured?.argv.some((argument) => argument.startsWith(`${flag}=`))).toBe(false);
      }
    } finally {
      await stopSidecar(childStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  });

  it("keeps distribution channels isolated and force-stops only an exact argv stamp", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const stable = { ...stamp, channel: "stable", namespace: `isolation-${process.pid}` };
    const beta = { ...stable, channel: "beta" };
    await launchSidecar({
      args: [fixture],
      command: process.execPath,
      resources: { dataRoot: "/tmp/open-design-stable", ownerPid: null, port: 0, runtimeRoot: "/tmp/open-design-stable-runtime" },
      stamp: stable,
    });
    await launchSidecar({
      args: [fixture],
      command: process.execPath,
      resources: { dataRoot: "/tmp/open-design-beta", ownerPid: null, port: 0, runtimeRoot: "/tmp/open-design-beta-runtime" },
      stamp: beta,
    });

    try {
      await expect(findSidecarProcesses(stable)).resolves.toHaveLength(1);
      await expect(findSidecarProcesses(beta)).resolves.toHaveLength(1);
      const result = await stopSidecar(stable, { killGraceMs: 2_000, termGraceMs: 0 });
      expect(result.remainingPids).toEqual([]);
      expect(result.gracefulAccepted).toBe(false);
      await vi.waitFor(async () => {
        await expect(findSidecarProcesses(stable)).resolves.toEqual([]);
      });
      await expect(findSidecarProcesses(beta)).resolves.toHaveLength(1);
    } finally {
      await stopSidecar(stable, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(beta, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, process.platform === "win32" ? 20_000 : 10_000);

  it("removes an unresponsive generation and its stale private endpoint", async () => {
    if (process.platform === "win32") return;
    const fixture = fileURLToPath(new URL("./fixtures/unresponsive-sidecar.ts", import.meta.url));
    const staleStamp = { ...stamp, app: "web", namespace: `stale-endpoint-${process.pid}` };
    const endpoint = resolvePrivateIpcPath(staleStamp);
    await launchSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_STALE_ENDPOINT: endpoint },
      resources: { dataRoot: "/tmp/open-design-stale", ownerPid: null, port: 0, runtimeRoot: "/tmp/open-design-stale-runtime" },
      stamp: staleStamp,
    });

    try {
      await vi.waitFor(async () => {
        expect((await lstat(endpoint)).isSocket()).toBe(true);
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      const result = await stopSidecar(staleStamp, { killGraceMs: 2_000, termGraceMs: 0 });
      expect(result.remainingPids).toEqual([]);
      await expect(lstat(endpoint)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await stopSidecar(staleStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, 20_000);

  it("sends SIGTERM before waiting when graceful IPC is not accepted", async () => {
    if (process.platform === "win32") return;
    const fixture = fileURLToPath(new URL("./fixtures/term-responsive-sidecar.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-term-fallback-"));
    const termStamp = { ...stamp, app: "web", namespace: `term-fallback-${process.pid}` };
    const endpoint = resolvePrivateIpcPath(termStamp);
    const marker = join(root, "term.marker");
    const spawned = await spawnSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_STALE_ENDPOINT: endpoint, OD_TEST_TERM_MARKER: marker },
      resources: { dataRoot: join(root, "data"), ownerPid: null, port: 0, runtimeRoot: join(root, "runtime") },
      stamp: termStamp,
    });

    try {
      await vi.waitFor(
        async () => expect((await lstat(endpoint)).isSocket()).toBe(true),
        { timeout: FIXTURE_READY_TIMEOUT_MS },
      );
      const result = await spawned.stop({ killGraceMs: 2_000, termGraceMs: 2_000 });
      expect(result).toMatchObject({ forcedPids: [], gracefulAccepted: false, remainingPids: [] });
      await expect(readFile(marker, "utf8")).resolves.toBe("SIGTERM");
    } finally {
      await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(termStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, 20_000);

  it("lets an owned generation handle retire its stale endpoint without discovering a replacement", async () => {
    if (process.platform === "win32") return;
    const fixture = fileURLToPath(new URL("./fixtures/unresponsive-sidecar.ts", import.meta.url));
    const ownedStamp = { ...stamp, app: "web", namespace: `owned-endpoint-${process.pid}` };
    const endpoint = resolvePrivateIpcPath(ownedStamp);
    const spawned = await spawnSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_STALE_ENDPOINT: endpoint },
      resources: {
        dataRoot: "/tmp/open-design-owned-endpoint",
        ownerPid: null,
        port: 0,
        runtimeRoot: "/tmp/open-design-owned-endpoint-runtime",
      },
      stamp: ownedStamp,
    });

    try {
      await vi.waitFor(
        async () => expect((await lstat(endpoint)).isSocket()).toBe(true),
        { timeout: FIXTURE_READY_TIMEOUT_MS },
      );
      const result = await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 });
      expect(result).toMatchObject({ remainingPids: [], staleEndpointRemoved: true });
      await expect(lstat(endpoint)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(ownedStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, 20_000);

  it("removes a refused stale endpoint after its stamped generation is already gone", async () => {
    if (process.platform === "win32") return;
    const fixture = fileURLToPath(new URL("./fixtures/unresponsive-sidecar.ts", import.meta.url));
    const staleStamp = { ...stamp, app: "web", namespace: `stale-only-${process.pid}` };
    const endpoint = resolvePrivateIpcPath(staleStamp);
    const launched = await launchSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_STALE_ENDPOINT: endpoint },
      resources: { dataRoot: "/tmp/open-design-stale-only", ownerPid: null, port: 0, runtimeRoot: "/tmp/open-design-stale-only-runtime" },
      stamp: staleStamp,
    });

    try {
      await vi.waitFor(
        async () => expect((await lstat(endpoint)).isSocket()).toBe(true),
        { timeout: FIXTURE_READY_TIMEOUT_MS },
      );
      const generationPids = collectProcessTreePids(await captureProcessSnapshot(), [launched.pid]);
      for (const pid of generationPids) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
      await Promise.all(generationPids.map(async (pid) => await waitForProcessExit(pid, 2_000)));
      await expect(findSidecarProcesses(staleStamp)).resolves.toEqual([]);

      const result = await stopSidecar(staleStamp, { killGraceMs: 2_000, termGraceMs: 0 });
      expect(result).toMatchObject({ alreadyStopped: true, staleEndpointRemoved: true });
      await expect(lstat(endpoint)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await stopSidecar(staleStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, 20_000);

  it("force-stops an unresponsive target after its declared owner dies", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/unresponsive-sidecar.ts", import.meta.url));
    const owner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    if (owner.pid == null) throw new Error("owner fixture has no pid");
    const ownerStamp = { ...stamp, app: "web", namespace: `owner-death-${process.pid}` };
    const endpoint = resolvePrivateIpcPath(ownerStamp);
    const spawned = await spawnSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_STALE_ENDPOINT: endpoint },
      resources: { dataRoot: "/tmp/open-design-owner-death", ownerPid: owner.pid, port: 0, runtimeRoot: "/tmp/open-design-owner-death-runtime" },
      stamp: ownerStamp,
    });
    let generationPids: number[] = [];
    try {
      await vi.waitFor(async () => {
        expect((await findSidecarProcesses(ownerStamp)).map(({ pid }) => pid)).toContain(spawned.process.pid);
        generationPids = collectProcessTreePids(await captureProcessSnapshot(), [spawned.process.pid]);
        expect(generationPids.length).toBeGreaterThan(1);
      }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });
      owner.kill("SIGKILL");
      await expect(waitForProcessExit(spawned.process.pid, 9_000)).resolves.toBe(true);
      await Promise.all(generationPids.map(async (pid) => {
        await expect(waitForProcessExit(pid, 2_000)).resolves.toBe(true);
      }));
    } finally {
      try { owner.kill("SIGKILL"); } catch {}
      for (const pid of generationPids) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
      await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(ownerStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, process.platform === "win32" ? 30_000 : 15_000);

  it("stops an ownerless target after it requests a visible argv rewrite", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/renamed-child.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-owner-renamed-"));
    const readyPath = join(root, "ready.json");
    const owner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    if (owner.pid == null) throw new Error("owner fixture has no pid");
    const ownerStamp = { ...stamp, app: "web", namespace: `owner-renamed-${process.pid}` };
    const spawned = await spawnSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_SIDECAR_READY: readyPath },
      resources: {
        dataRoot: join(root, "data"),
        ownerPid: owner.pid,
        port: 0,
        runtimeRoot: join(root, "runtime"),
      },
      stamp: ownerStamp,
    });
    let runtimePid: number | null = null;
    try {
      await vi.waitFor(async () => {
        const ready = await readFile(readyPath, "utf8").then((value) => JSON.parse(value)).catch(() => null);
        runtimePid = Number(ready?.runtimePid);
        expect(ready?.generationPid).toBe(spawned.process.pid);
        expect(runtimePid).toBeGreaterThan(0);
        const runtime = (await captureProcessSnapshot()).find(({ pid }) => pid === runtimePid);
        // Win32_Process.CommandLine is the immutable launch command even after
        // Node updates process.title; Unix process listings expose that update.
        expect(runtime?.command).toContain(process.platform === "win32" ? "renamed-child.ts" : "next-server");
      }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });
      const renamedRuntimePid = runtimePid;
      if (renamedRuntimePid == null) throw new Error("renamed target did not report its pid");

      owner.kill("SIGKILL");

      await expect(waitForProcessExit(spawned.process.pid, 9_000)).resolves.toBe(true);
      await expect(waitForProcessExit(renamedRuntimePid, 2_000)).resolves.toBe(true);
    } finally {
      try { owner.kill("SIGKILL"); } catch {}
      if (runtimePid != null) {
        try { process.kill(runtimePid, "SIGKILL"); } catch {}
      }
      await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(ownerStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, process.platform === "win32" ? 30_000 : 15_000);

  it.skipIf(process.platform === "win32")(
    "bounds retirement of a frozen runtime with rewritten argv",
    async () => {
      const fixture = fileURLToPath(new URL("./fixtures/managed-child.ts", import.meta.url));
      const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-frozen-"));
      const frozenStamp = { ...stamp, app: "web", namespace: `frozen-runtime-${process.pid}` };
      const spawned = await spawnSidecar({
        args: ["--import", "tsx", fixture],
        command: process.execPath,
        env: { ...process.env, OD_TEST_RENAME_RUNTIME: "1" },
        resources: {
          dataRoot: join(root, "data"),
          ownerPid: null,
          port: 0,
          runtimeRoot: join(root, "runtime"),
        },
        stamp: frozenStamp,
      });
      let runtimePid: number | null = null;
      try {
        await vi.waitFor(async () => {
          await expect(getSidecarStatus(frozenStamp)).resolves.toMatchObject({ pid: spawned.process.pid });
          runtimePid = (await captureProcessSnapshot())
            .find(({ ppid }) => ppid === spawned.process.pid)?.pid ?? null;
          expect(runtimePid).toBeGreaterThan(0);
        }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });
        const frozenRuntimePid = runtimePid;
        if (frozenRuntimePid == null) throw new Error("managed runtime was not discovered");
        process.kill(frozenRuntimePid, "SIGSTOP");

        const startedAt = Date.now();
        const stopped = await stopSidecar(frozenStamp, {
          gracefulRequestTimeoutMs: 300,
          killGraceMs: 750,
          termGraceMs: 300,
        });

        expect(Date.now() - startedAt).toBeLessThan(6_000);
        expect(stopped.remainingPids).toEqual([]);
        expect(stopped.stoppedPids).toEqual(expect.arrayContaining([spawned.process.pid, frozenRuntimePid]));
        await expect(waitForProcessExit(spawned.process.pid, 1_000)).resolves.toBe(true);
        await expect(waitForProcessExit(frozenRuntimePid, 1_000)).resolves.toBe(true);
      } finally {
        if (runtimePid != null) {
          try { process.kill(runtimePid, "SIGCONT"); } catch {}
          try { process.kill(runtimePid, "SIGKILL"); } catch {}
        }
        await spawned.stop({ killGraceMs: 750, termGraceMs: 0 }).catch(() => undefined);
        await stopSidecar(frozenStamp, { killGraceMs: 750, termGraceMs: 0 }).catch(() => undefined);
        await rm(root, { force: true, recursive: true });
      }
    },
    15_000,
  );

  it("quick-fails a managed target when its supervisor disappears", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/managed-child.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-supervisor-death-"));
    const supervisedStamp = { ...stamp, namespace: `supervisor-death-${process.pid}` };
    const spawned = await spawnSidecar({
      args: ["--import", "tsx", fixture],
      command: process.execPath,
      resources: {
        dataRoot: join(root, "data"),
        ownerPid: null,
        port: 0,
        runtimeRoot: join(root, "runtime"),
      },
      stamp: supervisedStamp,
    });
    let runtimePid: number | null = null;
    try {
      await vi.waitFor(async () => {
        const status = await getSidecarStatus<{ pid: number; port: number }>(supervisedStamp);
        expect(status.pid).toBe(spawned.process.pid);
        expect(status.port).toBeGreaterThan(0);
        runtimePid = (await captureProcessSnapshot())
          .find(({ ppid }) => ppid === spawned.process.pid)?.pid ?? null;
        expect(runtimePid).toBeGreaterThan(0);
      }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });
      const managedRuntimePid = runtimePid;
      if (managedRuntimePid == null) throw new Error("managed target was not discovered");

      process.kill(spawned.process.pid, "SIGKILL");

      await expect(waitForProcessExit(spawned.process.pid, 2_000)).resolves.toBe(true);
      await expect(waitForProcessExit(managedRuntimePid, 4_000)).resolves.toBe(true);
    } finally {
      if (runtimePid != null) {
        try { process.kill(runtimePid, "SIGKILL"); } catch {}
      }
      try { process.kill(spawned.process.pid, "SIGKILL"); } catch {}
      await stopSidecar(supervisedStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, process.platform === "win32" ? 30_000 : 15_000);

  it("retires fenced descendants when an ownerless target exits on SIGTERM", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/orphaning-sidecar.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-owner-orphan-"));
    const readyPath = join(root, "ready.json");
    const owner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    if (owner.pid == null) throw new Error("owner fixture has no pid");
    const ownerStamp = { ...stamp, app: "web", namespace: `owner-orphan-${process.pid}` };
    const spawned = await spawnSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_ORPHAN_READY: readyPath },
      resources: { dataRoot: join(root, "data"), ownerPid: owner.pid, port: 0, runtimeRoot: join(root, "runtime") },
      stamp: ownerStamp,
    });
    let descendantPid: number | null = null;
    try {
      await vi.waitFor(async () => {
        const ready = await readFile(readyPath, "utf8").then((value) => JSON.parse(value)).catch(() => null);
        descendantPid = Number(ready?.pid);
        expect(descendantPid).toBeGreaterThan(0);
        expect(collectProcessTreePids(await captureProcessSnapshot(), [spawned.process.pid])).toContain(descendantPid);
      }, { interval: 100, timeout: process.platform === "win32" ? 15_000 : 5_000 });
      const fencedDescendantPid = descendantPid;
      if (fencedDescendantPid == null) throw new Error("orphan fixture did not report its descendant");

      owner.kill("SIGKILL");
      await expect(waitForProcessExit(spawned.process.pid, 9_000)).resolves.toBe(true);
      await expect(waitForProcessExit(fencedDescendantPid, 2_000)).resolves.toBe(true);
    } finally {
      try { owner.kill("SIGKILL"); } catch {}
      if (descendantPid != null) {
        try { process.kill(descendantPid, "SIGKILL"); } catch {}
      }
      await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(ownerStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, process.platform === "win32" ? 30_000 : 15_000);

  it("force-stops fenced descendants when the supervisor root exits during retirement", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const orphanStamp = { ...stamp, namespace: `orphan-retirement-${process.pid}` };
    const spawned = await spawnSidecar({
      args: [fixture],
      command: process.execPath,
      resources: {
        dataRoot: "/tmp/open-design-orphan-retirement",
        ownerPid: null,
        port: 0,
        runtimeRoot: "/tmp/open-design-orphan-retirement-runtime",
      },
      stamp: orphanStamp,
    });
    let generationPids: number[] = [];
    try {
      let snapshots = await captureProcessSnapshot();
      await vi.waitFor(async () => {
        snapshots = await captureProcessSnapshot();
        generationPids = collectProcessTreePids(snapshots, [spawned.process.pid]);
        expect(generationPids.length).toBeGreaterThan(1);
      }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });

      const stopping = retireSidecarGeneration(
        sidecarGenerationRef(orphanStamp, spawned.process.pid),
        { killGraceMs: 2_000, termGraceMs: 500 },
        snapshots,
      );
      process.kill(spawned.process.pid, "SIGKILL");
      await expect(waitForProcessExit(spawned.process.pid, 2_000)).resolves.toBe(true);

      const result = await stopping;
      expect(result.remainingPids).toEqual([]);
      await Promise.all(generationPids.map(async (pid) => {
        await expect(waitForProcessExit(pid, 2_000)).resolves.toBe(true);
      }));
    } finally {
      for (const pid of generationPids) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
      await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
      await stopSidecar(orphanStamp, { killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined);
    }
  }, process.platform === "win32" ? 20_000 : 10_000);

  it("does not let an earlier stop terminate a replacement with the same stamp", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const replacementStamp = { ...stamp, namespace: `replacement-${process.pid}` };
    const resources = {
      dataRoot: "/tmp/open-design-replacement",
      ownerPid: null,
      port: 0,
      runtimeRoot: "/tmp/open-design-replacement-runtime",
    };
    const old = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: replacementStamp });
    const oldPid = old.process.pid;
    let replacement: Awaited<ReturnType<typeof spawnSidecar>> | null = null;
    try {
      await vi.waitFor(async () => {
        expect((await findSidecarProcesses(replacementStamp)).map(({ pid }) => pid)).toContain(oldPid);
      }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });
      const stopping = old.stop({ killGraceMs: 2_000, termGraceMs: 300 });
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      replacement = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: replacementStamp });
      await vi.waitFor(async () => {
        expect((await findSidecarProcesses(replacementStamp)).map(({ pid }) => pid)).toContain(replacement?.process.pid);
      }, { interval: 100, timeout: FIXTURE_READY_TIMEOUT_MS });

      const result = await stopping;
      expect(result.matchedPids).toContain(oldPid);
      expect(result.matchedPids).not.toContain(replacement.process.pid);
      expect(result.forcedPids).not.toContain(replacement.process.pid);
      expect((await findSidecarProcesses(replacementStamp)).map(({ pid }) => pid)).toContain(replacement.process.pid);
    } finally {
      await Promise.all([
        old.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
        replacement?.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
      ]);
    }
  }, 10_000);

  it("quick-fails stamp-only recovery when multiple generation roots are ambiguous", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const ambiguousStamp = { ...stamp, namespace: `ambiguous-${process.pid}` };
    const resources = {
      dataRoot: "/tmp/open-design-ambiguous",
      ownerPid: null,
      port: 0,
      runtimeRoot: "/tmp/open-design-ambiguous-runtime",
    };
    const first = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: ambiguousStamp });
    const second = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: ambiguousStamp });
    const firstPid = first.process.pid;
    const secondPid = second.process.pid;
    let budgetTimer: NodeJS.Timeout | null = null;
    let stopping: Promise<unknown> | null = null;
    try {
      await vi.waitFor(async () => {
        expect((await findSidecarProcesses(ambiguousStamp)).map(({ pid }) => pid).sort())
          .toEqual([firstPid, secondPid].sort());
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      stopping = stopSidecar(ambiguousStamp, { termGraceMs: 0 });
      const boundedStop = Promise.race([
        stopping,
        new Promise<never>((_resolve, reject) => {
          budgetTimer = setTimeout(() => reject(new Error("ambiguous generation observation exceeded 4900ms")), 4_900);
        }),
      ]);
      await expect(boundedStop)
        .rejects.toThrow("multiple stamped generation roots");
      expect((await findSidecarProcesses(ambiguousStamp)).map(({ pid }) => pid).sort())
        .toEqual([firstPid, secondPid].sort());
    } finally {
      if (budgetTimer != null) clearTimeout(budgetTimer);
      await Promise.all([
        first.stop({ killGraceMs: 2_000, termGraceMs: 0 }),
        second.stop({ killGraceMs: 2_000, termGraceMs: 0 }),
      ]);
      await stopping?.catch(() => undefined);
    }
  }, 15_000);

  it("retires a multi-resource lifecycle set at one declared boundary", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const namespace = `resource-set-${process.pid}`;
    const resources = {
      dataRoot: "/tmp/open-design-resource-set",
      ownerPid: null,
      port: 0,
      runtimeRoot: "/tmp/open-design-resource-set-runtime",
    };
    const daemonStamp = { ...stamp, namespace };
    const webStamp = { ...stamp, app: "web", namespace };
    const daemon = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: daemonStamp });
    const web = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: webStamp });
    try {
      await vi.waitFor(async () => {
        await expect(findSidecarProcesses(daemonStamp)).resolves.toHaveLength(1);
        await expect(findSidecarProcesses(webStamp)).resolves.toHaveLength(1);
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });

      const result = await stopSidecars([
        { stamp: daemonStamp },
        { stamp: webStamp },
      ]);

      expect(result.remainingPids).toEqual([]);
      expect(result.stoppedPids).toEqual(expect.arrayContaining([daemon.process.pid, web.process.pid]));
      expect(result.results.map(({ stamp: stoppedStamp }) => stoppedStamp.app)).toEqual(["daemon", "web"]);
    } finally {
      await Promise.all([
        daemon.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
        web.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
      ]);
    }
  }, 15_000);

  it("re-observes a transient second root before mutating the surviving generation", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url));
    const transientStamp = { ...stamp, namespace: `transient-root-${process.pid}` };
    const resources = {
      dataRoot: "/tmp/open-design-transient-root",
      ownerPid: null,
      port: 0,
      runtimeRoot: "/tmp/open-design-transient-root-runtime",
    };
    const first = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: transientStamp });
    const second = await spawnSidecar({ args: [fixture], command: process.execPath, resources, stamp: transientStamp });
    let retireSecond: Promise<unknown> = Promise.resolve();
    try {
      await vi.waitFor(async () => {
        await expect(findSidecarProcesses(transientStamp)).resolves.toHaveLength(2);
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      setTimeout(() => {
        retireSecond = second.stop({ killGraceMs: 2_000, termGraceMs: 0 });
      }, 100);

      const result = await stopSidecar(transientStamp, { killGraceMs: 2_000, termGraceMs: 0 });
      expect(result.matchedPids).toContain(first.process.pid);
      expect(result.matchedPids).not.toContain(second.process.pid);
      await retireSecond;
      await expect(findSidecarProcesses(transientStamp)).resolves.toEqual([]);
    } finally {
      await Promise.all([
        first.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
        second.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
      ]);
    }
  }, 10_000);

  it("stops its spawned generation after the process hides its argv stamp", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/renamed-child.ts", import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-renamed-"));
    const readyPath = join(root, "ready");
    const renamedStamp = { ...stamp, namespace: `renamed-${process.pid}` };
    const resources = {
      dataRoot: join(root, "data"),
      ownerPid: null,
      port: 0,
      runtimeRoot: join(root, "runtime"),
    };
    const spawned = await spawnSidecar({
      args: [fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_SIDECAR_READY: readyPath },
      resources,
      stamp: renamedStamp,
    });
    let replacement: Awaited<ReturnType<typeof spawnSidecar>> | null = null;

    try {
      let ready!: { generationPid: number; runtimePid: number };
      await vi.waitFor(async () => {
        ready = JSON.parse(await readFile(readyPath, "utf8"));
        expect(ready.generationPid).toBe(spawned.process.pid);
        expect(ready.runtimePid).not.toBe(spawned.process.pid);
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });
      await expect(findSidecarProcesses(renamedStamp)).resolves.toEqual([
        expect.objectContaining({ pid: spawned.process.pid }),
      ]);
      replacement = await spawnSidecar({
        args: [fileURLToPath(new URL("./fixtures/stamped-child.ts", import.meta.url))],
        command: process.execPath,
        resources,
        stamp: renamedStamp,
      });
      await vi.waitFor(async () => {
        expect((await findSidecarProcesses(renamedStamp)).map(({ pid }) => pid)).toContain(replacement?.process.pid);
      }, { timeout: FIXTURE_READY_TIMEOUT_MS });

      const result = await spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 });

      expect(result.alreadyStopped).toBe(false);
      expect(result.matchedPids).toContain(spawned.process.pid);
      expect(result.matchedPids).not.toContain(replacement.process.pid);
      await expect(waitForProcessExit(spawned.process.pid, 2_000)).resolves.toBe(true);
      expect((await findSidecarProcesses(renamedStamp)).map(({ pid }) => pid)).toContain(replacement.process.pid);
    } finally {
      await Promise.all([
        spawned.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
        replacement?.stop({ killGraceMs: 2_000, termGraceMs: 0 }).catch(() => undefined),
      ]);
      await rm(root, { force: true, recursive: true });
    }
  }, 20_000);
});
