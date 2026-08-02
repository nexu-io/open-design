import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  normalizeJsonIpcMaxFrameBytes,
  requestJsonIpc,
  createSidecarLaunchEnv,
  resolveAppIpcPath,
  resolveAppRuntimePath,
  resolveLogFilePath,
  resolveNamespace,
  resolveNamespaceRoot,
  resolveRuntimeNamespaceRoot,
  resolveSidecarBase,
  resolveSourceRuntimeRoot,
  writeJsonFile,
  type SidecarContractDescriptor,
  type SidecarStampShape,
} from "../src/index.js";

async function listen(server: ReturnType<typeof createServer>, socketPath: string): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(socketPath, resolveListen);
  });
}

type FakeStamp = SidecarStampShape & {
  app: "api" | "ui";
  mode: "dev" | "prod";
  source: "tool" | "pack";
};

const fakeContract: SidecarContractDescriptor<FakeStamp> = {
  defaults: {
    host: "127.0.0.1",
    ipcBase: "/tmp/fake-product/ipc",
    namespace: "default",
    projectTmpDirName: ".fake-tmp",
    windowsPipePrefix: "fake-product",
  },
  env: {
    base: "FAKE_BASE",
    ipcBase: "FAKE_IPC_BASE",
    ipcPath: "FAKE_IPC_PATH",
    namespace: "FAKE_NAMESPACE",
    source: "FAKE_SOURCE",
  },
  normalizeApp(value) {
    if (value === "api" || value === "ui") return value;
    throw new Error(`unsupported fake app: ${String(value)}`);
  },
  normalizeNamespace(value) {
    if (typeof value !== "string" || !/^[a-z0-9-]+$/.test(value)) {
      throw new Error("invalid fake namespace");
    }
    return value;
  },
  normalizeSource(value) {
    if (value === "tool" || value === "pack") return value;
    throw new Error(`unsupported fake source: ${String(value)}`);
  },
  normalizeStamp(value) {
    const stamp = value as Partial<FakeStamp>;
    return {
      app: this.normalizeApp(stamp.app),
      ipc: String(stamp.ipc),
      mode: stamp.mode === "prod" ? "prod" : "dev",
      namespace: this.normalizeNamespace(stamp.namespace),
      source: this.normalizeSource(stamp.source),
    };
  },
};

describe("generic sidecar path boundary", () => {
  it("uses descriptor defaults instead of Open Design constants", () => {
    const sourceRoot = resolveSourceRuntimeRoot({
      contract: fakeContract,
      projectRoot: "/repo/product",
      source: "tool",
    });

    expect(sourceRoot).toBe(resolve("/repo/product", ".fake-tmp", "tool"));
    expect(resolveNamespaceRoot({ base: sourceRoot, contract: fakeContract, namespace: "alpha" })).toBe(
      join(sourceRoot, "alpha"),
    );
    expect(
      resolveAppRuntimePath({
        app: "ui",
        contract: fakeContract,
        fileName: "cache",
        namespaceRoot: join(sourceRoot, "alpha"),
      }),
    ).toBe(join(sourceRoot, "alpha", "ui", "cache"));
  });

  it("resolves descriptor-specific IPC paths", () => {
    expect(resolveAppIpcPath({ app: "ui", contract: fakeContract, namespace: "alpha" })).toBe(
      process.platform === "win32" ? "\\\\.\\pipe\\fake-product-alpha-ui" : "/tmp/fake-product/ipc/alpha/ui.sock",
    );
  });

  it("resolves namespace and base from descriptor env names", () => {
    const env = {
      FAKE_BASE: "/runtime/base",
      FAKE_NAMESPACE: "selected",
    };

    expect(resolveNamespace({ contract: fakeContract, env })).toBe("selected");
    expect(resolveSidecarBase({ contract: fakeContract, env, projectRoot: "/repo/product", source: "tool" })).toBe(resolve("/runtime/base"));
  });
});

describe("JSON IPC transport", () => {
  it("accepts split chunks and a frame exactly at the byte limit", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "open-design-sidecar-"));
    const socketPath = join(tempRoot, "bounded.sock");
    const payload = JSON.stringify("x".repeat(62));
    expect(Buffer.byteLength(payload)).toBe(64);
    const handle = await createJsonIpcServer({
      handler: () => null,
      maxFrameBytes: 64,
      socketPath,
    });

    try {
      const response = await new Promise<string>((resolveResponse, rejectResponse) => {
        const socket = createConnection(socketPath);
        let data = "";
        socket.on("connect", () => {
          socket.write(payload.slice(0, 11));
          setTimeout(() => socket.write(`${payload.slice(11)}\n`), 5);
        });
        socket.on("data", (chunk) => { data += chunk.toString("utf8"); });
        socket.on("end", () => resolveResponse(data));
        socket.on("error", rejectResponse);
      });
      expect(JSON.parse(response)).toEqual({ ok: true, result: null });
    } finally {
      await handle.close();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects invalid limits and oversized unterminated requests", async () => {
    expect(() => normalizeJsonIpcMaxFrameBytes(0)).toThrow(/between 1/);
    expect(() => normalizeJsonIpcMaxFrameBytes(16 * 1024 * 1024 + 1)).toThrow(/between 1/);
    const tempRoot = await mkdtemp(join(tmpdir(), "open-design-sidecar-"));
    const socketPath = join(tempRoot, "oversized.sock");
    let calls = 0;
    const handle = await createJsonIpcServer({
      handler: () => { calls += 1; return null; },
      maxFrameBytes: 8,
      socketPath,
    });

    try {
      await new Promise<void>((resolveClose) => {
        const socket = createConnection(socketPath);
        socket.on("connect", () => socket.write("1234567890"));
        socket.on("close", () => resolveClose());
        socket.on("error", () => {});
      });
      expect(calls).toBe(0);
    } finally {
      await handle.close();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects an oversized response and does not re-enter a handler for multiple frames", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "open-design-sidecar-"));
    const oversizedPath = join(tempRoot, "response-too-large.sock");
    const oversized = await createJsonIpcServer({
      handler: () => "x".repeat(100),
      maxFrameBytes: 32,
      socketPath: oversizedPath,
    });
    try {
      await expect(requestJsonIpc(oversizedPath, {}, { maxFrameBytes: 32 })).rejects.toThrow();
    } finally {
      await oversized.close();
    }

    const multiPath = join(tempRoot, "multiple.sock");
    let calls = 0;
    const multi = await createJsonIpcServer({
      handler: () => { calls += 1; return null; },
      socketPath: multiPath,
    });
    try {
      await new Promise<void>((resolveClose) => {
        const socket = createConnection(multiPath);
        socket.on("connect", () => socket.write("{}\n{}\n"));
        socket.on("close", () => resolveClose());
        socket.on("error", () => {});
      });
      expect(calls).toBe(0);
    } finally {
      await multi.close();
    }

    const concurrentPath = join(tempRoot, "concurrent.sock");
    let concurrentCalls = 0;
    let releaseHandler!: () => void;
    const concurrent = await createJsonIpcServer({
      handler: async () => {
        concurrentCalls += 1;
        await new Promise<void>((resolve) => { releaseHandler = resolve; });
        return null;
      },
      socketPath: concurrentPath,
    });
    try {
      await new Promise<void>((resolveClose) => {
        const socket = createConnection(concurrentPath);
        socket.on("connect", () => {
          socket.write("{}\n");
          setTimeout(() => socket.write("{}\n"), 10);
          setTimeout(() => releaseHandler(), 20);
        });
        socket.on("close", () => resolveClose());
        socket.on("error", () => {});
      });
      expect(concurrentCalls).toBe(1);
    } finally {
      await concurrent.close();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("times out and cleans up a response with no newline", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "open-design-sidecar-"));
    const socketPath = join(tempRoot, "no-newline.sock");
    const server = createServer((socket) => {
      socket.on("data", () => socket.write("partial-response"));
    });
    try {
      await listen(server, socketPath);
      await expect(requestJsonIpc(socketPath, { op: "status" }, { timeoutMs: 20 })).rejects.toThrow(/timed out/);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects malformed server responses instead of throwing from the socket callback", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "open-design-sidecar-"));
    const socketPath = join(tempRoot, "malformed.sock");
    const server = createServer((socket) => {
      socket.once("data", () => socket.end("not-json\n"));
    });

    try {
      await listen(server, socketPath);
      await expect(requestJsonIpc(socketPath, { op: "status" })).rejects.toThrow(/invalid IPC response/);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("atomic JSON files", () => {
  it("removes the temporary file when the final rename fails", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "open-design-json-"));
    const target = join(tempRoot, "occupied");
    await mkdir(target, { recursive: true });

    try {
      await expect(writeJsonFile(target, { ok: true })).rejects.toThrow();
      expect(await readdir(tempRoot)).toEqual(["occupied"]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("generic sidecar bootstrap", () => {
  it("creates and validates launch env from descriptor env names", () => {
    const stamp: FakeStamp = {
      app: "api",
      ipc: resolveAppIpcPath({ app: "api", contract: fakeContract, namespace: "alpha" }),
      mode: "dev",
      namespace: "alpha",
      source: "tool",
    };

    expect(createSidecarLaunchEnv({ base: "/runtime/base", contract: fakeContract, extraEnv: {}, stamp })).toEqual({
      FAKE_BASE: resolve("/runtime/base"),
      FAKE_IPC_PATH: stamp.ipc,
      FAKE_NAMESPACE: stamp.namespace,
      FAKE_SOURCE: stamp.source,
    });

    expect(
      bootstrapSidecarRuntime(stamp, { FAKE_BASE: resolve("/runtime/base") }, { app: "api", contract: fakeContract }),
    ).toEqual({
      app: "api",
      base: resolve("/runtime/base"),
      ipc: stamp.ipc,
      mode: "dev",
      namespace: "alpha",
      source: "tool",
    });
  });
});

describe("resolveRuntimeNamespaceRoot", () => {
  // dev / tools-dev: `base` is the pre-namespace source root, so the namespace
  // is appended — identical to plain `resolveNamespaceRoot`.
  it("appends the namespace for pre-namespace (dev) bases", () => {
    const namespaceRoot = resolveRuntimeNamespaceRoot({
      contract: fakeContract,
      runtime: { base: "/runtime/base", mode: "dev", namespace: "alpha" },
      runtimeMode: "prod",
    });
    expect(namespaceRoot).toBe(join(resolve("/runtime/base"), "alpha"));
  });

  // packaged: the orchestrator launches children with `base = <namespaceRoot>/runtime`,
  // so the namespace root is the PARENT of `base` and logs resolve to
  // `<namespaceRoot>/logs/...`. Re-appending the namespace (the old bug) would
  // point at `<namespaceRoot>/runtime/<namespace>/logs/...` → ENOENT.
  it("walks up out of the runtime dir for packaged bases", () => {
    const runtime = { base: "/data/ns/alpha/runtime", mode: "prod", namespace: "alpha" } as const;
    const namespaceRoot = resolveRuntimeNamespaceRoot({
      contract: fakeContract,
      runtime,
      runtimeMode: "prod",
    });
    expect(namespaceRoot).toBe(resolve("/data/ns/alpha"));
    expect(
      resolveLogFilePath({ app: "api", contract: fakeContract, runtimeRoot: namespaceRoot }),
    ).toBe(join(resolve("/data/ns/alpha"), "logs", "api", "latest.log"));
    // The old `resolveNamespaceRoot(base, namespace)` path would have produced
    // a phantom dir nested under `runtime/`.
    expect(
      resolveNamespaceRoot({ base: runtime.base, contract: fakeContract, namespace: runtime.namespace }),
    ).toBe(join(resolve("/data/ns/alpha/runtime"), "alpha"));
  });
});
