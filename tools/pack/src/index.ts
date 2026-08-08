import { cac } from "cac";
import type { CAC } from "cac";

import { buildClosureArchive } from "./closure.js";
import { resolveToolPackConfig, type ToolPackCliOptions, type ToolPackPlatform } from "./config.js";
import {
  cleanupPackedMacNamespace,
  installPackedMacDmg,
  inspectPackedMacApp,
  packMac,
  readPackedMacLogs,
  startPackedMacApp,
  stopPackedMacApp,
  uninstallPackedMacApp,
} from "./mac/index.js";
import {
  cleanupPackedWinNamespace,
  diagnosePackedWinIpc,
  installPackedWinApp,
  inspectPackedWinApp,
  listPackedWinNamespaces,
  packWin,
  readPackedWinLogs,
  resetPackedWinNamespaces,
  startPackedWinApp,
  stopPackedWinApp,
  uninstallPackedWinApp,
  validateWinLauncherPayloadArchive,
} from "./win/index.js";

type CliOptions = ToolPackCliOptions;

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printLogs(result: { logs: Record<string, { lines: string[]; logPath: string }>; namespace: string }, options: CliOptions): void {
  if (options.json === true) {
    printJson(result);
    return;
  }

  for (const [app, entry] of Object.entries(result.logs)) {
    process.stdout.write(`[${app}] ${entry.logPath}\n`);
    process.stdout.write(entry.lines.length > 0 ? `${entry.lines.join("\n")}\n` : "(no log lines)\n");
  }
}

type CacCommand = ReturnType<CAC["command"]>;

function addSharedOptions(command: CacCommand) {
  return command
    .option("--cache-dir <path>", "advanced escape hatch for relocating tools-pack cache")
    .option("--dir <path>", "tools-pack output/runtime root directory")
    .option("--diagnose-attempts <count>", "diagnose-ipc: start/poll/stop attempts")
    .option("--json", "print JSON")
    .option("--namespace <name>", "runtime namespace")
    .option("--expr <expression>", "desktop inspect eval expression")
    .option("--path <path>", "desktop inspect screenshot path")
    .option("--shell <shell>", "launcher shell (default: electron)")
    .option("--status-poll-count <count>", "inspect: poll the shell-owned runtime status projection this many times")
    .option("--status-poll-interval-ms <ms>", "inspect: delay between STATUS poll samples")
    .option("--update-action <action>", "desktop update action: status|check|clear-cache|download|install");
}

// Per-platform `--to` help text mirroring resolveToolPackBuildOutput in
// config.ts. Keep these in sync: the resolver throws on any value not listed
// here for the given platform.
const TO_HELP_BY_PLATFORM: Record<ToolPackPlatform, string> = {
  mac: "build target: all|app|dmg|zip (default: all)",
  win: "build target: all|dir|nsis|zip (default: nsis). `zip` produces a portable zip from the unpacked build; `all` produces dir+nsis+zip.",
};

function addBuildOptions(command: CacCommand, platform: ToolPackPlatform) {
  return command
    .option("--app-version <version>", "override packaged app version for release artifacts")
    .option("--portable", "do not bake local tools-pack runtime roots into the packaged config")
    .option("--require-vela-cli", "fail packaging when the bundled Vela CLI cannot be resolved")
    .option("--signed", "build a signed mac artifact")
    .option("--notarize", "notarize a signed mac artifact")
    .option("--to <target>", TO_HELP_BY_PLATFORM[platform]);
}

function addMacBuildOptions(command: CacCommand) {
  return addBuildOptions(command, "mac")
    .option("--mac-compression <mode>", "mac artifact compression: normal|maximum|store (default: normal)");
}

function addWinLifecycleOptions(command: CacCommand) {
  return command
    .option("--expected-version <version>", "validate-payload: expected launcher payload version")
    .option("--payload-path <path>", "validate-payload: launcher payload archive path")
    .option("--remove-cache", "remove packaged download/cache data during uninstall/reset/cleanup")
    .option("--remove-data", "remove packaged data during uninstall/reset/cleanup")
    .option("--remove-logs", "remove packaged logs during uninstall/reset/cleanup")
    .option("--remove-product-user-data", "remove the public Electron app userData root during Windows uninstall/reset/cleanup")
    .option("--remove-sidecars", "remove packaged sidecar runtime during uninstall/reset/cleanup")
    .option("--silent", "run installer/uninstaller silently", { default: true });
}

const cli = cac("tools-pack");

cli.command("closure <action>", "Standalone Closure commands: build")
  .option("--artifact-url <url>", "immutable public URL intended for closure.zip")
  .option("--cache-dir <path>", "independent Closure build cache root")
  .option("--channel <channel>", "release channel")
  .option("--dir <path>", "tools-pack output/staging root directory")
  .option("--json", "print JSON")
  .option("--min-shell-version <version>", "minimum compatible shell version")
  .option("--platform <target>", "closure target: darwin-arm64|win32-x64 (default: current host)")
  .option("--skip-workspace-build", "reuse workspace outputs built earlier in the same release job")
  .option("--version <version>", "Closure release version")
  .action(async (action: string, options: CliOptions) => {
    if (action !== "build") throw new Error(`unsupported closure action: ${action}`);
    if (options.artifactUrl == null || options.artifactUrl.length === 0) {
      throw new Error("closure build requires --artifact-url");
    }
    if (options.channel == null || options.channel.length === 0) {
      throw new Error("closure build requires --channel");
    }
    if (options.minShellVersion == null || options.minShellVersion.length === 0) {
      throw new Error("closure build requires --min-shell-version");
    }
    if (options.version == null || options.version.length === 0) {
      throw new Error("closure build requires --version");
    }
    printJson(await buildClosureArchive({
      artifactUrl: options.artifactUrl,
      ...(options.cacheDir == null ? {} : { cacheDir: options.cacheDir }),
      channel: options.channel,
      ...(options.dir == null ? {} : { dir: options.dir }),
      minShellVersion: options.minShellVersion,
      ...(options.platform == null ? {} : { platform: options.platform }),
      skipWorkspaceBuild: options.skipWorkspaceBuild === true,
      version: options.version,
    }));
  });

addMacBuildOptions(addSharedOptions(cli.command("mac <action>", "Mac packaging commands: build|install|start|stop|logs|uninstall|cleanup|inspect"))).action(
  async (action: string, options: CliOptions) => {
    const config = resolveToolPackConfig("mac", options);
    switch (action) {
      case "build":
        printJson(await packMac(config));
        return;
      case "install":
        printJson(await installPackedMacDmg(config));
        return;
      case "start":
        printJson(await startPackedMacApp(config));
        return;
      case "stop":
        printJson(await stopPackedMacApp(config));
        return;
      case "logs":
        printLogs(await readPackedMacLogs(config), options);
        return;
      case "inspect":
        printJson(await inspectPackedMacApp(config, options));
        return;
      case "uninstall":
        printJson(await uninstallPackedMacApp(config));
        return;
      case "cleanup":
        printJson(await cleanupPackedMacNamespace(config));
        return;
      default:
        throw new Error(`unsupported mac action: ${action}`);
    }
  },
);

addWinLifecycleOptions(
  addBuildOptions(
    addSharedOptions(
      cli.command(
        "win <action>",
        "Windows packaging commands: build|install|start|stop|logs|uninstall|cleanup|list|reset|inspect|diagnose-ipc|validate-payload",
      ),
    ),
    "win",
  ),
).action(async (action: string, options: CliOptions) => {
  const config = resolveToolPackConfig("win", options);
  switch (action) {
    case "build":
      printJson(await packWin(config));
      return;
    case "install":
      printJson(await installPackedWinApp(config));
      return;
    case "start":
      printJson(await startPackedWinApp(config));
      return;
    case "stop":
      printJson(await stopPackedWinApp(config));
      return;
    case "logs":
      printLogs(await readPackedWinLogs(config), options);
      return;
    case "uninstall":
      printJson(await uninstallPackedWinApp(config));
      return;
    case "cleanup":
      printJson(await cleanupPackedWinNamespace(config));
      return;
    case "list":
      printJson(await listPackedWinNamespaces(config));
      return;
    case "reset":
      printJson(await resetPackedWinNamespaces(config));
      return;
    case "inspect":
      printJson(await inspectPackedWinApp(config, options));
      return;
    case "diagnose-ipc":
      printJson(await diagnosePackedWinIpc(config, options));
      return;
    case "validate-payload": {
      if (options.payloadPath == null || options.payloadPath.length === 0) {
        throw new Error("win validate-payload requires --payload-path");
      }
      if (options.expectedVersion == null || options.expectedVersion.length === 0) {
        throw new Error("win validate-payload requires --expected-version");
      }
      printJson(await validateWinLauncherPayloadArchive({
        expectedVersion: options.expectedVersion,
        namespace: config.namespace,
        payloadPath: options.payloadPath,
        workspaceRoot: config.workspaceRoot,
      }));
      return;
    }
    default:
      throw new Error(`unsupported win action: ${action}`);
  }
});

cli.help();
cli.parse();
