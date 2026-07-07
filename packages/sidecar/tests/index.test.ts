import { mkdtemp, rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  createSidecarLaunchEnv,
  requestJsonIpc,
  resolveAppIpcPath,
  resolveAppRuntimePath,
  resolveLogFilePath,
  resolveNamespace,
  resolveNamespaceRoot,
  resolveRuntimeNamespaceRoot,
  resolveSidecarBase,
  resolveSourceRuntimeRoot,
  type SidecarContractDescriptor,
  type SidecarStampShape,
} from "../src/index.js";

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

function testIpcPath(root: string): string {
  if (process.platform === "win32") return `\\\\.\\pipe\\open-design-sidecar-test-${process.pid}-${Date.now()}`;
  return join(root, "ipc.sock");
}

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

describe("generic sidecar JSON IPC", () => {
  it("traces low-level IPC events without changing request semantics", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-ipc-"));
    const socketPath = testIpcPath(root);
    const previousTrace = process.env.OD_JSON_IPC_TRACE;
    const previousError = console.error;
    const logs: unknown[] = [];
    process.env.OD_JSON_IPC_TRACE = "1";
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    const server = await createJsonIpcServer({
      socketPath,
      handler: async (message) => ({
        seen: message?.type,
      }),
    });

    try {
      await expect(requestJsonIpc(socketPath, { input: { expression: "secret()" }, type: "EVAL" })).resolves.toEqual({
        seen: "EVAL",
      });
    } finally {
      await server.close();
      console.error = previousError;
      if (previousTrace == null) {
        delete process.env.OD_JSON_IPC_TRACE;
      } else {
        process.env.OD_JSON_IPC_TRACE = previousTrace;
      }
      await rm(root, { force: true, recursive: true });
    }

    const events = logs
      .map((entry) => (Array.isArray(entry) ? (entry[1] as { event?: unknown } | undefined)?.event : undefined))
      .filter(Boolean);
    expect(events).toContain("client.connect_start");
    expect(events).toContain("client.write_start");
    expect(events).toContain("server.connection");
    expect(events).toContain("server.data");
    expect(events).toContain("server.frame_parsed");
    expect(events).toContain("server.handler_start");
    expect(events).toContain("client.response_success");
    expect(JSON.stringify(logs)).not.toContain("secret()");
  });

  it("preserves multibyte UTF-8 (CJK) across socket chunk boundaries", async () => {
    // Regression for exported CJK artifacts showing `???` / `◆?` (U+FFFD):
    // a multibyte character (e.g. 挤 = 0xE6 0x8C 0xA4) split across two `data`
    // events was decoded per-chunk, turning each half into U+FFFD. The payload
    // is large enough that the OS delivers it over multiple chunks, so a
    // character is virtually guaranteed to straddle a boundary; with the old
    // per-chunk `chunk.toString()` the round-trip corrupts, with StringDecoder
    // it is byte-exact.
    const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-utf8-"));
    const socketPath = testIpcPath(root);
    // Mix of CJK glyphs incl. the exact ones seen corrupted in QA exports.
    const unit = "拥挤让人焦虑，留白让人信任。敢留白，是因为知道什么最重要——交付边界。";
    const big = unit.repeat(4000); // ~1.3 MB of UTF-8, far past one socket chunk
    const server = await createJsonIpcServer({
      socketPath,
      handler: async (message: any) => ({ echo: message.html }),
    });
    try {
      const result = await requestJsonIpc<{ echo: string }>(
        socketPath,
        { type: "RENDER", html: big },
        { timeoutMs: 10_000 },
      );
      expect(result.echo).toBe(big);
      expect(result.echo).not.toContain("�");
      expect(result.echo.includes("拥挤让人焦虑")).toBe(true);
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
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
