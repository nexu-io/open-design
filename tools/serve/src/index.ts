import { cac } from "cac";
import type { ReleaseChannel } from "@open-design/release";

import {
  DEFAULT_COLLAB_CLOUD_PORT,
  startCollabCloudFixtureServer,
} from "./collab-cloud-fixture.js";
import { startReleaseStorageFixtureServer } from "./release-storage-fixture.js";
import { startStandaloneExactFixtureServer } from "./standalone-exact-fixture.js";
import { startUpdaterFixtureServer } from "./updater-fixture.js";

type CliOptions = {
  artifactPath?: string;
  channel?: string;
  closurePath?: string;
  controlLauncherVersionMin?: string;
  controlLauncherVersionUrl?: string;
  host?: string;
  json?: boolean;
  platform?: "mac" | "win";
  port?: string;
  includePayload?: boolean;
  payloadPath?: string;
  launcherPath?: string;
  releaseVersion?: string;
  resource?: string | string[];
  shellBuildHash?: string;
  shellVersion?: string;
  sourceCommit?: string;
  standaloneVersion?: string;
  version?: string;
  token?: string;
};

function parseStandaloneResources(value: string | string[] | undefined) {
  const serialized = value == null ? [] : Array.isArray(value) ? value : [value];
  return serialized.map((item, index) => {
    let parsed: unknown;
    try { parsed = JSON.parse(item); }
    catch (error) { throw new Error(`--resource ${index + 1} must be JSON`, { cause: error }); }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`--resource ${index + 1} must be an object`);
    const resource = parsed as Record<string, unknown>;
    const keys = Object.keys(resource).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["entrypoint", "file", "id", "path", "treeSha256"])) {
      throw new Error(`--resource ${index + 1} fields are invalid`);
    }
    if (Object.values(resource).some((candidate) => typeof candidate !== "string" || candidate.length === 0)) {
      throw new Error(`--resource ${index + 1} values must be non-empty strings`);
    }
    return resource as { entrypoint: string; file: string; id: string; path: string; treeSha256: string };
  });
}

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
  if (service === "standalone-exact") {
    if (options.closurePath == null) throw new Error("--closure-path is required for standalone-exact");
    if (options.launcherPath == null) throw new Error("--launcher-path is required for standalone-exact");
    if (options.shellBuildHash == null) throw new Error("--shell-build-hash is required for standalone-exact");
    const channel = options.channel ?? "dev";
    const server = await startStandaloneExactFixtureServer({
      channel,
      closurePath: options.closurePath,
      host: options.host,
      launcherPath: options.launcherPath,
      port: parsePort(options.port),
      releaseVersion: options.releaseVersion ?? `0.1.0-${channel}.1`,
      resources: parseStandaloneResources(options.resource),
      shell: { buildHash: options.shellBuildHash, type: "electron", version: options.shellVersion ?? "0.1.0" },
      sourceCommit: options.sourceCommit,
      standaloneVersion: options.standaloneVersion,
    });
    if (options.json === true) printJson(server.info);
    else process.stdout.write(`tools-serve standalone-exact: ${server.info.bootstrapUrl}\n`);
    const shutdown = () => { void server.close().finally(() => process.exit(0)); };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

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

  if (service === "collab-cloud") {
    // Default to the well-known collab-cloud port when the caller does not pin
    // one, so two daemons can share a URL without discovering a dynamic port.
    const rawPort = options.port;
    const port = rawPort != null && rawPort !== "0" ? parsePort(rawPort) : DEFAULT_COLLAB_CLOUD_PORT;
    const server = await startCollabCloudFixtureServer({
      host: options.host,
      port,
      token: options.token,
    });
    if (options.json === true) {
      printJson(server.info);
    } else {
      process.stdout.write(
        `tools-serve collab-cloud: ${server.info.endpointUrl} (token=${server.info.token})\n`,
      );
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
    channel: options.channel as ReleaseChannel | undefined,
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
  .option("--channel <channel>", "Fixture channel")
  .option("--closure-path <path>", "standalone-exact: Closure content artifact")
  .option("--control-launcher-version-min <version>", "Publish control.launcher.version.min in fixture metadata")
  .option("--control-launcher-version-url <url>", "Publish control.launcher.version.url in fixture metadata")
  .option("--host <host>", "Host to bind", { default: "127.0.0.1" })
  .option("--json", "Print JSON")
  .option("--include-payload", "Include launcher payload metadata")
  .option("--launcher-path <path>", "standalone-exact: generation launcher artifact")
  .option("--payload-path <path>", "Serve launcher payload bytes from a real archive")
  .option("--platform <platform>", "Updater platform: mac|win", { default: "mac" })
  .option("--token <token>", "collab-cloud: shared bearer token clients must present")
  .option("--port <port>", "Port to bind, 0 for dynamic", { default: "0" })
  .option("--release-version <version>", "standalone-exact: channel release version")
  .option("--resource <json>", "standalone-exact: repeatable signed zip resource descriptor")
  .option("--shell-build-hash <digest>", "standalone-exact: accepted Electron Shell build hash")
  .option("--shell-version <version>", "standalone-exact: minimum Electron Shell version")
  .option("--source-commit <sha>", "standalone-exact: source commit identity")
  .option("--standalone-version <version>", "standalone-exact: Standalone runtime version")
  .option("--version <version>", "Fixture update version", { default: "99.0.0" })
  .action((service: string, options: CliOptions) => {
    void start(service, options);
  });

cli.help();
cli.parse();
