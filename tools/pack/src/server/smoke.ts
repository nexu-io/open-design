import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  resolve,
} from "node:path";

import { createCommandInvocation } from "@open-design/platform";

import type { ServerPackConfig } from "./config.js";
import { SERVER_PRIVATE_NODE_VERSION } from "./build.js";
import { SERVER_DEPLOY_HASH_PROBE_ENTRYPOINT } from "./bundle.js";

type SmokeMode = "private-node" | "system-node";

type SmokeModeResult = {
  assetStatus: number;
  healthStatus: number;
  mode: SmokeMode;
  privateNodeInstalled: boolean;
  rootStatus: number;
  spaStatus: number;
  sqliteStatus: number;
  terminalStatus: number;
};

export type ServerSmokeResult = {
  appVersion: string;
  arch: ServerPackConfig["target"]["arch"];
  archivePath: string;
  modes: SmokeModeResult[];
  platform: ServerPackConfig["target"]["platform"];
  reportPath: string;
  tamperedArchiveRejected: boolean;
};

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean } = {},
): Promise<{ stderr: string; stdout: string }> {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveRun({ stderr, stdout });
        return;
      }
      rejectRun(
        new Error(
          `command failed (${signal ?? `exit ${String(code)}`}): ${command} ${args.join(" ")}\n${stderr}`,
        ),
      );
    });
  });
}

async function reservePort(): Promise<number> {
  return await new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address == null || typeof address === "string") {
        server.close();
        rejectPort(new Error("failed to reserve server smoke port"));
        return;
      }
      server.close((error) => {
        if (error != null) rejectPort(error);
        else resolvePort(address.port);
      });
    });
  });
}

async function prependIncompatibleNodeShim(
  env: NodeJS.ProcessEnv,
  root: string,
): Promise<void> {
  const shimRoot = join(root, "incompatible-node");
  await mkdir(shimRoot, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(join(shimRoot, "node.cmd"), "@exit /b 24\r\n", "utf8");
  } else {
    const shim = join(shimRoot, "node");
    await writeFile(shim, "#!/bin/sh\nexit 24\n", "utf8");
    await chmod(shim, 0o755);
  }

  const existingPath =
    Object.entries(env).find(([name]) => name.toLowerCase() === "path")?.[1] ??
    "";
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === "path") delete env[name];
  }
  env.PATH = `${shimRoot}${delimiter}${existingPath}`;
}

function windowsPowerShell(): string {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  return join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

async function installArchive(options: {
  archivePath?: string;
  archiveSha256: string;
  binDir: string;
  config: ServerPackConfig;
  installRoot: string;
  mode: SmokeMode;
}): Promise<NodeJS.ProcessEnv> {
  const isWindows = options.config.target.platform === "win32";
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPEN_DESIGN_ARCHIVE: options.archivePath ?? options.config.archivePath,
    OPEN_DESIGN_ARCHIVE_SHA256: options.archiveSha256,
    OPEN_DESIGN_BIN_DIR: options.binDir,
    OPEN_DESIGN_FORCE_PRIVATE_NODE:
      options.mode === "private-node" ? "1" : "0",
    OPEN_DESIGN_HOME: options.installRoot,
    OPEN_DESIGN_VERSION: options.config.appVersion,
  };
  if (options.mode === "private-node") {
    await prependIncompatibleNodeShim(
      env,
      join(options.installRoot, "..", "installer-path"),
    );
  }
  const windowsTempRoot = isWindows
    ? join(
        process.env.RUNNER_TEMP ??
          process.env.TEMP ??
          process.env.TMP ??
          options.installRoot,
        `open-design-server-smoke-${"long-path-".repeat(6)}${options.mode}`,
      )
    : null;
  const originalWindowsTemp = Object.entries(env).filter(
    ([name]) =>
      name.toLowerCase() === "temp" || name.toLowerCase() === "tmp",
  );
  if (windowsTempRoot != null) {
    await mkdir(windowsTempRoot, { recursive: true });
    for (const name of Object.keys(env)) {
      if (name.toLowerCase() === "temp" || name.toLowerCase() === "tmp") {
        delete env[name];
      }
    }
    env.TEMP = windowsTempRoot;
    env.TMP = windowsTempRoot;
  }

  const installerRoot = options.config.installerRoot;
  const subst = isWindows
    ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "subst.exe")
    : null;
  const substBefore =
    subst == null ? null : (await runProcess(subst, [])).stdout;
  try {
    if (isWindows) {
      await runProcess(
        windowsPowerShell(),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(installerRoot, "install.ps1"),
        ],
        { env },
      );
    } else {
      await runProcess("/bin/sh", [join(installerRoot, "install.sh")], { env });
    }
  } finally {
    let cleanupError: unknown = null;
    if (subst != null) {
      try {
        const substAfter = (await runProcess(subst, [])).stdout;
        if (substAfter !== substBefore) {
          cleanupError = new Error(
            "Windows installer leaked a substituted temporary drive",
          );
        }
      } catch (error) {
        cleanupError = error;
      }
    }
    if (windowsTempRoot != null) {
      try {
        await rm(windowsTempRoot, { force: true, recursive: true });
      } catch (error) {
        cleanupError ??= error;
      }
      for (const name of Object.keys(env)) {
        if (name.toLowerCase() === "temp" || name.toLowerCase() === "tmp") {
          delete env[name];
        }
      }
      for (const [name, value] of originalWindowsTemp) {
        env[name] = value;
      }
    }
    if (cleanupError != null) throw cleanupError;
  }
  return env;
}

async function currentPointerValue(
  installRoot: string,
): Promise<string | null> {
  const currentPath = join(installRoot, "current");
  const metadata = await lstat(currentPath).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
  if (metadata == null) return null;
  if (metadata.isSymbolicLink()) {
    return `symlink:${await readlink(currentPath)}`;
  }
  if (metadata.isFile()) {
    return `file:${await readFile(currentPath, "utf8")}`;
  }
  throw new Error(`server current pointer has an unsupported type: ${currentPath}`);
}

async function assertTamperedArchiveRejected(options: {
  archiveSha256: string;
  config: ServerPackConfig;
  smokeRoot: string;
}): Promise<void> {
  const mode: SmokeMode = "system-node";
  const modeRoot = join(options.smokeRoot, mode);
  const installRoot = join(modeRoot, "home");
  const binDir = join(modeRoot, "bin");
  const tamperedArchive = join(
    modeRoot,
    `tampered-${basename(options.config.archivePath)}`,
  );
  const currentBefore = await currentPointerValue(installRoot);
  if (currentBefore == null) {
    throw new Error("tampered archive probe requires an installed current release");
  }

  await copyFile(options.config.archivePath, tamperedArchive);
  await appendFile(tamperedArchive, "\nopen-design-server-smoke-tamper\n", "utf8");
  let rejection: unknown = null;
  try {
    await installArchive({
      archivePath: tamperedArchive,
      archiveSha256: options.archiveSha256,
      binDir,
      config: options.config,
      installRoot,
      mode,
    });
  } catch (error) {
    rejection = error;
  } finally {
    await rm(tamperedArchive, { force: true });
  }
  if (rejection == null) {
    throw new Error("installer accepted an archive whose bytes did not match its checksum");
  }
  const rejectionMessage =
    rejection instanceof Error ? rejection.message : String(rejection);
  if (!/SHA-256 mismatch/i.test(rejectionMessage)) {
    throw new Error(
      `tampered archive failed for an unexpected reason: ${rejectionMessage}`,
    );
  }
  const currentAfter = await currentPointerValue(installRoot);
  if (currentAfter !== currentBefore) {
    throw new Error("installer changed current after rejecting a tampered archive");
  }
}

async function pollResponse(
  url: string,
  options: RequestInit = {},
  timeoutMs = 60_000,
): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, options);
      if (response.status < 500) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(
    `timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function waitForExit(child: ChildProcess, timeoutMs = 20_000): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return;
  await new Promise<void>((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      rejectExit(new Error("server daemon did not exit after shutdown"));
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectExit(error);
    });
  });
}

async function forceKillDaemon(daemon: ChildProcess): Promise<void> {
  if (process.platform === "win32" && daemon.pid != null) {
    await runProcess(
      "taskkill.exe",
      ["/pid", String(daemon.pid), "/t", "/f"],
    ).catch(() => undefined);
  } else {
    daemon.kill("SIGKILL");
  }
  await waitForExit(daemon).catch(() => undefined);
}

async function stopDaemonGracefully(
  daemon: ChildProcess,
  baseUrl: string,
  platform: ServerPackConfig["target"]["platform"],
): Promise<void> {
  if (daemon.exitCode != null || daemon.signalCode != null) {
    throw new Error("server daemon exited before the graceful shutdown probe");
  }

  try {
    if (platform === "win32") {
      const response = await fetch(`${baseUrl}/api/daemon/shutdown`, {
        headers: { origin: baseUrl },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          `Windows daemon shutdown endpoint returned ${response.status}`,
        );
      }
    } else if (!daemon.kill("SIGTERM")) {
      throw new Error("failed to deliver SIGTERM to the server daemon");
    }
    await waitForExit(daemon);
    if (daemon.exitCode !== 0 || daemon.signalCode != null) {
      throw new Error(
        `server daemon did not exit cleanly: ${
          daemon.signalCode ?? `exit ${String(daemon.exitCode)}`
        }`,
      );
    }
  } catch (error) {
    await forceKillDaemon(daemon);
    throw error;
  }
}

async function installedReleaseRoot(
  installRoot: string,
  config: ServerPackConfig,
): Promise<string> {
  if (config.target.platform === "win32") {
    const releaseId = (await readFile(join(installRoot, "current"), "utf8")).trim();
    return join(installRoot, "releases", releaseId);
  }
  return await realpath(join(installRoot, "current"));
}

async function probeBlake3(nodeBin: string, releaseRoot: string, env: NodeJS.ProcessEnv): Promise<void> {
  const probePath = join(
    releaseRoot,
    "apps",
    "daemon",
    "dist",
    SERVER_DEPLOY_HASH_PROBE_ENTRYPOINT,
  );
  await runProcess(
    nodeBin,
    [probePath],
    { cwd: releaseRoot, env },
  );
}

async function smokeInstalledArchive(options: {
  archiveSha256: string;
  config: ServerPackConfig;
  mode: SmokeMode;
  smokeRoot: string;
}): Promise<SmokeModeResult> {
  const installRoot = join(options.smokeRoot, options.mode, "home");
  const binDir = join(options.smokeRoot, options.mode, "bin");
  const env = await installArchive({
    archiveSha256: options.archiveSha256,
    binDir,
    config: options.config,
    installRoot,
    mode: options.mode,
  });
  const privateNode =
    options.config.target.platform === "win32"
      ? join(
          installRoot,
          "runtime",
          `node-v${SERVER_PRIVATE_NODE_VERSION}-${options.config.target.platform}-${options.config.target.arch}`,
          "node.exe",
        )
      : join(
          installRoot,
          "runtime",
          `node-v${SERVER_PRIVATE_NODE_VERSION}-${options.config.target.platform}-${options.config.target.arch}`,
          "bin",
          "node",
        );
  const privateNodeInstalled = (await stat(privateNode).catch(() => null))?.isFile() === true;
  if ((options.mode === "private-node") !== privateNodeInstalled) {
    throw new Error(
      `${options.mode} installer path produced unexpected private Node state: ${privateNode}`,
    );
  }
  if (
    options.mode === "private-node" &&
    options.config.target.platform !== "win32"
  ) {
    const npmLink = join(dirname(privateNode), "npm");
    const npmMetadata = await lstat(npmLink);
    if (!npmMetadata.isSymbolicLink()) {
      throw new Error(`private Node npm entry is not a symlink: ${npmLink}`);
    }
    const linkTarget = await readlink(npmLink);
    if (isAbsolute(linkTarget)) {
      throw new Error(
        `private Node npm symlink escaped the installed runtime: ${linkTarget}`,
      );
    }
    await realpath(npmLink);
  }

  const launcher =
    options.config.target.platform === "win32"
      ? join(binDir, "open-design.cmd")
      : join(binDir, "open-design");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const daemonArgs = [
    "daemon",
    "start",
    "--headless",
    "--serve-web",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ];
  const daemonInvocation = createCommandInvocation({
    args: daemonArgs,
    command: launcher,
    env,
  });
  const daemon = spawn(daemonInvocation.command, daemonInvocation.args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsVerbatimArguments: daemonInvocation.windowsVerbatimArguments,
    windowsHide: true,
  });
  let daemonOutput = "";
  daemon.stdout?.on("data", (chunk: Buffer) => {
    daemonOutput += chunk.toString("utf8");
  });
  daemon.stderr?.on("data", (chunk: Buffer) => {
    daemonOutput += chunk.toString("utf8");
  });

  let result: SmokeModeResult | null = null;
  let probeError: Error | null = null;
  try {
    const health = await pollResponse(`${baseUrl}/api/health`);
    if (health.status !== 200) throw new Error(`health smoke failed: ${health.status}`);
    const root = await pollResponse(`${baseUrl}/`);
    const rootHtml = await root.text();
    if (root.status !== 200 || !/<html/i.test(rootHtml)) {
      throw new Error(`web root smoke failed: ${root.status}`);
    }
    const spa = await pollResponse(`${baseUrl}/projects/server-package-smoke`, {
      headers: { accept: "text/html" },
    });
    if (spa.status !== 200) throw new Error(`SPA fallback smoke failed: ${spa.status}`);
    const assetPath =
      rootHtml.match(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/)?.[1] ??
      rootHtml.match(/(?:src|href)=["'](\/_next\/[^"']+)["']/)?.[1];
    if (assetPath == null) throw new Error("web root did not reference a _next asset");
    const asset = await pollResponse(new URL(assetPath, baseUrl).href);
    if (asset.status !== 200) throw new Error(`static asset smoke failed: ${asset.status}`);

    const sqlite = await pollResponse(`${baseUrl}/api/daemon/db`);
    if (sqlite.status !== 200) throw new Error(`SQLite smoke failed: ${sqlite.status}`);

    const projectId = `server-smoke-${Date.now()}`;
    const originHeaders = {
      "content-type": "application/json",
      origin: baseUrl,
    };
    const createProject = await fetch(`${baseUrl}/api/projects`, {
      body: JSON.stringify({
        designSystemId: null,
        id: projectId,
        name: "Server package smoke",
        skillId: null,
      }),
      headers: originHeaders,
      method: "POST",
    });
    if (createProject.status !== 200) {
      throw new Error(`project creation smoke failed: ${createProject.status} ${await createProject.text()}`);
    }
    const terminal = await fetch(`${baseUrl}/api/projects/${projectId}/terminals`, {
      body: JSON.stringify({ cols: 80, rows: 24 }),
      headers: originHeaders,
      method: "POST",
    });
    if (terminal.status !== 200) {
      throw new Error(`node-pty smoke failed: ${terminal.status} ${await terminal.text()}`);
    }
    const terminalBody = (await terminal.json()) as { terminal?: { id?: unknown } };
    const terminalId = terminalBody.terminal?.id;
    if (typeof terminalId !== "string") throw new Error("node-pty smoke returned no terminal id");
    // Keep the PTY active so the final daemon shutdown deterministically
    // exercises native-terminal cleanup instead of depending on whether a
    // preceding kill event happens to settle first on this runner.

    const releaseRoot = await installedReleaseRoot(installRoot, options.config);
    const selectedNode =
      options.mode === "private-node" ? privateNode : process.execPath;
    await probeBlake3(selectedNode, releaseRoot, env);

    result = {
      assetStatus: asset.status,
      healthStatus: health.status,
      mode: options.mode,
      privateNodeInstalled,
      rootStatus: root.status,
      spaStatus: spa.status,
      sqliteStatus: sqlite.status,
      terminalStatus: terminal.status,
    };
  } catch (error) {
    probeError = new Error(
      `${error instanceof Error ? error.message : String(error)}\nDaemon output:\n${daemonOutput}`,
    );
  }

  let shutdownError: unknown = null;
  try {
    await stopDaemonGracefully(
      daemon,
      baseUrl,
      options.config.target.platform,
    );
  } catch (error) {
    shutdownError = error;
  }
  if (probeError != null) {
    if (shutdownError != null) {
      throw new AggregateError(
        [probeError, shutdownError],
        "server package probes and graceful shutdown both failed",
      );
    }
    throw probeError;
  }
  if (shutdownError != null) {
    throw new Error(
      `${shutdownError instanceof Error ? shutdownError.message : String(shutdownError)}\nDaemon output:\n${daemonOutput}`,
      { cause: shutdownError },
    );
  }
  if (result == null) throw new Error("server smoke produced no result");
  return result;
}

export async function smokeServerPackage(
  config: ServerPackConfig,
): Promise<ServerSmokeResult> {
  const archiveMetadata = await stat(config.archivePath).catch(() => null);
  if (archiveMetadata == null || !archiveMetadata.isFile()) {
    throw new Error(`server archive not found: ${config.archivePath}`);
  }
  const checksumLine = await readFile(config.sha256Path, "utf8");
  const archiveSha256 = checksumLine.trim().split(/\s+/)[0];
  if (archiveSha256 == null || !/^[0-9a-f]{64}$/i.test(archiveSha256)) {
    throw new Error(`invalid server archive checksum: ${config.sha256Path}`);
  }

  const smokeRoot = join(config.outputRoot, "smoke install");
  await rm(smokeRoot, { force: true, recursive: true });
  await mkdir(smokeRoot, { recursive: true });
  const modes: SmokeModeResult[] = [];
  try {
    modes.push(
      await smokeInstalledArchive({
        archiveSha256,
        config,
        mode: "system-node",
        smokeRoot,
      }),
    );
    await assertTamperedArchiveRejected({
      archiveSha256,
      config,
      smokeRoot,
    });
    modes.push(
      await smokeInstalledArchive({
        archiveSha256,
        config,
        mode: "private-node",
        smokeRoot,
      }),
    );
  } finally {
    await rm(smokeRoot, { force: true, recursive: true });
  }
  const result: ServerSmokeResult = {
    appVersion: config.appVersion,
    arch: config.target.arch,
    archivePath: resolve(config.archivePath),
    modes,
    platform: config.target.platform,
    reportPath: config.reportPath,
    tamperedArchiveRejected: true,
  };
  await writeFile(config.reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
