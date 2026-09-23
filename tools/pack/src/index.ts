import { cac } from "cac";
import type { CAC } from "cac";
import { emitBuildRecord } from "./build-record.js";

import { resolveToolPackConfig, type ToolPackCliOptions, type ToolPackPlatform } from "./config/index.js";
import {
  cleanupPackedMacNamespace,
  installPackedMacDmg,
  inspectPackedMacApp,
  packMac,
  packageMac,
  readPackedMacLogs,
  startPackedMacApp,
  stopPackedMacApp,
  uninstallPackedMacApp,
} from "./mac/index.js";
import { exportMacRuntimeProduct, restoreMacRuntimeProduct, validateMacRuntimeProductRoot } from "./mac/runtime-product.js";
import {
  cleanupPackedWinNamespace,
  diagnosePackedWinIpc,
  installPackedWinApp,
  inspectPackedWinApp,
  listPackedWinNamespaces,
  packWin,
  packageWin,
  readPackedWinLogs,
  resetPackedWinNamespaces,
  startPackedWinApp,
  stopPackedWinApp,
  uninstallPackedWinApp,
  validateWinLauncherPayloadArchive,
} from "./win/index.js";
import {
  cleanupPackedLinuxNamespace,
  installPackedLinuxApp,
  installPackedLinuxHeadless,
  inspectPackedLinuxApp,
  packLinux,
  readPackedLinuxLogs,
  resolveLinuxLifecycleMode,
  startPackedLinuxApp,
  startPackedLinuxHeadless,
  stopPackedLinuxApp,
  stopPackedLinuxHeadless,
  uninstallPackedLinuxApp,
  uninstallPackedLinuxHeadless,
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
    .option("--cache-dir <path>", "advanced escape hatch for relocating tools-pack cache")
    .option("--dir <path>", "tools-pack output/runtime root directory")
    .option("--diagnose-attempts <count>", "diagnose-ipc: start/poll/stop attempts")
    .option("--json", "print JSON")
    .option("--namespace <name>", "runtime namespace")
    .option("--expr <expression>", "desktop inspect eval expression")
    .option("--path <path>", "desktop inspect screenshot path")
    .option("--status-poll-count <count>", "inspect: poll desktop/daemon/web STATUS this many times")
    .option("--status-poll-interval-ms <ms>", "inspect: delay between STATUS poll samples")
    .option("--update-action <action>", "desktop update action: status|check|clear-cache|download|install");
}

// Per-platform `--to` help text mirroring resolveToolPackBuildOutput in
// config.ts. Keep these in sync: the resolver throws on any value not listed
// here for the given platform.
const TO_HELP_BY_PLATFORM: Record<ToolPackPlatform, string> = {
  linux: "build target: all|appimage|dir (default: all)",
  mac: "build target: all|app|dmg|zip (default: all)",
  win: "build target: all|dir|nsis|zip (default: nsis). `zip` produces a portable zip from the unpacked build; `all` produces dir+nsis+zip.",
};

function addBuildOptions(command: CacCommand, platform: ToolPackPlatform) {
  return command
    .option("--app-version <version>", "override packaged app version for release artifacts")
    .option("--build-json <path>", "write a successful build/package result to this JSON path")
    .option("--portable", "do not bake local tools-pack runtime roots into the packaged config")
    .option("--require-vela-cli", "fail packaging when the bundled Vela CLI cannot be resolved")
    .option("--signed", "build a signed mac artifact")
    .option("--notarize", "notarize a signed mac artifact")
    .option("--to <target>", TO_HELP_BY_PLATFORM[platform]);
}

function addMacBuildOptions(command: CacCommand) {
  return addBuildOptions(command, "mac")
    .option("--mac-compression <mode>", "mac artifact compression: normal|maximum|store (default: normal)")
    .option("--mac-runtime-product <path>", "restored platform runtime product root")
    .option("--archive <path>", "runtime-restore: local product archive")
    .option("--output <path>", "runtime-export/runtime-restore output path")
    .option("--url <url>", "runtime-restore: verified product URL")
    .option("--sha256 <digest>", "runtime-restore: expected product SHA-256");
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

cli.command("workspace <action> <unit>", "Build, verify, export or import workspace outputs (packages|daemon|web|shell|javascript)")
  .option("--web-output-mode <mode>", "web output: standalone|server", { default: "standalone" })
  .option("--output <path>", "export built outputs to an archive directory")
  .option("--scratch <path>", "isolated workspace import staging directory")
  .option("--url <url>", "verified source archive URL")
  .option("--sha256 <digest>", "expected source archive SHA-256")
  .option("--sources <json>", "JavaScript source descriptors: unit, url and sha256")
  .option("--json", "print JSON result metadata")
  .action(async (action: string, unit: string, options: import("./workspace/command.js").WorkspaceCommandOptions) => {
    const { workspaceCommand } = await import("./workspace/command.js");
    printJson(await workspaceCommand(action, unit, options));
  });

cli.command('verify-runtime', 'Verify installed prerelease Vela/OpenCode identity against a release manifest')
  .option('--resources <path>', 'installed package Resources directory')
  .option('--manifest <path>', 'release platform manifest JSON')
  .option('--expected-vela <version>', 'exact Vela version from the reviewed dependency pin')
  .option('--expected-opencode <version>', 'exact OpenCode version from the reviewed Vela release')
  .option('--json', 'print JSON evidence (also the default)')
  .action(async (options: { resources: string; manifest: string; expectedVela: string; expectedOpencode: string }) => {
    const { verifyPackagedRuntime } = await import('./resources/runtime-verification.js');
    printJson(await verifyPackagedRuntime({ ...options, expectedOpenCode: options.expectedOpencode }));
  });

addMacBuildOptions(addSharedOptions(cli.command("mac <action>", "Mac packaging commands: build|package|runtime-export|runtime-restore|install|start|stop|logs|uninstall|cleanup|inspect"))).action(
  async (action: string, options: CliOptions) => {
    const config = resolveToolPackConfig("mac", options);
    switch (action) {
      case "build":
        emitBuildRecord(await packMac(config), options.buildJson);
        return;
      case "package":
        if (options.macRuntimeProduct != null) await validateMacRuntimeProductRoot(config, options.macRuntimeProduct);
        emitBuildRecord(await packageMac(config, options.macRuntimeProduct), options.buildJson);
        return;
      case "runtime-export":
        if (options.output == null) throw new Error("mac runtime-export requires --output");
        printJson(await exportMacRuntimeProduct(config, options.output));
        return;
      case "runtime-restore":
        if (options.output == null) throw new Error("mac runtime-restore requires --output");
        printJson(await restoreMacRuntimeProduct(config, {
          archive: options.archive,
          output: options.output,
          sha256: options.sha256,
          url: options.url,
        }));
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
        "Windows packaging commands: build|package|install|start|stop|logs|uninstall|cleanup|list|reset|inspect|diagnose-ipc|validate-payload",
      ),
    ),
    "win",
  ),
).action(async (action: string, options: CliOptions) => {
  const config = resolveToolPackConfig("win", options);
  switch (action) {
    case "build":
      emitBuildRecord(await packWin(config), options.buildJson);
      return;
    case "package":
      emitBuildRecord(await packageWin(config), options.buildJson);
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

addBuildOptions(addSharedOptions(cli.command("linux <action>", "Linux packaging commands: build|install|start|stop|logs|uninstall|cleanup|inspect")), "linux")
  .option("--containerized", "build inside electronuserland/builder Docker for wider glibc compatibility")
  .option("--headless", "install/start/stop/uninstall/cleanup the headless entry; inspect returns status only")
  .action(async (action: string, options: CliOptions) => {
    const config = resolveToolPackConfig("linux", options);
    switch (action) {
      case "build":
        emitBuildRecord(await packLinux(config), options.buildJson);
        return;
      case "install": {
        const mode = resolveLinuxLifecycleMode(options, "install");
        printJson(await (mode === "headless" ? installPackedLinuxHeadless(config) : installPackedLinuxApp(config)));
        return;
      }
      case "start": {
        const mode = resolveLinuxLifecycleMode(options, "start");
        printJson(await (mode === "headless" ? startPackedLinuxHeadless(config) : startPackedLinuxApp(config)));
        return;
      }
      case "stop": {
        const mode = resolveLinuxLifecycleMode(options, "stop");
        printJson(await (mode === "headless" ? stopPackedLinuxHeadless(config) : stopPackedLinuxApp(config)));
        return;
      }
      case "logs":
        printLogs(await readPackedLinuxLogs(config), options);
        return;
      case "inspect":
        printJson(await inspectPackedLinuxApp(config, {
          expr: options.expr,
          headless: options.headless === true,
          path: options.path,
        }));
        return;
      case "uninstall": {
        const mode = resolveLinuxLifecycleMode(options, "uninstall");
        printJson(await (mode === "headless" ? uninstallPackedLinuxHeadless(config) : uninstallPackedLinuxApp(config)));
        return;
      }
      case "cleanup":
        printJson(await cleanupPackedLinuxNamespace(config, options));
        return;
      default:
        throw new Error(`unsupported linux action: ${action}`);
    }
  });

cli.help();
cli.command("stage-artifact <reference>", "Stage a published installer into the normal tools-pack layout")
  .option("--dir <path>", "tools-pack output/runtime root directory")
  .option("--namespace <name>", "runtime namespace")
  .option("--build-json <path>", "Staged installer build record")
  .action(async (reference: string, options: { dir?: string; namespace?: string; buildJson?: string }) => {
    const { stagePublishedArtifact } = await import("./artifacts/stage.js");
    await stagePublishedArtifact(reference, options);
  });

cli.parse();
