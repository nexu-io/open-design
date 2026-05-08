import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  normalizeDesktopSidecarMessage,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { bootstrapSidecarRuntime, createJsonIpcServer, resolveAppIpcPath } from "@open-design/sidecar";

import type { PackagedConfig } from "./config.js";
import { writePackagedDesktopIdentity, writePackagedWebIdentity } from "./identity.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import { startPackagedSidecars } from "./sidecars.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function resolveHeadlessNamespaceBaseRoot(): string {
  const odDataDir = process.env.OD_DATA_DIR;
  if (odDataDir != null && odDataDir.length > 0) {
    return join(resolve(odDataDir.replace(/^~/, homedir())), "namespaces");
  }
  const xdgDataHome = process.env.XDG_DATA_HOME;
  const dataBase =
    xdgDataHome != null && xdgDataHome.length > 0
      ? xdgDataHome
      : join(homedir(), ".local", "share");
  return join(dataBase, "open-design", "namespaces");
}

function resolveHeadlessConfig(): PackagedConfig {
  const namespace =
    OPEN_DESIGN_SIDECAR_CONTRACT.normalizeNamespace(
      process.env.OD_NAMESPACE ??
      process.env.OD_SIDECAR_NAMESPACE ??
      SIDECAR_DEFAULTS.namespace,
    );

  const namespaceBaseRoot = resolveHeadlessNamespaceBaseRoot();

  // OD_RESOURCE_ROOT may be set by a launcher script; otherwise default to a
  // sibling open-design/ directory relative to the node_modules that contain
  // this file — the layout written by tools-pack linux headless-install.
  const resourceRoot =
    process.env.OD_RESOURCE_ROOT ??
    join(__dirname, "..", "..", "..", "open-design");

  return {
    appVersion: null,
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace,
    namespaceBaseRoot,
    nodeCommand: null,
    resourceRoot,
    webSidecarEntry: null,
    webStandaloneRoot: null,
    webOutputMode: "server",
  };
}

function createHeadlessStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

function colorize(text: string): string {
  if (process.stdout.isTTY !== true || process.env.NO_COLOR != null) return text;
  return `\x1b[36m\x1b[4m${text}\x1b[0m`;
}

async function main(): Promise<void> {
  const config = resolveHeadlessConfig();
  const paths = resolvePackagedNamespacePaths(config);
  const stamp = createHeadlessStamp(config.namespace);

  await mkdir(paths.runtimeRoot, { recursive: true });

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  // Write the identity marker so `tools-pack linux stop` can find and stop
  // this process by PID via the same mechanism as the Electron packaged path.
  const identity = await writePackagedDesktopIdentity({ paths, stamp });

  const sidecars = await startPackagedSidecars(runtime, paths, {
    appVersion: config.appVersion,
    daemonCliEntry: config.daemonCliEntry,
    daemonSidecarEntry: config.daemonSidecarEntry,
    nodeCommand: config.nodeCommand,
    webSidecarEntry: config.webSidecarEntry,
    webStandaloneRoot: config.webStandaloneRoot,
    webOutputMode: config.webOutputMode,
  });

  const webUrl = sidecars.web.url;
  if (!webUrl) {
    await sidecars.close().catch(() => undefined);
    await identity.close().catch(() => undefined);
    throw new Error("web sidecar failed to produce URL — check logs/desktop/latest.log");
  }

  const shutdown = async (): Promise<void> => {
    process.stdout.write("\n Shutting down Open Design...\n");
    await ipcServer.close().catch(() => undefined);
    await sidecars.close().catch(() => undefined);
    await identity.close().catch(() => undefined);
    process.exit(0);
  };

  const ipcServer = await createJsonIpcServer({
    socketPath: stamp.ipc,
    handler: async (message: unknown) => {
      const request = normalizeDesktopSidecarMessage(message);
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          return { pid: process.pid, state: "running", url: webUrl, updatedAt: new Date().toISOString() };
        case SIDECAR_MESSAGES.SHUTDOWN:
          setImmediate(() => {
            void shutdown().finally(() => process.exit(0));
          });
          return { accepted: true };
      }
    },
  });

  await writePackagedWebIdentity({
    paths,
    pid: process.pid,
    url: webUrl,
  });

  process.stdout.write(`\n Open Design is running\n\n`);
  process.stdout.write(` ➜ ${colorize(webUrl)}\n\n`);
  process.stdout.write(` Press Ctrl+C to stop\n\n`);

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `open-design headless failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
