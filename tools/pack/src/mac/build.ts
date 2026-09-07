import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";
import { withStandaloneExactFixture } from "@open-design/tools-serve/standalone-exact-client";

import type { ToolPackConfig } from "../config/index.js";
import type { buildElectronPackage } from "@open-design/shell-electron/build";

type ShellPackReceipt = Awaited<ReturnType<typeof buildElectronPackage>>;

function artifact(receipt: ShellPackReceipt, suffix: string): string | null {
  return receipt.distribution.artifacts.find((path) => path.toLowerCase().endsWith(suffix)) ?? null;
}

export async function packMac(config: ToolPackConfig) {
  if (config.standaloneBootstrapUrl == null) {
    throw new Error("tools-pack mac build requires --standalone-bootstrap-url (or OD_ELECTRON_STANDALONE_BOOTSTRAP_URL)");
  }
  return await withStandaloneExactFixture({ bootstrapUrl: config.standaloneBootstrapUrl, scratchRoot: join(config.roots.cacheRoot, "fixture-acquisition") }, async (installationInput) => {
  const version = config.appVersion ?? "0.1.0";
  const channel = releaseChannelFromVersion(version)
    ?? releaseChannelFromNamespace(config.namespace)
    ?? "stable";
  const receiptPath = join(config.roots.output.namespaceRoot, "shell-pack-receipt.json");
  await mkdir(config.roots.output.namespaceRoot, { recursive: true });
  const startedAt = Date.now();
  const { buildElectronPackage } = await import("@open-design/shell-electron/build");
  const receipt = await buildElectronPackage({
    schemaVersion: 2,
    operation: "electron.pack.build",
    installationInput,
    channel,
    installationRoot: join(config.roots.cacheRoot, "standalone", channel),
    namespace: config.namespace,
    outputDirectory: config.roots.output.namespaceRoot,
    releaseVersion: version,
  });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (receipt.schemaVersion !== 2 || receipt.operation !== "electron.pack.build" || receipt.distribution.platform !== "mac") {
    throw new Error("Shell pack adapter returned an invalid mac receipt");
  }
  const appPath = artifact(receipt, ".app");
  if (appPath == null) throw new Error("Shell pack adapter did not produce a mac app bundle");
  return Object.freeze({
    schemaVersion: 1 as const,
    operation: "tools-pack.build" as const,
    platform: "mac" as const,
    channel,
    namespace: config.namespace,
    releaseVersion: version,
    shellVersion: receipt.shellVersion,
    identity: receipt.identity,
    appPath,
    dmgPath: artifact(receipt, ".dmg"),
    artifacts: receipt.distribution.artifacts,
    outputRoot: receipt.distribution.outputRoot,
    receiptPath,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    timings: [Object.freeze({ phase: "shell-pack", durationMs: Date.now() - startedAt })],
  });
  });
}
