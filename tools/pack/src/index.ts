import { cac } from "cac";
import type { CAC } from "cac";

import { resolveToolPackConfig, type ToolPackCliOptions } from "./config.js";
import {
  cleanupPackedMacNamespace,
  installPackedMacDmg,
  packMac,
  readPackedMacLogs,
  startPackedMacApp,
  stopPackedMacApp,
  uninstallPackedMacApp,
} from "./mac.js";

type CliOptions = ToolPackCliOptions;

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printLogs(result: Awaited<ReturnType<typeof readPackedMacLogs>>, options: CliOptions): void {
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
    .option("--namespace <name>", "runtime namespace");
}

function addBuildOptions(command: CacCommand) {
  return command
    .option("--portable", "do not bake local tools-pack runtime roots into the packaged config")
    .option("--signed", "build a signed/notarized mac artifact")
    .option("--to <target>", "build target: all|app|dmg|zip (default: all)");
}

const cli = cac("tools-pack");

addBuildOptions(addSharedOptions(cli.command("mac <action>", "Mac packaging commands: build|install|start|stop|logs|uninstall|cleanup"))).action(
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

cli.help();
cli.parse();
