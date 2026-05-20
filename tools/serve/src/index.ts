import { cac } from "cac";

import { startUpdaterFixtureServer } from "./updater-fixture.js";

type CliOptions = {
  channel?: "stable" | "beta";
  host?: string;
  json?: boolean;
  port?: string;
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

async function start(service: string, options: CliOptions): Promise<void> {
  if (service !== "updater") throw new Error(`unsupported tools-serve service: ${service}`);
  const server = await startUpdaterFixtureServer({
    channel: options.channel,
    host: options.host,
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
  .option("--channel <channel>", "Updater channel: stable|beta", { default: "stable" })
  .option("--host <host>", "Host to bind", { default: "127.0.0.1" })
  .option("--json", "Print JSON")
  .option("--port <port>", "Port to bind, 0 for dynamic", { default: "0" })
  .option("--version <version>", "Fixture update version", { default: "99.0.0" })
  .action((service: string, options: CliOptions) => {
    void start(service, options);
  });

cli.help();
cli.parse();
