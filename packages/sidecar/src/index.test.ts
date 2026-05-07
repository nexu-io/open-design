import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";

import {
  bootstrapSidecarRuntime,
  createSidecarLaunchEnv,
  resolveAppIpcPath,
  resolveAppRuntimePath,
  resolveNamespace,
  resolveNamespaceRoot,
  resolveSidecarBase,
  resolveSourceRuntimeRoot,
  type SidecarContractDescriptor,
  type SidecarStampShape,
} from "./index.js";

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
