import { describe, expect, it, vi } from "vitest";

import {
  acquireStandalone,
  type StandaloneDependencies,
  type StandalonePaths,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeStatus,
} from "../src/index.js";

type TestStatus = StandaloneRuntimeStatus & { pid: number };

const paths: StandalonePaths = {
  cacheRoot: "/channel/namespaces/release-beta/cache",
  dataRoot: "/channel/namespaces/release-beta/data",
  installationRoot: "/channel",
  logsRoot: "/channel/namespaces/release-beta/logs",
  resourceRoot: "/closure/resources",
  runtimeRoot: "/channel/namespaces/release-beta/run",
};

function runtime(
  status: TestStatus,
  close: () => Promise<void>,
): StandaloneRuntimeHandle<TestStatus> {
  return {
    close,
    readStatus: async () => status,
    status,
  };
}

function fixture(options: { failWeb?: boolean } = {}) {
  const events: string[] = [];
  const daemonStatus: TestStatus = {
    pid: 100,
    state: "running",
    url: "http://127.0.0.1:4100",
  };
  const webStatus: TestStatus = {
    pid: 200,
    state: "running",
    url: "http://127.0.0.1:4200",
  };
  const dependencies: StandaloneDependencies<TestStatus, TestStatus> = {
    onDiagnostic: (value) => events.push(`phase:${value.phase}`),
    preparePaths: vi.fn(async (received) => {
      events.push("prepare");
      expect(received).toEqual(paths);
    }),
    registerWebUrl: vi.fn(async ({ daemon, webUrl }) => {
      events.push(`register:${daemon.pid}:${webUrl}`);
    }),
    startDaemon: vi.fn(async ({ namespace, paths: received }) => {
      events.push(`daemon:start:${namespace}`);
      expect(received).toEqual(paths);
      return runtime(daemonStatus, async () => {
        events.push("daemon:close");
      });
    }),
    startWeb: vi.fn(async ({ daemon, namespace, paths: received }) => {
      events.push(`web:start:${namespace}:${daemon.pid}`);
      expect(received).toEqual(paths);
      if (options.failWeb === true) throw new Error("web boot failed");
      return runtime(webStatus, async () => {
        events.push("web:close");
      });
    }),
  };
  return { daemonStatus, dependencies, events, webStatus };
}

describe("acquireStandalone", () => {
  it("owns ordered Web + daemon readiness and preserves launcher paths", async () => {
    const { dependencies, events } = fixture();

    const closure = await acquireStandalone({
      dependencies,
      namespace: "release-beta",
      paths,
    });

    expect(closure.webUrl).toBe("http://127.0.0.1:4200");
    expect(closure.paths).toEqual(paths);
    expect(closure.diagnostic()).toMatchObject({
      daemonUrl: "http://127.0.0.1:4100",
      error: null,
      namespace: "release-beta",
      phase: "running",
      webUrl: "http://127.0.0.1:4200",
    });
    expect(events).toEqual([
      "phase:preparing",
      "prepare",
      "phase:daemon-starting",
      "daemon:start:release-beta",
      "phase:daemon-ready",
      "phase:web-starting",
      "web:start:release-beta:100",
      "register:100:http://127.0.0.1:4200",
      "phase:web-ready",
      "phase:running",
    ]);
  });

  it("reports product health for both runtimes", async () => {
    const { daemonStatus, dependencies, webStatus } = fixture();
    const closure = await acquireStandalone({
      dependencies,
      namespace: "release-beta",
      paths,
    });

    await expect(closure.health()).resolves.toEqual({
      daemon: daemonStatus,
      issues: [],
      namespace: "release-beta",
      state: "healthy",
      web: webStatus,
    });
  });

  it("converges started children when Web startup fails", async () => {
    const { dependencies, events } = fixture({ failWeb: true });

    await expect(acquireStandalone({
      dependencies,
      namespace: "release-beta",
      paths,
    })).rejects.toThrow("web boot failed");

    expect(events.slice(-2)).toEqual(["daemon:close", "phase:failed"]);
  });

  it("closes Web and daemon when readiness publication fails", async () => {
    const { dependencies, events } = fixture();
    dependencies.registerWebUrl = vi.fn(async () => {
      throw new Error("registration failed");
    });

    await expect(acquireStandalone({
      dependencies,
      namespace: "release-beta",
      paths,
    })).rejects.toThrow("registration failed");

    expect(events.slice(-3)).toEqual([
      "web:close",
      "daemon:close",
      "phase:failed",
    ]);
  });

  it("reports a degraded product when either runtime loses health", async () => {
    const { dependencies } = fixture();
    dependencies.startWeb = vi.fn(async () => ({
      close: async () => undefined,
      readStatus: async () => {
        throw new Error("web status unavailable");
      },
      status: {
        pid: 200,
        state: "running",
        url: "http://127.0.0.1:4200",
      },
    }));
    const closure = await acquireStandalone({
      dependencies,
      namespace: "release-beta",
      paths,
    });

    await expect(closure.health()).resolves.toMatchObject({
      issues: ["web: web status unavailable"],
      state: "degraded",
      web: null,
    });
  });

  it("closes Web before daemon and makes shutdown idempotent", async () => {
    const { dependencies, events } = fixture();
    const closure = await acquireStandalone({
      dependencies,
      namespace: "release-beta",
      paths,
    });

    await Promise.all([closure.close(), closure.close()]);

    expect(events.slice(-4)).toEqual([
      "phase:stopping",
      "web:close",
      "daemon:close",
      "phase:stopped",
    ]);
    await expect(closure.health()).resolves.toMatchObject({ state: "stopped" });
  });

  it("still closes daemon when Web shutdown fails", async () => {
    const { dependencies, events } = fixture();
    dependencies.startWeb = vi.fn(async () => runtime(
      { pid: 200, state: "running", url: "http://127.0.0.1:4200" },
      async () => {
        events.push("web:close");
        throw new Error("web close failed");
      },
    ));
    const closure = await acquireStandalone({
      dependencies,
      namespace: "release-beta",
      paths,
    });

    await expect(closure.close()).rejects.toThrow(
      "failed to stop every standalone runtime",
    );
    expect(events).toContain("daemon:close");
    expect(closure.diagnostic()).toMatchObject({ phase: "failed" });
  });
});
