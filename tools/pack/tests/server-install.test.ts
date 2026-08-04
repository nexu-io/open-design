import { spawn, type ChildProcess } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build as esbuild } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";

import {
  isInstallServerCliEntrypoint,
  installServerPayload,
  parseServerCurrentReleaseId,
  renderWindowsStableServerLauncher,
} from "../src/server/install-core.js";
import {
  writeServerReleaseManifest,
} from "../src/server/manifest.js";
import {
  hostServerTarget,
  type ServerTarget,
} from "../src/server/config.js";

const roots: string[] = [];
const childProcesses = new Set<ChildProcess>();

afterEach(async () => {
  const exits = [...childProcesses].map(
    (child) =>
      new Promise<void>((resolveExit) => {
        if (child.exitCode != null || child.signalCode != null) {
          resolveExit();
          return;
        }
        child.once("close", () => resolveExit());
        child.kill("SIGKILL");
      }),
  );
  await Promise.all(exits);
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function writeExecutable(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
  await chmod(path, 0o755);
}

async function writePayload(options: {
  appVersion: string;
  contents?: string;
  openDesignLauncherContents?: string;
  odLauncherContents?: string;
  payloadRoot: string;
  releaseId: string;
  target: ServerTarget;
}): Promise<void> {
  const releaseRoot = join(
    options.payloadRoot,
    "releases",
    options.releaseId,
  );
  await writeExecutable(
    join(releaseRoot, "apps", "daemon", "dist", "daemon-cli.mjs"),
    options.contents ??
      "if (process.argv.includes('--help')) process.exit(0);\n",
  );
  if (options.target.platform === "win32") {
    const defaultLauncher = [
      "@echo off",
      'for %%I in ("%~dp0..") do set "OD_RELEASE_ROOT=%%~fI"',
      '"%OD_NODE_BIN%" "%OD_RELEASE_ROOT%\\apps\\daemon\\dist\\daemon-cli.mjs" %*',
      "exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n");
    await writeExecutable(
      join(releaseRoot, "bin", "open-design.cmd"),
      options.openDesignLauncherContents ?? defaultLauncher,
    );
    await writeExecutable(
      join(releaseRoot, "bin", "od.cmd"),
      options.odLauncherContents ?? defaultLauncher,
    );
  } else {
    const defaultLauncher = [
      "#!/bin/sh",
      "set -eu",
      "source_path=$0",
      'while [ -L "$source_path" ]; do',
      '  source_dir=$(CDPATH= cd -- "$(dirname -- "$source_path")" && pwd -P)',
      '  source_target=$(readlink "$source_path")',
      '  case "$source_target" in',
      '    /*) source_path=$source_target ;;',
      '    *) source_path=$source_dir/$source_target ;;',
      "  esac",
      "done",
      'bin_dir=$(CDPATH= cd -- "$(dirname -- "$source_path")" && pwd -P)',
      'release_root=$(CDPATH= cd -- "$bin_dir/.." && pwd -P)',
      'exec "${OD_NODE_BIN:-node}" "$release_root/apps/daemon/dist/daemon-cli.mjs" "$@"',
      "",
    ].join("\n");
    await writeExecutable(
      join(releaseRoot, "bin", "open-design"),
      options.openDesignLauncherContents ?? defaultLauncher,
    );
    await writeExecutable(
      join(releaseRoot, "bin", "od"),
      options.odLauncherContents ?? defaultLauncher,
    );
  }
  await writeServerReleaseManifest({
    appVersion: options.appVersion,
    nodeAbi: process.versions.modules,
    releaseId: options.releaseId,
    releaseRoot,
    target: options.target,
  });
}

async function readCurrentReleaseId(
  installRoot: string,
  target: ServerTarget,
): Promise<string> {
  if (target.platform === "win32") {
    return (await readFile(join(installRoot, "current"), "utf8")).trim();
  }
  const targetPath = await readlink(join(installRoot, "current"));
  return targetPath.replaceAll("\\", "/").split("/").at(-1) ?? "";
}

async function replaceCurrentReleaseId(
  installRoot: string,
  target: ServerTarget,
  releaseId: string,
): Promise<void> {
  const temporaryPath = join(installRoot, ".current-test");
  await rm(temporaryPath, { force: true });
  if (target.platform === "win32") {
    await writeFile(temporaryPath, `${releaseId}\n`, "utf8");
  } else {
    await symlink(`releases/${releaseId}`, temporaryPath);
  }
  await rename(temporaryPath, join(installRoot, "current"));
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await access(path).then(() => true, () => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`timed out waiting for installer fixture: ${path}`);
}

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const isAlive = (() => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
      }
    })();
    if (!isAlive) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`timed out waiting for smoke descendant ${String(pid)} to exit`);
}

async function within<T>(
  promise: Promise<T>,
  timeoutMs: number,
  description: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`timed out waiting for ${description}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout != null) clearTimeout(timeout);
  }
}

function blockingFailureLauncher(
  target: ServerTarget,
  markerPath: string,
  continuePath: string,
): string {
  if (target.platform === "win32") {
    return [
      "@echo off",
      `type nul > "${markerPath}"`,
      ":wait_for_test",
      `if not exist "${continuePath}" (`,
      "  ping 127.0.0.1 -n 2 >nul",
      "  goto wait_for_test",
      ")",
      "echo concurrent smoke failure 1>&2",
      "exit /b 72",
      "",
    ].join("\r\n");
  }
  const quote = (value: string): string =>
    `'${value.replaceAll("'", "'\\''")}'`;
  return [
    "#!/bin/sh",
    "set -eu",
    `marker=${quote(markerPath)}`,
    `continue_path=${quote(continuePath)}`,
    ': > "$marker"',
    'while [ ! -f "$continue_path" ]; do sleep 0.01; done',
    "echo concurrent smoke failure >&2",
    "exit 72",
    "",
  ].join("\n");
}

function blockingSuccessLauncher(
  target: ServerTarget,
  markerPath: string,
  continuePath: string,
): string {
  return blockingFailureLauncher(target, markerPath, continuePath)
    .replace("echo concurrent smoke failure 1>&2\r\nexit /b 72", "exit /b 0")
    .replace("echo concurrent smoke failure >&2\nexit 72", "exit 0");
}

function markerSuccessLauncher(
  target: ServerTarget,
  markerPath: string,
): string {
  if (target.platform === "win32") {
    return [
      "@echo off",
      `type nul > "${markerPath}"`,
      "exit /b 0",
      "",
    ].join("\r\n");
  }
  const escapedPath = `'${markerPath.replaceAll("'", "'\\''")}'`;
  return [
    "#!/bin/sh",
    "set -eu",
    `: > ${escapedPath}`,
    "exit 0",
    "",
  ].join("\n");
}

function nodeFixtureLauncher(
  target: ServerTarget,
  fixturePath: string,
): string {
  if (target.platform === "win32") {
    return [
      "@echo off",
      `"%OD_NODE_BIN%" "${fixturePath}"`,
      "exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n");
  }
  const escapedPath = `'${fixturePath.replaceAll("'", "'\\''")}'`;
  return [
    "#!/bin/sh",
    "set -eu",
    `exec "\${OD_NODE_BIN:-node}" ${escapedPath}`,
    "",
  ].join("\n");
}

async function bundleInstallCoreForChild(root: string): Promise<string> {
  const outfile = join(root, "install-core-child.mjs");
  await esbuild({
    bundle: true,
    entryPoints: [
      fileURLToPath(
        new URL("../src/server/install-core.ts", import.meta.url),
      ),
    ],
    format: "esm",
    logLevel: "silent",
    outfile,
    platform: "node",
    target: "node24",
  });
  return outfile;
}

function runInstallChild(
  installerPath: string,
  options: {
    archiveSha256: string;
    binDir: string;
    installRoot: string;
    payloadRoot: string;
  },
): {
  child: ChildProcess;
  completion: Promise<void>;
} {
  const child = spawn(
    process.execPath,
    [
      installerPath,
      "install",
      "--payload-root",
      options.payloadRoot,
      "--install-root",
      options.installRoot,
      "--bin-dir",
      options.binDir,
      "--archive-sha256",
      options.archiveSha256,
      "--node-bin",
      process.execPath,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  childProcesses.add(child);
  const completion = new Promise<void>((resolveChild, rejectChild) => {
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", rejectChild);
    child.once("close", (code, signal) => {
      childProcesses.delete(child);
      if (code === 0 && signal == null) {
        resolveChild();
        return;
      }
      rejectChild(
        new Error(
          `installer child failed (${signal ?? `exit ${String(code)}`}): ${stderr}`,
        ),
      );
    });
  });
  void completion.catch(() => undefined);
  return { child, completion };
}

describe("server payload installer", () => {
  it("terminates the smoke process tree on timeout and bounds stderr diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const payloadRoot = join(root, "payload");
    const descendantPidPath = join(root, "smoke-descendant.pid");
    const target = hostServerTarget();
    await writePayload({
      appVersion: "1.2.3",
      contents: [
        'import { spawn } from "node:child_process";',
        'import { writeFileSync } from "node:fs";',
        "if (process.argv.includes('--help')) {",
        "  const descendant = spawn(process.execPath, [",
        "    '-e',",
        "    'setInterval(() => undefined, 1_000)',",
        "  ], { stdio: 'ignore' });",
        `  writeFileSync(${JSON.stringify(descendantPidPath)}, String(descendant.pid));`,
        "  process.stderr.write('x'.repeat(128 * 1_024));",
        "  setInterval(() => undefined, 1_000);",
        "}",
        "",
      ].join("\n"),
      payloadRoot,
      releaseId: "timeout-release",
      target,
    });

    const error = await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir: join(root, "bin"),
      installRoot: join(root, "install"),
      nodeBin: process.execPath,
      payloadRoot,
      smokeTimeoutMs: 250,
    }).then(
      () => null,
      (reason: unknown) =>
        reason instanceof Error ? reason : new Error(String(reason)),
    );

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/smoke timed out after 250ms/);
    expect(error?.message).toContain("stderr bytes truncated");
    expect(error?.message.length).toBeLessThan(20_000);
    await waitForFile(descendantPidPath);
    await waitForProcessExit(
      Number.parseInt(await readFile(descendantPidPath, "utf8"), 10),
    );
  });

  it("strictly validates platform current pointer encodings", () => {
    expect(
      parseServerCurrentReleaseId("releases/release-1", "darwin"),
    ).toBe("release-1");
    expect(
      parseServerCurrentReleaseId("releases/1.2.3+abc", "linux"),
    ).toBe("1.2.3+abc");
    for (const invalid of [
      "/outside/releases/release-1",
      "../releases/release-1",
      "./releases/release-1",
      "releases/release-1/extra",
      "releases/release..1",
    ]) {
      expect(() => parseServerCurrentReleaseId(invalid, "linux")).toThrow(
        /invalid server current pointer/,
      );
    }

    expect(parseServerCurrentReleaseId("release-1\n", "win32")).toBe(
      "release-1",
    );
    expect(parseServerCurrentReleaseId("release-1\r\n", "win32")).toBe(
      "release-1",
    );
    for (const invalid of [
      "",
      "release-1\nrelease-2\n",
      "../release-1",
      "release/release-1",
      "release..1\n",
      " release-1\n",
    ]) {
      expect(() => parseServerCurrentReleaseId(invalid, "win32")).toThrow(
        /invalid server current pointer/,
      );
    }
  });

  it("chains the Windows stable launcher directly without CALL re-expansion", () => {
    const rendered = renderWindowsStableServerLauncher(
      "C:\\Open %Design%",
      "open-design",
    );
    expect(rendered.toLowerCase()).not.toContain("call ");
    expect(rendered).toContain('set "OD_INSTALL_ROOT=C:\\Open %%Design%%"');
    expect(rendered.trimEnd().split(/\r?\n/).at(-1)).toBe(
      '"%OD_INSTALL_ROOT%\\releases\\%OD_RELEASE_ID%\\bin\\open-design.cmd" %*',
    );
  });

  it("rejects an unsafe installed current pointer before publishing or replacing launchers", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const payloadRoot = join(root, "payload");
    const target = hostServerTarget();
    await mkdir(installRoot, { recursive: true });
    if (target.platform === "win32") {
      await writeFile(
        join(installRoot, "current"),
        "release-one\r\nrelease-two\r\n",
        "utf8",
      );
    } else {
      await symlink(
        join(root, "outside", "release-one"),
        join(installRoot, "current"),
      );
    }
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot,
      releaseId: "release-one",
      target,
    });

    await expect(
      installServerPayload({
        archiveSha256: "a".repeat(64),
        binDir,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot,
      }),
    ).rejects.toThrow(/invalid server current pointer/);
    await expect(
      access(join(installRoot, "releases", "release-one")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(
        join(
          binDir,
          target.platform === "win32" ? "open-design.cmd" : "open-design",
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an unsafe manifest release id before first-install current creation", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const payloadRoot = join(root, "payload");
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot,
      releaseId: "release..one",
      target,
    });

    await expect(
      installServerPayload({
        archiveSha256: "a".repeat(64),
        binDir,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot,
      }),
    ).rejects.toThrow(/release id is not one safe path segment/);
    await expect(access(join(installRoot, "current"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("deduplicates identical install and launcher lock roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const payloadRoot = join(root, "payload");
    const target = hostServerTarget();
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot,
      releaseId: "same-lock-root",
      target,
    });

    await within(
      installServerPayload({
        archiveSha256: "a".repeat(64),
        binDir: installRoot,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot,
      }),
      5_000,
      "deduplicated install locks",
    );
    expect(await readCurrentReleaseId(installRoot, target)).toBe(
      "same-lock-root",
    );
  });

  it("recognizes a CLI entrypoint across canonical temp-directory aliases", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const entrypoint = join(root, "install-core.mjs");
    await writeFile(entrypoint, "", "utf8");

    const moduleUrl = pathToFileURL(await realpath(entrypoint)).href;
    expect(isInstallServerCliEntrypoint(moduleUrl, entrypoint)).toBe(true);

    // Windows argv paths often differ in drive-letter / segment casing from the
    // file URL form of import.meta.url; identity must still hold.
    if (process.platform === "win32") {
      const flippedCase = entrypoint.replace(/[a-zA-Z]/g, (ch) =>
        ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase(),
      );
      expect(isInstallServerCliEntrypoint(moduleUrl, flippedCase)).toBe(true);
    }
  });

  it("publishes an immutable release and atomically points current at it", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const payloadRoot = join(root, "payload");
    const releaseId = "1.2.3+abc1234";
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot,
      releaseId,
      target,
    });

    const result = await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot,
    });

    expect(result).toMatchObject({
      changed: true,
      previousReleaseId: null,
      releaseId,
    });
    expect(await readCurrentReleaseId(installRoot, target)).toBe(releaseId);
    if (target.platform === "win32") {
      expect(await readFile(join(binDir, "open-design.cmd"), "utf8")).toContain(
        "%OD_INSTALL_ROOT%\\current",
      );
      expect(await readFile(join(binDir, "od.cmd"), "utf8")).toContain(
        "%OD_INSTALL_ROOT%\\current",
      );
    } else {
      expect(await readlink(join(binDir, "open-design"))).toBe(
        join(installRoot, "current", "bin", "open-design"),
      );
      expect(await readlink(join(binDir, "od"))).toBe(
        join(installRoot, "current", "bin", "od"),
      );
    }
  });

  it("preserves the previous immutable release while switching current", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();

    for (const [appVersion, releaseId] of [
      ["1.2.3", "release-one"],
      ["1.2.4", "release-two"],
    ] as const) {
      const payloadRoot = join(root, `payload-${releaseId}`);
      await writePayload({
        appVersion,
        payloadRoot,
        releaseId,
        target,
      });
      await installServerPayload({
        archiveSha256: releaseId === "release-one" ? "a".repeat(64) : "b".repeat(64),
        binDir,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot,
      });
    }

    expect(await readCurrentReleaseId(installRoot, target)).toBe("release-two");
    await expect(
      access(join(installRoot, "releases", "release-one", "RELEASE.json")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(installRoot, "releases", "release-two", "RELEASE.json")),
    ).resolves.toBeUndefined();
  });

  it("rejects the same release id when its verified content differs", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const releaseId = "immutable-release";
    const target = hostServerTarget();
    const firstPayload = join(root, "payload-first");
    const secondPayload = join(root, "payload-second");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId,
      target,
    });
    await writePayload({
      appVersion: "1.2.3",
      contents:
        "if (process.argv.includes('--help')) process.exit(0);\n// different bytes\n",
      payloadRoot: secondPayload,
      releaseId,
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    await expect(
      installServerPayload({
        archiveSha256: "b".repeat(64),
        binDir,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot: secondPayload,
      }),
    ).rejects.toThrow(/release id already exists with different content/);
    expect(await readCurrentReleaseId(installRoot, target)).toBe(releaseId);
  });

  it("rejects the same release id when only verified manifest metadata differs", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const releaseId = "immutable-metadata-release";
    const target = hostServerTarget();
    const firstPayload = join(root, "payload-first");
    const secondPayload = join(root, "payload-second");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId,
      target,
    });
    await writePayload({
      appVersion: "1.2.4",
      payloadRoot: secondPayload,
      releaseId,
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    await expect(
      installServerPayload({
        archiveSha256: "b".repeat(64),
        binDir,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot: secondPayload,
      }),
    ).rejects.toThrow(/release id already exists with different content/);
    expect(await readCurrentReleaseId(installRoot, target)).toBe(releaseId);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a release-root symlink introduced during publication",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
      roots.push(root);
      const installRoot = join(root, "install");
      const binDir = join(root, "bin");
      const payloadRoot = join(root, "payload");
      const releaseId = "raced-release";
      const target = hostServerTarget();
      await writePayload({
        appVersion: "1.2.3",
        payloadRoot,
        releaseId,
        target,
      });
      const sourceReleaseRoot = join(payloadRoot, "releases", releaseId);
      const releaseStaged = Promise.withResolvers<void>();
      const commitRelease = Promise.withResolvers<void>();
      const installation = installServerPayload(
        {
          archiveSha256: "a".repeat(64),
          binDir,
          installRoot,
          nodeBin: process.execPath,
          payloadRoot,
        },
        {
          beforeReleaseCommit: async () => {
            releaseStaged.resolve();
            await commitRelease.promise;
          },
        },
      );
      const releasesRoot = join(installRoot, "releases");
      try {
        await within(
          releaseStaged.promise,
          5_000,
          "release publication staging",
        );
        await symlink(
          sourceReleaseRoot,
          join(releasesRoot, releaseId),
        );
      } finally {
        commitRelease.resolve();
      }

      await expect(installation).rejects.toThrow(
        /release destination is not a real directory/,
      );
      await expect(
        readlink(join(releasesRoot, releaseId)),
      ).resolves.toBe(sourceReleaseRoot);
      await expect(access(join(installRoot, "current"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("runs the post-flip smoke through the stable public launcher and restores the prior launchers", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();
    const firstPayload = join(root, "payload-first");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId: "release-one",
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    const launcherNames =
      target.platform === "win32"
        ? ["open-design.cmd", "od.cmd"]
        : ["open-design", "od"];
    const priorLauncherContents = target.platform === "win32"
      ? "@echo prior launcher\r\n@exit /b 0\r\n"
      : "#!/bin/sh\necho prior launcher\nexit 0\n";
    for (const launcherName of launcherNames) {
      const launcherPath = join(binDir, launcherName);
      await rm(launcherPath, { force: true });
      await writeExecutable(launcherPath, priorLauncherContents);
    }

    const secondPayload = join(root, "payload-second");
    await writePayload({
      appVersion: "1.2.4",
      openDesignLauncherContents:
        target.platform === "win32"
          ? "@echo stable launcher smoke failed 1>&2\r\n@exit /b 71\r\n"
          : "#!/bin/sh\necho stable launcher smoke failed >&2\nexit 71\n",
      payloadRoot: secondPayload,
      releaseId: "release-two",
      target,
    });

    await expect(
      installServerPayload({
        archiveSha256: "b".repeat(64),
        binDir,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot: secondPayload,
      }),
    ).rejects.toThrow(/stable launcher smoke failed/);

    expect(await readCurrentReleaseId(installRoot, target)).toBe("release-one");
    for (const launcherName of launcherNames) {
      await expect(readFile(join(binDir, launcherName), "utf8")).resolves.toBe(
        priorLauncherContents,
      );
    }
  });

  it("does not roll current back over a concurrent successful switch", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();
    const firstPayload = join(root, "payload-first");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId: "release-one",
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    const markerPath = join(root, "post-flip-smoke-started");
    const continuePath = join(root, "continue-post-flip-smoke");
    const secondPayload = join(root, "payload-second");
    await writePayload({
      appVersion: "1.2.4",
      openDesignLauncherContents: blockingFailureLauncher(
        target,
        markerPath,
        continuePath,
      ),
      payloadRoot: secondPayload,
      releaseId: "release-two",
      target,
    });

    const installation = installServerPayload({
      archiveSha256: "b".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: secondPayload,
    });
    const installationFailure = expect(installation).rejects.toThrow(
      /concurrent smoke failure/,
    );
    try {
      await waitForFile(markerPath);
      await mkdir(join(installRoot, "releases", "concurrent-release"), {
        recursive: true,
      });
      await replaceCurrentReleaseId(
        installRoot,
        target,
        "concurrent-release",
      );
    } finally {
      await writeFile(continuePath, "", "utf8");
    }
    await installationFailure;

    expect(await readCurrentReleaseId(installRoot, target)).toBe(
      "concurrent-release",
    );
  });

  it("serializes real concurrent installer processes across the full switch transaction", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();
    const installerPath = await bundleInstallCoreForChild(root);

    const firstPayload = join(root, "payload-first");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId: "release-one",
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    const firstPostMarker = join(root, "first-post-smoke");
    const releaseFirstPost = join(root, "release-first-post-smoke");
    const secondPayload = join(root, "payload-second");
    await writePayload({
      appVersion: "1.2.4",
      openDesignLauncherContents: blockingSuccessLauncher(
        target,
        firstPostMarker,
        releaseFirstPost,
      ),
      payloadRoot: secondPayload,
      releaseId: "release-two",
      target,
    });
    const firstInstall = runInstallChild(installerPath, {
      archiveSha256: "b".repeat(64),
      binDir,
      installRoot,
      payloadRoot: secondPayload,
    });
    await waitForFile(firstPostMarker);

    const secondPreMarker = join(root, "second-pre-smoke");
    const secondPostMarker = join(root, "second-post-smoke");
    const thirdPayload = join(root, "payload-third");
    await writePayload({
      appVersion: "1.2.5",
      contents: [
        'import { writeFileSync } from "node:fs";',
        `writeFileSync(${JSON.stringify(secondPreMarker)}, "");`,
        "setTimeout(() => process.exit(0), 200);",
        "",
      ].join("\n"),
      openDesignLauncherContents: markerSuccessLauncher(
        target,
        secondPostMarker,
      ),
      payloadRoot: thirdPayload,
      releaseId: "release-three",
      target,
    });
    const secondInstall = runInstallChild(installerPath, {
      archiveSha256: "c".repeat(64),
      binDir,
      installRoot,
      payloadRoot: thirdPayload,
    });
    await waitForFile(secondPreMarker);
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
    const secondReachedPostBeforeRelease = await access(secondPostMarker).then(
      () => true,
      () => false,
    );

    await writeFile(releaseFirstPost, "", "utf8");
    await Promise.all([firstInstall.completion, secondInstall.completion]);

    expect(secondReachedPostBeforeRelease).toBe(false);
    await expect(access(secondPostMarker)).resolves.toBeUndefined();
    expect(await readCurrentReleaseId(installRoot, target)).toBe(
      "release-three",
    );
  }, 15_000);

  it("serializes different install roots that share one stable launcher directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const firstInstallRoot = join(root, "install-first");
    const secondInstallRoot = join(root, "install-second");
    const binDir = join(root, "shared-bin");
    const target = hostServerTarget();
    const installerPath = await bundleInstallCoreForChild(root);

    const firstPayload = join(root, "payload-first");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId: "first-release-one",
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot: firstInstallRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    const blockedPostMarker = join(root, "blocked-post-smoke");
    const releaseBlockedSmoke = join(root, "release-blocked-smoke");
    const failingPayload = join(root, "payload-failing");
    await writePayload({
      appVersion: "1.2.4",
      openDesignLauncherContents: blockingFailureLauncher(
        target,
        blockedPostMarker,
        releaseBlockedSmoke,
      ),
      payloadRoot: failingPayload,
      releaseId: "first-release-two",
      target,
    });
    const failingInstall = runInstallChild(installerPath, {
      archiveSha256: "b".repeat(64),
      binDir,
      installRoot: firstInstallRoot,
      payloadRoot: failingPayload,
    });
    await waitForFile(blockedPostMarker);

    const sharedPreMarker = join(root, "shared-bin-pre-smoke");
    const sharedPostMarker = join(root, "shared-bin-post-smoke");
    const successfulPayload = join(root, "payload-successful");
    await writePayload({
      appVersion: "2.0.0",
      contents: [
        'import { writeFileSync } from "node:fs";',
        `writeFileSync(${JSON.stringify(sharedPreMarker)}, "");`,
        "setTimeout(() => process.exit(0), 200);",
        "",
      ].join("\n"),
      openDesignLauncherContents: markerSuccessLauncher(
        target,
        sharedPostMarker,
      ),
      payloadRoot: successfulPayload,
      releaseId: "second-release-one",
      target,
    });
    const successfulInstall = runInstallChild(installerPath, {
      archiveSha256: "c".repeat(64),
      binDir,
      installRoot: secondInstallRoot,
      payloadRoot: successfulPayload,
    });
    await waitForFile(sharedPreMarker);
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
    const successfulInstallReachedPost = await access(sharedPostMarker).then(
      () => true,
      () => false,
    );

    await writeFile(releaseBlockedSmoke, "", "utf8");
    await expect(failingInstall.completion).rejects.toThrow(
      /concurrent smoke failure/,
    );
    await successfulInstall.completion;

    expect(successfulInstallReachedPost).toBe(false);
    expect(await readCurrentReleaseId(firstInstallRoot, target)).toBe(
      "first-release-one",
    );
    expect(await readCurrentReleaseId(secondInstallRoot, target)).toBe(
      "second-release-one",
    );
    if (target.platform === "win32") {
      await expect(
        readFile(join(binDir, "open-design.cmd"), "utf8"),
      ).resolves.toContain(`OD_INSTALL_ROOT=${secondInstallRoot}`);
    } else {
      await expect(readlink(join(binDir, "open-design"))).resolves.toBe(
        join(secondInstallRoot, "current", "bin", "open-design"),
      );
    }
  }, 15_000);

  it("blocks unsafe takeover of a lock left by an abnormally terminated installer", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();
    const installerPath = await bundleInstallCoreForChild(root);

    const firstPayload = join(root, "payload-first");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId: "release-one",
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    const abandonedMarker = join(root, "abandoned-post-smoke");
    const abandonedPidPath = join(root, "abandoned-post-smoke.pid");
    const releaseAbandonedSmoke = join(root, "release-abandoned-smoke");
    const abandonedFixturePath = join(root, "abandoned-smoke-fixture.mjs");
    await writeFile(
      abandonedFixturePath,
      [
        'import { existsSync, writeFileSync } from "node:fs";',
        `writeFileSync(${JSON.stringify(abandonedPidPath)}, String(process.pid));`,
        `writeFileSync(${JSON.stringify(abandonedMarker)}, "");`,
        "const poll = setInterval(() => {",
        `  if (existsSync(${JSON.stringify(releaseAbandonedSmoke)})) {`,
        "    clearInterval(poll);",
        "    process.exit(0);",
        "  }",
        "}, 10);",
        "",
      ].join("\n"),
      "utf8",
    );
    const secondPayload = join(root, "payload-second");
    await writePayload({
      appVersion: "1.2.4",
      openDesignLauncherContents: nodeFixtureLauncher(
        target,
        abandonedFixturePath,
      ),
      payloadRoot: secondPayload,
      releaseId: "release-two",
      target,
    });
    const abandonedInstall = runInstallChild(installerPath, {
      archiveSha256: "b".repeat(64),
      binDir,
      installRoot,
      payloadRoot: secondPayload,
    });
    await waitForFile(abandonedMarker);
    const smokePid = Number.parseInt(
      await readFile(abandonedPidPath, "utf8"),
      10,
    );
    const abandonedPid = abandonedInstall.child.pid;
    if (abandonedPid == null) throw new Error("installer child has no pid");
    abandonedInstall.child.kill("SIGKILL");
    await expect(abandonedInstall.completion).rejects.toThrow(
      /installer child failed/,
    );
    await writeFile(releaseAbandonedSmoke, "", "utf8");
    try {
      await waitForProcessExit(smokePid);
    } catch (error) {
      try {
        process.kill(smokePid, "SIGKILL");
      } catch (killError) {
        if ((killError as NodeJS.ErrnoException).code !== "ESRCH") {
          throw new AggregateError(
            [error, killError],
            "fixture did not exit and could not be terminated",
          );
        }
      }
      throw error;
    }

    const thirdPayload = join(root, "payload-third");
    await writePayload({
      appVersion: "1.2.5",
      payloadRoot: thirdPayload,
      releaseId: "release-three",
      target,
    });
    await expect(
      installServerPayload({
        archiveSha256: "c".repeat(64),
        binDir,
        installLockTimeoutMs: 250,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot: thirdPayload,
      }),
    ).rejects.toThrow(/stale owner pid .*automatic takeover is disabled/);

    for (const lockRoot of [installRoot, binDir]) {
      const owner = JSON.parse(
        await readFile(
          join(lockRoot, ".server-install.lock", "owner.json"),
          "utf8",
        ),
      ) as { pid?: unknown };
      expect(owner.pid).toBe(abandonedPid);
    }
    expect(await readCurrentReleaseId(installRoot, target)).toBe(
      "release-two",
    );
  }, 15_000);

  it("never removes a lock whose owner token changed before release", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const target = hostServerTarget();
    const installerPath = await bundleInstallCoreForChild(root);
    const firstPayload = join(root, "payload-first");
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot: firstPayload,
      releaseId: "release-one",
      target,
    });
    await installServerPayload({
      archiveSha256: "a".repeat(64),
      binDir,
      installRoot,
      nodeBin: process.execPath,
      payloadRoot: firstPayload,
    });

    const blockedMarker = join(root, "token-post-smoke");
    const releaseBlockedSmoke = join(root, "release-token-post-smoke");
    const secondPayload = join(root, "payload-second");
    await writePayload({
      appVersion: "1.2.4",
      openDesignLauncherContents: blockingSuccessLauncher(
        target,
        blockedMarker,
        releaseBlockedSmoke,
      ),
      payloadRoot: secondPayload,
      releaseId: "release-two",
      target,
    });
    const installation = runInstallChild(installerPath, {
      archiveSha256: "b".repeat(64),
      binDir,
      installRoot,
      payloadRoot: secondPayload,
    });
    await waitForFile(blockedMarker);

    const binOwnerPath = join(
      binDir,
      ".server-install.lock",
      "owner.json",
    );
    const originalOwner = JSON.parse(
      await readFile(binOwnerPath, "utf8"),
    ) as { pid: number; startedAt: string; token: string };
    await writeFile(
      binOwnerPath,
      `${JSON.stringify({
        ...originalOwner,
        token: "successor-token",
      })}\n`,
      "utf8",
    );
    await writeFile(releaseBlockedSmoke, "", "utf8");
    await installation.completion;

    const preservedOwner = JSON.parse(
      await readFile(binOwnerPath, "utf8"),
    ) as { token?: unknown };
    expect(preservedOwner.token).toBe("successor-token");
    await expect(
      access(join(installRoot, ".server-install.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readCurrentReleaseId(installRoot, target)).toBe(
      "release-two",
    );
  }, 15_000);

  it("rolls current back when stable launcher installation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-install-"));
    roots.push(root);
    const installRoot = join(root, "install");
    const binDir = join(root, "bin");
    const payloadRoot = join(root, "payload");
    const target = hostServerTarget();
    await writePayload({
      appVersion: "1.2.3",
      payloadRoot,
      releaseId: "rollback-release",
      target,
    });
    const openDesignLauncher = join(
      binDir,
      target.platform === "win32" ? "open-design.cmd" : "open-design",
    );
    const priorLauncherContents = target.platform === "win32"
      ? "@echo prior launcher\r\n@exit /b 0\r\n"
      : "#!/bin/sh\necho prior launcher\nexit 0\n";
    await writeExecutable(openDesignLauncher, priorLauncherContents);
    await mkdir(
      join(
        binDir,
        target.platform === "win32" ? "od.cmd" : "od",
      ),
      { recursive: true },
    );

    await expect(
      installServerPayload({
        archiveSha256: "a".repeat(64),
        binDir,
        installRoot,
        nodeBin: process.execPath,
        payloadRoot,
      }),
    ).rejects.toThrow(/refusing to replace directory with launcher/);
    await expect(
      access(join(installRoot, "current")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(openDesignLauncher, "utf8")).resolves.toBe(
      priorLauncherContents,
    );
  });
});
