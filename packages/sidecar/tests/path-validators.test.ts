import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";

import {
  isWindowsNamedPipePath,
  normalizeIpcPath,
  resolveAppRuntimePath,
  resolveLogFilePath,
  resolveLogsDir,
  resolveManifestPath,
  resolvePointerPath,
  resolveProjectRoot,
  resolveProjectTmpRoot,
  resolveRuntimeRoot,
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

describe("normalizeIpcPath", () => {
  it("rejects non-string inputs", () => {
    expect(() => normalizeIpcPath(undefined)).toThrow(/must be a string/);
    expect(() => normalizeIpcPath(42)).toThrow(/must be a string/);
    expect(() => normalizeIpcPath(null)).toThrow(/must be a string/);
  });

  it("rejects empty and whitespace-padded strings", () => {
    expect(() => normalizeIpcPath("")).toThrow(/must not be empty/);
    expect(() => normalizeIpcPath(" /tmp/sock ")).toThrow(/leading or trailing whitespace/);
    expect(() => normalizeIpcPath("\t/tmp/sock")).toThrow(/leading or trailing whitespace/);
  });

  it("rejects null bytes embedded in the path", () => {
    expect(() => normalizeIpcPath("/tmp/sock\0evil")).toThrow(/null bytes/);
  });

  it("accepts Windows named pipe paths verbatim", () => {
    const pipe = "\\\\.\\pipe\\open-design-default-api";
    expect(isWindowsNamedPipePath(pipe)).toBe(true);
    expect(normalizeIpcPath(pipe)).toBe(pipe);
  });

  it("rejects non-absolute POSIX paths", () => {
    expect(() => normalizeIpcPath("relative/sock")).toThrow(/must be absolute/);
    expect(() => normalizeIpcPath("./sock")).toThrow(/must be absolute/);
  });

  it("accepts absolute POSIX paths verbatim", () => {
    expect(normalizeIpcPath("/tmp/open-design/ipc/default/api.sock")).toBe(
      "/tmp/open-design/ipc/default/api.sock",
    );
  });
});

describe("resolveProjectRoot", () => {
  it("rejects non-string and empty inputs", () => {
    expect(() => resolveProjectRoot(undefined as unknown as string)).toThrow(/non-empty string/);
    expect(() => resolveProjectRoot("")).toThrow(/non-empty string/);
    expect(() => resolveProjectRoot("   ")).toThrow(/non-empty string/);
  });

  it("resolves relative paths against the current working directory", () => {
    expect(resolveProjectRoot("./repo")).toBe(resolve("./repo"));
    expect(resolveProjectRoot("/repo/product")).toBe(resolve("/repo/product"));
  });
});

describe("runtime path resolvers", () => {
  const projectRoot = "/repo/product";
  const base = resolve(projectRoot, ".fake-tmp", "tool");
  const namespaceRoot = join(base, "alpha");

  it("anchors the project tmp root to the descriptor directory name", () => {
    expect(resolveProjectTmpRoot({ contract: fakeContract, projectRoot })).toBe(
      resolve(projectRoot, ".fake-tmp"),
    );
  });

  it("nests runtime roots under the namespace and runs directory", () => {
    expect(resolveRuntimeRoot({ base, contract: fakeContract, namespace: "alpha", runId: "run-42" })).toBe(
      join(namespaceRoot, "runs", "run-42"),
    );
  });

  it("places pointer and manifest files in their expected slots", () => {
    expect(resolvePointerPath({ base, contract: fakeContract, namespace: "alpha" })).toBe(
      join(namespaceRoot, "current.json"),
    );
    const runtimeRoot = join(namespaceRoot, "runs", "run-42");
    expect(resolveManifestPath({ runtimeRoot })).toBe(join(runtimeRoot, "manifest.json"));
  });

  it("scopes log directories and files to the requested app", () => {
    const runtimeRoot = join(namespaceRoot, "runs", "run-42");
    expect(resolveLogsDir({ app: "api", contract: fakeContract, runtimeRoot })).toBe(
      join(runtimeRoot, "logs", "api"),
    );
    expect(resolveLogFilePath({ app: "api", contract: fakeContract, runtimeRoot })).toBe(
      join(runtimeRoot, "logs", "api", "latest.log"),
    );
    expect(
      resolveLogFilePath({ app: "ui", contract: fakeContract, fileName: "stderr.log", runtimeRoot }),
    ).toBe(join(runtimeRoot, "logs", "ui", "stderr.log"));
  });
});

describe("resolveAppRuntimePath fileName validation", () => {
  const namespaceRoot = "/repo/product/.fake-tmp/tool/alpha";

  it("rejects empty file names", () => {
    expect(() =>
      resolveAppRuntimePath({ app: "ui", contract: fakeContract, fileName: "", namespaceRoot }),
    ).toThrow(/simple path segment/);
  });

  it("rejects file names containing null bytes", () => {
    expect(() =>
      resolveAppRuntimePath({ app: "ui", contract: fakeContract, fileName: "cache\0evil", namespaceRoot }),
    ).toThrow(/simple path segment/);
  });

  it("rejects file names containing path separators", () => {
    expect(() =>
      resolveAppRuntimePath({ app: "ui", contract: fakeContract, fileName: "nested/file", namespaceRoot }),
    ).toThrow(/simple path segment/);
    expect(() =>
      resolveAppRuntimePath({ app: "ui", contract: fakeContract, fileName: "nested\\file", namespaceRoot }),
    ).toThrow(/simple path segment/);
  });

  it("accepts simple segment names", () => {
    expect(
      resolveAppRuntimePath({ app: "ui", contract: fakeContract, fileName: "cache.json", namespaceRoot }),
    ).toBe(join(namespaceRoot, "ui", "cache.json"));
  });
});
