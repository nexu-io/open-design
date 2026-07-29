import { cac } from "cac";
import type { ReleaseChannel } from "@open-design/release";

import { startReleaseStorageFixtureServer } from "./release-storage-fixture.js";
import { startUpdaterFixtureServer } from "./updater-fixture.js";

type CliOptions = {
  artifactPath?: string;
  channel?: ReleaseChannel;
  controlLauncherVersionMin?: string;
  controlLauncherVersionUrl?: string;
  host?: string;
  json?: boolean;
  platform?: "mac" | "win";
  port?: string;
  includePayload?: boolean;
  payloadPath?: string;
  version?: string;
};

function parsePort(value: string | undefined): number {
  if (value == null || value.length === 0) return 0;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("--port must be an integer between 0 and 65535");
  }
  return port;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parsePlatform(value: string | undefined): "mac" | "win" {
  if (value == null || value.length === 0 || value === "mac") return "mac";
  if (value === "win") return "win";
  throw new Error("--platform must be mac or win");
}

async function start(service: string, options: CliOptions): Promise<void> {
  if (service === "release-storage") {
    const server = await startReleaseStorageFixtureServer({
      host: options.host,
      port: parsePort(options.port),
    });
    if (options.json === true) {
      printJson(server.info);
    } else {
      process.stdout.write(`tools-serve release-storage: ${server.info.endpointUrl} bucket=${server.info.bucket}\n`);
    }

    const shutdown = () => {
      void server.close().finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  if (service !== "updater") throw new Error(`unsupported tools-serve service: ${service}`);
  const server = await startUpdaterFixtureServer({
    artifactPath: options.artifactPath,
    channel: options.channel,
    controlLauncherVersionMin: options.controlLauncherVersionMin,
    controlLauncherVersionUrl: options.controlLauncherVersionUrl,
    host: options.host,
    platform: parsePlatform(options.platform),
    includePayload: options.includePayload,
    payloadPath: options.payloadPath,
    port: parsePort(options.port),
    version: options.version,
  });
  if (options.json === true) {
    printJson(server.info);
  } else {
    process.stdout.write(`tools-serve updater: ${server.info.metadataUrl}\n`);
  }

  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

process.on("uncaughtException", (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

const cli = cac("tools-serve");

cli
  .command("start <service>", "Start a local fixture service")
  .option("--artifact-path <path>", "Serve a local update artifact file")
  .option("--channel <channel>", "Updater channel: stable|beta|betas|prerelease|preview", { default: "stable" })
  .option("--control-launcher-version-min <version>", "Publish control.launcher.version.min in fixture metadata")
  .option("--control-launcher-version-url <url>", "Publish control.launcher.version.url in fixture metadata")
  .option("--host <host>", "Host to bind", { default: "127.0.0.1" })
  .option("--json", "Print JSON")
  .option("--include-payload", "Include launcher payload metadata")
  .option("--payload-path <path>", "Serve launcher payload bytes from a real archive")
  .option("--platform <platform>", "Updater platform: mac|win", { default: "mac" })
  .option("--port <port>", "Port to bind, 0 for dynamic", { default: "0" })
  .option("--version <version>", "Fixture update version", { default: "99.0.0" })
  .action((service: string, options: CliOptions) => {
    void start(service, options);
  });

cli.help();
cli.parse();
