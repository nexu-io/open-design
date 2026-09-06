import { cac } from "cac";
import { resolveToolPackConfig, type ToolPackCliOptions } from "./config/index.js";
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

const cli = cac("tools-pack");
const mac = cli.command("mac <action>", "Mac Electron Shell commands: build|install|start|stop|logs|uninstall|cleanup|inspect")
    .option("--cache-dir <path>", "advanced escape hatch for relocating tools-pack cache")
    .option("--dir <path>", "tools-pack output/runtime root directory")
    .option("--json", "print JSON")
    .option("--namespace <name>", "runtime namespace")
    .option("--app-version <version>", "override packaged app version for release artifacts")
    .option("--standalone-bootstrap-url <url>", "Shell authority bootstrap URL");

mac.action(
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

cli.help();
cli.parse();
