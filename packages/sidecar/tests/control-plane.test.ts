import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as publicControl from "../src/control/index.js";
import {
  createPrivateLaunchForTest,
  installPrivateLaunchForTest,
  privateLaunchStateForTest,
  sendPrivateRequestForTest,
} from "../src/control/private-testing.js";
import { attachDemoBody } from "./fixtures/control-body.js";
import {
  createDemoController,
  demoProjection,
  type DemoMethods,
} from "./fixtures/control-controller.js";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-control-"));
  cleanups.push(() => rm(root, { force: true, recursive: true }));
  return {
    roots: {
      dataRoot: join(root, "data"),
      resourceRoot: join(root, "resources"),
      runtimeRoot: join(root, "runtime"),
    },
    scope: {
      channel: "beta",
      generation: 7,
      namespace: "release-beta",
    },
  } as const;
}

describe("sidecar control public boundary", () => {
  it("exports semantic control operations without raw transport or incarnation helpers", () => {
    expect(Object.keys(publicControl).sort()).toEqual([
      "SidecarControlError",
      "attachSidecar",
      "bootstrapControlPlane",
    ]);

    const publicNames = Object.keys(publicControl).join(" ").toLowerCase();
    expect(publicNames).not.toMatch(/endpoint|incarnation|ipc|process|stamp|transport/);
  });
});

describe("sidecar control identity", () => {
  it("keeps channel, namespace, generation and service independent", async () => {
    const { roots, scope } = await createFixture();
    const controller = createDemoController(scope, roots);

    expect(controller.scope).toEqual(scope);
    expect(controller.roots).toEqual(roots);
    expect(() =>
      createDemoController({ ...scope, channel: "release/beta" }, roots),
    ).toThrow(/channel/);
    expect(() =>
      createDemoController({ ...scope, namespace: "Beta Namespace" }, roots),
    ).toThrow(/namespace/);
    expect(() => createDemoController({ ...scope, generation: -1 }, roots)).toThrow(
      /generation/,
    );
  });
});

describe("independent sidecar controller and body", () => {
  it("exposes a caller-hosted semantic service through the same fenced control plane", async () => {
    const { roots, scope } = await createFixture();
    const controller = createDemoController(scope, roots);
    const hosted = await controller.expose<DemoMethods>({
      handlers: {
        context(_input, context) {
          return context;
        },
        echo(input) {
          return { value: `hosted:${input.value}` };
        },
      },
      service: "shell",
    });
    cleanups.push(() => hosted.close());

    const client = await controller.connect<DemoMethods>("shell");
    await expect(client.call("echo", { value: "capability" })).resolves.toEqual({
      value: "hosted:capability",
    });
    await expect(client.call("context", {})).resolves.toEqual({
      identity: { ...scope, service: "shell" },
      projection: demoProjection,
      roots,
    });

    await hosted.close();
    await expect(controller.connect("shell")).rejects.toThrow(/unavailable/);
  });

  it("initializes the body from validated roots before publishing readiness", async () => {
    const { roots, scope } = await createFixture();
    const launch = createPrivateLaunchForTest({
      projection: demoProjection,
      roots,
      scope,
      service: "web",
    });
    const restoreLaunch = installPrivateLaunchForTest(launch);
    cleanups.push(restoreLaunch);
    let initialized = false;
    const body = await publicControl.attachSidecar<DemoMethods>({
      handlers: {
        context(_input, context) {
          expect(initialized).toBe(true);
          return context;
        },
        echo(input) {
          expect(initialized).toBe(true);
          return { value: input.value };
        },
      },
      initialize(context) {
        expect(context).toEqual({
          identity: { ...scope, service: "web" },
          projection: demoProjection,
          roots,
        });
        initialized = true;
      },
    });
    cleanups.push(() => body.close());

    const client = await createDemoController(scope, roots).connect<DemoMethods>("web");
    await expect(client.call("echo", { value: "ready-after-body" })).resolves.toEqual({
      value: "ready-after-body",
    });
  });

  it("cleans up body startup when initialization fails", async () => {
    const { roots, scope } = await createFixture();
    const launch = createPrivateLaunchForTest({
      projection: demoProjection,
      roots,
      scope,
      service: "web",
    });
    const restoreLaunch = installPrivateLaunchForTest(launch);
    cleanups.push(restoreLaunch);
    let stopped = false;

    await expect(publicControl.attachSidecar<DemoMethods>({
      handlers: {
        context(_input, context) {
          return context;
        },
        echo(input) {
          return { value: input.value };
        },
      },
      initialize() {
        throw new Error("body startup failed");
      },
      onStopRequested() {
        stopped = true;
      },
    })).rejects.toThrow("body startup failed");

    expect(stopped).toBe(true);
    await expect(createDemoController(scope, roots).connect("web")).rejects.toThrow(
      /unavailable/,
    );
  });

  it("launches and stops a real body without exposing launch metadata to it", async () => {
    const { roots, scope } = await createFixture();
    const controller = createDemoController(scope, roots);
    const childEntry = join(import.meta.dirname, "fixtures", "control-child.ts");
    const launch = await controller.launch<DemoMethods>({
      args: ["--import", "tsx", childEntry],
      executable: process.execPath,
      readyTimeoutMs: 5_000,
      service: "daemon",
    });
    cleanups.push(async () => {
      await launch.stop();
    });

    await expect(launch.client.call("echo", { value: "real-child" })).resolves.toEqual({
      value: "real-child",
    });
    await expect(launch.client.call("context", {})).resolves.toEqual({
      identity: { ...scope, service: "daemon" },
      projection: demoProjection,
      roots,
    });
    await expect(launch.stop()).resolves.toMatchObject({ code: 0, signal: null });
    await expect(controller.connect("daemon")).rejects.toThrow(/unavailable/);
  });

  it("force-terminates an uncooperative body and converges its control state", async () => {
    const { roots, scope } = await createFixture();
    const controller = createDemoController(scope, roots);
    const childEntry = join(import.meta.dirname, "fixtures", "control-uncooperative-child.ts");
    const launch = await controller.launch<DemoMethods>({
      args: ["--import", "tsx", childEntry],
      executable: process.execPath,
      service: "daemon",
      stopTimeoutMs: 50,
    });
    cleanups.push(async () => {
      await launch.stop();
    });

    await expect(launch.stop()).resolves.toMatchObject({ code: null });
    await expect(controller.connect("daemon")).rejects.toThrow(/unavailable/);
    const privateState = await privateLaunchStateForTest(
      createPrivateLaunchForTest({
        projection: demoProjection,
        roots,
        scope,
        service: "daemon",
      }),
    );
    expect(privateState).toEqual({ descriptorExists: false, endpointExists: false });
  });

  it("does not replace a live peer when a duplicate launch loses endpoint ownership", async () => {
    const { roots, scope } = await createFixture();
    const controller = createDemoController(scope, roots);
    const childEntry = join(import.meta.dirname, "fixtures", "control-child.ts");
    const first = await controller.launch<DemoMethods>({
      args: ["--import", "tsx", childEntry],
      executable: process.execPath,
      service: "daemon",
    });
    cleanups.push(async () => {
      await first.stop();
    });

    await expect(
      controller.launch<DemoMethods>({
        args: ["--import", "tsx", childEntry],
        executable: process.execPath,
        readyTimeoutMs: 2_000,
        service: "daemon",
      }),
    ).rejects.toThrow(/exited before readiness/);
    await expect(first.client.call("echo", { value: "still-owner" })).resolves.toEqual({
      value: "still-owner",
    });
  });

  it("agree on normalized identity, roots and caller-owned methods", async () => {
    const { roots, scope } = await createFixture();
    const launch = createPrivateLaunchForTest({
      projection: demoProjection,
      roots,
      scope,
      service: "daemon",
    });
    const restoreLaunch = installPrivateLaunchForTest(launch);
    cleanups.push(restoreLaunch);
    let observedContext: unknown = null;
    const body = await attachDemoBody((context) => {
      observedContext = context;
    });
    cleanups.push(() => body.close());

    const controller = createDemoController(scope, roots);
    const client = await controller.connect<DemoMethods>("daemon");

    await expect(client.probe()).resolves.toEqual({
      identity: { ...scope, service: "daemon" },
      projection: demoProjection,
    });
    await expect(client.call("echo", { value: "江湖" })).resolves.toEqual({
      value: "江湖",
    });
    expect(observedContext).toEqual({
      identity: { ...scope, service: "daemon" },
      projection: demoProjection,
      roots,
    });
  });

  it("fences a delayed client after a same-generation restart", async () => {
    const { roots, scope } = await createFixture();
    const controller = createDemoController(scope, roots);

    const firstLaunch = createPrivateLaunchForTest({
      projection: demoProjection,
      roots,
      scope,
      service: "web",
    });
    const restoreFirst = installPrivateLaunchForTest(firstLaunch);
    const firstBody = await attachDemoBody(() => undefined);
    const staleClient = await controller.connect<DemoMethods>("web");
    await firstBody.close();
    restoreFirst();

    const secondLaunch = createPrivateLaunchForTest({
      projection: demoProjection,
      roots,
      scope,
      service: "web",
    });
    expect(secondLaunch.identity).toEqual(firstLaunch.identity);
    expect(secondLaunch.incarnation).not.toBe(firstLaunch.incarnation);
    const restoreSecond = installPrivateLaunchForTest(secondLaunch);
    cleanups.push(restoreSecond);
    const secondBody = await attachDemoBody(() => undefined);
    cleanups.push(() => secondBody.close());

    await expect(staleClient.call("echo", { value: "late" })).rejects.toThrow(
      /stale sidecar peer/,
    );

    const currentClient = await controller.connect<DemoMethods>("web");
    await expect(currentClient.call("echo", { value: "current" })).resolves.toEqual({
      value: "current",
    });
  });

  it("does not let a wrong scope satisfy or stop the requested peer", async () => {
    const { roots, scope } = await createFixture();
    const launch = createPrivateLaunchForTest({
      projection: demoProjection,
      roots,
      scope,
      service: "daemon",
    });
    const restoreLaunch = installPrivateLaunchForTest(launch);
    cleanups.push(restoreLaunch);
    const body = await attachDemoBody(() => undefined);
    cleanups.push(() => body.close());

    const wrongChannel = createDemoController({ ...scope, channel: "stable" }, roots);
    const wrongNamespace = createDemoController({ ...scope, namespace: "release-stable" }, roots);
    const wrongGeneration = createDemoController({ ...scope, generation: 8 }, roots);

    await expect(wrongChannel.connect("daemon")).rejects.toThrow(/unavailable/);
    await expect(wrongNamespace.connect("daemon")).rejects.toThrow(/unavailable/);
    await expect(wrongGeneration.requestStop("daemon")).rejects.toThrow(/unavailable/);

    for (const identity of [
      { ...launch.identity, channel: "stable" },
      { ...launch.identity, namespace: "release-stable" },
      { ...launch.identity, generation: 8 },
    ]) {
      await expect(
        sendPrivateRequestForTest(launch, {
          identity,
          operation: { kind: "request-stop" },
        }),
      ).resolves.toMatchObject({
        error: { code: "peer-mismatch" },
        status: "error",
      });
    }

    const currentClient = await createDemoController(scope, roots).connect<DemoMethods>("daemon");
    await expect(currentClient.call("echo", { value: "still-running" })).resolves.toEqual({
      value: "still-running",
    });
  });

  it("does not attach a controller with a different caller-owned projection", async () => {
    const { roots, scope } = await createFixture();
    const launch = createPrivateLaunchForTest({
      projection: demoProjection,
      roots,
      scope,
      service: "daemon",
    });
    const restoreLaunch = installPrivateLaunchForTest(launch);
    cleanups.push(restoreLaunch);
    const body = await attachDemoBody(() => undefined);
    cleanups.push(() => body.close());

    const value = { releaseVersion: "0.18.0-beta.5" } as const;
    const wrongProjection = {
      digest: `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}` as const,
      value,
    };
    const wrongController = publicControl.bootstrapControlPlane({
      projection: wrongProjection,
      roots,
      scope,
    });

    await expect(wrongController.connect("daemon")).rejects.toThrow(/unavailable/);
    await expect(createDemoController(scope, roots).connect("daemon")).resolves.toBeDefined();
  });
});
