import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

import { findSidecarProcesses, getSidecarStatus, invokeSidecar, stopSidecar } from "@open-design/sidecar";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

const stopSidecarMock = vi.hoisted(() => vi.fn(async (_stamp?: unknown, _options?: unknown) => ({
  alreadyStopped: true,
  forcedPids: [],
  gracefulAccepted: false,
  matchedPids: [],
  remainingPids: [],
  stoppedPids: [],
})));
const stopSidecarsMock = vi.hoisted(() => vi.fn(async (requests: Array<{ options?: unknown; stamp: unknown }>) => {
  const results = await Promise.all(requests.map(async ({ options, stamp }) => ({
    result: await stopSidecarMock(stamp, options),
    stamp,
  })));
  const stopped = results.map(({ result }) => result);
  return {
    alreadyStopped: stopped.every(({ alreadyStopped }) => alreadyStopped),
    forcedPids: [],
    gracefulAccepted: stopped.some(({ gracefulAccepted }) => gracefulAccepted),
    matchedPids: [...new Set(stopped.flatMap(({ matchedPids }) => matchedPids))],
    remainingPids: [...new Set(stopped.flatMap(({ remainingPids }) => remainingPids))],
    results,
    stoppedPids: [...new Set(stopped.flatMap(({ stoppedPids }) => stoppedPids))],
  };
}));

vi.mock("@open-design/sidecar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@open-design/sidecar")>();
  return {
    ...actual,
    findSidecarProcesses: vi.fn(async () => []),
    getSidecarStatus: vi.fn(async () => { throw new Error("status unavailable"); }),
    invokeSidecar: vi.fn(async () => { throw new Error("invoke unavailable"); }),
    stopSidecar: stopSidecarMock,
    stopSidecars: stopSidecarsMock,
  };
});

import type { ToolPackConfig } from "@/config/index.js";
import {
  buildDockerArgs,
  cleanupPackedLinuxNamespace,
  createLinuxDesktopLaunchEnv,
  findBuiltArtifact,
  inspectPackedLinuxApp,
  LINUX_APPIMAGE_EXECUTABLE_ARGS,
  linuxBuildsAppImage,
  linuxBundledFilePatterns,
  matchesAppImageProcess,
  renderDesktopTemplate,
  resolveLinuxBuilderTargets,
  renderLinuxAppImageAppRun,
  renderLinuxPackagedMainEntry,
  resolveLinuxLifecycleMode,
  resolveLinuxPaths,
  resolveProductionInstallCommand,
  shouldRejectLinuxHeadlessInspectOptions,
  stopPackedLinuxApp,
  sanitizeNamespace,
  stopPackedLinuxHeadless,
  writeLinuxBuilderConfig,
  writeWebStandaloneHookConfig,
} from "@/linux.js";
import { linuxResources } from "@/resources/index.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function makeConfig(): ToolPackConfig {
  return {
    containerized: true,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "default",
    platform: "linux",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      output: {
        appBuilderRoot: "/work/.tmp/tools-pack/out/linux/namespaces/default/builder",
        namespaceRoot: "/work/.tmp/tools-pack/out/linux/namespaces/default",
        platformRoot: "/work/.tmp/tools-pack/out/linux",
        root: "/work/.tmp/tools-pack/out",
      },
      runtime: {
        namespaceBaseRoot: "/work/.tmp/tools-pack/runtime/linux/namespaces",
        namespaceRoot: "/work/.tmp/tools-pack/runtime/linux/namespaces/default",
      },
      cacheRoot: "/work/.tmp/tools-pack/cache",
      toolPackRoot: "/work/.tmp/tools-pack",
    },
    silent: true,
    signed: false,
    to: "all",
    webOutputMode: "server",
    workspaceRoot: "/work",
  };
}

const linuxOnlyIt = process.platform === "linux" ? it : it.skip;

async function waitForChildExit(child: ChildProcess, timeoutMs = 5000): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe("buildDockerArgs", () => {
  it("returns the expected docker argv array", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    expect(args[0]).toBe("run");
    expect(args).toContain("--rm");
    expect(args).toContain("--user");
    expect(args).toContain("1000:1000");
    expect(args).toContain("electronuserland/builder:base");
  });

  it("mounts the workspace at /project", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    expect(args).toContain("-v");
    expect(args).toContain("/work:/project");
  });

  it("mounts docker home and electron caches under .tmp/tools-pack/.docker-*", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    expect(args).toContain(`${posix.join("/work/.tmp/tools-pack", ".docker-home")}:/home/builder`);
    expect(args).toContain(`${posix.join("/work/.tmp/tools-pack", ".docker-cache", "electron")}:/home/builder/.cache/electron`);
    expect(args).toContain(
      `${posix.join("/work/.tmp/tools-pack", ".docker-cache", "electron-builder")}:/home/builder/.cache/electron-builder`,
    );
  });

  it("mounts the tool-pack root at /tools-pack so inner build writes to host-visible output dir", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    expect(args).toContain("/work/.tmp/tools-pack:/tools-pack");
  });

  it("sets HOME and ELECTRON_CACHE env vars", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    expect(args).toContain("HOME=/home/builder");
    expect(args).toContain("ELECTRON_CACHE=/home/builder/.cache/electron");
    expect(args).toContain("ELECTRON_BUILDER_CACHE=/home/builder/.cache/electron-builder");
  });

  it("passes the telemetry relay URL into containerized builds when configured", () => {
    const args = buildDockerArgs(
      {
        ...makeConfig(),
        telemetryRelayUrl: "https://telemetry.open-design.ai/api/langfuse",
      },
      { uid: 1000, gid: 1000 },
    );
    expect(args).toContain("OPEN_DESIGN_TELEMETRY_RELAY_URL=https://telemetry.open-design.ai/api/langfuse");
  });

  it("passes the AMR profile into containerized builds when configured", () => {
    const args = buildDockerArgs(
      {
        ...makeConfig(),
        amrProfile: "test",
      },
      { uid: 1000, gid: 1000 },
    );
    expect(args).toContain("OPEN_DESIGN_AMR_PROFILE=test");
  });

  it("bind-mounts the host Vela binary directory and rewrites the env path into the container", () => {
    const previous = process.env.OPEN_DESIGN_VELA_CLI_BIN;
    process.env.OPEN_DESIGN_VELA_CLI_BIN = "/host/bin/vela";
    try {
      const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
      // The container only mounts /project, /tools-pack, and cache/home by
      // default — a host-path env value like `/host/bin/vela` would resolve
      // to a non-existent path inside. The directory must be bind-mounted
      // and the env rewritten to the container-side path so the resource
      // copier can actually read the binary.
      expect(args).toContain("/host/bin:/opt/vela-cli:ro");
      expect(args).toContain("OPEN_DESIGN_VELA_CLI_BIN=/opt/vela-cli/vela");
      expect(args).not.toContain("OPEN_DESIGN_VELA_CLI_BIN=/host/bin/vela");
    } finally {
      if (previous === undefined) delete process.env.OPEN_DESIGN_VELA_CLI_BIN;
      else process.env.OPEN_DESIGN_VELA_CLI_BIN = previous;
    }
  });

  it("runs the built tools-pack CLI through node inside the container without generated package-bin shims", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toMatch(/command -v curl >\/dev\/null/);
    expect(last).toMatch(/case "\$\(uname -m\)" in/);
    expect(last).toMatch(/x86_64\) PNPM_ASSET=pnpm-linuxstatic-x64; PNPM_SHA256=[a-f0-9]{64}/);
    expect(last).toMatch(/aarch64\) PNPM_ASSET=pnpm-linuxstatic-arm64; PNPM_SHA256=[a-f0-9]{64}/);
    expect(last).toMatch(
      /curl --retry 3 --retry-all-errors --connect-timeout 10 --max-time 60 -fsSL "https:\/\/github\.com\/pnpm\/pnpm\/releases\/download\/v\d+\.\d+\.\d+\/\$PNPM_ASSET" -o \/tmp\/pnpm\.tmp/,
    );
    expect(last).toMatch(/echo "\$PNPM_SHA256  \/tmp\/pnpm\.tmp" \| sha256sum -c -/);
    expect(last).toMatch(/mv \/tmp\/pnpm\.tmp \/tmp\/pnpm/);
    expect(last).toMatch(/chmod \+x \/tmp\/pnpm/);
    expect(last).toMatch(/\/tmp\/pnpm env use --global 24\.\d+\.\d+/);
    expect(last).toMatch(/\/tmp\/pnpm install --frozen-lockfile/);
    expect(last).toMatch(/node tools\/pack\/bin\/tools-pack\.mjs linux build --to all --namespace default/);
    expect(last).not.toMatch(/\/tmp\/pnpm tools-pack linux build/);
    expect(last).not.toMatch(/--containerized/);
  });

  it("fetches pnpm standalone binary instead of relying on image npm tooling", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).not.toMatch(/corepack/);
    expect(last).not.toMatch(/\bnpx\b/);
    expect(last).not.toMatch(/(^|[;&|]\s*)npm(\s|$)/);
    expect(last).toMatch(/pnpm-linuxstatic-x64/);
    expect(last).toMatch(/pnpm-linuxstatic-arm64/);
  });

  it("routes container setup and install output to stderr before the JSON-emitting build", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toContain("{ command -v curl");
    expect(last).toContain("/tmp/pnpm install --frozen-lockfile; } >&2 && node tools/pack/bin/tools-pack.mjs linux build");
    expect(last.indexOf("/tmp/pnpm install --frozen-lockfile")).toBeLessThan(
      last.indexOf("} >&2 && node tools/pack/bin/tools-pack.mjs linux build"),
    );
  });

  it("picks the pnpm asset by container CPU so amd64 and arm64 hosts both work", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toContain('case "$(uname -m)" in');
    expect(last).toContain("x86_64) PNPM_ASSET=pnpm-linuxstatic-x64");
    expect(last).toContain("aarch64) PNPM_ASSET=pnpm-linuxstatic-arm64");
    expect(last).toMatch(/unsupported container arch/);
  });

  it("verifies the downloaded standalone pnpm binary before executing it", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toMatch(/PNPM_SHA256=[a-f0-9]{64}/);
    expect(last).toMatch(/sha256sum -c -/);
    expect(last).toMatch(/\/tmp\/pnpm\.tmp/);
    expect(last.indexOf("sha256sum -c -")).toBeLessThan(last.indexOf("mv /tmp/pnpm.tmp /tmp/pnpm"));
    expect(last.indexOf("mv /tmp/pnpm.tmp /tmp/pnpm")).toBeLessThan(last.indexOf("chmod +x /tmp/pnpm"));
  });

  it("hardcoded pnpm version stays in lockstep with root package.json `packageManager`", () => {
    // Guard against silent drift: if someone bumps packageManager in the
    // root package.json but forgets to update PNPM_VERSION in linux.ts,
    // the Linux container build would silently keep downloading the old pnpm.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const rootPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
      packageManager?: string;
    };
    const match = String(rootPkg.packageManager ?? "").match(/^pnpm@(\d+\.\d+\.\d+)$/);
    expect(match, `expected root packageManager "pnpm@x.y.z", got ${rootPkg.packageManager}`).not.toBeNull();
    const expectedVersion = match![1];

    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toContain(`pnpm/releases/download/v${expectedVersion}/$PNPM_ASSET`);
  });

  it("container Node major stays in lockstep with root .node-version", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const expectedMajor = readFileSync(join(repoRoot, ".node-version"), "utf-8").trim();
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    const match = last.match(/\/tmp\/pnpm env use --global (\d+)\.\d+\.\d+/);
    expect(match, "expected container bootstrap to install an explicit Node version").not.toBeNull();
    expect(match?.[1]).toBe(expectedMajor);
  });

  it("forwards --dir /tools-pack so inner build output lands under the mounted host dir", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toMatch(/--dir \/tools-pack/);
  });

  it("forwards --portable when config.portable is true", () => {
    const args = buildDockerArgs({ ...makeConfig(), portable: true }, { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toMatch(/--portable/);
  });

  it("forwards --require-vela-cli to the inner containerized build when strict packaging is requested", () => {
    const args = buildDockerArgs({ ...makeConfig(), requireVelaCli: true }, { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).toMatch(/--require-vela-cli/);
  });

  it("omits --require-vela-cli from containerized builds by default", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).not.toMatch(/--require-vela-cli/);
  });

  it("omits --portable when config.portable is false", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const last = args[args.length - 1];
    expect(last).not.toMatch(/--portable/);
  });

  it("forwards a shell-quoted --app-version to the inner build", () => {
    const args = buildDockerArgs(
      { ...makeConfig(), appVersion: "0.5.0-beta.1;echo-nope" },
      { uid: 1000, gid: 1000 },
    );
    const last = args[args.length - 1];
    expect(last).toContain("--app-version '0.5.0-beta.1;echo-nope'");
  });

  it("shell-quotes apostrophes in --app-version", () => {
    const args = buildDockerArgs(
      { ...makeConfig(), appVersion: "0.5.0-beta.1'quoted" },
      { uid: 1000, gid: 1000 },
    );
    const last = args[args.length - 1];
    expect(last).toContain("--app-version '0.5.0-beta.1'\\''quoted'");
  });

  it("exports OD_TOOLS_PACK_PNPM_BIN=/tmp/pnpm so the inner build's production install skips npm", () => {
    const args = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const envFlagIndex = args.findIndex(
      (arg, i) => arg === "-e" && args[i + 1] === "OD_TOOLS_PACK_PNPM_BIN=/tmp/pnpm",
    );
    expect(envFlagIndex).toBeGreaterThan(-1);
  });
});

describe("stopPackedLinuxHeadless", () => {
  it("ignores the desktop AppImage identity marker and reads only the headless marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-headless-marker-"));
    const namespace = "marker-split";
    const namespaceRoot = join(root, "runtime", "linux", "namespaces", namespace);
    const config: ToolPackConfig = {
      ...makeConfig(),
      namespace,
      roots: {
        ...makeConfig().roots,
        runtime: {
          namespaceBaseRoot: join(root, "runtime", "linux", "namespaces"),
          namespaceRoot,
        },
      },
    };
    const markerPath = join(namespaceRoot, "runtime", "desktop-root.json");
    const stamp = {
      app: APP_KEYS.DESKTOP,
      ipc: "/deprecated-derived-identity",
      mode: SIDECAR_MODES.RUNTIME,
      namespace,
      source: SIDECAR_SOURCES.PACKAGED,
    };

    try {
      await mkdir(dirname(markerPath), { recursive: true });
      await writeFile(
        markerPath,
        `${JSON.stringify({
          appPath: "/tmp/Open-Design.AppImage",
          executablePath: "/tmp/.mount_od/AppRun",
          logPath: join(namespaceRoot, "logs", "desktop", "latest.log"),
          namespaceRoot,
          pid: Number.MAX_SAFE_INTEGER,
          ppid: 1,
          stamp,
          startedAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          version: 1,
        })}\n`,
        "utf8",
      );

      const result = await stopPackedLinuxHeadless(config);

      expect(result.status).toBe("not-running");
      expect(result.fallback).toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("removes stale desktop AppImage markers during headless cleanup", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-headless-cleanup-"));
    const namespace = "cleanup-split";
    const namespaceRoot = join(root, "runtime", "linux", "namespaces", namespace);
    const config: ToolPackConfig = {
      ...makeConfig(),
      namespace,
      roots: {
        ...makeConfig().roots,
        output: {
          ...makeConfig().roots.output,
          namespaceRoot: join(root, "out", "linux", "namespaces", namespace),
        },
        runtime: {
          namespaceBaseRoot: join(root, "runtime", "linux", "namespaces"),
          namespaceRoot,
        },
      },
    };
    const markerPath = join(namespaceRoot, "runtime", "desktop-root.json");
    const stamp = {
      app: APP_KEYS.DESKTOP,
      ipc: "/deprecated-derived-identity",
      mode: SIDECAR_MODES.RUNTIME,
      namespace,
      source: SIDECAR_SOURCES.PACKAGED,
    };

    try {
      await mkdir(dirname(markerPath), { recursive: true });
      await writeFile(
        markerPath,
        `${JSON.stringify({
          appPath: "/tmp/Open-Design.AppImage",
          executablePath: "/tmp/.mount_od/AppRun",
          logPath: join(namespaceRoot, "logs", "desktop", "latest.log"),
          namespaceRoot,
          pid: Number.MAX_SAFE_INTEGER,
          ppid: 1,
          stamp,
          startedAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          version: 1,
        })}\n`,
        "utf8",
      );
      await mkdir(config.roots.output.namespaceRoot, { recursive: true });

      const result = await cleanupPackedLinuxNamespace(config, { headless: true });

      expect(result.skipped).toBe(false);
      expect(result.removedOutputRoot).toBe(true);
      expect(result.removedRuntimeNamespaceRoot).toBe(true);
      expect(await pathExists(markerPath)).toBe(false);
      expect(await pathExists(namespaceRoot)).toBe(false);
      expect(await pathExists(config.roots.output.namespaceRoot)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("skips headless cleanup while the desktop marker PID is live in the snapshot table", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-headless-cleanup-live-"));
    const namespace = "cleanup-split-live";
    const namespaceRoot = join(root, "runtime", "linux", "namespaces", namespace);
    const config: ToolPackConfig = {
      ...makeConfig(),
      namespace,
      roots: {
        ...makeConfig().roots,
        output: {
          ...makeConfig().roots.output,
          namespaceRoot: join(root, "out", "linux", "namespaces", namespace),
        },
        runtime: {
          namespaceBaseRoot: join(root, "runtime", "linux", "namespaces"),
          namespaceRoot,
        },
      },
    };
    try {
      vi.mocked(findSidecarProcesses).mockImplementation(async (stamp) =>
        stamp.mode === SIDECAR_MODES.RUNTIME ? [{ command: "desktop", pid: process.pid, ppid: 1 }] : [],
      );
      await mkdir(namespaceRoot, { recursive: true });
      await mkdir(config.roots.output.namespaceRoot, { recursive: true });

      const result = await cleanupPackedLinuxNamespace(config, { headless: true });

      expect(result.skipped).toBe(true);
      expect(result.removedOutputRoot).toBe(false);
      expect(result.removedRuntimeNamespaceRoot).toBe(false);
      expect(await pathExists(namespaceRoot)).toBe(true);
      expect(await pathExists(config.roots.output.namespaceRoot)).toBe(true);
    } finally {
      vi.mocked(findSidecarProcesses).mockResolvedValue([]);
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("stopPackedLinuxApp", () => {
  it("stops both exact launch sources without consulting derived files", async () => {
    const stop = vi.mocked(stopSidecar);
    stop.mockClear();
    stop.mockResolvedValue({
      alreadyStopped: true,
      forcedPids: [],
      gracefulAccepted: false,
      matchedPids: [],
      remainingPids: [],
      stoppedPids: [],
    });
    await expect(stopPackedLinuxApp(makeConfig())).resolves.toMatchObject({ status: "not-running" });
    expect(stop).toHaveBeenCalledTimes(12);
    expect(stop).toHaveBeenCalledWith(
      expect.objectContaining({ source: SIDECAR_SOURCES.TOOLS_PACK }),
      undefined,
    );
    expect(stop).toHaveBeenCalledWith(
      expect.objectContaining({ source: SIDECAR_SOURCES.PACKAGED }),
      undefined,
    );
  });
});

describe("resolveProductionInstallCommand", () => {
  it("defaults to npm install --omit=dev --no-package-lock when OD_TOOLS_PACK_PNPM_BIN is unset", () => {
    expect(resolveProductionInstallCommand({})).toEqual({
      command: "npm",
      args: ["install", "--omit=dev", "--no-package-lock"],
    });
  });

  it("treats an empty OD_TOOLS_PACK_PNPM_BIN as unset and keeps the npm host default", () => {
    expect(resolveProductionInstallCommand({ OD_TOOLS_PACK_PNPM_BIN: "" })).toEqual({
      command: "npm",
      args: ["install", "--omit=dev", "--no-package-lock"],
    });
  });

  it("uses OD_TOOLS_PACK_PNPM_BIN with hoisted-layout pnpm flags when set", () => {
    // --config.node-linker=hoisted intentionally matches the prior
    // npm/electron-builder packaging layout so the AppImage pack step keeps
    // working when the assembled-app install runs through pnpm.
    expect(
      resolveProductionInstallCommand({ OD_TOOLS_PACK_PNPM_BIN: "/tmp/pnpm" }),
    ).toEqual({
      command: "/tmp/pnpm",
      args: ["install", "--prod", "--no-lockfile", "--config.node-linker=hoisted"],
    });
  });

  it("chains end-to-end with buildDockerArgs: docker exports OD_TOOLS_PACK_PNPM_BIN and the resolver returns the standalone pnpm install for that value", () => {
    const dockerArgs = buildDockerArgs(makeConfig(), { uid: 1000, gid: 1000 });
    const envFlagIndex = dockerArgs.findIndex(
      (arg, i) => arg === "-e" && dockerArgs[i + 1]?.startsWith("OD_TOOLS_PACK_PNPM_BIN="),
    );
    expect(envFlagIndex).toBeGreaterThan(-1);
    const envValue = dockerArgs[envFlagIndex + 1]?.split("=")[1];
    expect(envValue).toBe("/tmp/pnpm");

    const resolved = resolveProductionInstallCommand({ OD_TOOLS_PACK_PNPM_BIN: envValue });
    expect(resolved).toEqual({
      command: "/tmp/pnpm",
      args: ["install", "--prod", "--no-lockfile", "--config.node-linker=hoisted"],
    });
    expect(resolved.command).not.toBe("npm");
  });
});

describe("renderDesktopTemplate", () => {
  const template = `[Desktop Entry]
Type=Application
Name=Open Design (@@NAMESPACE@@)
Exec=env -u ELECTRON_RUN_AS_NODE OD_PACKAGED_NAMESPACE=@@NAMESPACE@@ @@EXEC_PATH@@ --appimage-extract-and-run %U
Icon=@@ICON_PATH@@
MimeType=x-scheme-handler/od;
`;

  it("substitutes all @@TOKEN@@ placeholders", () => {
    const out = renderDesktopTemplate(template, {
      namespace: "default",
      execPath: "/home/u/.local/bin/Open-Design.default.AppImage",
      iconName: "open-design-default",
    });
    expect(out).toContain("Name=Open Design (default)");
    expect(out).toContain(
      "Exec=env -u ELECTRON_RUN_AS_NODE OD_PACKAGED_NAMESPACE=default /home/u/.local/bin/Open-Design.default.AppImage --appimage-extract-and-run %U",
    );
    expect(out).toContain("Icon=open-design-default");
  });

  it("uses OD_PACKAGED_NAMESPACE (not OD_NAMESPACE) so apps/packaged actually picks up the namespace override", () => {
    const out = renderDesktopTemplate(template, {
      namespace: "ns",
      execPath: "/x",
      iconName: "open-design-ns",
    });
    expect(out).toMatch(/^Exec=env -u ELECTRON_RUN_AS_NODE OD_PACKAGED_NAMESPACE=ns /m);
    expect(out).not.toMatch(/OD_NAMESPACE=/);
  });

  it("unsets ELECTRON_RUN_AS_NODE on the Exec= line so desktop launches run Electron normally", () => {
    const out = renderDesktopTemplate(template, {
      namespace: "ns",
      execPath: "/x",
      iconName: "open-design-ns",
    });
    expect(out).toMatch(/^Exec=env -u ELECTRON_RUN_AS_NODE /m);
  });

  it("preserves --appimage-extract-and-run on the Exec= line so menu launches bypass FUSE", () => {
    const out = renderDesktopTemplate(template, {
      namespace: "ns",
      execPath: "/x",
      iconName: "open-design-ns",
    });
    expect(out).toMatch(/^Exec=.*--appimage-extract-and-run .*%U$/m);
  });

  it("leaves no @@...@@ tokens unsubstituted", () => {
    const out = renderDesktopTemplate(template, {
      namespace: "ns",
      execPath: "/x",
      iconName: "open-design-ns",
    });
    expect(out).not.toMatch(/@@[A-Z_]+@@/);
  });

  it("preserves the MimeType=x-scheme-handler/od; line", () => {
    const out = renderDesktopTemplate(template, {
      namespace: "ns",
      execPath: "/x",
      iconName: "open-design-ns",
    });
    expect(out).toContain("MimeType=x-scheme-handler/od;");
  });
});

describe("renderLinuxPackagedMainEntry", () => {
  it("loads the ESM packaged entry without require or temporary keepalive handles", () => {
    const out = renderLinuxPackagedMainEntry();

    expect(out).toContain('import("@open-design/packaged")');
    expect(out).not.toContain('require("@open-design/packaged")');
    expect(out).not.toContain("setTimeout");
  });
});

describe("LINUX_APPIMAGE_EXECUTABLE_ARGS", () => {
  it("keeps the AppImage no-sandbox fallback explicit for constrained Linux hosts", () => {
    expect([...LINUX_APPIMAGE_EXECUTABLE_ARGS]).toEqual(["--no-sandbox"]);
  });
});

describe("renderLinuxAppImageAppRun", () => {
  it("unsets ELECTRON_RUN_AS_NODE before execing the Electron binary", () => {
    const out = renderLinuxAppImageAppRun();

    expect(out).toContain("unset ELECTRON_RUN_AS_NODE");
    expect(out.indexOf("unset ELECTRON_RUN_AS_NODE")).toBeLessThan(out.indexOf('exec "$BIN"'));
    expect(out).toContain('BIN="$APPDIR/Open Design"');
  });

  it("preserves AppImageLauncher install-only behavior", () => {
    const out = renderLinuxAppImageAppRun();

    expect(out).toContain('if [ -z "$APPIMAGE_EXIT_AFTER_INSTALL" ] ; then');
    expect(out).toContain("trap atexit EXIT");
  });

  it("passes desktop Exec arguments through to Electron", () => {
    const out = renderLinuxAppImageAppRun();

    expect(out).toContain('args=("$@")');
    expect(out).toContain('exec "$BIN" "${args[@]}"');
  });

  it("sets APPIMAGE when running an extracted AppRun directly", () => {
    const out = renderLinuxAppImageAppRun();

    expect(out).toContain('APPIMAGE="$APPDIR/AppRun"');
  });

  linuxOnlyIt("exports APPIMAGE fallback to the execed Electron process", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-apprun-export-"));
    const appDir = join(root, "AppDir");
    const appRunPath = join(appDir, "AppRun");
    const observedEnvPath = join(root, "observed-env.txt");
    const electronPath = join(appDir, "Open Design");

    try {
      await mkdir(appDir, { recursive: true });
      await writeFile(appRunPath, renderLinuxAppImageAppRun(), "utf8");
      await chmod(appRunPath, 0o755);
      await writeFile(
        electronPath,
        `#!/bin/bash
{
  printf 'APPIMAGE=%s\\n' "$APPIMAGE"
  printf 'ELECTRON_RUN_AS_NODE=%s\\n' "\${ELECTRON_RUN_AS_NODE-unset}"
} > ${JSON.stringify(observedEnvPath)}
`,
        "utf8",
      );
      await chmod(electronPath, 0o755);

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        APPDIR: appDir,
        ELECTRON_RUN_AS_NODE: "1",
      };
      delete env.APPIMAGE;
      const child = spawn(appRunPath, [], { env, stdio: "ignore" });
      const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve({ code, signal }));
      });

      expect(exit).toEqual({ code: 0, signal: null });
      expect(await readFile(observedEnvPath, "utf8")).toBe(
        `APPIMAGE=${appRunPath}\nELECTRON_RUN_AS_NODE=unset\n`,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("createLinuxDesktopLaunchEnv", () => {
  it("strips ELECTRON_RUN_AS_NODE before spawning the Electron AppImage", () => {
    const config = makeConfig();
    const stamp = {
      app: APP_KEYS.DESKTOP,
      channel: "stable",
      mode: SIDECAR_MODES.RUNTIME,
      namespace: "default",
      source: SIDECAR_SOURCES.TOOLS_PACK,
    };

    const env = createLinuxDesktopLaunchEnv(config, stamp, {
      ELECTRON_RUN_AS_NODE: "1",
      KEEP_ME: "yes",
    });

    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.KEEP_ME).toBe("yes");
    expect(env.OD_SIDECAR_BASE).toBeUndefined();
  });
});

describe("sanitizeNamespace", () => {
  it("replaces non-alphanumeric chars with hyphens", () => {
    expect(sanitizeNamespace("a/b c")).toBe("a-b-c");
  });
});

describe("resolveLinuxLifecycleMode", () => {
  it("uses headless mode for every lifecycle action when --headless is set", () => {
    expect(resolveLinuxLifecycleMode({ headless: true }, "install")).toBe("headless");
    expect(resolveLinuxLifecycleMode({ headless: true }, "start")).toBe("headless");
    expect(resolveLinuxLifecycleMode({ headless: true }, "stop")).toBe("headless");
    expect(resolveLinuxLifecycleMode({ headless: true }, "uninstall")).toBe("headless");
    expect(resolveLinuxLifecycleMode({ headless: true }, "cleanup")).toBe("headless");
  });

  it("uses appimage mode when --headless is omitted", () => {
    expect(resolveLinuxLifecycleMode({}, "install")).toBe("appimage");
    expect(resolveLinuxLifecycleMode({}, "start")).toBe("appimage");
    expect(resolveLinuxLifecycleMode({}, "stop")).toBe("appimage");
    expect(resolveLinuxLifecycleMode({}, "uninstall")).toBe("appimage");
    expect(resolveLinuxLifecycleMode({}, "cleanup")).toBe("appimage");
  });
});

describe("linuxBundledFilePatterns", () => {
  // Paths as they appear in the assembled app, relative to its root.
  const bundledCruft = [
    "node_modules/@ffmpeg-installer/ffmpeg/index.js~",
    "node_modules/@ffmpeg-installer/ffmpeg/lib/manifest.js~",
    "node_modules/node-pty/prebuilds/win32-x64/pty.node",
    "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
    "node_modules/onnxruntime-node/bin/napi-v3/darwin/x64/libonnxruntime.1.21.1.dylib",
    "node_modules/onnxruntime-node/bin/napi-v3/win32/arm64/onnxruntime_binding.node",
    "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so",
    "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_tensorrt.so",
  ];
  const linuxX64Runtime = [
    "node_modules/node-pty/prebuilds/linux-x64/pty.node",
    "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node",
    "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1",
    "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_shared.so",
    "node_modules/@ffmpeg-installer/ffmpeg/index.js",
  ];

  // Mirrors electron-builder's `files` semantics closely enough for these
  // patterns: the last matching rule wins, `!` negates.
  function bundled(patterns: string[], file: string): boolean {
    let keep = false;
    for (const pattern of patterns) {
      const negated = pattern.startsWith("!");
      const glob = negated ? pattern.slice(1) : pattern;
      if (globMatches(glob, file)) keep = !negated;
    }
    return keep;
  }
  function expandBraces(glob: string): string[] {
    const match = /\{([^{}]*)\}/.exec(glob);
    if (!match) return [glob];
    return match[1]
      .split(",")
      .flatMap((alt) => expandBraces(glob.slice(0, match.index) + alt + glob.slice(match.index + match[0].length)));
  }
  function globMatches(glob: string, file: string): boolean {
    return expandBraces(glob).some((variant) => {
      const source = variant
        .split(/(\*\*\/|\*\*|\*)/)
        .map((part) => (part === "**/" ? "(?:.*/)?" : part === "**" ? ".*" : part === "*" ? "[^/]*" : escape(part)))
        .join("");
      return new RegExp(`^${source}$`).test(file);
    });
  }
  function escape(value: string): string {
    return value.replace(/[.+^$()|[\]\\?]/g, "\\$&");
  }

  it("drops foreign-platform binaries, GPU providers and backup files on x64", () => {
    const patterns = linuxBundledFilePatterns("x64");
    for (const file of bundledCruft) expect(bundled(patterns, file), file).toBe(false);
    for (const file of linuxX64Runtime) expect(bundled(patterns, file), file).toBe(true);
    expect(bundled(patterns, "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/libonnxruntime.so.1")).toBe(false);
  });

  it("keeps the arm64 linux runtime and drops x64 when building on arm64", () => {
    const patterns = linuxBundledFilePatterns("arm64");
    expect(bundled(patterns, "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/libonnxruntime.so.1")).toBe(true);
    expect(bundled(patterns, "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1")).toBe(false);
    expect(bundled(patterns, "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/libonnxruntime_providers_cuda.so")).toBe(false);
  });
});

describe("resolveLinuxBuilderTargets", () => {
  it("maps deb to the electron-builder deb target", () => {
    expect(resolveLinuxBuilderTargets("deb")).toEqual(["deb"]);
  });

  it("maps rpm to the electron-builder rpm target", () => {
    expect(resolveLinuxBuilderTargets("rpm")).toEqual(["rpm"]);
  });

  it("maps dir to an unpacked build", () => {
    expect(resolveLinuxBuilderTargets("dir")).toEqual(["dir"]);
  });

  it("defaults appimage and all to AppImage", () => {
    expect(resolveLinuxBuilderTargets("appimage")).toEqual(["AppImage"]);
    expect(resolveLinuxBuilderTargets("all")).toEqual(["AppImage"]);
  });
});

describe("linuxBuildsAppImage", () => {
  it("is true only for appimage/all so deb, rpm, and dir skip the AppRun wrapper", () => {
    expect(linuxBuildsAppImage("appimage")).toBe(true);
    expect(linuxBuildsAppImage("all")).toBe(true);
    expect(linuxBuildsAppImage("deb")).toBe(false);
    expect(linuxBuildsAppImage("rpm")).toBe(false);
    expect(linuxBuildsAppImage("dir")).toBe(false);
  });
});

describe("writeLinuxBuilderConfig", () => {
  it("generates the rpm target and rpm identity for --to rpm", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-rpm-config-"));
    try {
      const config: ToolPackConfig = {
        ...makeConfig(),
        to: "rpm",
        appVersion: "0.24.1",
        roots: {
          ...makeConfig().roots,
          output: {
            ...makeConfig().roots.output,
            namespaceRoot: join(root, "out", "linux", "namespaces", "default"),
            appBuilderRoot: join(root, "out", "linux", "namespaces", "default", "builder"),
          },
        },
      };
      const paths = resolveLinuxPaths(config);

      await writeLinuxBuilderConfig(config, paths);

      const builderConfig = JSON.parse(await readFile(paths.appBuilderConfigPath, "utf8")) as {
        linux: { target: string[] };
        rpm?: { packageName: string; artifactName?: string; fpm: string[] };
        deb?: unknown;
      };
      expect(builderConfig.linux.target).toEqual(["rpm"]);
      expect(builderConfig.rpm).toEqual({
        packageName: "open-design",
        // Release-friendly filename (electron-builder substitutes ${version} and
        // ${arch} — x86_64 for rpm), so release-notes globs like
        // ./open-design_*.rpm match the real artifact instead of the default
        // "Open Design ..." product name carrying a space.
        artifactName: "open-design_${version}_${arch}.rpm",
        fpm: ["--license", "Apache-2.0"],
        // Post-install fixup: the rpm entry/icon keep the spaced product
        // name, and the icon ships into the undeclared hicolor/1024x1024 —
        // the after-install template relocates both (issues #8587/#8588).
        afterInstall: expect.stringContaining("after-install.tpl"),
      });
      // The referenced template must ship with the checkout (fpm runs it at
      // install time on the user's machine, not at build time). It has to
      // carry the electron-builder default boilerplate (executable symlink,
      // sandbox perms, mime/desktop databases) plus the icon relocation.
      const afterInstallTemplate = builderConfig.rpm.afterInstall as string;
      const afterInstallContent = await readFile(afterInstallTemplate, "utf8");
      expect(afterInstallContent).toMatch(/^#!/m);
      expect(afterInstallContent).toContain("update-alternatives");
      expect(afterInstallContent).toContain("512x512/apps");
      expect(afterInstallContent).toContain("open-design.png");
      expect(afterInstallContent).toContain("Icon=open-design");
      // Explicit targets only: --to rpm must not leak the deb block (and
      // --to all never produces an rpm; resolveLinuxBuilderTargets owns that).
      expect(builderConfig.deb).toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("findBuiltArtifact", () => {
  it("locates the built .rpm in the electron-builder output directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-rpm-artifact-"));
    try {
      const config: ToolPackConfig = {
        ...makeConfig(),
        roots: {
          ...makeConfig().roots,
          output: {
            ...makeConfig().roots.output,
            appBuilderRoot: join(root, "out", "linux", "namespaces", "default", "builder"),
          },
        },
      };
      const paths = resolveLinuxPaths(config);
      await mkdir(paths.appBuilderOutputRoot, { recursive: true });
      const rpmPath = join(paths.appBuilderOutputRoot, "Open Design-default.rpm");
      await writeFile(rpmPath, "rpm-bytes");

      expect(await findBuiltArtifact(paths, ".rpm")).toBe(rpmPath);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("returns null when the output directory holds no .rpm", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-rpm-artifact-empty-"));
    try {
      const config: ToolPackConfig = {
        ...makeConfig(),
        roots: {
          ...makeConfig().roots,
          output: {
            ...makeConfig().roots.output,
            appBuilderRoot: join(root, "out", "linux", "namespaces", "default", "builder"),
          },
        },
      };
      const paths = resolveLinuxPaths(config);
      await mkdir(paths.appBuilderOutputRoot, { recursive: true });
      await writeFile(join(paths.appBuilderOutputRoot, "Open Design-default.AppImage"), "appimage-bytes");

      expect(await findBuiltArtifact(paths, ".rpm")).toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("shouldRejectLinuxHeadlessInspectOptions", () => {
  it("allows status-only headless inspect", () => {
    expect(shouldRejectLinuxHeadlessInspectOptions({})).toBe(false);
  });

  it("rejects headless eval and screenshot requests", () => {
    expect(shouldRejectLinuxHeadlessInspectOptions({ expr: "document.title" })).toBe(true);
    expect(shouldRejectLinuxHeadlessInspectOptions({ path: "/tmp/open-design-linux.png" })).toBe(true);
    expect(
      shouldRejectLinuxHeadlessInspectOptions({
        expr: "document.title",
        path: "/tmp/open-design-linux.png",
      }),
    ).toBe(true);
  });
});

describe("inspectPackedLinuxApp", () => {
  it("rejects unsupported headless inspect options before opening IPC", async () => {
    const getStatus = vi.mocked(getSidecarStatus);
    getStatus.mockClear();

    await expect(
      inspectPackedLinuxApp(makeConfig(), {
        expr: "document.title",
        headless: true,
      }),
    ).rejects.toThrow("linux inspect --headless supports status only; omit --expr and --path");
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("allows desktop inspect eval and screenshot options when headless is omitted", async () => {
    vi.mocked(getSidecarStatus).mockImplementation(async (stamp) => {
      if (stamp.source === SIDECAR_SOURCES.TOOLS_PACK) return { state: "running", url: "od://app/" };
      throw new Error("packaged status unavailable");
    });
    vi.mocked(invokeSidecar)
      .mockResolvedValueOnce({ ok: true, value: "Open Design" })
      .mockResolvedValueOnce({ path: "/tmp/open-design-linux.png" });

    const result = await inspectPackedLinuxApp(makeConfig(), {
      expr: "document.title",
      path: "/tmp/open-design-linux.png",
    });

    expect(result).toEqual({
      eval: { ok: true, value: "Open Design" },
      screenshot: { path: "/tmp/open-design-linux.png" },
      status: { state: "running", url: "od://app/" },
    });
    expect(getSidecarStatus).toHaveBeenCalledTimes(2);
    expect(invokeSidecar).toHaveBeenCalledTimes(2);
  });

  it("targets packaged IPC when a tools-pack process marker is stale", async () => {
    vi.mocked(findSidecarProcesses).mockImplementation(async (stamp) =>
      stamp.source === SIDECAR_SOURCES.TOOLS_PACK ? [{ command: "desktop", pid: 42, ppid: 1 }] : [],
    );
    vi.mocked(getSidecarStatus).mockImplementation(async (stamp) => {
      if (stamp.source === SIDECAR_SOURCES.PACKAGED) return { state: "running", url: "od://app/" };
      throw new Error("stale tools-pack endpoint");
    });
    vi.mocked(invokeSidecar).mockResolvedValueOnce({ ok: true, value: "Open Design" });

    const result = await inspectPackedLinuxApp(makeConfig(), { expr: "document.title" });

    expect(result.status).toEqual({ state: "running", url: "od://app/" });
    expect(invokeSidecar).toHaveBeenCalledWith(
      expect.objectContaining({ source: SIDECAR_SOURCES.PACKAGED }),
      SIDECAR_MESSAGES.EVAL,
      { expression: "document.title" },
      { timeoutMs: 5000 },
    );
  });
});

describe("matchesAppImageProcess", () => {
  const installPath = "/home/u/.local/bin/Open-Design.default.AppImage";

  it("matches FUSE-mode (executable === installPath)", () => {
    const ok = matchesAppImageProcess(
      { pid: 1234, executable: installPath, env: {} },
      installPath,
    );
    expect(ok).toBe(true);
  });

  it("matches extracted-mode (env.APPIMAGE === installPath, executable matches /tmp/.mount_*/AppRun)", () => {
    const ok = matchesAppImageProcess(
      { pid: 1234, executable: "/tmp/.mount_abc123/AppRun", env: { APPIMAGE: installPath } },
      installPath,
    );
    expect(ok).toBe(true);
  });

  it("rejects unrelated processes", () => {
    const ok = matchesAppImageProcess(
      { pid: 9999, executable: "/usr/bin/node", env: {} },
      installPath,
    );
    expect(ok).toBe(false);
  });

  it("rejects extracted-mode with mismatched APPIMAGE env", () => {
    const ok = matchesAppImageProcess(
      { pid: 1234, executable: "/tmp/.mount_abc/AppRun", env: { APPIMAGE: "/other/path.AppImage" } },
      installPath,
    );
    expect(ok).toBe(false);
  });

  it("rejects extracted-mode when APPIMAGE env is missing", () => {
    const ok = matchesAppImageProcess(
      { pid: 1234, executable: "/tmp/.mount_abc123/AppRun", env: {} },
      installPath,
    );
    expect(ok).toBe(false);
  });

  it("matches direct AppRun fallback when APPIMAGE points to the sibling AppRun", () => {
    const ok = matchesAppImageProcess(
      {
        pid: 1234,
        executable: "/tmp/appimage_extracted_fe548e54/Open Design",
        env: { APPIMAGE: "/tmp/appimage_extracted_fe548e54/AppRun" },
      },
      installPath,
    );
    expect(ok).toBe(true);
  });

  it("rejects direct AppRun fallback when APPIMAGE points outside the executable directory", () => {
    const ok = matchesAppImageProcess(
      {
        pid: 1234,
        executable: "/tmp/appimage_extracted_fe548e54/Open Design",
        env: { APPIMAGE: "/tmp/other/AppRun" },
      },
      installPath,
    );
    expect(ok).toBe(false);
  });

  it("matches --appimage-extract-and-run mode (executable in /tmp/appimage_extracted_*/<binary>)", () => {
    const ok = matchesAppImageProcess(
      {
        pid: 1234,
        executable: "/tmp/appimage_extracted_fe548e54/Open Design",
        env: { APPIMAGE: installPath },
      },
      installPath,
    );
    expect(ok).toBe(true);
  });

  it("rejects extract-and-run mode with mismatched APPIMAGE env", () => {
    const ok = matchesAppImageProcess(
      {
        pid: 1234,
        executable: "/tmp/appimage_extracted_fe548e54/Open Design",
        env: { APPIMAGE: "/elsewhere/Other.AppImage" },
      },
      installPath,
    );
    expect(ok).toBe(false);
  });
});

describe("resolveLinuxPaths web standalone hook paths", () => {
  it("places the hook config and audit report under the namespace root like the mac lane", () => {
    const paths = resolveLinuxPaths(makeConfig());

    expect(paths.webStandaloneHookConfigPath).toBe(
      "/work/.tmp/tools-pack/out/linux/namespaces/default/web-standalone-after-pack-config.json",
    );
    expect(paths.webStandaloneHookAuditPath).toBe(
      "/work/.tmp/tools-pack/out/linux/namespaces/default/web-standalone-after-pack-audit.json",
    );
  });
});

describe("writeWebStandaloneHookConfig", () => {
  async function writeStandaloneFixture(workspaceRoot: string): Promise<void> {
    const serverPath = join(
      workspaceRoot,
      "apps",
      "web",
      ".next",
      "standalone",
      "apps",
      "web",
      "server.js",
    );
    await mkdir(dirname(serverPath), { recursive: true });
    await writeFile(serverPath, "// standalone server fixture\n", "utf8");
  }

  function configWithWorkspace(workspaceRoot: string, root?: string): ToolPackConfig {
    const outputNamespaceRoot = root == null
      ? makeConfig().roots.output.namespaceRoot
      : join(root, "out", "linux", "namespaces", "default");
    return {
      ...makeConfig(),
      containerized: false,
      webOutputMode: "standalone",
      workspaceRoot,
      roots: {
        ...makeConfig().roots,
        output: {
          ...makeConfig().roots.output,
          namespaceRoot: outputNamespaceRoot,
          appBuilderRoot: join(outputNamespaceRoot, "builder"),
        },
      },
    };
  }

  it("throws with the shared mac/win clarity when no standalone server was produced", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-webstandalone-missing-"));
    try {
      // The throw happens before any file is written, so the unreachable
      // /work-shaped default roots do not matter for this assertion.
      await expect(writeWebStandaloneHookConfig(configWithWorkspace(root), resolveLinuxPaths(configWithWorkspace(root))))
        .rejects.toThrow("Next.js standalone server output was not produced under apps/web/.next/standalone");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("writes the hook config consumed by the linux after-pack hook", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-webstandalone-config-"));
    try {
      await writeStandaloneFixture(root);
      const config = configWithWorkspace(root, root);
      const paths = resolveLinuxPaths(config);

      const configPath = await writeWebStandaloneHookConfig(config, paths);
      expect(configPath).toBe(paths.webStandaloneHookConfigPath);

      const hookConfig = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
      expect(hookConfig).toEqual({
        auditReportPath: paths.webStandaloneHookAuditPath,
        // Must equal the packaged app's resolvePackagedWebStandaloneRoot default.
        resourceName: "open-design-web-standalone",
        standaloneSourceRoot: join(root, "apps", "web", ".next", "standalone"),
        version: 1,
        webPublicSourceRoot: join(root, "apps", "web", "public"),
        webStaticSourceRoot: join(root, "apps", "web", ".next", "static"),
        workspaceRoot: root,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("writeLinuxBuilderConfig web standalone", () => {
  function configWithRoot(root: string, overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
    return {
      ...makeConfig(),
      ...overrides,
      roots: {
        ...makeConfig().roots,
        output: {
          ...makeConfig().roots.output,
          namespaceRoot: join(root, "out", "linux", "namespaces", "default"),
          appBuilderRoot: join(root, "out", "linux", "namespaces", "default", "builder"),
        },
      },
    };
  }

  it("registers the linux web-standalone after-pack hook for standalone builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-buildercfg-standalone-"));
    try {
      const config = configWithRoot(root, { appVersion: "0.24.1", webOutputMode: "standalone" });
      const paths = resolveLinuxPaths(config);

      await writeLinuxBuilderConfig(config, paths);

      const builderConfig = JSON.parse(await readFile(paths.appBuilderConfigPath, "utf8")) as {
        afterPack?: string;
      };
      expect(builderConfig.afterPack).toBe(linuxResources.webStandaloneAfterPackHook);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("omits the after-pack hook for server-mode builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-buildercfg-server-"));
    try {
      const config = configWithRoot(root, { appVersion: "0.24.1", webOutputMode: "server" });
      const paths = resolveLinuxPaths(config);

      await writeLinuxBuilderConfig(config, paths);

      const builderConfig = JSON.parse(await readFile(paths.appBuilderConfigPath, "utf8")) as {
        afterPack?: string;
      };
      expect(builderConfig.afterPack).toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
