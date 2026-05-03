import { cac } from "cac";
import type { CAC } from "cac";

import { resolveToolPackConfig, type ToolPackCliOptions, type ToolPackPlatform } from "./config.js";
import {
  cleanupPackedMacNamespace,
  installPackedMacDmg,
  packMac,
  readPackedMacLogs,
  startPackedMacApp,
  stopPackedMacApp,
  uninstallPackedMacApp,
} from "./mac.js";
import {
  cleanupPackedWinNamespace,
  installPackedWinApp,
  inspectPackedWinApp,
  listPackedWinNamespaces,
  packWin,
  readPackedWinLogs,
  resetPackedWinNamespaces,
  startPackedWinApp,
  stopPackedWinApp,
  uninstallPackedWinApp,
} from "./win.js";
import {
  cleanupPackedLinuxNamespace,
  installPackedLinuxApp,
  packLinux,
  readPackedLinuxLogs,
  startPackedLinuxApp,
  stopPackedLinuxApp,
  uninstallPackedLinuxApp,
} from "./linux.js";

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
    .option("--dir <path>", "tools-pack root directory")
    .option("--json", "print JSON")
    .option("--namespace <name>", "runtime namespace")
    .option("--expr <expression>", "desktop inspect eval expression")
    .option("--path <path>", "desktop inspect screenshot path");
}

// Per-platform `--to` help text mirroring resolveToolPackBuildOutput in
// config.ts. Keep these in sync: the resolver throws on any value not listed
// here for the given platform.
const TO_HELP_BY_PLATFORM: Record<ToolPackPlatform, string> = {
  linux: "build target: all|appimage|dir (default: all)",
  mac: "build target: all|app|dmg|zip (default: all)",
  win: "build target: all|dir|nsis (default: nsis)",
};

function addBuildOptions(command: CacCommand, platform: ToolPackPlatform) {
  return command
    .option("--portable", "do not bake local tools-pack runtime roots into the packaged config")
    .option("--signed", "build a signed/notarized mac artifact")
    .option("--to <target>", TO_HELP_BY_PLATFORM[platform]);
}

function addWinLifecycleOptions(command: CacCommand) {
  return command
    .option("--remove-data", "remove packaged data during uninstall/reset/cleanup")
    .option("--remove-logs", "remove packaged logs during uninstall/reset/cleanup")
    .option("--remove-product-user-data", "remove the public Electron app userData root during Windows uninstall/reset/cleanup")
    .option("--remove-sidecars", "remove packaged sidecar runtime during uninstall/reset/cleanup")
    .option("--silent", "run installer/uninstaller silently", { default: true });
}

const cli = cac("tools-pack");

addBuildOptions(addSharedOptions(cli.command("mac <action>", "Mac packaging commands: build|install|start|stop|logs|uninstall|cleanup")), "mac").action(
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
        "Windows packaging commands: build|install|start|stop|logs|uninstall|cleanup|list|reset|inspect",
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
    default:
      throw new Error(`unsupported win action: ${action}`);
  }
});

addBuildOptions(addSharedOptions(cli.command("linux <action>", "Linux packaging commands: build|install|start|stop|logs|uninstall|cleanup")), "linux")
  .option("--containerized", "build inside electronuserland/builder Docker for distro-agnostic glibc compat")
  .action(async (action: string, options: CliOptions) => {
    const config = resolveToolPackConfig("linux", options);
    switch (action) {
      case "build":
        printJson(await packLinux(config));
        return;
      case "install":
        printJson(await installPackedLinuxApp(config));
        return;
      case "start":
        printJson(await startPackedLinuxApp(config));
        return;
      case "stop":
        printJson(await stopPackedLinuxApp(config));
        return;
      case "logs":
        printLogs(await readPackedLinuxLogs(config), options);
        return;
      case "uninstall":
        printJson(await uninstallPackedLinuxApp(config));
        return;
      case "cleanup":
        printJson(await cleanupPackedLinuxNamespace(config));
        return;
      default:
        throw new Error(`unsupported linux action: ${action}`);
    }
  });

cli.help();
cli.parse();
