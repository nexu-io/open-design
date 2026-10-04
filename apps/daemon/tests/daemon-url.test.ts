import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from "vitest";
import { resolveDaemonUrl, resolveDaemonUrlDetailed, conventionalDaemonStamps, currentReleasePlatform, isLoopbackHttpUrl, DEFAULT_DAEMON_URL } from "../src/daemon-url.js";

// Verifies the resolution chain: --daemon-url > OD_DAEMON_URL > sidecar
// IPC status discovery > legacy default. Each layer must short-circuit the next
// so `od` clients follow the live daemon across ephemeral-port restarts.

describe("resolveDaemonUrl", () => {
  let emptyBinDir: string;

  beforeAll(() => {
    emptyBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-tools-dev-empty-"));
  });

  afterAll(() => {
    fs.rmSync(emptyBinDir, { recursive: true, force: true });
  });

  it("prefers the explicit --daemon-url flag", async () => {
    const url = await resolveDaemonUrl({
      flagUrl: "http://flag.example:1111",
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
      },
    });
    expect(url).toBe("http://flag.example:1111");
  });

  it("falls back to OD_DAEMON_URL when no flag given", async () => {
    const url = await resolveDaemonUrl({
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
      },
    });
    expect(url).toBe("http://env.example:2222");
  });

  it("returns the legacy default when no flag/env/socket is available", async () => {
    const url = await resolveDaemonUrl({
      env: {
        PATH: emptyBinDir,
      },
      timeoutMs: 200,
    });
    expect(url).toBe(DEFAULT_DAEMON_URL);
  });

  it("discovers the live daemon URL through an inherited sidecar client", async () => {
    const url = await resolveDaemonUrl({
      connectInherited: (() => ({
        invoke: async () => { throw new Error("unexpected invoke"); },
        status: async () => ({
          pid: 4242,
          state: "running",
          updatedAt: new Date().toISOString(),
          url: "http://127.0.0.1:54321",
        }),
      })) as never,
      env: {},
      timeoutMs: 1000,
    });
    expect(url).toBe("http://127.0.0.1:54321");
  });
});

describe("isLoopbackHttpUrl (pure)", () => {
  it.each([
    "http://127.0.0.1:59999",
    "http://127.0.0.2:23456",
    "http://[::1]:34567",
    "https://localhost:41111",
  ])("accepts a bare loopback origin: %s", (url) => {
    expect(isLoopbackHttpUrl(url)).toBe(true);
  });

  it.each([
    ["http://user:pass@127.0.0.1:22222", "embedded credentials"],
    ["http://127.0.0.1:22222/some/path", "non-root path"],
    ["http://127.0.0.1:22222/?x=1", "query string"],
    ["http://127.0.0.1:22222/#fragment", "fragment"],
    ["http://127.0.0.1", "missing explicit port"],
    ["http://evil.example:1234", "non-loopback host"],
    ["not a url", "unparseable"],
    ["ftp://127.0.0.1:1234", "non-http(s) scheme"],
  ])("rejects %s (%s)", (url) => {
    expect(isLoopbackHttpUrl(url)).toBe(false);
  });
});

// Verifies the resolution chain: --daemon-url > OD_DAEMON_URL > sidecar
// IPC status discovery > legacy default. Each layer must short-circuit the next
// so `od` clients follow the live daemon across ephemeral-port restarts.


const mocks = vi.hoisted(() => ({ status: vi.fn(), lstat: vi.fn() }));
vi.mock("@open-design/sidecar", async (importOriginal) => ({
  ...await importOriginal<typeof import("@open-design/sidecar")>(),
  getSidecarStatus: mocks.status,
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  lstat: mocks.lstat,
}));

describe("packaged discovery with current sidecar identities", () => {
  beforeEach(() => {
    mocks.status.mockReset().mockRejectedValue(new Error("absent"));
    mocks.lstat.mockReset().mockResolvedValue({ isSocket: () => true, uid: process.getuid?.() });
  });
  const options = { env: {}, platform: "mac" as const, allowConventionalIpcDiscovery: true, timeoutMs: 1 };

  it("keeps packaged discovery opt-in", async () => {
    await resolveDaemonUrl({ ...options, allowConventionalIpcDiscovery: false });
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("uses one live channel through the public status API", async () => {
    mocks.status.mockImplementation(async (stamp) => {
      if (stamp.channel === "beta" && stamp.namespace === "release-beta" && stamp.source === "packaged" && stamp.mode === "runtime") return { url: "http://127.0.0.1:51234" };
      throw new Error("absent");
    });
    expect(await resolveDaemonUrlDetailed(options)).toEqual({ url: "http://127.0.0.1:51234", ambiguous: false });
  });
  it("deduplicates aliases reporting the same URL", async () => {
    mocks.status.mockResolvedValue({ url: "http://127.0.0.1:51234" });
    expect((await resolveDaemonUrlDetailed(options)).ambiguous).toBe(false);
  });
  it("reports ambiguity without probing tools-dev", async () => {
    mocks.status.mockImplementation(async (stamp) => ({ url: stamp.channel === "stable" ? "http://127.0.0.1:51234" : "http://127.0.0.1:51235" }));
    // A strict caller would throw if it fell through to the missing tools-dev runtime.
    expect(await resolveDaemonUrlDetailed({ ...options, allowLegacyDefault: false })).toEqual({ url: DEFAULT_DAEMON_URL, ambiguous: true });
  });
  it("preserves inherited-client precedence and non-loopback URLs", async () => {
    const connectInherited = (() => ({ status: async () => ({ url: "http://100.64.0.1:51234" }) })) as never;
    expect(await resolveDaemonUrl({ ...options, connectInherited })).toBe("http://100.64.0.1:51234");
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("does not sweep other channels after an unavailable inherited endpoint", async () => {
    const connectInherited = (() => ({ status: async () => { throw new Error("gone"); } })) as never;
    await resolveDaemonUrl({ ...options, connectInherited });
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it.each(["http://remote.example:51234", "http://user:pass@127.0.0.1:51234", "http://127.0.0.1:51234/path"])("rejects unsafe discovered origin %s", async (url) => {
    mocks.status.mockResolvedValue({ url });
    await expect(resolveDaemonUrl({ ...options, allowLegacyDefault: false })).rejects.toThrow("could not be discovered");
  });
  it.each(["foreign", "file", "symlink", "missing"])("rejects %s endpoints before status", async (kind) => {
    if (kind === "missing") mocks.lstat.mockRejectedValue(new Error("ENOENT"));
    else mocks.lstat.mockResolvedValue({ uid: kind === "foreign" ? -1 : process.getuid?.(), isSocket: () => kind === "foreign" });
    await resolveDaemonUrl(options);
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("keeps MCP startup's no-guessed-port requirement", async () => {
    await expect(resolveDaemonUrl({ ...options, allowLegacyDefault: false })).rejects.toThrow("could not be discovered");
  });
  it("does not enable conventional discovery on Windows", async () => {
    expect(conventionalDaemonStamps({}, "win")).toEqual([]);
    await resolveDaemonUrl({ ...options, platform: "win" });
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("honors an explicit namespace while retaining channel identity", () => {
    const stamps = conventionalDaemonStamps({ OD_SIDECAR_NAMESPACE: "custom" }, "mac");
    expect(new Set(stamps.map(s => s.namespace))).toEqual(new Set(["custom"]));
    expect(new Set(stamps.map(s => s.channel))).toEqual(new Set(["stable", "beta", "betas", "prerelease", "preview"]));
    expect(stamps.every(s => s.app === "daemon")).toBe(true);
  });
  it("includes an explicitly selected named release", () => {
    expect(conventionalDaemonStamps({ OD_SIDECAR_NAMESPACE: "release-candidate" }, "mac")).toContainEqual({
      app: "daemon", channel: "candidate", namespace: "release-candidate", source: "packaged", mode: "runtime",
    });
  });
  it("covers release namespaces, Intel beta alias, and packaged runtime modes", () => {
    const stamps = conventionalDaemonStamps({}, "macIntel");
    expect(stamps).toContainEqual({ app: "daemon", channel: "beta", namespace: "release-beta-x64", source: "packaged", mode: "runtime" });
    expect(stamps).toContainEqual({ app: "daemon", channel: "stable", namespace: "default", source: "tools-pack", mode: "headless" });
    expect(conventionalDaemonStamps({}, "linux").some(s => s.namespace === "release-stable-linux")).toBe(true);
  });
  it.each([
    ["darwin", "arm64", "mac"], ["darwin", "x64", "macIntel"], ["linux", "x64", "linux"], ["win32", "x64", "win"],
  ] as const)("maps %s/%s to %s", (platform, arch, expected) => {
    expect(currentReleasePlatform({ platform, arch })).toBe(expected);
  });
});
